import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';

export type CaptionTaskStage = 'ready' | 'transcribing' | 'cleaning' | 'styling' | 'rendering' | 'completed' | 'failed' | 'interrupted';
export interface CaptionTaskRecord {
  id: string; scope: string; name: string; sourceSig: string; width: number; height: number; durationSec: number;
  options: CaptionTaskOptions; stage: CaptionTaskStage; updatedAt: number; error?: string; transcript?: AsrSegment[];
  cuts?: { fromSec: number; toSec: number }[]; document?: EditorDocumentV2; projectId?: string; archivedAt?: number; metadataUpdatedAt?: number; coverThumb?: string;
}
const database = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open('pireel-caption-tasks', 2);
  request.onupgradeneeded = () => {
    const tasks = request.result.objectStoreNames.contains('tasks') ? request.transaction!.objectStore('tasks') : request.result.createObjectStore('tasks', { keyPath: 'key' });
    if (!tasks.indexNames.contains('scope')) tasks.createIndex('scope', 'task.scope');
    if (!request.result.objectStoreNames.contains('results')) request.result.createObjectStore('results');
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const key = (scope: string, id: string) => JSON.stringify([scope, id]);
export async function saveCaptionTask(task: CaptionTaskRecord, result?: Blob) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['tasks', 'results'], 'readwrite');
    const tasks = tx.objectStore('tasks');
    const request = tasks.get(key(task.scope, task.id));
    request.onsuccess = () => tasks.put({ key: key(task.scope, task.id), task: mergeCaptionProjectMetadata(task, request.result?.task) });
    if (result) tx.objectStore('results').put(result, key(task.scope, task.id));
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
export async function listCaptionTasks(scope: string): Promise<CaptionTaskRecord[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('tasks').objectStore('tasks').index('scope').getAll(IDBKeyRange.only(scope));
    request.onsuccess = () => resolve(request.result.map((row) => row.task as CaptionTaskRecord).filter((task) => task.scope === scope && !task.archivedAt).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12).map((task) => ['transcribing', 'cleaning', 'styling', 'rendering'].includes(task.stage) ? { ...task, stage: 'interrupted' } : task));
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function loadCaptionTaskResult(scope: string, id: string): Promise<Blob | undefined> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('results').objectStore('results').get(key(scope, id));
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}

export async function loadCaptionTask(scope: string, id: string): Promise<CaptionTaskRecord | undefined> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('tasks').objectStore('tasks').get(key(scope, id));
    request.onsuccess = () => {
      const task = request.result?.task as CaptionTaskRecord | undefined;
      resolve(task && task.scope === scope && !task.archivedAt ? (['transcribing', 'cleaning', 'styling', 'rendering'].includes(task.stage) ? { ...task, stage: 'interrupted' } : task) : undefined);
    };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}

export type CaptionProjectSummary = Pick<CaptionTaskRecord, 'id' | 'scope' | 'name' | 'updatedAt' | 'durationSec' | 'stage' | 'coverThumb'>;
export async function listCaptionProjectSummaries(scope: string): Promise<CaptionProjectSummary[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const rows: CaptionProjectSummary[] = [];
    const request = db.transaction('tasks').objectStore('tasks').index('scope').openCursor(IDBKeyRange.only(scope));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(rows); return; }
      const task = cursor.value.task as CaptionTaskRecord;
      if (task.scope === scope && !task.archivedAt) rows.push({ id: task.id, scope: task.scope, name: task.name, updatedAt: task.updatedAt, durationSec: task.durationSec, stage: task.stage, coverThumb: task.coverThumb });
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
