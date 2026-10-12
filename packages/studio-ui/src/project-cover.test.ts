import { describe, expect, it, vi } from 'vitest';
import { compositionToEditorDocument, emptyComposition, parseEditorDocumentV2 } from '@pireel/studio-engine/composition';
import { ProjectSync } from './project-sync';
import { canonicalJson, hashSection } from '@pireel/studio-engine/stable-json';
import { applyProjectCover, persistProjectCover, projectCoverFromDocument, withProjectCover, ProjectCoverWriteQueue } from './project-cover';
const document = () => compositionToEditorDocument({ projectId: 'p', videoSig: 'sig', composition: emptyComposition() }).document;
const cover = { url: 'https://cdn.example/cover.png', key: 'uploads/cover.png', label: 'Current video cover' };

describe('applied project cover', () => {
  it('survives document serialization without changing footage, canvas or other artifacts', () => {
    const original = document(); original.semantics.artifacts = { directorPlan: { content: 'Keep the opening' } };
    const next = withProjectCover(original, cover);
    const restored = parseEditorDocumentV2(JSON.parse(JSON.stringify(next)))!;
    expect(projectCoverFromDocument(restored)).toEqual(cover);
    expect(restored.timeline).toEqual(original.timeline);
    expect(restored.canvas).toEqual(original.canvas);
    expect(restored.semantics.artifacts).toMatchObject({ directorPlan: { content: 'Keep the opening' } });
    expect(projectCoverFromDocument(original)).toBeNull();
    expect(() => withProjectCover(original, { ...cover, url: 'blob:temporary' })).toThrow();
  });
  it('waits for storage and commits against the latest document before reporting success', async () => {
    let current = document();
    const events: string[] = [];
    const persist = vi.fn(async () => { events.push('persist'); });
    await applyProjectCover(cover, {
      load: async () => new Blob(['image'], { type: 'image/png' }),
      save: async () => { events.push('bytes'); current = { ...current, canvas: { ...current.canvas, fps: 24 } }; },
      current: () => true, document: () => current,
      commit: next => { events.push('commit'); current = next; return true; }, persist,
    });
    expect(events).toEqual(['bytes', 'commit', 'persist']);
    expect(current.canvas.fps).toBe(24);
    expect(projectCoverFromDocument(current)).toEqual(cover);
  });
  it('does not claim application on failed storage or a changed active output', async () => {
    const commit = vi.fn(() => true); const persist = vi.fn(async () => {});
    const base = { load: async () => new Blob(['image'], { type: 'image/png' }), save: vi.fn(async () => {}), current: () => true, document, commit, persist };
    await expect(applyProjectCover(cover, { ...base, save: async () => { throw new Error('offline'); } })).rejects.toThrow('cover_upload_failed');
    await expect(applyProjectCover(cover, { ...base, current: () => false })).rejects.toThrow('cover_output_changed');
    expect(base.save).not.toHaveBeenCalled();
    await expect(applyProjectCover(cover, { ...base, load: async () => new Blob(['html'], { type: 'text/html' }) })).rejects.toThrow('cover_image_unavailable');
    expect(commit).not.toHaveBeenCalled(); expect(persist).not.toHaveBeenCalled();
  });
  it('serializes an in-flight auto frame before the user selection and recovers after a failed write', async () => {
    let release!: () => void;
    const saved: (string | null)[] = [];
    const save = vi.fn(async (_blob: Blob | null, signature: string | null) => {
      saved.push(signature);
      if (signature === 'auto') await new Promise<void>(resolve => { release = resolve; });
      if (signature === 'failed') throw new Error('offline');
    });
    const queue = new ProjectCoverWriteQueue(save);
    const auto = queue.write(null, 'auto'); await Promise.resolve(); await Promise.resolve();
    const chosen = queue.write(new Blob(['image']), 'chosen');
    expect(saved).toEqual(['auto']); release(); await Promise.all([auto, chosen]);
    expect(saved).toEqual(['auto', 'chosen']);
    await expect(queue.write(null, 'failed')).rejects.toThrow('offline');
    await expect(queue.write(null, 'retry')).resolves.toBeUndefined();
    expect(saved.at(-1)).toBe('retry');
  });
});


it('accepts an acknowledged cover even when unrelated metadata becomes dirty during its save', async () => {
  const doc = withProjectCover(document(), cover);
  const transactionId = 'cover-save-transaction';
  const sync = new ProjectSync({ projectId: 'p', getDocument: () => doc, canWrite: () => true,
    sections: () => ({ videoSig: null, videoDurationSec: null }),
    send: async () => {
      sync.markDirty(); // A real workbench render updates output metadata while the cover save is in flight.
      return { status: 'saved', baseVersion: 0, version: 1, updatedAt: 1, applied: [transactionId], rejected: [], documentHash: hashSection(canonicalJson(doc)) };
    }, onAck() {}, debounceMs: 60000,
  });
  sync.record({ id: transactionId, origin: 'user', ops: [{ op: 'document.replace', input: { document: doc } }] });
  try {
    await expect(persistProjectCover(sync, transactionId, cover, () => doc)).resolves.toBeUndefined();
    expect(sync.hasPending).toBe(true); // The old global check incorrectly reported "cover not saved" here.
    expect(sync.pendingTransactions).toEqual([]);
  } finally { sync.dispose(); }
});

it('does not claim success when the cover transaction is still pending or the saved selection was rejected', async () => {
  const pending = { flush: async () => {}, whenIdle: async () => {}, pendingTransactions: [{ id: 'cover-tx', origin: 'user' as const, ops: [] }] };
  await expect(persistProjectCover(pending, 'cover-tx', cover, () => withProjectCover(document(), cover))).rejects.toThrow('cover_sync_failed');
  await expect(persistProjectCover({ ...pending, pendingTransactions: [] }, 'cover-tx', cover, document)).rejects.toThrow('cover_sync_failed');
});
