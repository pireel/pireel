import { editingWorkflowNodes } from './editing-workflow-nodes';
import type { CaptionTaskRecord } from '@pireel/studio-engine/scene-project';
import type { WorkflowDefinition, WorkflowRun } from '@pireel/studio-engine/workflow';
import { createWorkflowRun } from '@pireel/studio-engine/workflow';
import { emptySceneWorkflowData } from '@pireel/studio-engine/workflow-artifacts';
import { workflowLabPreset, WORKFLOW_NODE_CATALOG, workflowToTarget } from '@pireel/studio-engine/workflow-editor';
import { SceneWorkflowHost, type SceneWorkflowHooks } from './scene-workflow-runtime';
import { captionWorkflowNodes } from './caption-workflow-nodes';
import { dubbingWorkflowNodes } from './dubbing-workflow-nodes';
import { brollWorkflowNodes } from './broll-workflow-nodes';
import { textWorkflowNodes } from './text-workflow-nodes';
import { loadLocalVideo, saveLocalVideo } from './local-media';
export interface WorkflowLabSession { previousDefinition?: WorkflowDefinition; recipeDefinition?: WorkflowDefinition; recipe?: import('@pireel/studio-engine/editing-capabilities').EditingRecipe; editingGroups?: Record<string, string[]>; editingTargets?: Record<string, string>; schemaVersion: 1; id: string; scope: string; name: string; definition: WorkflowDefinition; task: CaptionTaskRecord; history: WorkflowRun[] }
export function newWorkflowLabSession(scope: string): WorkflowLabSession {
  const id = crypto.randomUUID();
  const definition: WorkflowDefinition = { schemaVersion: 1, id: 'local-workflow-test', version: 1, title: '我的测试流程', templateId: 'workflow-lab', parameters: { projectId: { type: 'string', label: { zh: '测试项目', en: 'Test project' }, default: id } }, trigger: { kind: 'manual' }, steps: [{ id: 'input', capability: 'data.value', version: 1, dependsOn: [], arguments: { value: { kind: 'literal', value: { text: '这是一段用于组合测试的文案。' } } } }] };
  return { schemaVersion: 1, id, scope, name: definition.title, definition, history: [], task: { id, scope, name: '未选择媒体', sourceSig: 'lab-' + id, width: 1080, height: 1920, durationSec: 1, stage: 'ready', updatedAt: Date.now(), options: { presetId: 'clean', layoutVersion: 2, aspect: 'original', shortenPauses: false }, workflowData: emptySceneWorkflowData() } };
}
export async function workflowLabSource(session: WorkflowLabSession, file: File): Promise<WorkflowLabSession> {
  const { durableFileSig, probeVideoFile } = await import('./media');
  const [sig, metadata] = await Promise.all([durableFileSig(file), probeVideoFile(file)]);
  if (!await saveLocalVideo(file, sig)) throw new Error('素材未保存到本机，请检查可用空间。');
  const next = structuredClone(session); const changed = sig !== next.task.sourceSig;
  next.task = { ...next.task, sourceSig: sig, name: file.name, ...metadata, stage: 'ready', ...(changed ? { transcript: undefined, cuts: undefined, dubbing: undefined, broll: undefined, document: undefined, generationId: undefined } : {}) };
  const host = new SceneWorkflowHost(next.task, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: () => {} });
  const ref = await host.store.put('media', sig, { sig, name: file.name, width: metadata.width, height: metadata.height, durationSec: metadata.durationSec });
  next.task.workflowData = host.data;
  if (changed) for (const step of next.definition.steps) {
    const source = step.arguments.media;
    const usesSource = source?.kind === 'input' && source.key === 'source' || source?.kind === 'literal' && (source.value as { id?: string } | null)?.id === session.task.sourceSig;
    if (usesSource && step.capability === 'speech.transcribe') step.arguments.transcript = { kind: 'literal', value: null };
    if (usesSource && source?.kind === 'literal') step.arguments.media = { kind: 'literal', value: ref as never };
    if (usesSource && step.capability === 'speech.pause-plan') step.arguments.cuts = { kind: 'literal', value: null };
  }
  if (next.definition.parameters.source) next.definition.parameters.source.default = ref as never;
  if (next.definition.parameters.duration) next.definition.parameters.duration.default = metadata.durationSec;
  return next;
}
export async function createWorkflowLabPreset(session: WorkflowLabSession, kind: 'captions' | 'dubbing' | 'broll'): Promise<WorkflowLabSession> {
  const next = structuredClone(session); const task = next.task;
  const file = await loadLocalVideo(task.sourceSig);
  if (!file) throw new Error('请先添加一段原视频。');
  task.scene = kind; task.options = { ...task.options, dubbing: kind === 'dubbing' ? task.options.dubbing ?? { language: 'English', voiceId: '', lipSync: false, captions: true } : undefined, broll: kind === 'broll' ? task.options.broll ?? { assets: [], captions: true } : undefined };
  const host = new SceneWorkflowHost(task, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: () => {} });
  const media = await host.store.put('media', task.sourceSig, { sig: task.sourceSig, name: task.name, width: task.width, height: task.height, durationSec: task.durationSec });
  const transcript = task.transcript?.length ? await host.store.put('transcript', task.sourceSig, task.transcript) : null;
  next.definition = workflowLabPreset(kind, task, media, transcript); next.task.workflowData = host.data;
  next.task.workflowDefinition = undefined; next.task.workflow = undefined; next.task.generationId = undefined;
  next.name = next.definition.title;
  return next;
}
async function runWorkflowLabUnlocked(session: WorkflowLabSession, hooks: Pick<SceneWorkflowHooks, 'signal' | 'progress'> & { checkpoint: (session: WorkflowLabSession) => Promise<void> }, targetStepId?: string) {
  let next = structuredClone(session);
  const executable = targetStepId ? workflowToTarget(next.definition, targetStepId) : next.definition;
  const file = await loadLocalVideo(next.task.sourceSig);
  // Keep the run identity when recovering; edits use new keys, so old approvals cannot authorize changed data.
  next.task.generationId ??= crypto.randomUUID(); next.task.workflowDefinition = undefined;
  const host = new SceneWorkflowHost(next.task, file, { ...hooks, definition: next.definition, checkpoint: async task => { next = { ...next, task }; await hooks.checkpoint(structuredClone(next)); } });
  try {
    // Validate the whole requested subgraph before any provider call.
    createWorkflowRun(executable, {}, { projectId: next.id, outputId: next.id, revision: next.task.sourceSig }, WORKFLOW_NODE_CATALOG, next.task.generationId);
    const result = await host.executeGraph(next.definition, [...captionWorkflowNodes(host), ...dubbingWorkflowNodes(host), ...brollWorkflowNodes(host), ...textWorkflowNodes(host), ...editingWorkflowNodes(host)], targetStepId);
    next = { ...next, task: { ...result.task, stage: result.run.status === 'waiting' ? 'waiting' : 'completed' } };
    next.history = [result.run, ...next.history.filter(run => run.id !== result.run.id)].slice(0, 10);
    if (result.video) {
      const render = [...result.run.steps].reverse().find(step => step.artifact?.data.media && step.id === result.run.definition.steps.find(node => node.id === step.id && node.capability === 'video.render')?.id);
      const media = render && host.store.read<{ sig: string; name: string }>(render.artifact!.data.media, 'media');
      if (media && !await saveLocalVideo(new File([result.video], media.name, { type: 'video/mp4' }), media.sig)) throw new Error('成片未缓存，请立即下载保存。');
    }
    await hooks.checkpoint(next);
    return { session: next, video: result.video };
  } finally { host.dispose(); }
}
const DB = 'pireel-workflow-lab';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open(DB, 1); request.onupgradeneeded = () => request.result.createObjectStore('sessions', { keyPath: 'key' }); request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result); });
}
export async function saveWorkflowLab(session: WorkflowLabSession): Promise<void> {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction('sessions', 'readwrite'); tx.objectStore('sessions').put({ key: session.scope, session }); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('工作流保存已取消。')); }); } finally { db.close(); }
}
export async function loadWorkflowLab(scope: string): Promise<WorkflowLabSession | null> {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const request = db.transaction('sessions').objectStore('sessions').get(scope); request.onsuccess = () => { const session = request.result?.session; resolve(session?.schemaVersion === 1 && session.scope === scope ? session : null); }; request.onerror = () => reject(request.error); }); } finally { db.close(); }
}
export async function workflowLabFootage(session: WorkflowLabSession, files: File[]): Promise<WorkflowLabSession> {
  const next = structuredClone(session); const { durableFileSig, probeVideoFile } = await import('./media');
  const assets = [...(next.task.options.broll?.assets ?? [])];
  if (assets.length + files.length > 20) throw new Error('最多添加 20 个补充素材。');
  for (const file of files) {
    const sig = await durableFileSig(file);
    const image = file.type.startsWith('image/');
    const metadata = image ? await createImageBitmap(file).then(bitmap => { const value = { width: bitmap.width, height: bitmap.height, durationSec: 5 }; bitmap.close(); return value; }) : await probeVideoFile(file);
    if (!await saveLocalVideo(file, sig)) throw new Error('补充素材未保存到本机。');
    if (!assets.some(asset => asset.sig === sig)) assets.push({ id: crypto.randomUUID(), sig, name: file.name, kind: image ? 'image' : 'video', ...metadata });
  }
  next.task.options.broll = { ...next.task.options.broll, assets, captions: next.task.options.broll?.captions ?? true };
  for (const step of next.definition.steps) {
    if (step.capability === 'media.analyze') step.arguments.assets = { kind: 'literal', value: assets as never };
    if (step.capability === 'broll.compose') { const options = step.arguments.options; step.arguments.options = { kind: 'literal', value: { ...(options?.kind === 'literal' && options.value && typeof options.value === 'object' ? options.value : {}), assets, captions: next.task.options.broll.captions } as never }; }
  }
  return next;
}
export async function workflowLabTranscript(session: WorkflowLabSession, transcript: import('@pireel/studio-engine/build-blocks').AsrSegment[]): Promise<WorkflowLabSession> {
  if (!Array.isArray(transcript) || !transcript.length || transcript.some(segment => !segment.text?.trim() || !Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.start < 0 || segment.end <= segment.start || segment.end > session.task.durationSec)) throw new Error('转写需要 text、start、end，且时间必须在媒体范围内。');
  const next = structuredClone(session); next.task.transcript = transcript;
  const { WorkflowArtifactStore } = await import('@pireel/studio-engine/workflow-artifacts');
  next.task.workflowData ??= emptySceneWorkflowData();
  const ref = await new WorkflowArtifactStore(next.task.workflowData.artifacts).put('transcript', next.task.sourceSig, transcript);
  const first = next.definition.steps.find(step => step.capability === 'speech.transcribe');
  if (first) first.arguments.transcript = { kind: 'literal', value: ref as never };
  return next;
}

