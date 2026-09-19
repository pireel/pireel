import { studioProviders } from '@pireel/studio-engine/providers';
import { dubbingVideoDocument } from '@pireel/studio-engine/dubbing-task';
import { buildCaptionTaskDocument } from '@pireel/studio-engine/caption-task';
import { type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION, type ProjectSaveWire } from '@pireel/studio-engine/project-dto';
import { createDocumentTransactionId } from '@pireel/studio-engine/document-transaction';
import { loadCaptionVersion, loadCaptionMedia, type CaptionTaskRecord } from './caption-task-store';
import { alignFileToSig, loadLocalVideo, saveLocalVideo } from './local-media';
import { loadCurrentUser } from './current-user';
import { cacheProjectLocally, newProjectId, serverSaveProject, serverLoadProject } from './use-draft-persist';

export function captionAgentRemixDocument(task: CaptionTaskRecord, projectId: string, sourceUrl: string): EditorDocumentV2 {
  if (!task.document && task.scene === 'dubbing') return dubbingVideoDocument(projectId, task.sourceSig, sourceUrl, task.name, task.width, task.height, task.durationSec);
  return task.document ? structuredClone(task.document) : buildCaptionTaskDocument({
    ...task, projectId, sourceName: task.name, sourceUrl, sourceSig: task.sourceSig,
    transcript: task.transcript ?? [], cuts: task.options.shortenPauses ? task.cuts : [],
  });
}

/** Each explicit remix creates a new Agent project; the caption project is never written. */
export async function createCaptionAgentRemix(task: CaptionTaskRecord, sourceFile?: File | null): Promise<string> {
  const user = await loadCurrentUser();
  if (!user || user.auth_method === 'anon' || user.user_id !== task.scope) throw new Error('请登录这个项目所属的账号。');
  const nativeWorkflow = task.workflow?.definition.version === 2 && !!task.workflowData && !!task.document;
  if (!nativeWorkflow && task.scene === 'broll' && task.broll?.outputSig) {
    task = { ...task, sourceSig: task.broll.outputSig };
    const stored = task.generationId ? await loadCaptionVersion(task.scope, task.id, task.generationId) : undefined;
    sourceFile = stored?.video ? alignFileToSig(new File([stored.video], 'broll.mp4', { type: 'video/mp4' }), task.sourceSig) : null;
  }
  if (!nativeWorkflow && task.scene === 'dubbing' && task.dubbing?.outputSig) {
    task = { ...task, sourceSig: task.dubbing.outputSig, width: task.dubbing.outputWidth ?? task.width, height: task.dubbing.outputHeight ?? task.height };
    sourceFile = await loadLocalVideo(task.sourceSig);
    if (!sourceFile && task.generationId) {
      const stored = await loadCaptionVersion(task.scope, task.id, task.generationId).catch(() => undefined);
      if (stored?.video) sourceFile = alignFileToSig(new File([stored.video], 'dubbed.mp4', { type: 'video/mp4' }), task.sourceSig);
    }
  }
  const file = sourceFile ?? await loadCaptionMedia(task.scope, task.sourceSig, task.name);
  if (!file) throw new Error(task.scene === 'dubbing' && task.dubbing?.outputSig ? '译制成片暂时无法读取，请下载该版本后重新导入。' : '请先打开项目，重新选择原视频。');
  if (!(await saveLocalVideo(file, task.sourceSig))) throw new Error('本机空间不足，请清理后重试。');
  if (studioProviders().sceneProjects && !await studioProviders().vault.backup(file, task.sourceSig)) throw new Error('副本素材尚未同步到云端，请重试。');
  const id = newProjectId();
  const url = URL.createObjectURL(file);
  try {
    const document = captionAgentRemixDocument(task, id, url);
    const localAssets: NonNullable<NonNullable<ProjectSaveWire['context']>['localAssets']> = [];
    for (const asset of Object.values(document.assets)) {
      const sig = asset.locator.localSig;
      if (!sig) continue;
      const media = sig === task.sourceSig ? file : await loadCaptionMedia(task.scope, sig, asset.label);
      if (!media) throw new Error('副本素材暂时无法读取：' + (asset.label ?? sig));
      if (sig !== task.sourceSig) {
        if (!await saveLocalVideo(media, sig)) throw new Error('本机空间不足，请清理后重试。');
        if (studioProviders().sceneProjects && !await studioProviders().vault.backup(media, sig)) throw new Error('副本素材尚未同步到云端，请重试。');
      }
      localAssets.push({ assetId: asset.id, contentSig: sig, sig, label: asset.label ?? media.name, kind: asset.kind,
        w: asset.metadata.width ?? task.width, h: asset.metadata.height ?? task.height, durationSec: asset.metadata.durationSec ?? task.durationSec,
        size: media.size, mime: media.type, createdAt: Date.now() });
    }
    const transactionId = createDocumentTransactionId();
    const payload: ProjectSaveWire = {
      documentSchemaVersion: 2, knownVersion: null,
      transactions: [{ id: transactionId, origin: 'user', ops: [{ op: 'document.replace', input: { document } }] }],
      title: task.name.replace(/\.[^.]+$/, '') + (task.scene === 'dubbing' ? ` · ${task.options.dubbing?.language ?? ''}` : '') + ' · Agent Remix',
      videoSig: task.sourceSig, videoDurationSec: task.durationSec,
      context: { schemaVersion: STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION, localAssets },
    };
    const saved = await serverSaveProject(id, payload);
    if (typeof saved !== 'object' || saved.status !== 'saved' || !saved.applied.includes(transactionId)) throw new Error('副本暂时无法保存，请重试。');
    const stored = await serverLoadProject(id);
    if (!stored) throw new Error('副本已创建，暂时无法打开。请从项目列表重试。');
    cacheProjectLocally(stored);
    return id;
  } finally { URL.revokeObjectURL(url); }
}
