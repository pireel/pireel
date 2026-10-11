import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionTaskRecord, CaptionTaskProgress } from './caption-task-store';
const mock = vi.hoisted(() => ({ transcribe: vi.fn(), clean: vi.fn(), render: vi.fn(), font: vi.fn(), translate: vi.fn(), emphasis: vi.fn() }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ translate: mock.translate, autoHighlight: mock.emphasis }) }));
vi.mock('./media', () => ({ transcribeFile: mock.transcribe, durableFileSig: async () => "rendered-sig" }));
vi.mock('./speech-silence', () => ({ detectSpeechSilenceCuts: mock.clean }));
vi.mock('./client-export', () => ({ clientExportVideo: mock.render }));
vi.mock('./web-fonts', () => ({ loadFont: mock.font }));
import { runCaptionTask as generateCaptions, exportCaptionEdit } from './caption-task-runner';
import type { SceneWorkflowHooks } from './scene-workflow-runtime';
/** Generation, then the download-time render, as the scene page does. */
async function runCaptionTask(source: CaptionTaskRecord, input: File, hooks: SceneWorkflowHooks) {
  const generated = await generateCaptions(source, input, hooks);
  return { ...generated, video: await exportCaptionEdit(generated.task, input, hooks) };
}
const transcript = [{ text: 'Hello world', start: 0, end: 3, words: [{ text: 'Hello', start: 0, end: 1 }, { text: 'world', start: 2, end: 3 }] }];
const task = (): CaptionTaskRecord => ({ id: 'task', scope: 'account', name: 'video.mp4', sourceSig: 'sig', width: 1080, height: 1920, durationSec: 4, stage: 'ready', updatedAt: 0, options: { caption: {}, aspect: 'original', shortenPauses: true } });
const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } });
  mock.translate.mockImplementation(async (rows) => rows.map((row: { index: number; text: string }) => ({ index: row.index, text: row.text.split(' | ').map(() => '你好世界').join(' | ') })));
  mock.transcribe.mockResolvedValue(transcript); mock.clean.mockResolvedValue([{ fromSec: 1, toSec: 2 }]);
  mock.render.mockResolvedValue(new Blob(['video'], { type: 'video/mp4' })); mock.font.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