/** One active media execution per account per browser, including other tabs. */
export async function runWorkflowLab(...args: Parameters<typeof runWorkflowLabUnlocked>) {
  if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request('workflow-lab:' + args[0].scope, { ifAvailable: true }, async lock => {
    if (!lock) throw new Error('另一个页面正在运行这个测试，请等它结束。');
    return runWorkflowLabUnlocked(...args);
  });
  return runWorkflowLabUnlocked(...args);
}

export async function prepareEditingWorkflow(session: WorkflowLabSession): Promise<WorkflowLabSession> {
  const { compileEditingWorkflow } = await import('@pireel/studio-engine/editing-workflow');
  const { defaultEditingRecipe } = await import('@pireel/studio-engine/editing-capabilities');
  const { WorkflowArtifactStore } = await import('@pireel/studio-engine/workflow-artifacts');
  const next = structuredClone(session); next.recipe ??= defaultEditingRecipe(); next.task.workflowData ??= emptySceneWorkflowData();
  const store = new WorkflowArtifactStore(next.task.workflowData.artifacts);
  const media = await store.put('media', next.task.sourceSig, { sig: next.task.sourceSig, name: next.task.name, width: next.task.width, height: next.task.height, durationSec: next.task.durationSec });
  const existing = next.definition.steps.find(step => step.id === 'transcript')?.arguments.transcript;
  const raw = next.task.workflow?.steps.find(step => step.id === 'transcript')?.artifact?.data.transcript;
  const ownedRaw = raw && (raw as unknown as { id: string }).id === next.task.sourceSig ? raw : Object.values(store.entries).find(entry => entry.ref.kind === 'transcript' && entry.ref.id === next.task.sourceSig && Array.isArray(entry.value) && entry.value.length)?.ref;
  const transcript = existing?.kind === 'literal' ? existing.value : ownedRaw ?? (next.task.transcript?.length ? await store.put('transcript', next.task.sourceSig, next.task.transcript) : null);
  const compiled = compileEditingWorkflow(next.recipe, next.task, media, transcript);
  next.definition = compiled.definition; next.recipeDefinition = structuredClone(compiled.definition); next.editingGroups = compiled.groups; next.editingTargets = compiled.targets; return next;
}
