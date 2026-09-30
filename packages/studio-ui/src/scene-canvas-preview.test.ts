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
  srcdoc = ''; onMessage: ((event: unknown) => void) | null = null; dispose = vi.fn();
  contentWindow = { postMessage: vi.fn() };
  constructor(readonly element: HTMLDivElement) { stages.push(this); }
} }));
vi.mock('./video-track-engine', () => ({ VideoTrackEngine: class {
  setAudioClips = vi.fn(); setLayers = vi.fn(); setSource = vi.fn(); setSegments = vi.fn(() => true); setTimelineDuration = vi.fn();
  refresh = vi.fn(); seek = vi.fn(); play = vi.fn(); pause = vi.fn(); dispose = vi.fn();
  isPlaying = false;
  constructor() { engines.push(this); }
} }));

it('uses the workbench canvas, keeps its decoder through edits, and primes replacements before showing them', async () => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const element = document.createElement('div'); document.body.append(element);
  const root = createRoot(element); const ref = createRef<SceneCanvasHandle>();
  const source = new File(['source'], 'source.mp4'); const footage = new File(['footage'], 'footage.mp4');
  const comp = { ...emptyComposition(), width: 640, height: 360, audioTracks: [{ id: 'sfx', src: 'blob:sfx', role: 'sfx' as const, startSec: 2, durationSec: .25, volumeDb: -12 }], video: { url: 'blob:source', durationSec: 10 }, shots: [{ id: 'source', src: 'blob:source', srcStart: 0, srcEnd: 10, treatment: 'full' as const }] };
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
