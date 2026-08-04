import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyComposition } from '@pireel/studio-engine/composition';
import { createProject, migrateLegacyDraft, renameProject } from './use-draft-persist';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

describe('local project document persistence', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('window', { localStorage: storage });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('writes a new draft as V2 without persisting the compatibility Composition', () => {
    const id = createProject(emptyComposition(), 'Empty');
    const stored = JSON.parse(storage.getItem(`studio:draft:${id}`)!) as Record<string, unknown>;
    expect(stored.document).toMatchObject({ version: 2 });
    expect(stored).not.toHaveProperty('comp');
  });

  it('dual-reads an old per-project draft and rewrites it as V2 on the next mutation', () => {
    storage.setItem('studio:draft:old-project', JSON.stringify({
      id: 'old-project',
      title: 'Old',
      comp: emptyComposition(),
      videoSig: null,
      videoDurationSec: null,
      savedAt: 1,
    }));
    renameProject('old-project', 'Renamed');
    const stored = JSON.parse(storage.getItem('studio:draft:old-project')!) as Record<string, unknown>;
    expect(stored).toMatchObject({ title: 'Renamed', document: { version: 2 } });
    expect(stored).not.toHaveProperty('comp');
  });

  it('moves the single-draft-era payload into a V2 project draft', () => {
    storage.setItem('studio:draft:v1', JSON.stringify({
      id: 'legacy-single',
      comp: {
        ...emptyComposition(),
        blocks: [{ id: 'title', templateId: 'custom', slots: {}, startSec: 0, durationSec: 1, trackIndex: 1 }],
      },
      videoSig: null,
      videoDurationSec: null,
      savedAt: 1,
    }));
    migrateLegacyDraft();
    const stored = JSON.parse(storage.getItem('studio:draft:legacy-single')!) as Record<string, unknown>;
    expect(stored.document).toMatchObject({ version: 2 });
    expect(stored).not.toHaveProperty('comp');
    expect(storage.getItem('studio:draft:v1')).toBeNull();
  });
});
