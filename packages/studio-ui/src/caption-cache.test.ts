import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as local from './caption-task-local';
import { additionalMediaCacheEntries } from './local-media-cache';
import { loadCaptionVersion } from './caption-task-store';
import { setStudioProviders, unavailableProviders } from '@pireel/studio-engine/providers';

beforeEach(() => { vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); setStudioProviders(unavailableProviders()); });
it('evicts only acknowledged version bytes and restores a cold version from the cloud', async () => {
  let now = 1_000_000; vi.spyOn(Date, 'now').mockImplementation(() => now);
  const task: local.CaptionTaskRecord = { id: 'task', scope: 'owner', generationId: 'v1', name: 'demo.mp4', sourceSig: 'source', width: 1920, height: 1080, durationSec: 4, stage: 'completed', updatedAt: now, cloudRevision: 1, cloudPending: false, options: { caption: {}, aspect: 'original', shortenPauses: false } };
  await local.saveCaptionTask(task, new Blob(['video']));
  expect((await additionalMediaCacheEntries())[0].cloudConfirmed).toBe(false);
  await local.markCaptionVersionSynced('owner', 'task', 'v1');
  now += 600_000;
  const candidate = (await additionalMediaCacheEntries())[0];
  expect(candidate.cloudConfirmed).toBe(true);
  await local.saveCaptionTask({ ...task, cloudPending: true });
  expect(await candidate.remove()).toBe(0);
  await local.saveCaptionTask(task);
  expect(await candidate.remove()).toBe(5);
  expect(await local.loadCaptionVersion('owner', 'task', 'v1')).toBeUndefined();
  expect(await local.loadCaptionTask('owner', 'task')).toBeDefined();
  expect(await local.listCaptionVersions('owner', 'task')).toHaveLength(1);
  const fetch = vi.fn(async () => new File(['video'], 'result.mp4'));
  const version = { id: 'v1', number: 1, createdAt: task.updatedAt, task };
  setStudioProviders({ ...unavailableProviders(), vault: { backup: async () => null, fetch }, sceneProjects: {
    owner: async () => 'owner', list: async () => [], load: async () => ({ task, revision: 1 }),
    save: async () => ({ task, revision: 1 }), patch: async () => ({ task, revision: 1 }),
    versions: async () => [version], version: async () => ({ version, resultSig: 'result:5:0' }), saveVersion: async () => ({ version, resultSig: 'result:5:0' }),
  } });
  expect(await (await loadCaptionVersion('owner', 'task', 'v1'))?.video.text()).toBe('video');
  expect(fetch).toHaveBeenCalledTimes(1);
});
