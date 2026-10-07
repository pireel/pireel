import { studioProviders } from '@pireel/studio-engine/providers';
import { compositionToEditorDocument, emptyComposition } from '@pireel/studio-engine/composition';
import { EDITING_SKILL_IDS } from '@pireel/studio-engine/editing-skills';
import { STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION, type ProjectSaveWire } from '@pireel/studio-engine/project-dto';
import { createDocumentTransactionId } from '@pireel/studio-engine/document-transaction';
import { loadCurrentUser } from './current-user';
import { durableFileSig, fileSig, probeVideoFile } from './media';
import { saveLocalVideo } from './local-media';
import { cacheProjectLocally, newProjectId, serverSaveProject, serverLoadProject } from './use-draft-persist';

/** The first message an Agent project made this way sends once it opens (read once, then removed). */
const START_PROMPT_KEY = (projectId: string) => `studio:start-prompt:${projectId}`;

export function takeAgentStartPrompt(projectId: string): string | null {
  try {
    const prompt = sessionStorage.getItem(START_PROMPT_KEY(projectId));
    if (prompt !== null) sessionStorage.removeItem(START_PROMPT_KEY(projectId));
    return prompt;
  } catch { return null; }
}

/**
 * A new Agent project holding one video, with the editing skills it starts with and the first message
 * its agent is asked: the Studio home's way into the agent. Saved like an Agent Remix copy (the video
 * kept on this device and backed up), so the editor opens it with its media.
 */
export async function createAgentProjectFromVideo(file: File, options: { skills: readonly string[]; prompt: string; report?: (phase: 'preparing' | 'saving') => void }): Promise<string> {
  options.report?.('preparing');
  const [data, user] = await Promise.all([probeVideoFile(file), loadCurrentUser()]);
  if (!user || user.auth_method === 'anon') throw new Error('请先登录。');
  if (![data.durationSec, data.width, data.height].every((value) => Number.isFinite(value) && value > 0)) throw new Error('无法读取视频，请换一个文件。');
  const sig = studioProviders().sceneProjects ? await durableFileSig(file) : fileSig(file);
  if (!(await saveLocalVideo(file, sig))) throw new Error('本机空间不足，请清理后重试。');
  if (studioProviders().sceneProjects && !await studioProviders().vault.backup(file, sig)) throw new Error('视频尚未同步到云端，请重试。');
  options.report?.('saving');
  const id = newProjectId();
  const url = URL.createObjectURL(file);
  try {
    const composition = { ...emptyComposition(), width: data.width, height: data.height, video: { url, durationSec: data.durationSec }, shots: [{ id: 'source-video', srcStart: 0, srcEnd: data.durationSec, treatment: 'full' as const }] };
    const document = compositionToEditorDocument({ projectId: id, videoSig: sig, composition }).document;
    document.semantics = { ...document.semantics, editingSkills: EDITING_SKILL_IDS.filter((skill) => options.skills.includes(skill)) };
    const localAssets: NonNullable<NonNullable<ProjectSaveWire['context']>['localAssets']> = [];
    for (const asset of Object.values(document.assets)) {
      if (asset.kind !== 'video') continue;
      asset.label = file.name;
      localAssets.push({ assetId: asset.id, contentSig: sig, sig, label: file.name, kind: asset.kind, w: data.width, h: data.height, durationSec: data.durationSec, size: file.size, mime: file.type, createdAt: Date.now() });
    }
    const transactionId = createDocumentTransactionId();
    const payload: ProjectSaveWire = {
      documentSchemaVersion: 2, knownVersion: null,
      transactions: [{ id: transactionId, origin: 'user', ops: [{ op: 'document.replace', input: { document } }] }],
      title: file.name.replace(/\.[^.]+$/, ''), videoSig: sig, videoDurationSec: data.durationSec,
      context: { schemaVersion: STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION, localAssets },
    };
    const saved = await serverSaveProject(id, payload);
    if (typeof saved !== 'object' || saved.status !== 'saved' || !saved.applied.includes(transactionId)) throw new Error('项目暂时无法保存，请重试。');
    const stored = await serverLoadProject(id);
    if (!stored) throw new Error('项目已创建，暂时无法打开。请从项目列表重试。');
    cacheProjectLocally(stored);
    try { sessionStorage.setItem(START_PROMPT_KEY(id), options.prompt); } catch { /* the editor opens without a first message */ }
    return id;
  } finally { URL.revokeObjectURL(url); }
}