describe('standalone caption task execution', () => {
  it('reports observed stage work and leaves opaque recognition indeterminate', async () => {
    const observed: CaptionTaskProgress[] = [];
    mock.transcribe.mockImplementationOnce(async (_file, options) => { options.onPhase('recognizing'); return transcript; });
    mock.clean.mockImplementationOnce(async (_file, options) => { options.onProgress(20, 100); return []; });
    mock.render.mockImplementationOnce(async (options) => { options.onProgress(42, 100); return new Blob(['video']); });
    await runCaptionTask(task(), file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn(), stageProgress: (value) => observed.push(structuredClone(value)) });
    expect(observed.find((value) => value.transcribing?.detail === 'recognizing')?.transcribing?.fraction).toBeUndefined();
    expect(observed.some((value) => value.cleaning?.fraction === .2)).toBe(true);
    expect(observed.some((value) => value.rendering?.fraction === .42)).toBe(true);
    expect(observed.some((value) => (['transcribing', 'cleaning', 'styling'] as const).every((stage) => value[stage]?.status === 'completed'))).toBe(true);
  });
  it('generates a native document without rendering; the download renders it', async () => {
    const generated = await generateCaptions(task(), file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
    expect(generated.video).toBeUndefined(); expect(mock.render).not.toHaveBeenCalled();
    expect(generated.task.workflow?.steps.some(step => step.id === 'render')).toBe(false);
    expect(generated.task.document?.semantics.managedCaptionTrackId).toBeTruthy();
    expect((await exportCaptionEdit(generated.task, file, { signal: new AbortController().signal, progress: vi.fn() })).type).toBe('video/mp4');
    expect(mock.render).toHaveBeenCalledOnce(); expect(mock.transcribe).toHaveBeenCalledOnce();
  });
  it('runs without a workbench and produces a downloadable video with a native document', async () => {
    const records: CaptionTaskRecord[] = [];
    const result = await runCaptionTask(task(), file, { signal: new AbortController().signal, checkpoint: async (record) => { records.push(structuredClone(record)); }, progress: vi.fn() });
    expect([...new Set(records.map(record => record.stage))].filter(stage => stage !== 'ready')).toEqual(['transcribing', 'cleaning', 'styling']);
    expect(result.task.workflow?.definition.id).toBe('official-ai-captions');
    expect(result.task.workflow?.steps.every(step => step.status === 'completed')).toBe(true);
    expect(records.some(record => record.workflow?.steps.some(step => step.id === 'transcript' && step.status === 'running') && !record.transcript)).toBe(true);
    expect(result.task.stage).toBe('completed'); expect(result.video.type).toBe('video/mp4');
    expect(result.task.document?.semantics.managedCaptionTrackId).toBeTruthy();
    expect(mock.render.mock.calls[0]![0].videoFile).toBe(file);
    const exported = mock.render.mock.calls[0]![0];
    expect(exported.comp.shots.every((shot: { src?: string }) => !shot.src || exported.clipFiles.get(shot.src) === file)).toBe(true);
    expect(records.at(-1)?.document).toBeTruthy();
  });
  it('checkpoints bilingual subtitles before rendering and reuses them on a retry', async () => {
    const source = task(); source.options.translationLanguage = '中文';
    const records: CaptionTaskRecord[] = [];
    const hooks = { signal: new AbortController().signal, checkpoint: async (record: CaptionTaskRecord) => { records.push(structuredClone(record)); }, progress: vi.fn() };
    const result = await runCaptionTask(source, file, hooks);
    expect([...new Set(records.map(record => record.stage))].filter(stage => stage !== 'ready')).toEqual(['transcribing', 'cleaning', 'translating', 'styling']);
    expect(records.find((record) => record.stage === 'styling')?.translation?.language).toBe('中文');
    expect(mock.render.mock.calls[0]![0].comp.captionStyle.sub.lang).toBe('中文');
    await runCaptionTask(result.task, file, hooks);
    expect(mock.translate).toHaveBeenCalledOnce();
  });
  it('does not render a partial bilingual result when translation fails', async () => {
    const source = task(); source.options.translationLanguage = '中文';
    mock.translate.mockResolvedValueOnce([]);
    await expect(runCaptionTask(source, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() })).rejects.toThrow('没有返回任何结果');
    expect(mock.render).not.toHaveBeenCalled(); expect(source.transcript).toBeUndefined();
  });
  it('resumes cached transcript and cleanup without repeating those operations', async () => {
    await runCaptionTask({ ...task(), transcript, cuts: [] }, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
    expect(mock.transcribe).not.toHaveBeenCalled(); expect(mock.clean).not.toHaveBeenCalled(); expect(mock.render).toHaveBeenCalledOnce();
  });
  it('does not start a paid operation when already cancelled', async () => {
    const abort = new AbortController(); abort.abort();
    await expect(runCaptionTask(task(), file, { signal: abort.signal, checkpoint: async () => {}, progress: vi.fn() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mock.transcribe).not.toHaveBeenCalled();
  });
  it('never reports completion if cancellation arrives during rendering', async () => {
    const abort = new AbortController();
    mock.render.mockImplementationOnce(async () => { abort.abort(); return new Blob(['late video']); });
    await expect(runCaptionTask(task(), file, { signal: abort.signal, checkpoint: async () => {}, progress: vi.fn() })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

it('keeps translation identity across color, position and re-wrapping, but invalidates a language change', async () => {
  const source = task(); source.options.shortenPauses = false; source.options.translationLanguage = '中文';
  const text = 'This is a longer sentence with enough words to wrap differently when the caption width becomes narrow';
  source.transcript = [{ text, start: 0, end: 4 }];
  const hooks = { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() };
  const first = await runCaptionTask(source, file, hooks);
  const plan = first.task.workflow!.steps.find(step => step.id === 'plan')!.artifact!.data.plan;
  first.task.options.caption = { color: '#ff0000', yPct: 55 };
  const styled = await runCaptionTask(first.task, file, hooks);
  expect(styled.task.workflow!.steps.find(step => step.id === 'plan')!.artifact!.data.plan).toEqual(plan);
  expect(mock.translate).toHaveBeenCalledOnce();
  expect(mock.render.mock.calls[1][0].comp.captionStyle.color).toBe('#ff0000');
  // Translations are stored per sentence and spread over lines at render time: re-wrapping keeps them.
  styled.task.options.caption.wPct = 15;
  const narrow = await runCaptionTask(styled.task, file, hooks);
  expect(mock.translate).toHaveBeenCalledOnce();
  narrow.task.options.translationLanguage = '日本語';
  await runCaptionTask(narrow.task, file, hooks);
  expect(mock.translate).toHaveBeenCalledTimes(2);
});

it('loads fonts before translation and persists matching planned and displayed word ranges without blob identities', async () => {
  const source = task(); source.options.translationLanguage = '中文'; source.options.caption = { font: 'web:smiley-sans' };
  const result = await runCaptionTask(source, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
  expect(mock.font.mock.invocationCallOrder[0]).toBeLessThan(mock.translate.mock.invocationCallOrder[0]);
  const { WorkflowArtifactStore } = await import('@pireel/studio-engine/workflow-artifacts');
  const { managedCaptionLineRows } = await import('@pireel/studio-engine/composition');
  const store = new WorkflowArtifactStore(result.task.workflowData!.artifacts);
  const plan = store.read<import('./caption-workflow-artifacts').CaptionPlan>(result.task.workflow!.steps.find(step => step.id === 'plan')!.artifact!.data.plan, 'caption-plan');
  expect(managedCaptionLineRows(result.task.document!)!.map(line => [line.seg, line.w0, line.w1])).toEqual(plan.lines.map(line => [line.seg, line.w0, line.w1]));
  expect(JSON.stringify(result.task.workflowData)).not.toContain('blob:nodedata');
});

it('stops an uncertain paid retry instead of issuing another translation request', async () => {
  const source = task(); source.generationId = 'uncertain'; source.options.translationLanguage = '中文';
  let saved = source;
  const hooks = { signal: new AbortController().signal, checkpoint: async (record: CaptionTaskRecord) => { saved = structuredClone(record); }, progress: vi.fn() };
  mock.translate.mockRejectedValueOnce(new Error('Connection lost'));
  await expect(runCaptionTask(source, file, hooks)).rejects.toThrow('Connection lost');
  await expect(runCaptionTask(saved, file, hooks)).rejects.toThrow('避免重复计费');
  expect(mock.translate).toHaveBeenCalledOnce();
});

it('assembles downstream data from inserted LLM and approval outputs, and resumes the same cloud job after reload', async () => {
  const source = task(); source.options.translationLanguage = '中文';
  let saved = source;
  const hooks = { signal: new AbortController().signal, checkpoint: async (record: CaptionTaskRecord) => { saved = structuredClone(record); }, progress: vi.fn() };
  const first = await runCaptionTask(source, file, hooks);
  const definition = structuredClone(first.task.workflow!.definition);
  const { workflowLiteral: lit } = await import('@pireel/studio-engine/workflow');
  const schema = lit({ type: 'object', properties: {}, additionalProperties: true });
  definition.steps.splice(definition.steps.findIndex(step => step.id === 'captions'), 0,
    { id: 'polish', capability: 'llm.transform', version: 1, dependsOn: ['translate'], arguments: { instruction: lit('Polish translated captions'), schema, value: { kind: 'step', stepId: 'translate', key: 'value' } } },
    { id: 'review', capability: 'human.approval', version: 1, dependsOn: ['polish'], arguments: { title: lit('Review captions'), schema, value: { kind: 'step', stepId: 'polish', key: 'value' }, editable: lit(true) } },
  );
  const assemble = definition.steps.find(step => step.id === 'captions')!;
  assemble.arguments.translation = { kind: 'step', stepId: 'review', key: 'value' };
  assemble.dependsOn = [...assemble.dependsOn.filter(id => id !== 'translate'), 'review'];
  const { createWorkflowRun } = await import('@pireel/studio-engine/workflow');
  const { GENERIC_WORKFLOW_CAPABILITIES, genericWorkflowExecutor, decideWorkflowApproval } = await import('@pireel/studio-engine/workflow-generic');
  const { executeWorkflow } = await import('@pireel/studio-engine/workflow-runtime');
  const cloud = new Map<string, import('@pireel/studio-engine/workflow').WorkflowRun>();
  let llmCalls = 0;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === 'create') {
      if (!cloud.has(body.creationKey)) cloud.set(body.creationKey, createWorkflowRun(body.definition, {}, { projectId: 'cloud', outputId: 'cloud', revision: '1' }, GENERIC_WORKFLOW_CAPABILITIES, body.creationKey));
      return Response.json({ run: cloud.get(body.creationKey) });
    }
    if (body.action === 'get') return Response.json({ run: cloud.get(body.id) });
    const generic = genericWorkflowExecutor({ transform: async ({ value }) => { llmCalls++; const edited = structuredClone(value) as unknown as import('./caption-workflow-artifacts').CaptionTranslation; edited.items.forEach(item => { item.text = 'LLM 修改'; }); return edited as never; } });
    const run = await executeWorkflow(cloud.get(body.id)!, GENERIC_WORKFLOW_CAPABILITIES, generic, { save: async run => { cloud.set(run.id, run); } });
    return Response.json({ run });
  }));
  mock.render.mockClear();
  await expect(runCaptionTask(first.task, file, { ...hooks, definition })).rejects.toMatchObject({ code: 'workflow_waiting' });
  expect(mock.render).not.toHaveBeenCalled();
  const approval = [...cloud.values()].find(run => run.status === 'waiting')!;
  const value = structuredClone(approval.steps[0].approval!.value) as unknown as import('./caption-workflow-artifacts').CaptionTranslation;
  value.items.forEach(item => { item.text = '人工确认稿'; });
  cloud.set(approval.id, decideWorkflowApproval(approval, approval.steps[0].approval!.id, 'approve', 'owner', value as never));
  const resumed = await runCaptionTask(JSON.parse(JSON.stringify(saved)), file, hooks);
  expect(resumed.task.workflow!.id).toBe(first.task.workflow!.id);
  // The approved sentence translation is spread over the caption lines.
  const rendered = JSON.stringify(mock.render.mock.calls[0][0].comp);
  expect(rendered).toContain('"sub":"人工"'); expect(rendered).toContain('"sub":"确认稿"');
  expect(llmCalls).toBe(1); expect(mock.translate).toHaveBeenCalledOnce();
});

it('reuses highlights on color/position changes without another paid selection', async () => {
  const source = task(); source.options.highlights = true;
  mock.emphasis.mockImplementation(async (rows: { index: number; text: string }[]) => rows.map(row => ({ index: row.index, text: row.text.split(/\s+/)[0]! })));
  const hooks = { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() };
  const first = await runCaptionTask(source, file, hooks);
  first.task.options.caption = { color: '#ff0000', yPct: 50 };
  const next = await runCaptionTask(first.task, file, hooks);
  expect(mock.emphasis).toHaveBeenCalledOnce();
  expect(Object.values(next.task.document!.semantics.transcripts).flat()[0]?.wordDecorations?.['0']).toEqual({ highlight: 'color' });
});

it('keeps highlights and paid selection across font-driven line changes', async () => {
  const source = task(); source.options = { ...source.options, caption: { scale: .7, wPct: 90 }, highlights: true, shortenPauses: false };
  const words = ['This', 'complete', 'important', 'phrase', 'must', 'survive', 'a', 'different', 'font', 'size'].map((text, index) => ({ text, start: index * .3, end: (index + 1) * .3 }));
  mock.transcribe.mockResolvedValueOnce([{ text: words.map(word => word.text).join(' '), start: 0, end: 3, words }]);
  mock.emphasis.mockImplementation(async (rows: { index: number }[]) => rows.map(row => ({ index: row.index, text: 'complete important phrase' })));
  const hooks = { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() };
  const first = await runCaptionTask(source, file, hooks);
  const before = first.task.document!.timeline.tracks.find(track => track.type === 'caption')!.clips.length;
  first.task.options = { ...first.task.options, caption: { scale: 2, wPct: 35 } };
  const second = await runCaptionTask(first.task, file, hooks);
  expect(mock.emphasis).toHaveBeenCalledOnce();
  expect(second.task.document!.timeline.tracks.find(track => track.type === 'caption')!.clips.length).toBeGreaterThan(before);
  expect(Object.keys(Object.values(second.task.document!.semantics.transcripts).flat()[0].wordDecorations ?? {})).toEqual(['1', '2', '3']);
});
