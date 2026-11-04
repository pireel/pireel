import { describe, expect, it } from 'vitest';
import { runAgentTimelineTool } from '@pireel/studio-engine/agent-timeline';
import { packStorySpine } from '@pireel/studio-engine/story-spine';
import { compositionToEditorDocument, emptyComposition } from '@pireel/studio-engine/composition';
import type { PlaybookSnapshot } from '@pireel/studio-engine/project-brand-metadata';
import { resolveEditingRunConfig } from '@pireel/studio-engine/editing-run-config';
import { firstNarrativeAssetId } from '@pireel/studio-engine/editor-document/read-model';
import { directorBeatWindows, directorPlanForModel, directorPlanToolBlock, saveEditingDirectorPlan, reviewDirectorPlan, withDirectorInstruction } from '@pireel/studio-ui/editing-director-plan';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditingTaskCard } from '@pireel/studio-ui/editing-task-card';
import { setStudioLocale } from '@pireel/studio-ui/i18n';
import { reviewEditingTask } from '@pireel/studio-ui/editing-task-review';
import { latestTask, resumeTaskHint, type ChatTask } from '@pireel/studio-ui/chat-task';
import { sanitizeRestored } from '@pireel/studio-ui/chat-thread-store';
import { editingTaskRows } from '@pireel/studio-ui/editing-task-progress';
const emptySnapshot = (id: string, name: string): PlaybookSnapshot => ({ schema: 3, id, name, version: 1, method: 'manual', blocks: {} });

function fixture() {
  const document = compositionToEditorDocument({ projectId: 'p-test', videoSig: 'sig', composition: { ...emptyComposition(), video: { url: 'blob:test', durationSec: 10 }, shots: [{ id: 'speaker', srcStart: 0, srcEnd: 10, treatment: 'full' }] } }).document;
  const assetId = firstNarrativeAssetId(document)!;
  document.semantics.transcripts[assetId] = [{ start: 2, end: 5, text: '这张年卡包含两场大会门票。' }];
  const brand = emptySnapshot('brand', '克制讲解');
  const config = resolveEditingRunConfig({ brand, skills: ['rough-cut', 'captions'] });
  const task: ChatTask = { id: 'edit', mode: 'one-click', state: 'running', goal: '讲清楚礼盒的价值', skills: config.skills, config, directorPlanRequired: true, reviewRequired: true,
    roughCut: { callId: 'rough', report: { state: 'done', credits: 0, steps: [{ id: 'transcribe', status: 'done' }, { id: 'cleanup', status: 'done' }, { id: 'captions', status: 'done' }] } } };
  const input = { direction: '先展示实际年卡，让观众理解权益，再解释价格，最后回到人物说明领取方式。', brandTreatment: '沿用品牌克制的节奏和细字排版，实物展示时保持画面安静，不用大卡片遮住年卡。', beats: [
    { id: 'annual-card', assetId, sourceInSec: 2, sourceOutSec: 5, quote: '这张年卡包含两场大会门票', direction: '保留人物举起年卡的原画面，留足看清卡面的时间，在人物说完权益后再进入价格段落。' },
  ] };
  const saved = saveEditingDirectorPlan(task, input, document);
  if (!saved.ok) throw new Error(saved.error);
  const planned = { ...task, directorPlan: saved.plan };
  const review = { planRevision: 1, editorialReview: '开头直接展示年卡，权益说明保留人物和实物，节奏留白与品牌一致。', beats: [{ beatId: 'annual-card', status: 'kept', result: '保留了年卡展示段落，卡面完整，没有被文字遮挡。', clipIds: ['speaker'] }] };
  return { task, document, input, planned, review };
}

