// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { SceneCanvasPreview, type SceneCanvasHandle } from './scene-canvas-preview';
import { emptyComposition } from '@pireel/studio-engine/composition';
import type { SupplementalVisualMediaClip } from '@pireel/studio-engine/visual-layer-plan';

const engines = vi.hoisted(() => [] as any[]);
const stages = vi.hoisted(() => [] as any[]);
vi.mock('./preview-stage-host', () => ({ PreviewStageHost: class {
  // Like the real stage: every assignment mounts the document, the same text included.
  mounts = 0; private text = '';
  get srcdoc() { return this.text; }
  set srcdoc(html: string) { this.text = html; this.mounts += 1; }
  onMessage: ((event: unknown) => void) | null = null; dispose = vi.fn();
  contentWindow = { postMessage: vi.fn() };
  constructor(readonly element: HTMLDivElement) { stages.push(this); }
} }));
vi.mock('./video-track-engine', () => ({ VideoTrackEngine: class {
  setTransitions = vi.fn(); setAudioClips = vi.fn(); setLayers = vi.fn(); setSource = vi.fn(); setSegments = vi.fn(() => true); setTimelineDuration = vi.fn(); setMasterGain = vi.fn();
  refresh = vi.fn(); seek = vi.fn(); play = vi.fn(); pause = vi.fn(); dispose = vi.fn();
  isPlaying = false;
  constructor() { engines.push(this); }
} }));

