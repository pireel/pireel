import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveCaptionTask, listCaptionVersions, loadCaptionVersion, loadCaptionTask, type CaptionTaskRecord } from './caption-task-store';
const task = (generationId = 'v1'): CaptionTaskRecord => ({ id: 'task', scope: 'owner', generationId, name: 'demo.mp4', sourceSig: 'source', width: 1920, height: 1080, durationSec: 4, stage: 'completed', updatedAt: 10, options: { presetId: 'clean', aspect: 'original', shortenPauses: false } });
beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange); });
afterEach(() => vi.unstubAllGlobals());
describe('caption version persistence', () => {
  it('keeps each completed video and settings immutable across regeneration and retries', async () => {
    const first = task(); await saveCaptionTask(first, new Blob(['first']));
    const second = { ...task('v2'), updatedAt: 20, options: { ...first.options, presetId: 'neon' } };
    await saveCaptionTask({ ...second, stage: 'failed' });
    expect(await listCaptionVersions('owner', 'task')).toHaveLength(1);
    await saveCaptionTask(second, new Blob(['second']));
    await saveCaptionTask({ ...second, options: first.options }, new Blob(['must not overwrite']));
    expect((await listCaptionVersions('owner', 'task')).map(({ number }) => number)).toEqual([2, 1]);
    const old = await loadCaptionVersion('owner', 'task', 'v1'); const latest = await loadCaptionVersion('owner', 'task', 'v2');
    expect(await old!.video.text()).toBe('first'); expect(old!.version.task.options.presetId).toBe('clean');
    expect(await latest!.video.text()).toBe('second'); expect(latest!.version.task.options.presetId).toBe('neon');
    await saveCaptionTask({ ...second, draftOptions: { ...first.options, translationLanguage: 'English' } });
    expect((await loadCaptionVersion('owner', 'task', 'v2'))!.version.task.draftOptions).toBeUndefined();
    expect((await loadCaptionTask('owner', 'task'))!.draftOptions?.translationLanguage).toBe('English');
  });
  it('assigns distinct numbers for concurrent completion transactions and isolates accounts', async () => {
    await Promise.all([saveCaptionTask(task('a'), new Blob(['a'])), saveCaptionTask(task('b'), new Blob(['b']))]);
    expect((await listCaptionVersions('owner', 'task')).map(({ number }) => number)).toEqual([2, 1]);
    expect(await loadCaptionVersion('other', 'task', 'a')).toBeUndefined();
    expect(await listCaptionVersions('other', 'task')).toEqual([]);
  });
  it('migrates the previous single result before saving a new version', async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('pireel-caption-tasks', 2);
      request.onupgradeneeded = () => { const tasks = request.result.createObjectStore('tasks', { keyPath: 'key' }); tasks.createIndex('scope', 'task.scope'); request.result.createObjectStore('results'); };
      request.onsuccess = () => {
        const db = request.result; const tx = db.transaction(['tasks', 'results'], 'readwrite');
        const original = { ...task(), generationId: undefined };
        tx.objectStore('tasks').put({ key: JSON.stringify(['owner', 'task']), task: original });
        tx.objectStore('results').put(new Blob(['legacy']), JSON.stringify(['owner', 'task']));
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });
    await saveCaptionTask(task('new'), new Blob(['new']));
    expect((await listCaptionVersions('owner', 'task')).map(({ number }) => number)).toEqual([2, 1]);
    expect(await (await loadCaptionVersion('owner', 'task', 'legacy'))!.video.text()).toBe('legacy');
    expect((await listCaptionVersions('owner', 'task'))).toHaveLength(2);
  });
});
