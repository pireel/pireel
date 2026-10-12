/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ poll: vi.fn() }));
vi.mock('./gen-api', async original => ({ ...await original<object>(), pollCreation: mocks.poll }));
import { GenerationJobsBody } from './chat-generation-card';
import { setStudioLocale } from './i18n';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { roots.splice(0).forEach(root => act(() => root.unmount())); document.body.innerHTML = ''; vi.clearAllMocks(); });
const job = { id: 'cover-job', status: 'succeeded', prompt: 'This video cover', createdAt: 1, assets: [{ key: 'uploads/cover.png', url: 'https://cdn.example/cover.png', mime: 'image/png' }] };
async function mount(status = 'succeeded', appliedCoverKey?: string) {
  setStudioLocale('zh'); mocks.poll.mockResolvedValue({ ...job, status, assets: status === 'succeeded' ? job.assets : [] });
  const onApplyCover = vi.fn(async () => {}); const onInsertMedia = vi.fn(); const onGenerateCover = vi.fn();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);
  await act(async () => { root.render(createElement(GenerationJobsBody, { ids: [job.id], kind: 'image', prompt: job.prompt, isCover: true, actions: { onApplyCover, onInsertMedia, onGenerateCover, appliedCoverKey } })); });
  return { host, onApplyCover, onInsertMedia, onGenerateCover };
}
describe('generated cover result card', () => {
  it('applies the actual image to the cover and regenerates as a cover, keeping it out of the timeline', async () => {
    const { host, onApplyCover, onInsertMedia, onGenerateCover } = await mount();
    const apply = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('应用为封面'))!;
    await act(async () => apply.click());
    expect(onApplyCover).toHaveBeenCalledWith({ key: job.assets[0].key, url: job.assets[0].url, label: job.prompt });
    expect(host.textContent).not.toContain('插入时间线'); expect(onInsertMedia).not.toHaveBeenCalled();
    act(() => [...host.querySelectorAll('button')].find(button => button.textContent?.includes('重新生成封面'))!.click());
    expect(onGenerateCover).toHaveBeenCalledTimes(1);
  });
  it('restores applied state from the selected cover key', async () => {
    const { host } = await mount('succeeded', job.assets[0].key);
    const applied = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('已应用封面'))!;
    expect(applied.disabled).toBe(true);
  });
  it.each(['pending', 'failed'])('never applies a %s generation', async status => {
    const { host, onApplyCover } = await mount(status);
    expect(host.textContent).not.toContain('应用为封面'); expect(onApplyCover).not.toHaveBeenCalled();
  });
});