it('uses the workbench canvas, keeps its decoder through edits, and primes replacements before showing them', async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const element = document.createElement('div'); document.body.append(element);
  const root = createRoot(element); const ref = createRef<SceneCanvasHandle>();
  const source = new File(['source'], 'source.mp4'); const footage = new File(['footage'], 'footage.mp4');
  const comp = { ...emptyComposition(), width: 640, height: 360, audioLoudness: { targetLufs: -16, gainDb: 20 }, audioTracks: [{ id: 'sfx', src: 'blob:sfx', role: 'sfx' as const, startSec: 2, durationSec: .25, volumeDb: -12 }], video: { url: 'blob:source', durationSec: 10 }, shots: [{ id: 'source', src: 'blob:source', srcStart: 0, srcEnd: 10, treatment: 'full' as const }] };
  const picture = new File(['image'], 'picture.png', { type: 'image/png' });
  const files = new Map([['blob:source', source], ['blob:footage', footage], ['blob:picture', picture]]);
  const visual: SupplementalVisualMediaClip = { clipId: 'footage', trackId: 'broll', stackOrder: 1, kind: 'video', source: 'blob:footage', startSec: 2, endSec: 5, sourceInSec: 1, sourceOutSec: 4, fit: 'cover', muted: true, audioMuted: true };
  const onTime = vi.fn(); const onPlaying = vi.fn();
  const render = async (start = 2, volume = 1) => {
    await act(async () => root.render(createElement(SceneCanvasPreview, { ref, composition: comp, visuals: [{ ...visual, startSec: start, endSec: start + 3 }, { ...visual, clipId: 'picture', kind: 'image', source: 'blob:picture' }], files, duration: 10, volume, onTime, onPlaying })));
    await act(async () => vi.advanceTimersByTime(110));
  };
  const boot = async (stage: any) => {
    const post = stage.contentWindow.postMessage;
    await act(async () => stage.onMessage({ source: stage.contentWindow, data: { type: 'pong', nonce: 'boot' } }));
    return post;
  };
  try {
    await render();
    const eng = engines.at(-1); const count = engines.length;
    const sound = eng.setAudioClips.mock.calls.at(-1)[0][0];
    expect(eng.setMasterGain).toHaveBeenLastCalledWith(10);
    expect(sound.url).toBe('blob:sfx'); expect(sound.gainAt(1)).toBe(0); expect(sound.gainAt(2.1)).toBeCloseTo(10 ** (-12 / 20)); expect(sound.srcTimeAt(2.1)).toBeCloseTo(.1);
    expect(element.querySelector('iframe')).toBeNull();
    const first = stages[0];
    expect(first.srcdoc).toContain('<canvas id="vidEl"');
    expect(first.srcdoc).toContain('data-source-in="1"');
    expect(first.srcdoc).toContain('pireel-local-image:picture');
    expect(first.srcdoc).not.toContain('src="blob:picture"');
    expect(element.querySelector('video')).toBeNull();
    const post = await boot(first);
    expect(post).toHaveBeenCalledWith({ type: 'hf:imageFile', sig: 'picture', file: picture }, '*');
    expect(eng.setLayers).toHaveBeenCalledWith([expect.objectContaining({ elKey: 'hf-visual-footage', key: 'blob:footage', timelineStart: 2 })]);
    const layerFrame = { close: vi.fn() };
    await act(async () => eng.onLayerFrame({ elKey: 'hf-visual-footage' }, layerFrame));
    expect(post).toHaveBeenCalledWith({ type: 'hf:layerFrame', id: 'hf-visual-footage', frame: layerFrame }, '*', [layerFrame]);
    const frame = { close: vi.fn() };
    await act(async () => eng.onFrame(frame, { t: 0, srcT: 0, elKey: 'clip_source' }));
    await act(async () => { ref.current!.seek(4); ref.current!.play(); });
    expect(eng.seek).toHaveBeenLastCalledWith(4);
    expect(eng.play).toHaveBeenLastCalledWith(4);
    await render(6, .4);
    expect(eng.setAudioClips.mock.calls.at(-1)[0][0].gainAt(2.1)).toBeCloseTo(.4 * 10 ** (-12 / 20));
    expect(engines).toHaveLength(count);
    expect(eng.setSegments.mock.calls.at(-1)[0][0].gain).toBe(.4);
    const second = stages[1];
    expect(second.element.style.opacity).toBe('0');
    expect(second.srcdoc).toContain('data-start="6"');
    const nextPost = await boot(second);
    expect(nextPost).toHaveBeenCalledWith({ type: 'hf:seek', t: 4 }, '*');
    expect(second.element.style.opacity).toBe('0');
    await act(async () => eng.onFrame(frame, { t: 4, srcT: 4, elKey: 'clip_source' }));
    expect(second.element.style.opacity).toBe('1');
    expect(first.element.style.opacity).toBe('0');
    expect(post).toHaveBeenCalledWith({ type: 'hf:pause' }, '*');
    await act(async () => root.unmount());
    expect(eng.dispose).toHaveBeenCalledOnce();
    expect(stages.every(stage => stage.dispose.mock.calls.length > 0)).toBe(true);
  } finally { element.remove(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});

it('announces a picture asked for again: the one on screen, and the one the hidden stage still holds', async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  stages.length = 0;
  const element = document.createElement('div'); document.body.append(element);
  const root = createRoot(element);
  const source = new File(['source'], 'source.mp4');
  const files = new Map([['blob:source', source]]);
  const onShown = vi.fn();
  // Three pictures that differ in the document: the same footage under three canvas shapes.
  const picture = (height: number) => ({ ...emptyComposition(), width: 640, height, video: { url: 'blob:source', durationSec: 10 }, shots: [{ id: 'source', src: 'blob:source', srcStart: 0, srcEnd: 10, treatment: 'full' as const }] });
  const show = async (height: number) => {
    await act(async () => root.render(createElement(SceneCanvasPreview, { composition: picture(height), visuals: [], files, duration: 10, volume: 1, onTime: vi.fn(), onPlaying: vi.fn(), onShown })));
    await act(async () => vi.advanceTimersByTime(110));
  };
  const firstFrame = async (stage: any) => {
    await act(async () => stage.onMessage({ source: stage.contentWindow, data: { type: 'pong', nonce: 'boot' } }));
    await act(async () => engines.at(-1).onFrame({ close: vi.fn() }, { t: 0, srcT: 0, elKey: 'clip_source' }));
  };
  try {
    await show(360);
    const [first] = stages;
    await firstFrame(first);
    expect(onShown).toHaveBeenCalledTimes(1);

    await show(480);
    const second = stages[1];
    await firstFrame(second);
    expect(onShown).toHaveBeenCalledTimes(2);
    expect(second.element.style.opacity).toBe('1');

    // The same picture again, as a new composition object: nothing mounts, and it is announced.
    const mounted = [first.mounts, second.mounts];
    await show(480);
    expect([first.mounts, second.mounts]).toEqual(mounted);
    expect(onShown).toHaveBeenCalledTimes(3);
    expect(second.element.style.opacity).toBe('1');

    // A third picture takes the other place (a new stage: the first one's was let go above); the
    // second is now the hidden one.
    await show(600);
    const third = stages.at(-1)!;
    expect(third).not.toBe(second);
    await firstFrame(third);
    expect(onShown).toHaveBeenCalledTimes(4);
    expect(third.element.style.opacity).toBe('1');

    // Back to the second picture: the hidden stage still holds that very document. It is mounted
    // afresh, and its first frame brings it up. (It used to mount nothing and wait for good.)
    const before = second.mounts;
    await show(480);
    expect(second.mounts).toBe(before + 1);
    expect(second.element.style.opacity).toBe('0');
    await firstFrame(second);
    expect(onShown).toHaveBeenCalledTimes(5);
    expect(second.element.style.opacity).toBe('1');
    expect(third.element.style.opacity).toBe('0');
    await act(async () => root.unmount());
  } finally { element.remove(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); }
});
