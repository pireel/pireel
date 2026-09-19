// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SceneCanvasPreview, type SceneCanvasHandle } from './scene-canvas-preview';
import { emptyComposition } from '@pireel/studio-engine/composition';
import type { SupplementalVisualMediaClip } from '@pireel/studio-engine/visual-layer-plan';

const engines = vi.hoisted(() => [] as any[]);
vi.mock('./video-track-engine', () => ({ VideoTrackEngine: class {
  setSource = vi.fn(); setSegments = vi.fn(() => true); setTimelineDuration = vi.fn();
  refresh = vi.fn(); seek = vi.fn(); play = vi.fn(); pause = vi.fn(); dispose = vi.fn();
  isPlaying = false;
  constructor() { engines.push(this); }
} }));

it('uses the workbench canvas, keeps its decoder through edits, and primes replacements before showing them', async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const element = document.createElement('div'); document.body.append(element);
  const root = createRoot(element); const ref = createRef<SceneCanvasHandle>();
  const source = new File(['source'], 'source.mp4'); const footage = new File(['footage'], 'footage.mp4');
  const comp = { ...emptyComposition(), width: 640, height: 360, video: { url: 'blob:source', durationSec: 10 }, shots: [{ id: 'source', src: 'blob:source', srcStart: 0, srcEnd: 10, treatment: 'full' as const }] };
  const files = new Map([['blob:source', source], ['blob:footage', footage]]);
  const visual: SupplementalVisualMediaClip = { clipId: 'footage', trackId: 'broll', stackOrder: 1, kind: 'video', source: 'blob:footage', startSec: 2, endSec: 5, sourceInSec: 1, sourceOutSec: 4, fit: 'cover', muted: true, audioMuted: true };
  const onTime = vi.fn(); const onPlaying = vi.fn();
  const render = async (start = 2, volume = 1) => {
    await act(async () => root.render(createElement(SceneCanvasPreview, { ref, composition: comp, visuals: [{ ...visual, startSec: start, endSec: start + 3 }], files, duration: 10, volume, onTime, onPlaying })));
    await act(async () => vi.advanceTimersByTime(110));
  };
  const boot = async (iframe: HTMLIFrameElement) => {
    const post = vi.spyOn(iframe.contentWindow!, 'postMessage').mockImplementation(() => {});
    await act(async () => window.dispatchEvent(new MessageEvent('message', { source: iframe.contentWindow!, data: { type: 'pong', nonce: 'boot' } })));
    return post;
  };
  try {
    await render();
    const eng = engines.at(-1); const count = engines.length;
    const first = element.querySelector('iframe')!;
    expect(first.srcdoc).toContain('<canvas id="vidEl"');
    expect(first.srcdoc).toContain('data-source-in="1"');
    expect(element.querySelector('video')).toBeNull();
    const post = await boot(first);
    expect(post).toHaveBeenCalledWith({ type: 'hf:clipFile', id: 'hf-visual-footage', file: footage }, '*');
    const frame = { close: vi.fn() };
    await act(async () => eng.onFrame(frame, { t: 0, srcT: 0, elKey: 'clip_source' }));
    await act(async () => { ref.current!.seek(4); ref.current!.play(); });
    expect(eng.seek).toHaveBeenLastCalledWith(4);
    expect(eng.play).toHaveBeenLastCalledWith(4);
    await render(6, .4);
    expect(engines).toHaveLength(count);
    expect(eng.setSegments.mock.calls.at(-1)[0][0].gain).toBe(.4);
    const second = element.querySelectorAll('iframe')[1];
    expect(second.style.opacity).toBe('0');
    expect(second.srcdoc).toContain('data-start="6"');
    const nextPost = await boot(second);
    expect(nextPost).toHaveBeenCalledWith({ type: 'hf:seek', t: 4 }, '*');
    expect(second.style.opacity).toBe('0');
    await act(async () => eng.onFrame(frame, { t: 4, srcT: 4, elKey: 'clip_source' }));
    expect(second.style.opacity).toBe('1');
    expect(first.style.opacity).toBe('0');
    expect(post).toHaveBeenCalledWith({ type: 'hf:pause' }, '*');
    await act(async () => root.unmount());
    expect(eng.dispose).toHaveBeenCalledOnce();
  } finally { element.remove(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
