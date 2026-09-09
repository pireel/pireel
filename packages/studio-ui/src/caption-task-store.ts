import { studioProviders } from '@pireel/studio-engine/providers';
import type { CaptionTaskRecord, CaptionTaskVersion, CaptionProjectSummary, CaptionVersionSummary } from '@pireel/studio-engine/scene-project';
import * as local from './caption-task-local';
export type * from '@pireel/studio-engine/scene-project';
export { mergeCaptionProjectMetadata } from './caption-task-local';

const cloud = () => studioProviders().sceneProjects;
const chains = new Map<string, Promise<unknown>>();
const migrations = new Set<string>();
const writeRevisions = new Map<string, number>();
let migrationTail = Promise.resolve();
const key = (scope: string, id: string) => JSON.stringify([scope, id]);
const changed = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('pireel-scene-projects-changed')); };
function serial<T>(scope: string, id: string, work: () => Promise<T>): Promise<T> {
  const idKey = key(scope, id);
  const next = (chains.get(idKey) ?? Promise.resolve()).catch(() => {}).then(work);
  chains.set(idKey, next);
  void next.finally(() => { if (chains.get(idKey) === next) chains.delete(idKey); }).catch(() => {});
  return next;
}
const assertScope = (task: CaptionTaskRecord, scope: string) => { if (task.scope !== scope) throw new Error('项目不属于当前账号。'); };
export async function loadCaptionMedia(scope: string, sig: string, label?: string): Promise<File | null> {
  const { loadLocalVideo } = await import('./local-media');
  const cached = await loadLocalVideo(sig);
  if (cached) return cached;
  if (!cloud()) return null;
  if (await cloud()!.owner() !== scope) throw new Error('登录账号已变化，请重新打开项目。');
  const file = await studioProviders().vault.fetch(sig, { label });
  if (!file) return null;
  const { saveLocalVideo, alignFileToSig } = await import('./local-media');
  const aligned = alignFileToSig(file, sig);
  await saveLocalVideo(aligned, sig).catch(() => false);
  return aligned;
}
async function backup(file: File, sig: string) {
  if (!await studioProviders().vault.backup(file, sig)) throw new Error('素材上传未完成，请重试同步。');
}
async function prepareTask(task: CaptionTaskRecord, sourceFile?: File) {
  if ((!task.cloudRevision || task.coverThumb?.startsWith('data:image/')) && await cloud()!.owner() !== task.scope) throw new Error('登录账号已变化，请重新打开项目。');
  let next = { ...task };
  if (!next.cloudRevision) {
    const file = sourceFile ?? await loadCaptionMedia(task.scope, task.sourceSig, task.name);
    if (!file) throw new Error('请重新选择原视频，完成云端同步。');
    await backup(file, task.sourceSig);
  }
  if (next.coverThumb?.startsWith('data:image/')) {
    const blob = await (await fetch(next.coverThumb)).blob();
    const file = new File([blob], 'cover.jpg', { type: blob.type || 'image/jpeg' });
    const { durableFileSig } = await import('./media');
    next.coverSig = await durableFileSig(file); await backup(file, next.coverSig);
  }
  return next;
}
async function saveVersionToCloud(scope: string, id: string, version: CaptionTaskVersion, video: Blob) {
  assertScope(version.task, scope);
  if (await cloud()!.owner() !== scope) throw new Error('登录账号已变化，请重新打开项目。');
  const { durableFileSig } = await import('./media');
  const file = video instanceof File ? video : new File([video], `${id}-${version.id}.mp4`, { type: 'video/mp4' });
  const sig = await durableFileSig(file);
  await backup(file, sig);
  return cloud()!.saveVersion(id, version, sig);
}
async function recordError(task: CaptionTaskRecord, error: unknown) {
  const latest = await local.loadCaptionTask(task.scope, task.id).catch(() => undefined);
  if (latest) await local.saveCaptionTask({ ...latest, cloudPending: true, cloudError: error instanceof Error ? error.message : '云端同步未完成。' }).catch(() => {});
  changed();
}
export async function saveCaptionTask(task: CaptionTaskRecord, result?: Blob, sourceFile?: File): Promise<void> {
  if (!cloud()) return local.saveCaptionTask(task, result);
  return serial(task.scope, task.id, async () => {
    const previous = await local.loadCaptionTask(task.scope, task.id).catch(() => undefined);
    const idKey = key(task.scope, task.id);
    if (!previous && task.cloudRevision === undefined) writeRevisions.delete(idKey);
    let pending = local.mergeCaptionProjectMetadata({ ...task, ...(previous?.coverSig ? { coverSig: previous.coverSig, coverThumb: previous.coverThumb } : {}), cloudRevision: writeRevisions.get(idKey) ?? task.cloudRevision ?? previous?.cloudRevision ?? 0, cloudPending: true, cloudError: undefined }, previous);
    await local.saveCaptionTask(pending, result).catch(() => local.saveCaptionTask(pending).catch(() => {}));
    try {
      pending = await prepareTask(pending, sourceFile);
      // Establish the parent before uploading immutable versions; don't advertise a cloud result before it exists.
      if (!pending.cloudRevision && result) {
        const created = await cloud()!.save({ ...pending, stage: 'ready' }, 0);
        assertScope(created.task, task.scope); pending.cloudRevision = created.revision; writeRevisions.set(idKey, created.revision);
        await local.saveCaptionTask(pending).catch(() => {});
      }
      if (result) await saveVersionToCloud(task.scope, task.id, { id: task.generationId ?? `generated-${task.updatedAt}`, number: 0, createdAt: task.updatedAt, task }, result);
      const stored = await cloud()!.save(pending, pending.cloudRevision ?? 0);
      assertScope(stored.task, task.scope); writeRevisions.set(idKey, stored.revision);
      await local.saveCaptionTask({ ...stored.task, cloudRevision: stored.revision, cloudPending: false, cloudError: undefined }).catch(() => {});
      changed();
    } catch (error) { await recordError(pending, error); throw error; }
  });
}
/** Explicit/background migration of an existing browser project, including all historical results. */
export async function syncCaptionProject(scope: string, id: string) {
  if (!cloud()) return;
  return serial(scope, id, async () => {
    let task = await local.loadCaptionTask(scope, id);
    if (!task || task.archivedAt) return;
    try {
      task = await prepareTask({ ...task, cloudRevision: writeRevisions.get(key(scope, id)) ?? task.cloudRevision });
      if (!task.cloudRevision) {
        const created = await cloud()!.save({ ...task, stage: task.stage === 'completed' ? 'ready' : task.stage }, 0);
        assertScope(created.task, scope); task.cloudRevision = created.revision; writeRevisions.set(key(scope, id), created.revision);
        await local.saveCaptionTask({ ...task, cloudPending: true });
      }
      const remote = new Set((await cloud()!.versions(id)).map((version) => version.id));
      const versions = (await local.listCaptionVersions(scope, id)).sort((a, b) => a.number - b.number);
      for (const version of versions) if (!remote.has(version.id)) {
        const stored = await local.loadCaptionVersion(scope, id, version.id);
        if (stored) await saveVersionToCloud(scope, id, stored.version, stored.video);
      }
      const stored = await cloud()!.save(task, task.cloudRevision ?? 0);
      assertScope(stored.task, scope); writeRevisions.set(key(scope, id), stored.revision);
      await local.saveCaptionTask({ ...stored.task, cloudRevision: stored.revision, cloudPending: false, cloudError: undefined }).catch(() => {});
      changed();
    } catch (error) { await recordError(task, error); throw error; }
  });
}
export async function loadCaptionTask(scope: string, id: string): Promise<CaptionTaskRecord | undefined> {
  const cached = await local.loadCaptionTask(scope, id).catch(() => undefined);
  if (!cloud()) return cached;
  try {
    const stored = await cloud()!.load(id);
    if (stored) {
      assertScope(stored.task, scope);
      if (cached?.cloudPending) return cached;
      writeRevisions.set(key(scope, id), stored.revision);
      const task = { ...stored.task, cloudRevision: stored.revision, cloudPending: false };
      await local.saveCaptionTask(task).catch(() => {});
      const active = ['preparing', 'transcribing', 'cleaning', 'translating', 'styling', 'emphasizing', 'voicing', 'aligning', 'lipsync', 'rendering'].includes(task.stage);
      return active ? { ...task, stage: 'interrupted' } : task;
    }
    if (cached?.cloudRevision) { await local.patchCaptionProjectMetadata(scope, id, { archivedAt: Date.now() }); return undefined; }
    return cached ? { ...cached, cloudPending: true } : undefined;
  } catch (error) {
    if (!cached) throw error;
    return { ...cached, cloudError: error instanceof Error ? error.message : '云端项目暂时无法读取。' };
  }
}
export async function listCaptionProjectSummaries(scope: string): Promise<CaptionProjectSummary[]> {
  const cached = await local.listCaptionProjectSummaries(scope).catch(() => []);
  if (!cloud()) return cached;
  let remote: CaptionProjectSummary[];
  try { remote = await cloud()!.list(); } catch (error) { return cached.map((task) => ({ ...task, cloudError: error instanceof Error ? error.message : '云端项目暂时无法读取。' })); }
  for (const row of remote) if (row.scope !== scope) throw new Error('项目不属于当前账号。');
  const merged = new Map(remote.map((row) => [row.id, row]));
  for (const row of cached) {
    const task = await local.loadCaptionTask(scope, row.id);
    if (!task) continue;
    if (!task.cloudRevision || task.cloudPending) {
      merged.set(row.id, { ...row, cloudPending: true });
      const idKey = key(scope, row.id);
      if ((!task.cloudRevision || task.cloudError) && !migrations.has(idKey)) { migrations.add(idKey); migrationTail = migrationTail.catch(() => {}).then(() => syncCaptionProject(scope, row.id)).catch(() => {}); }
    }
  }
  return [...merged.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}
export async function listCaptionTasks(scope: string): Promise<CaptionTaskRecord[]> {
  if (!cloud()) return local.listCaptionTasks(scope);
  const summaries = (await listCaptionProjectSummaries(scope)).slice(0, 12);
  return (await Promise.all(summaries.map((summary) => loadCaptionTask(scope, summary.id)))).filter((task): task is CaptionTaskRecord => !!task);
}
export async function patchCaptionProjectMetadata(scope: string, id: string, patch: { name?: string; archivedAt?: number; coverThumb?: string }) {
  if (!cloud()) return local.patchCaptionProjectMetadata(scope, id, patch);
  const task = await loadCaptionTask(scope, id);
  if (!task) throw new Error('找不到项目。');
  if (!task.cloudRevision) await syncCaptionProject(scope, id);
  return serial(scope, id, async () => {
    const cover = patch.coverThumb ? await prepareTask({ ...task, cloudRevision: task.cloudRevision || 1, coverThumb: patch.coverThumb }) : undefined;
    const stored = await cloud()!.patch(id, { ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.archivedAt ? { archivedAt: patch.archivedAt } : {}), ...(cover?.coverSig ? { coverSig: cover.coverSig } : {}) });
    assertScope(stored.task, scope);
    const pending = await local.loadCaptionTask(scope, id);
    if (!pending?.cloudPending || patch.archivedAt) writeRevisions.set(key(scope, id), stored.revision);
    await local.saveCaptionTask(pending?.cloudPending && !patch.archivedAt ? { ...local.mergeCaptionProjectMetadata(pending, stored.task), cloudPending: true } : { ...stored.task, cloudRevision: stored.revision, cloudPending: false }); changed();
  });
}
export async function listCaptionVersions(scope: string, id: string): Promise<CaptionVersionSummary[]> {
  const cached = await local.listCaptionVersions(scope, id).catch(() => []);
  if (!cloud()) return cached;
  const task = await loadCaptionTask(scope, id);
  if (!task) return [];
  if (!task.cloudRevision) return cached;
  const remote = await cloud()!.versions(id);
  return [...remote, ...cached.filter((version) => !remote.some((row) => row.id === version.id))].sort((a, b) => b.number - a.number);
}
export async function loadCaptionVersion(scope: string, id: string, versionId: string): Promise<{ version: CaptionTaskVersion; video: Blob } | undefined> {
  const cached = await local.loadCaptionVersion(scope, id, versionId).catch(() => undefined);
  if (!cloud()) return cached;
  const task = await loadCaptionTask(scope, id);
  if (!task) return undefined;
  if (!task.cloudRevision) return cached;
  const stored = await cloud()!.version(id, versionId);
  if (!stored) return cached;
  assertScope(stored.version.task, scope);
  const video = cached?.video ?? await loadCaptionMedia(scope, stored.resultSig, `${task.name}-v${stored.version.number}.mp4`);
  if (!video) throw new Error('成片暂时无法下载，请稍后重试。');
  return { version: stored.version, video };
}
export async function loadCaptionTaskResult(scope: string, id: string): Promise<Blob | undefined> {
  const versions = await listCaptionVersions(scope, id);
  return versions[0] ? (await loadCaptionVersion(scope, id, versions[0].id))?.video : local.loadCaptionTaskResult(scope, id);
}
