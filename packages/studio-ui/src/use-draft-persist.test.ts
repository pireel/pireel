import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyComposition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { createProject, migrateLegacyDraft, renameProject, serverSaveProject } from './use-draft-persist';

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

  it('ignores a retired per-project V1 draft instead of recreating compatibility state', () => {
    const legacy = {
      id: 'old-project',
      title: 'Old',
      comp: emptyComposition(),
      videoSig: null,
      videoDurationSec: null,
      savedAt: 1,
    };
    storage.setItem('studio:draft:old-project', JSON.stringify(legacy));
    renameProject('old-project', 'Renamed');
    const stored = JSON.parse(storage.getItem('studio:draft:old-project')!) as Record<string, unknown>;
    expect(stored).toEqual(legacy);
  });

  it('discards the single-draft-era payload and chat so the cloud V2 row can recover', () => {
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
    storage.setItem('studio:chat:v1', JSON.stringify([{ id: 'legacy-message' }]));
    migrateLegacyDraft();
    expect(storage.getItem('studio:draft:v1')).toBeNull();
    expect(storage.getItem('studio:chat:v1')).toBeNull();
    expect(storage.getItem('studio:draft:legacy-single')).toBeNull();
  });

  it('returns the reload signal when autosave meets an online schema upgrade', async () => {
    const id = createProject(emptyComposition(), 'Native');
    const stored = JSON.parse(storage.getItem(`studio:draft:${id}`)!) as { document: EditorDocumentV2 };
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ error: 'document_schema_upgraded', reloadRequired: true }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    }));

    const result = await serverSaveProject(id, {
      document: stored.document,
      chat: [],
      videoSig: null,
      videoDurationSec: null,
      coverThumb: null,
    });

    expect(result).toBe('schema-upgraded');
    expect(requestBody).toMatchObject({ documentSchemaVersion: 2, document: { version: 2 } });
    expect(requestBody).not.toHaveProperty('comp');
    expect(requestBody).not.toHaveProperty('context');
  });
});
