// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import type { CaptionTaskRecord, CaptionTaskVersion, CloudSceneProject, CloudSceneVersion } from '@pireel/studio-engine/scene-project';
const mocks = vi.hoisted(() => ({ backup: vi.fn(), fetch: vi.fn(), save: vi.fn(), load: vi.fn(), patch: vi.fn(), version: vi.fn(), saveVersion: vi.fn(), versions: vi.fn(), owner: vi.fn() }));
const files = new Map<string, File>();
vi.mock('./local-media', () => ({ loadLocalVideo: async (sig: string) => files.get(sig) ?? null, saveLocalVideo: async (file: File, sig: string) => { files.set(sig, file); return true; }, alignFileToSig: (file: File) => file }));
vi.mock('./media', () => ({ durableFileSig: async (file: File) => `hash:${file.name}:${file.size}` }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ vault: { backup: mocks.backup, fetch: mocks.fetch }, sceneProjects: { owner: mocks.owner, save: mocks.save, load: mocks.load, patch: mocks.patch, versions: mocks.versions, version: mocks.version, saveVersion: mocks.saveVersion } }) }));
import { saveCaptionTask, loadCaptionTask, loadCaptionMedia, listCaptionVersions, loadCaptionVersion, syncCaptionProject } from './caption-task-store';
import * as local from './caption-task-local';
const projects = new Map<string, CloudSceneProject>();
const versions = new Map<string, CloudSceneVersion>();
const cloudFiles = new Map<string, File>();
const fixture = (): CaptionTaskRecord => ({ id: 'cloud-task', scope: 'owner', scene: 'dubbing', name: 'source.mp4', sourceSig: 'source', width: 1920, height: 1080, durationSec: 10, stage: 'ready', updatedAt: 1, options: { presetId: 'clean', aspect: 'original', shortenPauses: false } });
beforeEach(() => {
  vi.clearAllMocks(); files.clear(); projects.clear(); versions.clear(); cloudFiles.clear();
  vi.stubGlobal('Blob', NodeBlob); vi.stubGlobal('File', NodeFile);
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  files.set('source', new File(['source'], 'source.mp4', { type: 'video/mp4' }));
  mocks.owner.mockResolvedValue('owner');
  mocks.backup.mockImplementation(async (file, sig) => { cloudFiles.set(sig, file); return { key: `owned/${sig}` }; });
  mocks.fetch.mockImplementation(async (sig) => cloudFiles.get(sig) ?? null);
  mocks.save.mockImplementation(async (task: CaptionTaskRecord, revision: number) => {
    const previous = projects.get(task.id);
    if ((previous?.revision ?? 0) !== revision) throw Object.assign(new Error('Project changed remotely'), { status: 409 });
    const next = { task: { ...structuredClone(task), cloudPending: false, cloudError: undefined }, revision: revision + 1 };
    projects.set(task.id, next); return next;
  });
  mocks.load.mockImplementation(async (id) => projects.get(id) ?? null);
  mocks.versions.mockImplementation(async () => [...versions.values()].map(({ version: { id, number, createdAt } }) => ({ id, number, createdAt })));
  mocks.version.mockImplementation(async (_id, version) => versions.get(version) ?? null);
  mocks.saveVersion.mockImplementation(async (_id, version: CaptionTaskVersion, resultSig: string) => {
    const result = versions.get(version.id) ?? { version: { ...structuredClone(version), number: versions.size + 1 }, resultSig };
    versions.set(version.id, result); return result;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('restores project, source, settings and completed versions on another device', async () => {
  await saveCaptionTask(fixture());
  const completed = { ...fixture(), stage: 'completed' as const, generationId: 'version-1', updatedAt: 2 };
  await saveCaptionTask(completed, new Blob(['result'], { type: 'video/mp4' }));
  expect(versions.size).toBe(1);
  files.clear(); vi.stubGlobal('indexedDB', new IDBFactory());
  const task = await loadCaptionTask('owner', 'cloud-task');
  expect(task).toMatchObject({ scene: 'dubbing', options: { presetId: 'clean' }, cloudPending: false });
  expect(await loadCaptionMedia('owner', task!.sourceSig)).toBeInstanceOf(File);
  expect(await listCaptionVersions('owner', 'cloud-task')).toEqual([{ id: 'version-1', number: 1, createdAt: 2 }]);
  expect((await loadCaptionVersion('owner', 'cloud-task', 'version-1'))?.video.size).toBe(6);
});
it('keeps a recoverable local copy when upload fails and migrates every version on retry', async () => {
  mocks.backup.mockResolvedValueOnce(null);
  await expect(saveCaptionTask(fixture())).rejects.toThrow('上传未完成');
  expect((await local.loadCaptionTask('owner', 'cloud-task'))?.cloudPending).toBe(true);
  expect(mocks.save).not.toHaveBeenCalled();
  await local.saveCaptionTask({ ...fixture(), stage: 'completed', generationId: 'old-version', updatedAt: 2 }, new Blob(['old result']));
  await syncCaptionProject('owner', 'cloud-task');
  expect(versions.has('old-version')).toBe(true); expect((await local.loadCaptionTask('owner', 'cloud-task'))?.cloudPending).toBe(false);
});
it('retains edits instead of overwriting a newer cloud revision', async () => {
  await saveCaptionTask(fixture());
  projects.get('cloud-task')!.revision++;
  await expect(saveCaptionTask({ ...fixture(), name: 'Local edit', updatedAt: 3 })).rejects.toMatchObject({ status: 409 });
  expect(projects.get('cloud-task')!.task.name).toBe('source.mp4');
  expect(await local.loadCaptionTask('owner', 'cloud-task')).toMatchObject({ name: 'Local edit', cloudPending: true });
});
it('does not upload another account’s device cache after a session switch', async () => {
  mocks.owner.mockResolvedValue('other');
  await expect(saveCaptionTask(fixture())).rejects.toThrow('账号已变化');
  expect(mocks.backup).not.toHaveBeenCalled(); expect(mocks.save).not.toHaveBeenCalled();
});
it('removes remotely deleted projects rather than resurrecting their cache', async () => {
  await saveCaptionTask(fixture()); projects.clear();
  expect(await loadCaptionTask('owner', 'cloud-task')).toBeUndefined();
  expect(await local.loadCaptionTask('owner', 'cloud-task')).toBeUndefined();
});

it('does not adopt another tab’s newer cache revision for an older open draft', async () => {
  await saveCaptionTask(fixture());
  projects.get('cloud-task')!.revision++;
  projects.get('cloud-task')!.task.name = 'Other tab';
  await local.saveCaptionTask({ ...fixture(), name: 'Other tab', cloudRevision: 2, cloudPending: false });
  await expect(saveCaptionTask({ ...fixture(), name: 'Older open draft', cloudRevision: 1 })).rejects.toMatchObject({ status: 409 });
  expect(projects.get('cloud-task')!.task.name).toBe('Other tab');
});

it('uploads a completed result even when the browser cannot cache it in IndexedDB', async () => {
  vi.spyOn(local, 'saveCaptionTask').mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
  const task = { ...fixture(), stage: 'completed' as const, generationId: 'uncached-result', updatedAt: 2 };
  await saveCaptionTask(task, new Blob(['result'], { type: 'video/mp4' }));
  expect(versions.has('uncached-result')).toBe(true);
  expect(await loadCaptionTask('owner', 'cloud-task')).toMatchObject({ stage: 'completed', cloudPending: false });
});

it('forwards storage transfer progress and only enters saving after source upload succeeds', async () => {
  const progress = vi.fn();
  let finishUpload!: () => void;
  mocks.backup.mockImplementationOnce((_file, _sig, options) => {
    options.onProgress(.42);
    return new Promise<{ key: string }>((resolve) => { finishUpload = () => resolve({ key: 'owned/source' }); });
  });
  const saving = saveCaptionTask(fixture(), undefined, undefined, progress);
  await vi.waitFor(() => expect(progress).toHaveBeenCalledWith({ phase: 'uploading', fraction: .42 }));
  expect(mocks.save).not.toHaveBeenCalled();
  finishUpload(); await saving;
  expect(progress).toHaveBeenCalledWith({ phase: 'uploading', fraction: 1 });
  expect(progress.mock.calls.at(-1)?.[0]).toEqual({ phase: 'saving' });
});