describe('brand-informed director plan', () => {
  it('requires rough-cut completion, authentic source quotes and concrete brand treatment', () => {
    const { task, input, document } = fixture();
    expect(saveEditingDirectorPlan({ ...task, roughCut: undefined }, input, document).ok).toBe(false);
    expect(saveEditingDirectorPlan(task, { ...input, brandTreatment: '' }, document).ok).toBe(false);
    expect(saveEditingDirectorPlan(task, { ...input, beats: [{ ...input.beats[0], quote: '保证十倍收益' }] }, document).ok).toBe(false);
    expect(saveEditingDirectorPlan(task, { ...input, beats: [{ ...input.beats[0], sourceInSec: 30, sourceOutSec: 35 }] }, document).ok).toBe(false);
    expect(saveEditingDirectorPlan(task, { ...input, beats: [input.beats[0], input.beats[0]] }, document).ok).toBe(false);
    expect(saveEditingDirectorPlan(task, input, document).ok).toBe(true);
    expect(saveEditingDirectorPlan({ ...task, config: { ...task.config!, brand: null } }, { ...input, brandTreatment: undefined }, document).ok).toBe(true);
  });
  it('allows read-only preparation and fixed rough cut, but gates execution until the plan is saved', () => {
    const { task, planned } = fixture();
    expect(directorPlanToolBlock(task, 'rough_cut', true)).toBeUndefined();
    expect(directorPlanToolBlock(task, 'inspect_media', false)).toBeUndefined();
    expect(directorPlanToolBlock(task, 'apply_component', true)).toContain('save_edit_plan');
    expect(directorPlanToolBlock(planned, 'apply_component', true)).toBeUndefined();
    expect(directorPlanToolBlock({ ...task, directorPlanRequired: undefined }, 'apply_component', true)).toBeUndefined();
  });
  it('survives refresh and resume without resetting the completed planning stage', () => {
    const { planned } = fixture();
    const messages = sanitizeRestored(JSON.parse(JSON.stringify([{ id: 'user', role: 'user', parts: [], metadata: { task: planned } }])));
    const restored = latestTask(messages)!;
    expect(restored.directorPlan).toEqual(planned.directorPlan);
    expect(restored.state).toBe('paused');
    expect(resumeTaskHint(restored)).toContain(planned.directorPlan.brandTreatment);
    expect(editingTaskRows(restored, restored.roughCut?.report, messages, false).planning?.status).toBe('done');
  });
  it('reads each beat’s clips from the timeline, following the passage when it moves', () => {
    const { document, planned, review } = fixture();
    const clip = document.timeline.tracks.flatMap(track => track.clips).find(clip => clip.id === 'speaker')!;
    clip.startFrame += 300;
    expect(directorBeatWindows(planned.directorPlan.beats[0], document)[0].startFrame).toBeGreaterThanOrEqual(300);
    expect(reviewDirectorPlan(planned, review, document)).toMatchObject({ ok: true, completed: true });
    // Applied with nothing at the passage: refused, naming where the passage is now.
    const applied = { ...review, beats: [{ beatId: 'annual-card', status: 'applied', result: '在年卡出现时补了权益说明的图形。' }] };
    const refused = reviewDirectorPlan(planned, applied, document);
    expect(refused).toMatchObject({ ok: false, error: expect.stringContaining('nothing was added, reframed, restored, cut or emphasised at its passage') });
    // A graphic that lands just after the words still belongs to the beat; one far away does not.
    // (Any edit closes the gap left before the spine above, so measure on the closed spine.)
    const whole = packStorySpine(document);
    const [window] = directorBeatWindows(planned.directorPlan.beats[0], whole);
    const fps = document.canvas.fps;
    const place = (atFrame: number) => runAgentTimelineTool(whole, 'set_texts', { items: [{ text: '两场大会门票', startFrame: atFrame, durationFrames: fps }] }).document!;
    const near = place(Math.round(window!.endFrame + fps));
    expect(reviewDirectorPlan(planned, applied, near)).toMatchObject({ ok: true, beats: [{ beatId: 'annual-card', clipIds: [expect.any(String)] }] });
    expect(reviewDirectorPlan(planned, applied, place(Math.round(window!.endFrame + 4 * fps))).ok).toBe(false);
    // The passage gone: kept is no longer true; changed or blocked is.
    clip.enabled = false;
    expect(reviewDirectorPlan(planned, review, document)).toMatchObject({ ok: false, error: expect.stringContaining('no longer in the video') });
    expect(reviewDirectorPlan(planned, { ...review, beats: [{ ...review.beats[0], status: 'changed', result: '这段口播被剪掉，年卡改在价格段落里展示。' }] }, document).ok).toBe(true);
    // Cutting the passage's own speech after the plan was saved is work done there.
    expect(reviewDirectorPlan(planned, applied, document).ok).toBe(true);
  });
  it('takes a quote as transcribed or as it plays now, and shows the passage when neither matches', () => {
    const { task, document: original, input } = fixture();
    const assetId = input.beats[0]!.assetId;
    original.semantics.transcripts[assetId] = [{ start: 2, end: 5, text: '这张，呃，年卡包含两场大会门票。', words: [
      { text: '这张，', start: 2, end: 2.4 }, { text: '呃，', start: 2.5, end: 2.8 }, { text: '年卡', start: 3, end: 3.4 }, { text: '包含两场大会门票。', start: 3.5, end: 5 },
    ] }];
    const cut = runAgentTimelineTool(original, 'remove_words', { ranges: [[2.45, 2.95]], keepGapSec: 0 });
    if (!cut.ok || !cut.document) throw new Error(JSON.stringify(cut));
    const document = cut.document;
    const quoting = (quote: string) => saveEditingDirectorPlan(task, { ...input, beats: [{ ...input.beats[0]!, quote }] }, document);
    expect(quoting('这张，呃，年卡').ok).toBe(true);
    expect(quoting('这张年卡包含').ok).toBe(true);
    expect(quoting('年卡包含三场')).toMatchObject({ ok: false, error: expect.stringContaining('这张，呃，年卡包含两场大会门票') });
    const saved = quoting('这张年卡');
    if (!saved.ok) throw new Error(saved.error);
    expect(saved.plan.beats[0]!.coveredAtSave).toBeDefined();
    expect(directorPlanForModel(saved.plan).beats[0]).not.toHaveProperty('coveredAtSave');
  });
  it('plans a passage the rough cut removed and counts its restoration as applied', () => {
    const { task, document, input } = fixture();
    const speaker = document.timeline.tracks.flatMap(track => track.clips).find(clip => clip.id === 'speaker')!;
    speaker.enabled = false;
    const saved = saveEditingDirectorPlan(task, input, document);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const planned = { ...task, directorPlan: saved.plan };
    const restored = { planRevision: 1, editorialReview: '恢复了被误剪的年卡说明，节奏保持品牌的克制。', beats: [{ beatId: 'annual-card', status: 'applied', result: '把粗剪误删的年卡权益说明放回原位。' }] };
    expect(reviewDirectorPlan(planned, restored, document).ok).toBe(false);
    speaker.enabled = true;
    expect(reviewDirectorPlan(planned, restored, document)).toMatchObject({ ok: true, completed: true });
  });
  it('requires the current revision and all beat outcomes; blockers cannot be called complete', () => {
    const { task, planned, document, input, review } = fixture();
    expect(reviewDirectorPlan(task, review, document).ok).toBe(false);
    expect(reviewDirectorPlan(planned, { ...review, beats: [] }, document).ok).toBe(false);
    const revision = saveEditingDirectorPlan(planned, input, document);
    if (!revision.ok) throw new Error(revision.error);
    expect(reviewDirectorPlan({ ...planned, directorPlan: revision.plan }, review, document).ok).toBe(false);
    const blocked = { ...review, beats: [{ ...review.beats[0], status: 'blocked', clipIds: [], result: '需要的实物特写暂时没有找到，等待补充素材。' }] };
    expect(reviewDirectorPlan(planned, blocked, document)).toMatchObject({ ok: true, completed: false });
    const evidence = { graphics: [], 'b-roll': [], sound: [] };
    expect(reviewEditingTask(planned, { ...review, features: [], brandApplication: input.brandTreatment }, evidence, document)).toMatchObject({ ok: true, review: { completed: true, director: { revision: 1 } } });
    expect(reviewEditingTask(planned, { ...blocked, features: [], brandApplication: input.brandTreatment }, evidence, document)).toMatchObject({ ok: true, review: { completed: false } });
  });
  it('passes the saved style and relevant passage to component generation without altering placement', () => {
    const { planned, document } = fixture();
    const input = { generate: true, instruction: '解释年卡权益', atFrame: 60, durationFrames: 60 };
    const args = withDirectorInstruction(planned, 'apply_component', input, document);
    expect(args).toMatchObject({ atFrame: 60, durationFrames: 60, generate: true });
    expect(args.instruction).toContain(planned.directorPlan.brandTreatment);
    expect(args.instruction).toContain(planned.directorPlan.beats[0].quote);
    expect(input.instruction).toBe('解释年卡权益');
    expect(withDirectorInstruction(planned, 'apply_component', { ...input, generate: false }, document).instruction).toBe(input.instruction);
    expect(withDirectorInstruction(planned, 'generate_image', input, document)).toBe(input);
  });
  it('shows authored prose between rough and fine cut without technical anchors or approval controls', () => {
    setStudioLocale('zh');
    const { planned } = fixture();
    const html = renderToStaticMarkup(createElement(EditingTaskCard, { task: planned, messages: [], live: false, credits: 0 }));
    expect(html.indexOf('粗剪')).toBeLessThan(html.indexOf('构思剪辑'));
    expect(html.indexOf('构思剪辑')).toBeLessThan(html.indexOf('精剪'));
    expect(html).toContain(planned.directorPlan.direction);
    expect(html).toContain(planned.directorPlan.brandTreatment);
    expect(html).toContain('段落安排');
    expect(html).not.toContain('annual-card');
    expect(html).not.toContain('待确认');
    expect(html).not.toContain('sourceInSec');
  });
});

