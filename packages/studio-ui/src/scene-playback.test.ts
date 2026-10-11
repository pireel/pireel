// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { ScenePlayerFrame } from './scene-player-frame';
import { ScenePlayback } from './scene-playback';
import { SceneVideoPreview } from './scene-video-preview';
it('shares scroll-aware dragging, frame keyboard steps, bounds and disabled behavior across track contents', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const rootEl = document.createElement('div'); document.body.append(rootEl); const root = createRoot(rootEl); const pause = vi.fn(); const seeks = vi.fn();
  function Harness({ disabled = false }) { const [time, setTime] = useState(0); return createElement(ScenePlayback, { time, duration: 20, playing: false, onToggle: vi.fn(), disabled, locale: 'zh', onPause: pause, onSeek: value => { seeks(value); setTime(value); } }, createElement('button', { 'data-scene-clip': true }, 'Clip')); }
  const pointer = (type: string, x: number) => { const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x }); Object.defineProperty(event, 'pointerId', { value: 7 }); return event; };
  try {
    await act(async () => root.render(createElement(Harness)));
    const track = rootEl.querySelector<HTMLElement>('[data-scene-time-track]')!; const head = rootEl.querySelector<HTMLElement>('[role=slider]')!;
    Object.assign(track, { getBoundingClientRect: () => ({ left: -100, width: 400 }), setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() });
    await act(async () => track.dispatchEvent(pointer('pointerdown', 100))); expect(head.getAttribute('aria-valuenow')).toBe('10');
    await act(async () => track.dispatchEvent(pointer('pointermove', 500))); expect(head.getAttribute('aria-valuenow')).toBe('20');
    await act(async () => track.dispatchEvent(pointer('pointerup', 500)));
    await act(async () => head.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft', shiftKey: true }))); expect(head.getAttribute('aria-valuenow')).toBe('19');
    await act(async () => head.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowLeft' }))); expect(Number(head.getAttribute('aria-valuenow'))).toBeCloseTo(19 - 1 / 30, 3);
    seeks.mockClear(); await act(async () => rootEl.querySelector('[data-scene-clip]')!.dispatchEvent(pointer('pointerdown', 100))); expect(seeks).not.toHaveBeenCalled();
    await act(async () => root.render(createElement(Harness, { disabled: true })));
    await act(async () => track.dispatchEvent(pointer('pointerdown', 0))); expect(seeks).not.toHaveBeenCalled(); expect(head.getAttribute('aria-disabled')).toBe('true');
    expect(rootEl.textContent).not.toMatch(/静音|只听音效|优化音源/);
  } finally { await act(async () => root.unmount()); rootEl.remove(); vi.unstubAllGlobals(); }
});
it('drives a regular scene video through the same axis, resets on version changes and pauses on teardown', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('URL', { createObjectURL: () => 'blob:source', revokeObjectURL: vi.fn() });
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) { this.dispatchEvent(new Event('play')); return Promise.resolve(); });
  const rootEl = document.createElement('div'); document.body.append(rootEl); const root = createRoot(rootEl); const source = new File(['source'], 'test.mp4');
  const props = { source, width: 640, height: 360, duration: 20, disabled: false, locale: 'zh' as const };
  try {
    await act(async () => root.render(createElement(SceneVideoPreview, props)));
    const video = rootEl.querySelector('video')!; expect(video.controls).toBe(false); expect(video.getAttribute('src')).toBe('blob:source');
    await act(async () => (rootEl.querySelector('[aria-label="播放"]') as HTMLButtonElement).click()); expect(play).toHaveBeenCalledOnce();
    const head = rootEl.querySelector('[role=slider]')!;
    await act(async () => head.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'End' }))); expect(video.currentTime).toBe(20);
    await act(async () => { video.currentTime = 7; video.dispatchEvent(new Event('timeupdate')); }); expect(head.getAttribute('aria-valuenow')).toBe('7');
    await act(async () => root.render(createElement(SceneVideoPreview, { ...props, resultUrl: 'blob:version' }))); expect(video.currentTime).toBe(0); expect(head.getAttribute('aria-valuenow')).toBe('0');
    pause.mockClear(); await act(async () => root.render(null)); expect(pause).toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); rootEl.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});

it('places the transport first in the action row with no time counter or video overlay', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const el = document.createElement('div'); document.body.append(el); const root = createRoot(el); const toggle = vi.fn();
  const render = async (playing = false, disabled = false) => act(async () => root.render(createElement('div', null,
    createElement(ScenePlayerFrame, { width: 1080, height: 1920, disabled, onToggle: toggle, children: createElement('div', { role: 'slider', 'aria-label': '字幕位置' }) }),
    createElement(ScenePlayback, { time: 3, duration: 10, playing, disabled, locale: 'zh', onToggle: toggle, onPause: vi.fn(), onSeek: vi.fn(), actions: createElement('button', null, 'Agent Remix') })
  )));
  try {
    await render(); const frame = el.querySelector<HTMLElement>('[data-scene-player-frame]')!; const row = el.querySelector('[data-scene-player-actions]')!;
    const button = row.querySelector<HTMLButtonElement>('button[aria-label="播放"]')!;
    expect(row.firstElementChild).toBe(button); expect(frame.querySelector('button')).toBeNull();
    expect(el.textContent).not.toContain('0:03.0 / 0:10.0');
    await act(async () => button.click()); expect(toggle).toHaveBeenCalledTimes(1);
    await act(async () => (frame.querySelector('[role="slider"]') as HTMLElement).click()); expect(toggle).toHaveBeenCalledTimes(1);
    await act(async () => frame.click()); expect(toggle).toHaveBeenCalledTimes(2);
    await render(true); expect(row.querySelector('[aria-label="暂停"]')).not.toBeNull();
    await render(false, true); await act(async () => button.click()); await act(async () => frame.click()); expect(toggle).toHaveBeenCalledTimes(2);
  } finally { await act(async () => root.unmount()); el.remove(); vi.unstubAllGlobals(); }
});
