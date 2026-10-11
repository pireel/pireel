// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
vi.mock('./caption-stage-sample', () => ({ CaptionStageSample: () => createElement('div') }));
import { CaptionPositionPreview } from './caption-position-preview';
let root: Root; let container: HTMLDivElement;
const changed = vi.fn();
function Harness() {
  const [options, setOptions] = useState<CaptionTaskOptions>({ caption: {}, aspect: 'original', shortenPauses: false, translationLanguage: 'English' });
  return createElement(CaptionPositionPreview, { options, source: { width: 1080, height: 1920 }, locale: 'zh', onChange: (yPct: number) => { changed(yPct); setOptions((current) => ({ ...current, caption: { ...current.caption, yPct } })); } });
}
const slider = () => container.querySelector<HTMLElement>('[role=slider]')!;
async function pointer(type: string, y: number, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  await act(async () => slider().dispatchEvent(event));
}
beforeEach(async () => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: (text: string) => ({ width: text.length * 24 }) } as never);
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(Harness)));
  container.querySelector<HTMLElement>('[data-caption-position-preview]')!.getBoundingClientRect = () => ({ height: 500, width: 281.25, x: 0, y: 0, top: 0, left: 0, bottom: 500, right: 281.25, toJSON() {} });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('direct caption positioning', () => {
  it('moves the full bilingual preview by pointer delta and commits only on release', async () => {
    await pointer('pointerdown', 300); await pointer('pointermove', 350);
    expect(slider().getAttribute('aria-valuenow')).toBe('84');
    expect(container.querySelector<HTMLElement>('[aria-hidden]')!.style.transform).toBe('translateY(10%)');
    expect(changed).not.toHaveBeenCalled();
    await pointer('pointerup', 350);
    expect(changed).toHaveBeenCalledExactlyOnceWith(84);
    expect(container.querySelector<HTMLElement>('[aria-hidden]')!.style.transform).toBe('');
  });
  it('cancels without changing settings and ignores unrelated pointers', async () => {
    await pointer('pointerdown', 300); await pointer('pointermove', 400, 2);
    expect(slider().getAttribute('aria-valuenow')).toBe('74');
    await pointer('pointermove', 350); await pointer('pointercancel', 350);
    expect(slider().getAttribute('aria-valuenow')).toBe('74'); expect(changed).not.toHaveBeenCalled();
  });
  it('supports keyboard adjustment and keeps a drag within the video', async () => {
    await act(async () => slider().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    expect(changed).toHaveBeenLastCalledWith(73);
    await pointer('pointerdown', 300); await pointer('pointermove', 10000); await pointer('pointerup', 10000);
    expect(Number(slider().getAttribute('aria-valuenow'))).toBeLessThanOrEqual(95);
    await pointer('pointerdown', 300); await pointer('pointermove', 200);
    await act(async () => slider().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(slider().getAttribute('data-dragging')).toBe('false');
  });
});
