import type { CaptionTaskRecord, CaptionProjectSummary, CaptionTaskVersion, CaptionVersionSummary } from '@pireel/studio-engine/scene-project';
import { MEDIA_CACHE_RECENT_MS, protectMediaCacheEntry, registerMediaCacheStore, withMediaCacheRead, type AdditionalMediaCacheEntry } from './local-media-cache';
export type * from '@pireel/studio-engine/scene-project';
const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('pireel-caption-tasks', 3);
  request.onupgradeneeded = () => {
    const tasks = request.result.objectStoreNames.contains('tasks') ? request.transaction!.objectStore('tasks') : request.result.createObjectStore('tasks', { keyPath: 'key' });
    if (!tasks.indexNames.contains('scope')) tasks.createIndex('scope', 'task.scope');
    if (!request.result.objectStoreNames.contains('versions')) {
      const versions = request.result.createObjectStore('versions', { keyPath: 'key' });
      versions.createIndex('project', 'project');
    }
    if (!request.result.objectStoreNames.contains('results')) request.result.createObjectStore('results');
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const key = (scope: string, id: string) => JSON.stringify([scope, id]);
const cacheLock = (scope: string, id: string) => `scene-project:${key(scope, id)}`;
export async function saveCaptionTask(task: CaptionTaskRecord, result?: Blob) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['tasks', 'results', 'versions'], 'readwrite');
    const tasks = tx.objectStore('tasks');
    const request = tasks.get(key(task.scope, task.id));
    request.onsuccess = () => {
      const previous = request.result?.task as CaptionTaskRecord | undefined;
      tasks.put({ key: key(task.scope, task.id), task: mergeCaptionProjectMetadata(task, previous) });
      if (result) withCaptionVersions(tx, previous ?? task, (versions) => {
        const id = task.generationId ?? `generated-${task.updatedAt}`;
        if (!versions.some((version) => version.id === id)) {
          const version = { key: versionKey(task.scope, task.id, id), project: key(task.scope, task.id), id, number: Math.max(0, ...versions.map((entry) => entry.number)) + 1, createdAt: task.updatedAt, task: structuredClone(task) };
          tx.objectStore('versions').add(version);
          tx.objectStore('results').put(result, version.key);
          tx.objectStore('results').put(result, key(task.scope, task.id));
        }
      });
    };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
export async function listCaptionTasks(scope: string): Promise<CaptionTaskRecord[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('tasks').objectStore('tasks').index('scope').getAll(IDBKeyRange.only(scope));
    request.onsuccess = () => resolve(request.result.map((row) => row.task as CaptionTaskRecord).filter((task) => task.scope === scope && !task.archivedAt).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12).map((task) => ['preparing', 'transcribing', 'cleaning', 'translating', 'styling', 'emphasizing', 'voicing', 'aligning', 'lipsync', 'rendering'].includes(task.stage) ? { ...task, stage: 'interrupted' } : task));
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function loadCaptionTaskResult(scope: string, id: string): Promise<Blob | undefined> {
  protectMediaCacheEntry(cacheLock(scope, id));
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('results').objectStore('results').get(key(scope, id));
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}

export async function loadCaptionTask(scope: string, id: string): Promise<CaptionTaskRecord | undefined> {
  protectMediaCacheEntry(cacheLock(scope, id));
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('tasks').objectStore('tasks').get(key(scope, id));
    request.onsuccess = () => {
      const task = request.result?.task as CaptionTaskRecord | undefined;
      resolve(task && task.scope === scope && !task.archivedAt ? (['preparing', 'transcribing', 'cleaning', 'translating', 'styling', 'emphasizing', 'voicing', 'aligning', 'lipsync', 'rendering'].includes(task.stage) ? { ...task, stage: 'interrupted' } : task) : undefined);
    };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}

export async function listCaptionProjectSummaries(scope: string): Promise<CaptionProjectSummary[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const rows: CaptionProjectSummary[] = [];
    const request = db.transaction('tasks').objectStore('tasks').index('scope').openCursor(IDBKeyRange.only(scope));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(rows); return; }
      const task = cursor.value.task as CaptionTaskRecord;
      if (task.scope === scope && !task.archivedAt) rows.push({ id: task.id, scope: task.scope, name: task.name, updatedAt: task.updatedAt, durationSec: task.durationSec, stage: task.stage, scene: task.scene, coverThumb: task.coverThumb, cloudPending: task.cloudPending, cloudError: task.cloudError });
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}

/** Metadata changes preserve the current execution record within one transaction. */
export async function patchCaptionProjectMetadata(scope: string, id: string, patch: { name?: string; archivedAt?: number; coverThumb?: string }): Promise<void> {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    const request = store.get(key(scope, id));
    request.onsuccess = () => {
      const row = request.result;
      if (!row || row.task.scope !== scope) { tx.abort(); return; }
      const changedAt = Date.now();
      const userEdit = patch.name !== undefined || patch.archivedAt !== undefined;
      row.task = { ...row.task, ...patch, ...(userEdit ? { updatedAt: changedAt, metadataUpdatedAt: changedAt } : {}) };
      store.put(row);
    };
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Caption project not found'));
  }); } finally { db.close(); }
}

/** A late processing checkpoint cannot undo a newer rename or archive. */
export function mergeCaptionProjectMetadata(incoming: CaptionTaskRecord, stored?: CaptionTaskRecord): CaptionTaskRecord {
  if (!stored || stored.scope !== incoming.scope || stored.id !== incoming.id) return incoming;
  // Background cover extraction must survive an already-running job's next checkpoint.
  if (!incoming.coverThumb && stored.coverThumb && stored.sourceSig === incoming.sourceSig) incoming = { ...incoming, coverThumb: stored.coverThumb };
  if ((stored.metadataUpdatedAt ?? 0) <= (incoming.metadataUpdatedAt ?? 0)) return incoming;
  return { ...incoming, name: stored.name, archivedAt: stored.archivedAt, metadataUpdatedAt: stored.metadataUpdatedAt, updatedAt: Math.max(incoming.updatedAt, stored.updatedAt) };
}

