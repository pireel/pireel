import 'fake-indexeddb/auto';
import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ translate: vi.fn(), render: vi.fn(), environment: null as ReturnType<typeof vi.fn> | null }));
vi.mock('./local-media', () => ({ loadLocalVideo: async () => null, saveLocalVideo: async () => true }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ translate: mock.translate, ...(mock.environment ? { workflowEnvironment: mock.environment } : {}) }) }));
import { newWorkflowLabSession, runWorkflowLab, saveWorkflowLab, loadWorkflowLab } from './workflow-lab-session';
import { WorkflowArtifactStore } from '@pireel/studio-engine/workflow-artifacts';
import { SceneWorkflowHost } from './scene-workflow-runtime';
import { textWorkflowNodes } from './text-workflow-nodes';
import { sceneLiteral } from '@pireel/studio-engine/workflow-caption-template';
import { atomicDubbingDefinition } from '@pireel/studio-engine/workflow-editor';
beforeEach(() => { vi.clearAllMocks(); mock.environment = null; mock.translate.mockImplementation(async rows => rows.map((row: { index: number }) => ({ index: row.index, text: 'Hello' }))); });
it('executes a standalone data node with no file or mandatory video export and persists per account', async () => {
  const session = newWorkflowLabSession('owner');
  session.definition.steps.push({ id: 'unrelated', capability: 'llm.transform', version: 1, dependsOn: [], arguments: {} });
  const result = await runWorkflowLab(session, { signal: new AbortController().signal, checkpoint: saveWorkflowLab, progress: () => {} }, 'input');
  expect(result.video).toBeUndefined(); expect(result.session.task.workflow?.status).toBe('completed');
  expect(result.session.task.workflow?.steps).toHaveLength(1);
  expect(result.session.task.workflow?.steps[0].inputs).toEqual({ value: { text: '这是一段用于组合测试的文案。' } });
  expect((await loadWorkflowLab('owner'))?.id).toBe(session.id); expect(await loadWorkflowLab('other')).toBeNull();
  const again = await runWorkflowLab(result.session, { signal: new AbortController().signal, checkpoint: saveWorkflowLab, progress: () => {} }, 'input');
  expect(again.session.task.workflow?.steps[0].cacheHit).toBe(true);
});
it('separates translation from voice planning, preserves stable IDs, and reuses translation on voice changes', async () => {
  const session = newWorkflowLabSession('owner'); session.task.options.dubbing = { language: 'English', voiceId: 'voice-a', lipSync: false };
  const host = new SceneWorkflowHost(session.task, null, { signal: new AbortController().signal, checkpoint: async () => {}, progress: () => {} });
  const media = await host.store.put('media', 'source', { sig: 'source', name: 'source.mp4', width: 640, height: 360, durationSec: 8 });
  const transcript = await host.store.put('transcript', 'source', [{ text: '你好', start: 1, end: 7 }]);
  let definition = atomicDubbingDefinition(session.task, media, transcript);
  // Test the atomic subgraph, using a literal transcript artifact without invoking ASR.
  definition.steps = definition.steps.filter(step => ['speechText', 'translate', 'speechPlan'].includes(step.id));
  definition.steps[0].arguments.transcript = sceneLiteral(transcript); definition.steps[0].dependsOn = [];
  const first = await host.executeGraph(definition, textWorkflowNodes(host));
  expect(first.run.status).toBe('completed'); expect(first.video).toBeUndefined();
  const plan = first.run.steps.find(step => step.id === 'speechPlan')!.artifact!.data.value as unknown as { parts: { voiceId: string }[] };
  expect(plan.parts[0].voiceId).toBe('voice-a');
  definition = structuredClone(definition); definition.steps.find(step => step.id === 'speechPlan')!.arguments.config = sceneLiteral({ voiceId: 'voice-b', language: 'English' });
  const second = await host.executeGraph(definition, textWorkflowNodes(host));
  expect(mock.translate).toHaveBeenCalledOnce();
  expect(second.run.steps.find(step => step.id === 'translate')!.cacheHit).toBe(true);
  expect((second.run.steps.find(step => step.id === 'speechPlan')!.artifact!.data.value as unknown as { parts: { voiceId: string }[] }).parts[0].voiceId).toBe('voice-b');
  expect(host.store.read(new WorkflowArtifactStore(host.data.artifacts).entries[Object.keys(host.data.artifacts)[0]].ref, 'media')).toBeTruthy();
});
it('refuses an invalid contract before a paid translation', async () => {
  const session = newWorkflowLabSession('owner'); session.definition.steps = [{ id: 'translate', capability: 'text.translate', version: 3, dependsOn: [], arguments: { units: sceneLiteral([{ id: 'bad', text: 12 }]), language: sceneLiteral('English') } }];
  await expect(runWorkflowLab(session, { signal: new AbortController().signal, checkpoint: async () => {}, progress: () => {} })).rejects.toThrow('Invalid workflow value');
  expect(mock.translate).not.toHaveBeenCalled();
});
it('keeps provider usage receipts and marks subsequent reuse without charging again', async () => {
  const session = newWorkflowLabSession('owner');
  session.definition.steps = [{ id: 'translate', capability: 'text.translate', version: 3, dependsOn: [], arguments: { units: sceneLiteral([{ id: 'line', text: '你好' }]), language: sceneLiteral('English') } }];
  mock.translate.mockImplementation(async (rows, _language, options) => { options.onUsage({ source: 'server', reference: 'receipt-1', credits: 3, inputTokens: 12, outputTokens: 4 }); return rows.map((row: { index: number }) => ({ index: row.index, text: 'Hello' })); });
  const hooks = { signal: new AbortController().signal, checkpoint: async () => {}, progress: () => {} };
  const first = await runWorkflowLab(session, hooks);
  expect(first.session.task.workflow?.steps[0].usage).toEqual([{ source: 'server', reference: 'receipt-1', credits: 3, inputTokens: 12, outputTokens: 4 }]);
  const second = await runWorkflowLab(first.session, hooks);
  expect(second.session.task.workflow?.steps[0].cacheHit).toBe(true);
  expect(second.session.task.workflow?.steps[0].usage).toEqual(first.session.task.workflow?.steps[0].usage);
  expect(mock.translate).toHaveBeenCalledOnce();
});
it('refuses a preset transcript from a different media source before recognition', async () => {
  const { captionWorkflowNodes } = await import('./caption-workflow-nodes');
  const session = newWorkflowLabSession('owner');
  const host = new SceneWorkflowHost(session.task, null, { signal: new AbortController().signal, checkpoint: async () => {}, progress: () => {} });
  const media = await host.store.put('media', 'new', { sig: 'new', name: 'new.mp4', width: 640, height: 360, durationSec: 8 });
  const transcript = await host.store.put('transcript', 'old', [{ text: 'Old speech', start: 0, end: 2 }]);
  const definition = { ...session.definition, steps: [{ id: 'transcript', capability: 'speech.transcribe', version: 2, dependsOn: [], arguments: { media: sceneLiteral(media), transcript: sceneLiteral(transcript) } }] };
  await expect(host.executeGraph(definition, captionWorkflowNodes(host))).rejects.toThrow('不属于当前媒体');
});

