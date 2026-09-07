import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';

export type CaptionTaskStage = 'ready' | 'transcribing' | 'cleaning' | 'styling' | 'rendering' | 'completed' | 'failed' | 'interrupted';
export interface CaptionTaskRecord {
  id: string; scope: string; name: string; sourceSig: string; width: number; height: number; durationSec: number;
  options: CaptionTaskOptions; stage: CaptionTaskStage; updatedAt: number; error?: string; transcript?: AsrSegment[];
  cuts?: { fromSec: number; toSec: number }[]; document?: EditorDocumentV2; projectId?: string;
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
    tx.objectStore('tasks').put({ key: key(task.scope, task.id), task });
    if (result) tx.objectStore('results').put(result, key(task.scope, task.id));
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  }); } finally { db.close(); }
}
export async function listCaptionTasks(scope: string): Promise<CaptionTaskRecord[]> {
  const db = await database();
  try { return await new Promise((resolve, reject) => {
    const request = db.transaction('tasks').objectStore('tasks').index('scope').getAll(IDBKeyRange.only(scope));
    request.onsuccess = () => resolve(request.result.map((row) => row.task as CaptionTaskRecord).filter((task) => task.scope === scope).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12).map((task) => ['transcribing', 'cleaning', 'styling', 'rendering'].includes(task.stage) ? { ...task, stage: 'interrupted' } : task));
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
      resolve(task && task.scope === scope ? (['transcribing', 'cleaning', 'styling', 'rendering'].includes(task.stage) ? { ...task, stage: 'interrupted' } : task) : undefined);
    };
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
