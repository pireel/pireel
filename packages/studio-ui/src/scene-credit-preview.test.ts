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
it('shows a rounded approximate budget while preserving the range in details', async () => {
  mocks.estimate.mockResolvedValue({ min: 34, max: 106, estimate: 69, durationBased: true, items: [{ kind: 'speech', min: 29, max: 101, estimate: 64 }] });
  await act(async () => root.render(createElement(SceneCreditPreview, { task, options: task.options, locale: 'en', busy: false })));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(container.querySelector('summary')?.textContent).toContain('Estimated ~ 70 credits');
  expect(container.querySelector('summary')?.textContent).not.toContain('34–106');
  expect(container.querySelector('details')?.textContent).toContain('34–106');
  expect(container.textContent).toContain('assumed speech rate');
});
it('requests the full generation price even after results are cached', async () => {
  const completed = { ...task, stage: 'completed' as const, transcript: [{ text: 'Hello', start: 0, end: 121.5 }], dubbing: { language: 'English', sourceText: 'Hello', translatedText: 'Hello', speechSignature: JSON.stringify(['Hello', 'voice', 'English']), speechParts: [{ url: 'audio', key: 'audio', signature: '', durationSec: 121.5 }] } };
  mocks.estimate.mockResolvedValue({ min: 7, max: 7, estimate: 7, durationBased: false, items: [] });
  await act(async () => root.render(createElement(SceneCreditPreview, { task: completed, options: task.options, locale: 'zh', busy: false })));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(mocks.estimate.mock.calls[0][0]).toMatchObject({ asr: true, translation: true, speech: [{ minUnits: 5, maxUnits: 5 }] });
  expect(container.querySelector('summary')?.textContent).toBe('预计 7 积分');
  expect(container.textContent).not.toContain('复用');
});

it('shows the selected cost tier, one-order rounding and settlement terms without a markup', async () => {
  const removal = { ...task, scene: 'subtitle-removal' as const, options: { ...task.options, subtitleRemoval: { mode: 'auto' as const, tier: 'lite' as const } } };
  mocks.estimate.mockResolvedValue({ min: 12, max: 15, estimate: 15, durationBased: false, items: [], erasure: { tier: 'lite', baseCnyPerMinute: .5, cnyPerCredit: .072, costCny: 1.0125, prechargeCredits: 15, outputFpsCap: 30, outputResolution: '1080p' } });
  await act(async () => root.render(createElement(SceneCreditPreview, { task: removal, options: removal.options, locale: 'zh', busy: false })));
  await act(async () => vi.advanceTimersByTimeAsync(350));
  expect(container.textContent).toContain('极速'); expect(container.textContent).toContain('15'); expect(container.textContent).toContain('¥0.5/分钟');
  expect(container.textContent).toContain('不加服务费'); expect(container.textContent).toContain('整单向上取整'); expect(container.textContent).toContain('差额退回');
  expect(mocks.estimate.mock.calls[0][0]).toMatchObject({ erasureTier: 'lite', erasureWidth: 1920, erasureHeight: 1080 });
});
