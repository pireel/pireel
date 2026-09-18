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

  it('maps a write-blocked answer to migration-required and sends transactions, never a document', async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ error: 'document_migration_required', saveBlocked: true }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    }));

    const result = await serverSaveProject('p1', {
      documentSchemaVersion: 2,
      knownVersion: 3,
      transactions: [{ id: 'tx_0000000000000001', origin: 'user', ops: [{ op: 'command', input: { command: { type: 'canvas.patch', patch: { width: 720, height: 1280 } } } }] }],
    });

    expect(result).toBe('migration-required');
    expect(requestBody).toMatchObject({ documentSchemaVersion: 2, knownVersion: 3 });
    expect(requestBody).not.toHaveProperty('document');
    expect(requestBody).not.toHaveProperty('baseVersion');
  });

  it('returns the acknowledgement fields the sync layer needs', async () => {
    const id = createProject(emptyComposition(), 'Acked');
    const stored = JSON.parse(storage.getItem(`studio:draft:${id}`)!) as { document: EditorDocumentV2 };
    const project = { id, title: 'Acked', document: stored.document, context: sanitizeProjectContext(null), videoSig: null, videoDurationSec: null, coverThumb: null, version: 8, updatedAt: Date.now() };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ project, applied: ['tx_0000000000000001'], rejected: [], baseVersion: 7, documentHash: 'h' })));

    const result = await serverSaveProject(id, { documentSchemaVersion: 2, knownVersion: 7, title: 'Acked' });

    expect(result).toMatchObject({ status: 'saved', version: 8, applied: ['tx_0000000000000001'], baseVersion: 7, documentHash: 'h', project: { version: 8 } });
  });

  it('answers need-full for a section patch the server could not apply', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'need_full' }), { status: 422 })));
    expect(await serverSaveProject('p1', { documentSchemaVersion: 2, knownVersion: 1, contextPatch: [], contextHash: 'x' })).toBe('need-full');
  });
});
