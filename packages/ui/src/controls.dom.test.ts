/** @vitest-environment jsdom */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaViewer } from './media-viewer';
import { SimpleSelect } from './simple-select';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { Element.prototype.scrollIntoView ??= vi.fn(); });
afterEach(() => { roots.splice(0).forEach(root => act(() => root.unmount())); document.body.innerHTML = ''; });
async function mount(element: ReturnType<typeof createElement>) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  await act(async () => root.render(element));
}
const press = (key: string) => act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });

describe('MediaViewer', () => {
  it('steps with the arrows, and closes from Escape, the close button and the backdrop', async () => {
    const onClose = vi.fn(), onPrevious = vi.fn(), onNext = vi.fn();
    await mount(createElement(MediaViewer, { label: 'Image preview', onClose, onPrevious, onNext, footer: 'Caption', children: createElement('img', { alt: 'shot' }) }));
    const dialog = document.querySelector('[role=dialog]') as HTMLElement;
    expect(dialog.textContent).toContain('Caption');
    expect(document.querySelector('h2')?.textContent).toBe('Image preview');
    await press('ArrowRight'); await press('ArrowLeft');
    expect(onNext).toHaveBeenCalledTimes(1); expect(onPrevious).toHaveBeenCalledTimes(1);
    await act(async () => (document.querySelector('img') as HTMLElement).click());
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => dialog.click());
    await act(async () => (document.querySelector('[aria-label=Close]') as HTMLElement).click());
    await press('Escape');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('shows no arrow without a neighbour', async () => {
    await mount(createElement(MediaViewer, { label: 'Video preview', onClose() {}, children: createElement('video') }));
    expect(document.querySelector('[aria-label=Previous], [aria-label=Next]')).toBeNull();
  });
});

describe('SimpleSelect', () => {
  it('offers an empty value and reports it back as empty', async () => {
    const onValueChange = vi.fn();
    await mount(createElement(SimpleSelect, { value: 'ok', ariaLabel: 'Status', onValueChange, options: [{ value: '', label: 'All' }, { value: 'ok', label: 'Succeeded' }] }));
    const trigger = document.querySelector('[aria-label=Status]') as HTMLElement;
    expect(trigger.textContent).toBe('Succeeded');
    await act(async () => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role=option]')].find(option => option.textContent === 'All')!.click());
    expect(onValueChange).toHaveBeenCalledWith('');
  });
});
