import { beforeEach, expect, it, vi } from 'vitest';
import type { CaptionTaskRecord } from '@pireel/studio-engine/scene-project';
const mocks = vi.hoisted(() => ({ start: vi.fn(), finish: vi.fn() }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ sceneRuns: { start: mocks.start, finish: mocks.finish } }) }));
import { withSceneRun } from './scene-run';
import type { SceneWorkflowHooks } from './scene-workflow-runtime';

const task = { id: '11111111-1111-4111-8111-111111111111', generationId: '22222222-2222-4222-8222-222222222222' } as CaptionTaskRecord;
const hooks = (controller = new AbortController()): SceneWorkflowHooks => ({ signal: controller.signal, checkpoint: async () => {}, progress: () => {} });
beforeEach(() => { vi.clearAllMocks(); mocks.start.mockResolvedValue({ id: task.generationId, credits: 8, resumed: false }); mocks.finish.mockResolvedValue(undefined); });

it('charges the generation once and hands its run to every step, closing it on success', async () => {
  const seen: (string | undefined)[] = [];
  expect(await withSceneRun(task, hooks(), async (inner) => { seen.push(inner.sceneRun); return 'done'; })).toBe('done');
  expect(mocks.start).toHaveBeenCalledWith({ id: task.generationId, projectId: task.id }, expect.any(AbortSignal));
  expect(seen).toEqual([task.generationId]);
  expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(task.generationId, 'completed');
});

it('refunds a failed generation but keeps a stopped or waiting one open to continue', async () => {
  await expect(withSceneRun(task, hooks(), async () => { throw new Error('voice failed'); })).rejects.toThrow('voice failed');
  expect(mocks.finish).toHaveBeenCalledExactlyOnceWith(task.generationId, 'failed');
  mocks.finish.mockClear();
  const controller = new AbortController();
  await expect(withSceneRun(task, hooks(controller), async () => { controller.abort(); throw new Error('stopped'); })).rejects.toThrow('stopped');
  await expect(withSceneRun(task, hooks(), async () => { throw Object.assign(new Error('waiting'), { code: 'workflow_waiting' }); })).rejects.toThrow('waiting');
  expect(mocks.finish).not.toHaveBeenCalled();
});

it('does not run the generation when the charge is refused', async () => {
  mocks.start.mockRejectedValue(new Error('积分不足'));
  const run = vi.fn();
  await expect(withSceneRun(task, hooks(), run)).rejects.toThrow('积分不足');
  expect(run).not.toHaveBeenCalled();
});
