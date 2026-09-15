import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyComposition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { compositionToEditorDocument } from '@pireel/studio-engine/project-document';
import { canonicalJson, hashSection, sanitizeProjectContext, type ProjectCommitAck, type ProjectSaveWire, type StudioProjectDto } from '@pireel/studio-engine/project-dto';
import type { DocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { ProjectSync, type PendingTransactionStore, type ProjectSyncSendResult } from './project-sync';

const tx = (id: string): DocumentTransaction => ({ id, origin: 'user', ops: [{ op: 'command', input: { command: { type: 'canvas.patch', patch: { width: 720, height: 1280 } } } }] });

function memoryStore(): PendingTransactionStore & { value: DocumentTransaction[] } {
  const store = {
    value: [] as DocumentTransaction[],
    load: () => store.value,
    save: (transactions: readonly DocumentTransaction[]) => { store.value = [...transactions]; },
  };
  return store;
}

function dto(document: EditorDocumentV2, version: number): StudioProjectDto {
  return { id: 'p', title: 'Project', document, context: sanitizeProjectContext(null), videoSig: null, videoDurationSec: null, coverThumb: null, version, updatedAt: 1 };
}

function ackFor(document: EditorDocumentV2, wire: ProjectSaveWire, baseVersion: number, extra: Partial<ProjectCommitAck> = {}): ProjectCommitAck {
  return {
    status: 'saved',
    project: dto(document, baseVersion + 1),
    applied: (wire.transactions ?? []).map((t) => t.id),
    rejected: [],
    baseVersion,
    documentHash: hashSection(canonicalJson(document)),
    ...extra,
  };
}

describe('ProjectSync', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function harness(results: Array<(wire: ProjectSaveWire) => ProjectSyncSendResult>) {
    const document = compositionToEditorDocument({ projectId: 'p', composition: emptyComposition() }).document;
    const queue = [...results];
    const sent: ProjectSaveWire[] = [];
    const send = vi.fn(async (wire: ProjectSaveWire) => { sent.push(wire); return (queue.shift() ?? (() => 'ok' as const))(wire); });
    const onAck = vi.fn();
    const store = memoryStore();
    const sync = new ProjectSync({
      projectId: 'p',
      send,
      sections: () => ({ videoSig: null, videoDurationSec: null }),
      canWrite: () => true,
      getDocument: () => document,
      onAck,
      store,
      debounceMs: 100,
    });
    return { sync, send, sent, onAck, store, document };
  }

  it('pushes pending transactions after the debounce and removes acknowledged ones', async () => {
    const h = harness([(wire) => ackFor(h.document, wire, 0)]);
    h.sync.record(tx('tx_a_0000000000001'));
    h.sync.record(tx('tx_b_0000000000001'));
    expect(h.store.value).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(100);
    await h.sync.whenIdle();
    expect(h.send).toHaveBeenCalledOnce();
    expect(h.sent[0]!.transactions?.map((t) => t.id)).toEqual(['tx_a_0000000000001', 'tx_b_0000000000001']);
    expect(h.sent[0]!.knownVersion).toBeNull();
    expect(h.sync.pendingTransactions).toHaveLength(0);
    expect(h.store.value).toHaveLength(0);
    expect(h.sync.version).toBe(1);
    expect(h.onAck).toHaveBeenCalledWith(expect.anything(), { diverged: false, pending: [] });
  });

  it('keeps transactions pending across a failed push and resends the same ids', async () => {
    const h = harness([() => 'skip', (wire) => ackFor(h.document, wire, 0)]);
    h.sync.record(tx('tx_a_0000000000001'));
    await h.sync.flush();
    expect(h.sync.pendingTransactions).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await h.sync.whenIdle();
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.sent[1]!.transactions?.[0]!.id).toBe('tx_a_0000000000001');
    expect(h.sync.pendingTransactions).toHaveLength(0);
  });

  it('reports divergence when another writer landed first and hands back what is still pending', async () => {
    let release: ((value: ProjectSyncSendResult) => void) | undefined;
    const h = harness([() => new Promise<ProjectSyncSendResult>((resolve) => { release = resolve; }) as unknown as ProjectSyncSendResult]);
    h.sync.seed(dto(h.document, 3));
    h.sync.record(tx('tx_a_0000000000001'));
    const flushing = h.sync.flush();
    await vi.waitFor(() => expect(h.send).toHaveBeenCalledOnce());
    // An edit made while the request is out stays pending and must be replayed after adopting.
    h.sync.record(tx('tx_b_0000000000001'));
    release!(ackFor(h.document, h.sent[0]!, 5, { documentHash: 'server-moved' }));
    await flushing;
    expect(h.onAck).toHaveBeenCalledOnce();
    const [, info] = h.onAck.mock.calls[0]!;
    expect(info.diverged).toBe(true);
    expect(info.pending.map((t: DocumentTransaction) => t.id)).toEqual(['tx_b_0000000000001']);
  });

  it('treats a rejected transaction as divergence and drops it from the queue', async () => {
    const h = harness([(wire) => ackFor(h.document, wire, 0, { applied: [], rejected: [{ id: 'tx_a_0000000000001', error: { code: 'invalid-range', message: 'bad' } }] })]);
    h.sync.record(tx('tx_a_0000000000001'));
    await h.sync.flush();
    expect(h.sync.pendingTransactions).toHaveLength(0);
    expect(h.onAck.mock.calls[0]![1].diverged).toBe(true);
  });

  it('resends the sections whole when the server cannot apply the section patch', async () => {
    const h = harness([() => 'need-full', (wire) => ackFor(h.document, wire, 0)]);
    h.sync.markDirty();
    await h.sync.flush();
    expect(h.send).toHaveBeenCalledTimes(2);
    expect(h.sync.hasPending).toBe(false);
  });

  it('stops after a migration block and keeps the intent', async () => {
    const onMigrationRequired = vi.fn();
    const h = harness([() => 'migration-required']);
    h.sync.configure({ ...(h.sync as unknown as { deps: ConstructorParameters<typeof ProjectSync>[0] }).deps, onMigrationRequired });
    h.sync.record(tx('tx_a_0000000000001'));
    await h.sync.flush();
    await vi.runAllTimersAsync();
    expect(onMigrationRequired).toHaveBeenCalledOnce();
    expect(h.send).toHaveBeenCalledOnce();
    expect(h.sync.pendingTransactions).toHaveLength(1);
  });

  it('reloads the pending list it persisted', () => {
    const store = memoryStore();
    store.value = [tx('tx_a_0000000000001')];
    const document = compositionToEditorDocument({ projectId: 'p', composition: emptyComposition() }).document;
    const sync = new ProjectSync({ projectId: 'p', send: async () => 'ok', sections: () => null, canWrite: () => true, getDocument: () => document, onAck: () => {}, store });
    expect(sync.pendingTransactions.map((t) => t.id)).toEqual(['tx_a_0000000000001']);
    expect(sync.hasPending).toBe(true);
  });
});
