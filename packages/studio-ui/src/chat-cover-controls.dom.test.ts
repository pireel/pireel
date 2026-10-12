/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatCoverEntry, CoverApplyButton } from './chat-cover-controls';
import { setStudioLocale } from './i18n';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
function mount(component: ReturnType<typeof createElement>) { const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root); act(() => root.render(component)); return { host, root }; }
afterEach(() => { roots.splice(0).forEach(root => act(() => root.unmount())); document.body.innerHTML = ''; });
const cover = { url: 'https://cdn.example/cover.png', key: 'cover.png', label: 'Cover' };

describe('cover interactions', () => {
  it('starts an explicit cover request and shows the persisted current selection', () => {
    setStudioLocale('zh'); const generate = vi.fn();
    const { host } = mount(createElement(ChatCoverEntry, { cover, onGenerate: generate }));
    act(() => [...host.querySelectorAll('button')].find(button => button.textContent === '生成封面')!.click());
    expect(generate).toHaveBeenCalledTimes(1);
    expect(host.querySelector('img')?.src).toBe(cover.url);
    expect(host.textContent).toContain('当前封面');

  });
  it('shows applying, prevents duplicate writes and confirms only after the save completes', async () => {
    setStudioLocale('zh'); let resolve!: () => void;
    const apply = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const { host, root } = mount(createElement(CoverApplyButton, { cover, onApply: apply }));
    await act(async () => { host.querySelector('button')!.click(); host.querySelector('button')!.click(); });
    expect(apply).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('正在应用'); expect(host.querySelector('button')!.disabled).toBe(true);
    await act(async () => { resolve(); });
    act(() => root.render(createElement(CoverApplyButton, { cover, onApply: apply, appliedKey: cover.key })));
    expect(host.textContent).toContain('已应用封面'); expect(host.querySelector('button')!.disabled).toBe(true);
  });
  it('offers retry after save failure rather than claiming application', async () => {
    setStudioLocale('zh'); const apply = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    const { host } = mount(createElement(CoverApplyButton, { cover, onApply: apply }));
    await act(async () => { host.querySelector('button')!.click(); });
    expect(host.querySelector('[role=alert]')?.textContent).toContain('封面未保存');
    expect(host.textContent).not.toContain('已应用封面');
    await act(async () => { host.querySelector('button')!.click(); });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role=alert]')).toBeNull();
  });
  it('localizes the actions in English and disables generation during another task', () => {
    setStudioLocale('en'); const onGenerate = vi.fn();
    const { host } = mount(createElement(ChatCoverEntry, { disabled: true, onGenerate }));
    act(() => host.querySelector('button')!.click());
    expect(onGenerate).not.toHaveBeenCalled(); expect(host.textContent).toContain('Generate cover');
  });
});
