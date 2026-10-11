import { studioAgentModelId, type StudioAgentModelId } from '@pireel/studio-engine/agent-models';
import { brandMediaAssets, playbookAppearance } from '@pireel/studio-engine/brand-media';
import { studioProviders } from '@pireel/studio-engine/providers';
import { compositionToEditorDocument, emptyComposition } from '@pireel/studio-engine/composition';
import { EDITING_SKILL_IDS } from '@pireel/studio-engine/editing-skills';
import type { PlaybookSnapshot } from '@pireel/studio-engine/brand-playbook';
import { HOME_VIDEO_EDITING_SKILL } from '@pireel/studio-engine/editing-run-config';
import { STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION, type ProjectSaveWire } from '@pireel/studio-engine/project-dto';
import { createDocumentTransactionId } from '@pireel/studio-engine/document-transaction';
import { loadCurrentUser } from './current-user';
import { durableFileSig, fileSig, probeVideoFile } from './media';
import { saveLocalVideo } from './local-media';
import { cacheProjectLocally, newProjectId, serverSaveProject, serverLoadProject } from './use-draft-persist';
import { importLocalSource, localAssetIndexEntry } from './local-import-session';
import type { LocalAssetIndexEntry } from '@pireel/studio-engine/project-dto';

/** An image's pixel size, for the library card and placement. */
async function imageSize(file: File): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch { return null; }
}

/** Keep the launch request until its first user message has been checkpointed. */
const START_PROMPT_KEY = (projectId: string) => `studio:start-prompt:${projectId}`;

export function takeAgentStartPrompt(projectId: string): string | null {
  try {
    const prompt = localStorage.getItem(START_PROMPT_KEY(projectId)) ?? sessionStorage.getItem(START_PROMPT_KEY(projectId));
    return prompt;
  } catch { return null; }
}

export function acknowledgeAgentStartPrompt(projectId: string): void {
  try { localStorage.removeItem(START_PROMPT_KEY(projectId)); sessionStorage.removeItem(START_PROMPT_KEY(projectId)); } catch { /* The saved task also deduplicates startup. */ }
}

/** Where making the project is: each step the Studio home shows, with how far it is when that can be told. */
export type AgentProjectProgress =
  | { phase: 'reading' | 'checking' | 'creating' }
  | { phase: 'storing'; fraction: number }
  | { phase: 'materials'; done: number; total: number };

/**
 * A new Agent project holding one video and the materials given with it, with the brand it is edited
 * with (a copy; null = none), the editing skills it starts with and the first message its agent is
 * asked: the Studio home's way into the agent. Everything here stays on this device (read, fingerprinted,
 * cached); the editor uploads the media in the background once it opens, so nothing waits on the network.
 * The materials go to the project's library, for the agent to place.
 */
export async function createAgentProjectFromVideo(file: File, options: { brand: PlaybookSnapshot | null; skills: readonly string[]; prompt: string; agentModel?: StudioAgentModelId; materials?: readonly File[]; report?: (progress: AgentProjectProgress) => void }): Promise<string> {
  options.report?.({ phase: 'reading' });
  const [data, user] = await Promise.all([probeVideoFile(file), loadCurrentUser()]);
  if (!user || user.auth_method === 'anon') throw new Error('请先登录。');
  if (![data.durationSec, data.width, data.height].every((value) => Number.isFinite(value) && value > 0)) throw new Error('无法读取视频，请换一个文件。');
  options.report?.({ phase: 'checking' });
  const sig = studioProviders().sceneProjects ? await durableFileSig(file) : fileSig(file);
  options.report?.({ phase: 'storing', fraction: 0 });
  if (!(await saveLocalVideo(file, sig, { onProgress: (fraction) => options.report?.({ phase: 'storing', fraction }) }))) throw new Error('本机空间不足，请清理后重试。');
  const materials: LocalAssetIndexEntry[] = [];
  const total = options.materials?.length ?? 0;
  for (const [index, material] of (options.materials ?? []).entries()) {
    options.report?.({ phase: 'materials', done: index, total });
    const imported = await importLocalSource({ type: 'browser', file: material });
    // The editor opens from the device copy; without one the material would not reach it.
    if (imported.cacheMiss) throw new Error('本机空间不足，请清理后重试。');
    const size = imported.kind === 'image' ? await imageSize(material) : null;
    materials.push(localAssetIndexEntry(imported, size ?? undefined));
  }
  options.report?.({ phase: 'creating' });
  const id = newProjectId();
  const url = URL.createObjectURL(file);
  try {
    const composition = { ...emptyComposition(), width: data.width, height: data.height, video: { url, durationSec: data.durationSec }, shots: [{ id: 'source-video', srcStart: 0, srcEnd: data.durationSec, treatment: 'full' as const }] };
    const document = compositionToEditorDocument({ projectId: id, videoSig: sig, composition }).document;
    // A brand brings its Skill (the kind of video it is a style of).
    // The homepage's talking-head workflow is the same with or without a brand.
    document.semantics = { ...document.semantics, brand: options.brand, agentModel: studioAgentModelId(options.agentModel), skillId: HOME_VIDEO_EDITING_SKILL, editingSkills: EDITING_SKILL_IDS.filter((skill) => options.skills.includes(skill)) };
    if (options.brand) document.appearance = { ...document.appearance, palette: { ...document.appearance.palette, ...playbookAppearance(options.brand).palette } };
    const localAssets: NonNullable<NonNullable<ProjectSaveWire['context']>['localAssets']> = [];
    for (const asset of Object.values(document.assets)) {
      if (asset.kind !== 'video') continue;
      asset.label = file.name;
      localAssets.push({ assetId: asset.id, contentSig: sig, sig, label: file.name, kind: asset.kind, w: data.width, h: data.height, durationSec: data.durationSec, size: file.size, mime: file.type, createdAt: Date.now() });
    }
    localAssets.push(...materials);
    if (options.brand) document.assets = { ...document.assets, ...brandMediaAssets(options.brand) };
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
    try { localStorage.setItem(START_PROMPT_KEY(id), options.prompt); } catch { sessionStorage.setItem(START_PROMPT_KEY(id), options.prompt); }
    return id;
  } finally { URL.revokeObjectURL(url); }
}
