import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyComposition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { sanitizeProjectContext } from '@pireel/studio-engine/project-dto';
import {
  cacheProjectLocally,
  createProject,
  migrateLegacyDraft,
  renameProject,
  serverSaveProject,
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

    expect(result).toBe('ok');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not turn an untouched stale timeline into a local edit after a 409 rebase', async () => {
    const id = createProject(emptyComposition(), 'Conflict-safe');
    const stored = JSON.parse(storage.getItem(`studio:draft:${id}`)!) as { document: EditorDocumentV2 };
    const baselineContext = sanitizeProjectContext(null);
    cacheProjectLocally({
      id,
      title: 'Conflict-safe',
      document: stored.document,
      context: baselineContext,
      videoSig: null,
      videoDurationSec: null,
      coverThumb: null,
      version: 3,
      updatedAt: Date.now(),
    });
    const remoteDocument = structuredClone(stored.document);
    remoteDocument.canvas = { ...remoteDocument.canvas, width: remoteDocument.canvas.width + 1 };
    const changedContext = sanitizeProjectContext({
      schemaVersion: 3,
      localAssets: [{
        assetId: 'asset-1',
        contentSig: 'teacher.mov:1:1',
        sig: 'teacher.mov:1:1',
        label: 'teacher.mov',
        createdAt: 1,
      }],
    });
    const requestBodies: Record<string, unknown>[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestBodies.push(body);
      if (requestBodies.length === 1) {
        return new Response(JSON.stringify({
          error: 'version_conflict',
          project: {
            id,
            title: 'Conflict-safe',
            document: remoteDocument,
            context: baselineContext,
            videoSig: null,
            videoDurationSec: null,
            coverThumb: null,
            version: 4,
            updatedAt: Date.now(),
          },
        }), { status: 409, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        project: {
          id,
          title: 'Conflict-safe',
          document: remoteDocument,
          context: changedContext,
          videoSig: null,
          videoDurationSec: null,
          coverThumb: null,
          version: 5,
          updatedAt: Date.now(),
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const payload = {
      document: stored.document,
      context: changedContext,
      videoSig: null,
      videoDurationSec: null,
      coverThumb: null,
    };
    await expect(serverSaveProject(id, payload)).resolves.toBe('conflict');
    await expect(serverSaveProject(id, payload)).resolves.toBe('ok');

    expect(requestBodies).toHaveLength(2);
    expect(requestBodies[0]).not.toHaveProperty('document');
    expect(requestBodies[0]).not.toHaveProperty('documentPatch');
    expect(requestBodies[1]).not.toHaveProperty('document');
    expect(requestBodies[1]).not.toHaveProperty('documentPatch');
    expect(requestBodies[1].context ?? requestBodies[1].contextPatch).toBeDefined();
  });
});
