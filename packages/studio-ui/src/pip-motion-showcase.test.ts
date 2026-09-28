// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PipShowcase } from './scene-upload-showcases';
let root: Root; let element: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  element = document.createElement('div'); document.body.append(element); root = createRoot(element);
});
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('cycles real layout geometries and lets the user select any template', async () => {
  await act(async () => root.render(createElement(PipShowcase, { locale: 'zh' })));
  expect(element.querySelector('[data-pip-demo-template]')?.getAttribute('data-pip-demo-template')).toBe('smart');
  expect(element.querySelector('video')).not.toBeNull();
  expect(element.querySelector('img')?.src).toContain('pip-footage-v1.png');
  expect(element.innerHTML).not.toContain('background-size');
  await act(async () => vi.advanceTimersByTime(2800));
  expect(element.querySelector('[data-pip-demo-template]')?.getAttribute('data-pip-demo-template')).toBe('inset');
  const presenter = [...element.querySelectorAll('button')].find(button => button.textContent?.includes('人物小窗'))!;
  await act(async () => presenter.click());
  expect(element.querySelector('[data-pip-demo-template]')?.getAttribute('data-pip-demo-template')).toBe('presenter');
  expect(element.querySelector('video')!.parentElement!.style.zIndex).toBe('3');
  expect(presenter.getAttribute('aria-pressed')).toBe('true');
});