describe('whole-whiteboard directing without destructive cleanup', () => {
  it('plans from original transcript, keeps local requests unchanged, and refuses completion without a full board', () => {
    const {task,document,input,review}=fixture();
    const whiteboard:ChatTask={...task,mode:'request',skillId:'whiteboard-explainer',roughCut:undefined,config:undefined,skills:[]};
    const planned=saveEditingDirectorPlan(whiteboard,{...input,entities:[]},document);expect(planned.ok).toBe(true);
    if(!planned.ok)throw Error(planned.error);
    expect(directorPlanToolBlock(whiteboard,'set_whiteboard',true)).toBeTruthy();
    expect(directorPlanToolBlock(whiteboard,'set_whiteboard',true,{describe:true})).toBeUndefined();
    expect(directorPlanToolBlock(whiteboard,'register_media',true)).toBeUndefined();
    expect(directorPlanToolBlock(whiteboard,'prepare_local_asset',false)).toBeUndefined();
    expect(saveEditingDirectorPlan(whiteboard,input,document).ok).toBe(false);
    expect(directorPlanToolBlock(whiteboard,'rough_cut',true)).toBeTruthy();
    expect(resumeTaskHint(whiteboard)).toContain('planning');
    expect(resumeTaskHint(whiteboard)).not.toContain('generation question');
    expect(saveEditingDirectorPlan({...whiteboard,directorPlanRequired:false},input,document).ok).toBe(false);
    const saved={...whiteboard,directorPlan:planned.plan};
    const evidence={graphics:[],'b-roll':[],sound:[]};
    expect(reviewEditingTask(saved,{...review,features:[]},evidence,document).ok).toBe(false);
    const board={version:1,aspect:'16:9',narration:{source:'script',durationSec:10,sentences:[{id:'s',text:'这张年卡包含两场大会门票。'}]},board:{nodes:[{id:'a',content:{kind:'headline',lines:['两场大会']} }],edges:[]},scenes:[{id:'s',nodeIds:['a'],layout:{type:'free'}}],beats:[{id:'b',anchor:{sentence:'s'},actions:[{op:'reveal',target:'a'}]}]};
    const applied=runAgentTimelineTool(document,'set_whiteboard',{id:'board',startFrame:0,durationFrames:300,doc:board});
    expect(applied.ok).toBe(true);
    expect(reviewEditingTask(saved,{...review,features:[]},evidence,applied.document)).toMatchObject({ok:true,review:{completed:true}});
    const shortened=structuredClone(applied.document!);const primary=shortened.timeline.tracks.find(t=>t.id===shortened.semantics.primaryNarrativeTrackId)!;primary.clips[0].durationFrames=270;if('sourceOutSec' in primary.clips[0])primary.clips[0].sourceOutSec=9;
    expect(reviewEditingTask(saved,{...review,features:[]},evidence,shortened).ok).toBe(false);
    expect(saveEditingDirectorPlan(whiteboard,{...input,beats:[{...input.beats[0],quote:'不存在的口播文字'}]},document).ok).toBe(false);
  });
});
