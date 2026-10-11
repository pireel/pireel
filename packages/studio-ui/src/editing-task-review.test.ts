import { describe, expect, it } from 'vitest';
import { resolveEditingRunConfig } from '@pireel/studio-engine/editing-run-config';
import { emptyPlaybook, playbookSnapshot } from '@pireel/studio-engine/brand-playbook';
import { reviewEditingTask, needsEditingReview } from './editing-task-review';
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
    expect(reviewEditingTask(task, { features: [] }, evidence)).toMatchObject({ ok: false, missing: ['graphics', 'b-roll', 'zoom', 'transitions'] });
  });
  it('rejects claims of effects that do not exist on the timeline', () => {
    expect(reviewEditingTask(task, input(), { ...evidence, zoom: [] })).toMatchObject({ ok: false });
    expect(reviewEditingTask(task, input(), { ...evidence, 'b-roll': [] })).toMatchObject({ ok: false });
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
