import { describe, expect, it } from 'vitest';
import { resolveEditingRunConfig } from '@pireel/studio-engine/editing-run-config';
import { emptyPlaybook, playbookSnapshot } from '@pireel/studio-engine/brand-playbook';
import { reviewEditingTask, needsEditingReview } from './editing-task-review';
import type { UIMessage } from 'ai';
import { compositionToEditorDocument, emptyComposition } from '@pireel/studio-engine/composition';
import { v3Instructions } from '@pireel/studio-engine/agent-surface-v3/instructions';
import { validateV3Input } from '@pireel/studio-engine/agent-surface-v3/validate';
import type { ChatTask } from './chat-task';

const brand = playbookSnapshot(emptyPlaybook('b', 'Brand'));
brand.preferences = { zoom: true, transitions: true };
const config = resolveEditingRunConfig({ brand, skills: ['b-roll', 'graphics'] });
const task: ChatTask = { id: 'task', goal: 'Edit', mode: 'one-click', state: 'running', skills: config.skills, config, roughCut: { callId: 'rough', report: { state: 'done', credits: 0, steps: [] } } };
const evidence = { graphics: ['g1'], 'b-roll': ['b1'], sound: [], zoom: ['z1'], transitions: ['t1'] };
const input = () => ({ brandApplication: '使用品牌的深底金色数字与紧凑标题，在金额和人数处对应强调。', features: ['graphics', 'b-roll', 'zoom', 'transitions'].map(feature => ({ feature, status: 'applied', reason: '在课程人数和礼盒金额处补充说明画面', atFrame: 12 })) });
describe('editing completion review', () => {
  it('does not report completion with an abandoned empty music track', () => {
    expect(reviewEditingTask(task, input(), { ...evidence, emptyMusicTracks: ['unused-music'] })).toMatchObject({ ok: false, error: expect.stringContaining('unused-music') });
  });
  it('rejects silently missing enabled features', () => {
    expect(needsEditingReview(task)).toBe(true);
    expect(reviewEditingTask(task, { features: [] }, evidence)).toMatchObject({ ok: false, missing: ['graphics', 'b-roll', 'zoom'] });
  });
  it('rejects claims of effects that do not exist on the timeline', () => {
    expect(reviewEditingTask(task, input(), { ...evidence, zoom: [] })).toMatchObject({ ok: false });
    expect(reviewEditingTask(task, input(), { ...evidence, 'b-roll': [] })).toMatchObject({ ok: false });
    expect(reviewEditingTask(task, input(), { ...evidence, transitions: [] })).toMatchObject({ ok: false });
    expect(reviewEditingTask(task, input(), evidence)).toMatchObject({ ok: true, review: { completed: true } });
  });
  it('requires real brand treatment and refuses an empty library as a reason to skip B-roll', () => {
    expect(reviewEditingTask(task, { ...input(), brandApplication: '' }, evidence)).toMatchObject({ ok: false });
    const review = input(); review.features[1] = { feature: 'b-roll', status: 'not_needed', reason: '没有可用的补充素材，所以没有添加配画面。', atFrame: 12 };
    expect(reviewEditingTask(task, review, evidence)).toMatchObject({ ok: false });
    review.features[1] = { feature: 'b-roll', status: 'blocked', reason: '生成配画面需要用户确认，当前等待答复。', atFrame: 12 };
    expect(reviewEditingTask(task, review, evidence)).toMatchObject({ ok: true, review: { completed: false } });
  });
});

