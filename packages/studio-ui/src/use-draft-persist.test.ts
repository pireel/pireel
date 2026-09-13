import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyComposition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { sanitizeProjectContext } from '@pireel/studio-engine/project-dto';
import {
  cacheProjectLocally,
  createProject,
  migrateLegacyDraft,
  renameProject,
  serverSaveProject,
  serverLoadProject,
  projectVersion,
  loadDraft,
} from './use-draft-persist';

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
  it('does not authorize a stale editor to save over a metadata-only cloud refresh', async () => {
    const id = createProject(emptyComposition(), 'Refresh');
    const stored = JSON.parse(storage.getItem(`studio:draft:${id}`)!);
    const dto = { id, title: 'Refresh', document: stored.document, context: sanitizeProjectContext({ schemaVersion: 3 }), videoSig: null, videoDurationSec: null, coverThumb: null, version: 1, updatedAt: Date.now() };
    cacheProjectLocally(dto);
    const remote = structuredClone(dto);
    remote.version = 2;
    remote.document.canvas.width += 1;
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ project: remote })));
    expect(await serverLoadProject(id)).toMatchObject({ version: 2 });
    expect(projectVersion(id)).toBe(1);
  });
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
  it('restores a pending empty document so clearing the timeline is not lost on reload', () => {
    const id = createProject(emptyComposition(), 'Cleared');
    const key = `studio:draft:${id}`;
    storage.setItem(key, JSON.stringify({ ...JSON.parse(storage.getItem(key)!), pending: true }));
    expect(loadDraft(id)?.pending).toBe(true);
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
    storage.setItem('studio:chat:v1:project-1', JSON.stringify([{ id: 'project-message' }]));
    migrateLegacyDraft();
    expect(storage.getItem('studio:draft:v1')).toBeNull();
    expect(storage.getItem('studio:chat:v1')).toBeNull();
    expect(storage.getItem('studio:chat:v1:project-1')).toBeNull();
    expect(storage.getItem('studio:draft:legacy-single')).toBeNull();
  });

  it('returns the reload signal when autosave meets an online schema upgrade', async () => {
    const id = createProject(emptyComposition(), 'Native');
    const stored = JSON.parse(storage.getItem(`studio:draft:${id}`)!) as { document: EditorDocumentV2 };
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ error: 'document_migration_required', saveBlocked: true }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    }));

    const result = await serverSaveProject(id, {
      document: stored.document,
      videoSig: null,
      videoDurationSec: null,
      coverThumb: null,
    });

    expect(result).toBe('migration-required');
    expect(requestBody).toMatchObject({ documentSchemaVersion: 2, document: { version: 2 } });
    expect(requestBody).not.toHaveProperty('comp');
    expect(requestBody).not.toHaveProperty('context');
  });

  it('does not write the unchanged cloud snapshot back after project hydration', async () => {
    const id = createProject(emptyComposition(), 'Hydrated');
    const stored = JSON.parse(storage.getItem(`studio:draft:${id}`)!) as { document: EditorDocumentV2 };
    const context = sanitizeProjectContext(null);
    cacheProjectLocally({
      id,
      title: 'Hydrated',
      document: stored.document,
      context,
      videoSig: null,
      videoDurationSec: null,
      coverThumb: null,
      version: 7,
      updatedAt: Date.now(),
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await serverSaveProject(id, {
      // Matches the workbench payload: title is intentionally omitted because this save is not a
      // rename. Omission must mean "preserve", not hash as null and create a metadata-only PUT.
      document: stored.document,
      context,
      videoSig: null,
      videoDurationSec: null,
      coverThumb: null,
    });

    expect(result).toMatchObject({ status: 'saved' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

});