interface StoredCaptionVersion extends CaptionTaskVersion { key: string; project: string; cache?: { cloudConfirmed: boolean; lastAccess: number } }
const versionKey = (scope: string, taskId: string, id: string) => JSON.stringify([scope, taskId, id]);

/** Run inside a single transaction so legacy migration and repeated completion saves are idempotent. */
function withCaptionVersions(tx: IDBTransaction, task: CaptionTaskRecord, done: (rows: CaptionVersionSummary[]) => void) {
  const versions = tx.objectStore('versions');
  const rows: CaptionVersionSummary[] = [];
  const request = versions.index('project').openCursor(IDBKeyRange.only(key(task.scope, task.id)));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) {
      const { id, number, createdAt } = cursor.value as StoredCaptionVersion;
      rows.push({ id, number, createdAt }); cursor.continue(); return;
    }
    if (rows.length) { done(rows); return; }
    const legacy = tx.objectStore('results').get(key(task.scope, task.id));
    legacy.onsuccess = () => {
      if (!legacy.result) { done(rows); return; }
      const row: StoredCaptionVersion = { key: versionKey(task.scope, task.id, 'legacy'), project: key(task.scope, task.id), id: 'legacy', number: 1, createdAt: task.updatedAt, task: structuredClone(task) };
      versions.add(row); tx.objectStore('results').put(legacy.result, row.key);
      done([row]);
    };
  };
}

export async function listCaptionVersions(scope: string, taskId: string): Promise<CaptionVersionSummary[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(['tasks', 'results', 'versions'], 'readwrite');
    let rows: CaptionVersionSummary[] = [];
    const request = tx.objectStore('tasks').get(key(scope, taskId));
    request.onsuccess = () => {
      const task = request.result?.task as CaptionTaskRecord | undefined;
      if (!task || task.scope !== scope || task.archivedAt) return;
      withCaptionVersions(tx, task, (versions) => { rows = versions.map(({ id, number, createdAt }) => ({ id, number, createdAt })).sort((a, b) => b.number - a.number); });
    };
    tx.oncomplete = () => resolve(rows); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}

export async function loadCaptionVersion(scope: string, taskId: string, id: string): Promise<{ version: CaptionTaskVersion; video: Blob } | undefined> {
  return withMediaCacheRead(cacheLock(scope, taskId), async () => {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction(['tasks', 'versions', 'results'], 'readwrite');
    const task = tx.objectStore('tasks').get(key(scope, taskId));
    const version = tx.objectStore('versions').get(versionKey(scope, taskId, id));
    version.onsuccess = () => { if (version.result?.cache) tx.objectStore('versions').put({ ...version.result, cache: { ...version.result.cache, lastAccess: Date.now() } }); };
    const video = tx.objectStore('results').get(versionKey(scope, taskId, id));
    tx.oncomplete = () => resolve(task.result?.task?.scope === scope && !task.result.task.archivedAt && version.result && video.result ? { version: version.result, video: video.result } : undefined);
    tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
  });
}

/** A version becomes expendable only after its immutable cloud version is acknowledged. */
export async function markCaptionVersionSynced(scope: string, taskId: string, id: string): Promise<void> {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('versions', 'readwrite');
    const store = tx.objectStore('versions');
    const request = store.get(versionKey(scope, taskId, id));
    request.onsuccess = () => { if (request.result) store.put({ ...request.result, cache: { cloudConfirmed: true, lastAccess: Date.now() } }); };
    tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}

async function removeVersionCache(row: StoredCaptionVersion): Promise<number> {
  const db = await database();
  try { return await new Promise<number>((resolve, reject) => {
    let bytes = 0;
    const tx = db.transaction(['tasks', 'versions', 'results'], 'readwrite');
    const task = tx.objectStore('tasks').get(row.project);
    const version = tx.objectStore('versions').get(row.key);
    const result = tx.objectStore('results').get(row.key);
    result.onsuccess = () => {
      const current = version.result as StoredCaptionVersion | undefined;
      if (task.result?.task?.cloudPending || !current?.cache?.cloudConfirmed || current.cache.lastAccess >= Date.now() - MEDIA_CACHE_RECENT_MS) return;
      bytes = result.result?.size ?? 0;
      tx.objectStore('results').delete(row.key);
      // Legacy/current result aliases may point to this same immutable version.
      if (task.result?.task?.generationId === row.id) tx.objectStore('results').delete(row.project);
    };
    tx.oncomplete = () => resolve(bytes); tx.onerror = tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}

registerMediaCacheStore('scene-results', async () => {
  const db = await database();
  try { return await new Promise<AdditionalMediaCacheEntry[]>((resolve, reject) => {
    const entries: AdditionalMediaCacheEntry[] = [];
    const tx = db.transaction(['versions', 'results']);
    const request = tx.objectStore('versions').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      const row = cursor.value as StoredCaptionVersion;
      const result = tx.objectStore('results').get(row.key);
      result.onsuccess = () => { if (result.result?.size) entries.push({ key: `scene-project:${row.project}`, bytes: result.result.size, lastAccess: row.cache?.lastAccess ?? row.createdAt, cloudConfirmed: row.cache?.cloudConfirmed === true, remove: () => removeVersionCache(row) }); };
      cursor.continue();
    };
    tx.oncomplete = () => resolve(entries); tx.onerror = tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
});
