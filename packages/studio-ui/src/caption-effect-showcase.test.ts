// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./canvas-caption-preview', () => ({ CanvasCaptionPreview: ({ style }: { style: { preset: string } }) => createElement('div', { 'data-preview-style': style.preset }) }));
import { CaptionEffectShowcase } from './caption-effect-showcase';
let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(CaptionEffectShowcase, { locale: 'zh' })));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const active = () => container.querySelector('[aria-pressed=true]')?.getAttribute('data-preset');
function pointer(element: Element, type: 'pointerover' | 'pointerout') {
  const event = new MouseEvent(type, { bubbles: true, relatedTarget: document.body });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  element.dispatchEvent(event);
}
describe('single video style showcase', () => {
  it('cycles the active style without replacing the video', () => {
    const video = container.querySelector('video');
    expect(active()).toBe('art-beast');
    act(() => vi.advanceTimersByTime(1400));
    expect(active()).toBe('art-keyline');
    expect(container.querySelector('[data-caption-demo-frame] [data-preview-style]')?.getAttribute('data-preview-style')).toBe('art-keyline');
    expect(container.querySelector('video')).toBe(video);
  });
  it('applies hovered styles, pauses the style cycle, and resumes on exit while video keeps playing', () => {
    const target = container.querySelector('[data-preset=art-comic]')!;
    act(() => pointer(target, 'pointerover'));
    expect(active()).toBe('art-comic');
    act(() => vi.advanceTimersByTime(10000));
    expect(active()).toBe('art-comic');
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    act(() => pointer(target, 'pointerout'));
    act(() => vi.advanceTimersByTime(1400));
    expect(active()).toBe('art-neon');
  });
});