// A branded whole-video edit must deliver its own cover, not just reuse a reference.
describe('branded cover delivery', () => {
  const brandedTask: ChatTask = { ...task, skills: [...task.skills, 'cover'], config: { ...config, skills: [...config.skills, 'cover'], brand: { ...brand, blocks: { ...brand.blocks, cover: { design: 'A clean portrait with a short headline.', frame: 'An expressive frame from this recording.' } } } } };
  it('rejects completion when cover work was silently omitted', () => {
    expect(reviewEditingTask(brandedTask, input(), evidence)).toMatchObject({ ok: false, missing: ['cover'] });
  });
  it('keeps pending cover generation and approval unfinished', () => {
    expect(reviewEditingTask(brandedTask, { ...input(), cover: { status: 'blocked', reason: '封面生成仍在等待结果，尚未交付。' } }, evidence)).toMatchObject({ ok: true, review: { completed: false, cover: { status: 'blocked' } } });
  });
  it('does not accept a claimed cover without a real generation result', () => {
    expect(reviewEditingTask(brandedTask, { ...input(), cover: { status: 'generated', jobId: 'cover-job', assetId: 'cover-image', reason: '已完成符合品牌风格的新封面。' } }, evidence)).toMatchObject({ ok: false });
  });
  it('cannot skip the cover just because the video edit is finished', () => {
    expect(reviewEditingTask(brandedTask, { ...input(), cover: { status: 'skipped', reason: '视频剪辑已经结束，因此无需制作封面。' } }, evidence)).toMatchObject({ ok: false });
  });
  it('accepts only this task’s settled, registered and inspected cover, including after reload', () => {
    const document = compositionToEditorDocument({ projectId: 'project', videoSig: 'sig', composition: emptyComposition() }).document;
    document.assets['cover-image'] = { id: 'cover-image', kind: 'image', label: 'New cover', locator: { cloudKey: 'uploads/new-cover.png' }, metadata: {} };
    const receipt = (name: string, input: object, data: object): UIMessage => ({ id: name, role: 'assistant', parts: [{ type: 'dynamic-tool', toolName: name, toolCallId: name, state: 'output-available', input, output: { ok: true, data } }] });
    const jobs = [{ id: 'cover-job', status: 'succeeded', assets: [{ key: 'uploads/new-cover.png', url: 'https://cdn.example/new-cover.png', mime: 'image/png' }] }];
    const messages = [receipt('generate_image', { purpose: 'cover' }, { ids: ['cover-job'] }), receipt('inspect_media', { mode: 'generation' }, { jobs }), receipt('inspect_media', { mode: 'frames' }, { images: [{ ref: 'cover-image', description: 'The speaker and new headline are legible.' }] })];
    const request = { ...input(), cover: { status: 'generated', jobId: 'cover-job', assetId: 'cover-image', reason: '封面沿用品牌的留白与字体，标题来自本视频。' } };
    expect(validateV3Input('finish_edit', request)).toBeNull();
    expect(validateV3Input('generate_image', { purpose: 'cover', prompt: 'New headline', sourceFrame: { assetId: 'speaker', sourceSec: 2 } })).toBeNull();
    expect(reviewEditingTask(brandedTask, request, evidence, document, JSON.parse(JSON.stringify(messages)))).toMatchObject({ ok: true, review: { completed: true, cover: { status: 'generated', url: 'https://cdn.example/new-cover.png' } } });
    expect(document.timeline.tracks.every(track => track.clips.length === 0)).toBe(true);
    for (const bad of [messages.slice(1), messages.slice(0, 2), [messages[0], receipt('inspect_media', { mode: 'generation' }, { jobs: [{ ...jobs[0], status: 'pending' }] }), messages[2]], [receipt('generate_image', { purpose: 'illustration' }, { ids: ['cover-job'] }), ...messages.slice(1)]]) expect(reviewEditingTask(brandedTask, request, evidence, document, bad).ok).toBe(false);
    document.assets['cover-image'].locator.cloudKey = 'uploads/brand-example.png';
    expect(reviewEditingTask(brandedTask, request, evidence, document, messages).ok).toBe(false);
  });
  it('instructs brand cover delivery and preserves the generation approval policy', () => {
    const instructions = v3Instructions({ surface: 'chat' });
    expect(instructions).toContain('call generate_cover after the spoken content is final');
    expect(instructions).toContain('never shifts footage or captions');
    expect(instructions).toContain('so do not ask for confirmation');
    expect(instructions).toContain('All other generation approval rules remain in force');
  });
  it('respects an explicit request to omit the cover', () => {
    expect(reviewEditingTask({ ...brandedTask, goal: '按品牌剪辑，但不要生成封面' }, { ...input(), cover: { status: 'skipped', reason: '用户明确要求本次不要生成封面。' } }, evidence)).toMatchObject({ ok: true, review: { completed: true } });
  });
});

it('checks the independent cover scene without returning its creative context to main chat', async () => {
  const { coverSceneInput, withCoverScene } = await import('./cover-scene');
  const document = compositionToEditorDocument({ projectId: 'scene', videoSig: 'sig', composition: emptyComposition() }).document;
  const configured: ChatTask = { ...task, skills: [...task.skills, 'cover'], config: { ...config, skills: [...config.skills, 'cover'] } };
  const scene = { version: 1 as const, runId: 'scene', inputFingerprint: coverSceneInput(document).fingerprint, phase: 'ready' as const, headline: ['PRIVATE HEADLINE'], prompt: 'PRIVATE COVER PROMPT', modelId: 'nano-banana', size: '3:4', jobId: 'job', images: [{ key: 'uploads/cover.jpg', url: 'https://cdn.example/cover.jpg', label: 'Cover' }], history: [] };
  const ready = reviewEditingTask(configured, input(), evidence, withCoverScene(document, scene));
  expect(ready).toMatchObject({ ok: true, review: { completed: true, cover: { status: 'generated' } } });
  expect(JSON.stringify(ready)).not.toMatch(/PRIVATE|https:|uploads/);
  expect(reviewEditingTask(configured, input(), evidence, withCoverScene(document, { ...scene, phase: 'generating', images: [] }))).toMatchObject({ ok: true, review: { completed: false } });
  expect(reviewEditingTask(configured, input(), evidence, withCoverScene(document, { ...scene, inputFingerprint: 'old-recording' }))).toMatchObject({ ok: true, review: { completed: false } });
  expect(reviewEditingTask(task, input(), evidence, document)).toMatchObject({ ok: true, review: { completed: true } });
});