it('scopes execution to the current account and invalidates cached outputs when model versions change', async () => {
  const session = newWorkflowLabSession('owner');
  const hooks = { signal: new AbortController().signal, checkpoint: async () => {}, progress: () => {} };
  mock.environment = vi.fn(async () => ({ scope: 'other', revision: 'a' }));
  await expect(runWorkflowLab(session, hooks)).rejects.toThrow('登录账号已变化');
  mock.environment.mockResolvedValue({ scope: 'owner', revision: 'a' });
  const first = await runWorkflowLab(session, hooks);
  mock.environment.mockResolvedValue({ scope: 'owner', revision: 'b' });
  const second = await runWorkflowLab(first.session, hooks);
  expect(second.session.task.workflow?.steps[0].cacheHit).toBe(false);
  expect(second.session.task.workflowEnvironmentRevision).toBe('b');
});
it('retains an uncertain legacy receipt across environment adoption and repeated resumes', async () => {
  const { artifactVersion } = await import('@pireel/studio-engine/workflow-artifacts');
  const session = newWorkflowLabSession('owner'); session.task.generationId = 'old-run';
  const inputs = { units: [{ id: 'one', text: '你好' }], language: 'English', enabled: true };
  session.definition.steps = [{ id: 'translate', capability: 'text.translate', version: 3, dependsOn: [], arguments: Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, sceneLiteral(value)])) }];
  const legacyKey = await artifactVersion(['text.translate', 3, inputs]);
  session.task.workflowData!.receipts[legacyKey] = { status: 'running', runId: 'old-run', idempotencyKey: 'old-request' };
  mock.environment = vi.fn(async () => ({ scope: 'owner', revision: 'first-known-model-revision' }));
  let saved = session;
  const hooks = { signal: new AbortController().signal, checkpoint: async (value: typeof session) => { saved = structuredClone(value); }, progress: () => {} };
  await expect(runWorkflowLab(session, hooks)).rejects.toThrow('避免重复计费');
  await expect(runWorkflowLab(saved, hooks)).rejects.toThrow('避免重复计费');
  expect(mock.translate).not.toHaveBeenCalled();
});
it('allows an explicit new round after an environment change without dereferencing a cleared run', async () => {
  const session = newWorkflowLabSession('owner'); session.task.workflowEnvironmentRevision = 'old';
  mock.environment = vi.fn(async () => ({ scope: 'owner', revision: 'new' }));
  const result = await runWorkflowLab(session, { signal: new AbortController().signal, checkpoint: async () => {}, progress: () => {} });
  expect(result.session.task.workflow?.status).toBe('completed');
});
