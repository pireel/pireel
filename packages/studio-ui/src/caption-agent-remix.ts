import { studioProviders } from '@pireel/studio-engine/providers';
import { dubbingVideoDocument } from '@pireel/studio-engine/dubbing-task';
import { buildCaptionTaskDocument } from '@pireel/studio-engine/caption-task';
import { firstNarrativeAssetId, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION, type ProjectSavePayload } from '@pireel/studio-engine/project-dto';
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
  if (task.scene === 'dubbing' && task.dubbing?.outputSig) {
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
    const assetId = firstNarrativeAssetId(document);
    const payload: ProjectSavePayload = {
      document, title: task.name.replace(/\.[^.]+$/, '') + (task.scene === 'dubbing' ? ` · ${task.options.dubbing?.language ?? ''}` : '') + ' · Agent Remix',
      videoSig: task.sourceSig, videoDurationSec: task.durationSec,
      context: { schemaVersion: STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION, ...(assetId ? { localAssets: [{ assetId, contentSig: task.sourceSig, sig: task.sourceSig, label: task.name, kind: 'video' as const, w: task.width, h: task.height, durationSec: task.durationSec, size: file.size, mime: file.type, createdAt: Date.now() }] } : {}) },
    };
    if (await serverSaveProject(id, payload) !== 'ok') throw new Error('副本暂时无法保存，请重试。');
    const stored = await serverLoadProject(id);
    if (!stored) throw new Error('副本已创建，暂时无法打开。请从项目列表重试。');
    cacheProjectLocally(stored);
    return id;
  } finally { URL.revokeObjectURL(url); }
}
