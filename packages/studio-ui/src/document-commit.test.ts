import { describe, expect, it, vi } from 'vitest';
import { emptyComposition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { compositionToEditorDocument } from '@pireel/studio-engine/project-document';
import type { DocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { DocumentCommitter } from './document-commit';

function harness() {
  let document = compositionToEditorDocument({ projectId: 'p', composition: emptyComposition() }).document;
  const undoStack = { current: [] as EditorDocumentV2[] };
  const redoStack = { current: [] as EditorDocumentV2[] };
  const transactions: DocumentTransaction[] = [];
  const onBeforeMutation = vi.fn();
  const publish = vi.fn((next: EditorDocumentV2) => { document = next; });
  const committer = new DocumentCommitter({
    projectId: 'p',
    getDocument: () => document,
    publish,
    undoStack,
    redoStack,
    undoCap: 20,
    onBeforeMutation,
    onTransaction: (transaction) => transactions.push(transaction),
  });
  return { committer, get document() { return document; }, undoStack, redoStack, transactions, publish, onBeforeMutation };
}

const card = (id: string, startSec = 1) => ({
  op: 'overlay.insert' as const,
  input: { block: { id, templateId: 'custom', slots: {}, startSec, durationSec: 2, trackIndex: 5 } },
});

describe('DocumentCommitter', () => {
  it('applies, publishes once, takes one undo step and records one transaction', () => {
    const h = harness();
    const result = h.committer.commit([card('a'), card('b', 4)]);
    expect(result.ok).toBe(true);
    expect(h.publish).toHaveBeenCalledOnce();
    expect(h.undoStack.current).toHaveLength(1);
    expect(h.onBeforeMutation).toHaveBeenCalledOnce();
    expect(h.transactions).toHaveLength(1);
    expect(h.transactions[0]!.ops).toHaveLength(2);
    expect(h.transactions[0]!.origin).toBe('user');
    expect(h.document.timeline.tracks.flatMap((t) => t.clips.map((c) => c.id))).toEqual(['a', 'b']);
  });

  it('leaves everything untouched when an operation fails', () => {
    const h = harness();
    const before = h.document;
    const result = h.committer.commit([card('a'), { op: 'overlay.remove', input: { clipIds: ['nope'] } }]);
    expect(result.ok).toBe(false);
    expect(h.document).toBe(before);
    expect(h.publish).not.toHaveBeenCalled();
    expect(h.undoStack.current).toHaveLength(0);
    expect(h.transactions).toHaveLength(0);
  });

  it('records nothing for an edit that changes nothing', () => {
    const h = harness();
    h.committer.commit(card('a'));
    const result = h.committer.commit({ op: 'overlay.patch', input: { updates: [{ clipId: 'a', startSec: 1 }] } });
    expect(result.ok).toBe(true);
    expect(h.transactions).toHaveLength(1);
    expect(h.undoStack.current).toHaveLength(1);
  });

  it('records nothing for a system relay that rebuilds an identical document', () => {
    const h = harness();
    h.committer.commit(card('a'));
    const before = h.document;
    const result = h.committer.commit({ op: 'document.foldMetadata', input: {} }, { origin: 'system', undo: 'none' });
    expect(result.ok).toBe(true);
    expect(h.document).toBe(before);
    expect(h.publish).toHaveBeenCalledOnce();
    expect(h.transactions).toHaveLength(1);
  });

  it('honours undo:none and clears the redo line on a real step', () => {
    const h = harness();
    h.redoStack.current = [h.document];
    h.committer.commit(card('a'), { undo: 'none' });
    expect(h.undoStack.current).toHaveLength(0);
    expect(h.redoStack.current).toHaveLength(1);
    h.committer.commit(card('b', 4));
    expect(h.undoStack.current).toHaveLength(1);
    expect(h.redoStack.current).toHaveLength(0);
  });

  it('records a restore as one document.replace and a hydrate as nothing', () => {
    const h = harness();
    h.committer.commit(card('a'));
    const snapshot = h.undoStack.current[0]!;
    const edited = h.document;
    h.committer.replace(snapshot, { origin: 'hydrate' });
    expect(h.transactions).toHaveLength(1);
    // Restoring to what is already published is not a change either.
    h.committer.replace(h.document, { origin: 'restore' });
    expect(h.transactions).toHaveLength(1);
    h.committer.replace(edited, { origin: 'restore' });
    const last = h.transactions.at(-1)!;
    expect(h.transactions).toHaveLength(2);
    expect(last.origin).toBe('restore');
    expect(last.ops[0]!.op).toBe('document.replace');
  });

  it('records a restore as a patch when that is small, as a snapshot when it is not', () => {
    const h = harness();
    for (let i = 0; i < 12; i += 1) h.committer.commit(card(`c${i}`, i));
    const full = h.document;
    const snapshot = h.undoStack.current.at(-1)!; // one card fewer: a small patch
    h.committer.replace(snapshot, { origin: 'restore' });
    const small = h.transactions.at(-1)!.ops[0]!;
    expect(small.op).toBe('document.patch');
    expect(JSON.stringify(small.input).length).toBeLessThan(JSON.stringify(snapshot).length / 2);
    // Back to the full document from an empty one: a patch would carry everything, so the snapshot travels.
    h.committer.replace(h.undoStack.current[0]!, { origin: 'restore' });
    h.committer.replace(full, { origin: 'restore' });
    expect(h.transactions.at(-1)!.ops[0]!.op).toBe('document.replace');
    // The fallback transaction is the current document, whole.
    const recovery = h.committer.replaceTransaction();
    expect(recovery.ops[0]).toMatchObject({ op: 'document.replace', input: { document: full } });
  });

  it('stages a scope and keeps or discards it as a unit', () => {
    const h = harness();
    const scope = h.committer.scope();
    scope.commit(card('a'));
    scope.commit(card('b', 4));
    expect(h.transactions).toHaveLength(0);
    expect(h.undoStack.current).toHaveLength(0); // the tool takes its own boundary
    scope.end('keep');
    expect(h.transactions).toHaveLength(2);
    expect(h.transactions.every((tx) => tx.origin === 'agent')).toBe(true);

    const discarded = h.committer.scope();
    discarded.commit(card('c', 7));
    discarded.end('discard');
    expect(h.transactions).toHaveLength(2);
  });

  it('rebases onto a newer document by replaying what is still pending, skipping vanished targets', () => {
    const h = harness();
    h.committer.commit(card('mine'));
    const pending = [...h.transactions];
    const server = compositionToEditorDocument({ projectId: 'p', composition: emptyComposition() }).document;
    const withAgentCard = h.committer.commit(card('agent', 8)).document;
    // Pretend the server holds only the agent's card; replaying our pending insert must add ours back.
    const serverDocument = { ...server, timeline: withAgentCard.timeline };
    const dropped = h.committer.rebase(serverDocument, pending);
    expect(dropped.dropped).toHaveLength(0);
    expect(h.document.timeline.tracks.flatMap((t) => t.clips.map((c) => c.id))).toEqual(expect.arrayContaining(['agent', 'mine']));
    // A pending edit whose target the server deleted is skipped, not fatal.
    const stale: DocumentTransaction = { id: 'tx_stale_000000001', origin: 'user', ops: [{ op: 'overlay.patch', input: { updates: [{ clipId: 'gone', startSec: 2 }] } }] };
    expect(h.committer.rebase(h.document, [stale]).dropped).toHaveLength(0);
  });
});
