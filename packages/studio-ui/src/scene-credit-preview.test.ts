// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { CaptionTaskRecord } from '@pireel/studio-engine/scene-project';
const mocks = vi.hoisted(() => ({ estimate: vi.fn() }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ estimateSceneCredits: mocks.estimate }) }));
import { SceneCreditPreview } from './scene-credit-preview';
let root: Root; let container: HTMLDivElement;
const task: CaptionTaskRecord = { id: 'task', scope: 'owner', name: 'video', scene: 'dubbing', sourceSig: 'source', durationSec: 121.5, width: 1920, height: 1080, stage: 'ready', updatedAt: 1, options: { caption: {}, aspect: 'original', shortenPauses: false, dubbing: { language: 'English', voiceId: 'voice', lipSync: false } } };
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.clearAllMocks();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('shows the estimated range up front', async () => {
  mocks.estimate.mockResolvedValue({ min: 34, max: 106, estimate: 69, durationBased: true, items: [{ kind: 'speech', min: 29, max: 101, estimate: 64 }] });
  await act(async () => root.render(createElement(SceneCreditPreview, { task, options: task.options, locale: 'en', busy: false })));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(container.querySelector('summary')?.textContent).toContain('Estimated 34–106 credits');
  expect(container.textContent).toContain('assumed speech rate');
});
it('tells picture in picture runs never charge more than the ceiling', async () => {
  const pip = { ...task, scene: 'pip' as const, options: { ...task.options, dubbing: undefined, broll: { assets: [], captions: true, aiFootage: true } } };
  mocks.estimate.mockResolvedValue({ min: 6, max: 18, estimate: 14, durationBased: false, items: [{ kind: 'stills', min: 4, max: 16, estimate: 16 }] });
  await act(async () => root.render(createElement(SceneCreditPreview, { task: pip, options: pip.options, locale: 'zh', busy: false })));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(container.querySelector('summary')?.textContent).toContain('预计 6–18 积分');
  expect(container.textContent).toContain('超出也只扣 18 积分');
});
it('shows the fixed generation price even after results are cached', async () => {
  const completed = { ...task, stage: 'completed' as const, transcript: [{ text: 'Hello', start: 0, end: 121.5 }], options: { ...task.options, dubbing: { ...task.options.dubbing!, lipSync: true } } };
  mocks.estimate.mockResolvedValue({ min: 90, max: 90, estimate: 90, durationBased: false, items: [], fixed: { perMinute: 8, lipSync: { perMinute: 36, minSec: 40, credits: 73 } } });
  await act(async () => root.render(createElement(SceneCreditPreview, { task: completed, options: completed.options, locale: 'zh', busy: false })));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(mocks.estimate.mock.calls[0][0]).toEqual({ scene: 'dubbing', durationSec: 121.5, asr: false, translation: false, emphasis: false, lipSync: true, speech: [] });
  expect(container.textContent).toContain('本次生成 90 积分');
  expect(container.textContent).toContain('8 积分/分钟');
  expect(container.textContent).toContain('口型同步 36 积分/分钟');
});

it('shows only the selected tier and the credits it deducts', async () => {
  const removal = { ...task, scene: 'subtitle-removal' as const, options: { ...task.options, subtitleRemoval: { mode: 'auto' as const, tier: 'lite' as const } } };
  mocks.estimate.mockResolvedValue({ min: 12, max: 15, estimate: 15, durationBased: false, items: [], erasure: { tier: 'lite', credits: 15, perMinute: 10 } });
  await act(async () => root.render(createElement(SceneCreditPreview, { task: removal, options: removal.options, locale: 'zh', busy: false })));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(container.textContent).toContain('极速'); expect(container.textContent).toContain('15'); expect(container.textContent).toContain('本次扣除'); expect(container.textContent).not.toContain('¥');
  expect(mocks.estimate.mock.calls[0][0]).toMatchObject({ erasureTier: 'lite', erasureWidth: 1920, erasureHeight: 1080 });
});
