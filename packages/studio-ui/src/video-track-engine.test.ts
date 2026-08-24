/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { previewAudioSource, VideoTrackEngine } from './video-track-engine';

describe('VideoTrackEngine timeline-only clock', () => {
  let now = 0;
  let nextRafId = 1;
  let rafs = new Map<number, FrameRequestCallback>();

  beforeEach(() => {
    document.body.innerHTML = '';
    now = 0;
    nextRafId = 1;
    rafs = new Map();
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextRafId++;
      rafs.set(id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => rafs.delete(id));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const step = (milliseconds: number) => {
    const pending = [...rafs.entries()];
    rafs.clear();
    now += milliseconds;
    for (const [, callback] of pending) callback(now);
  };

  it('plays a graphics/audio-only document to its timeline end without a video segment', () => {
    const engine = new VideoTrackEngine();
    const ticks: number[] = [];
    const ended = vi.fn();
    engine.onTick = (t) => ticks.push(t);
    engine.onEnded = ended;
    engine.setTimelineDuration(0.3);

    engine.play(0);
    step(100);
    step(100);
    expect(ended).not.toHaveBeenCalled();
    step(100);

    expect(engine.durationSec).toBe(0.3);
    expect(ticks).toEqual([0.1, 0.2, 0.3, 0.3]);
    expect(ended).toHaveBeenCalledOnce();
    expect(rafs.size).toBe(0);
  });

  it('starts the timeline-only clock from a seeked position', () => {
    const engine = new VideoTrackEngine();
    const ticks: number[] = [];
    engine.onTick = (t) => ticks.push(t);
    engine.setTimelineDuration(1);
    engine.seek(0.6);
    engine.play(0.6);
    step(100);

    expect(ticks[0]).toBeCloseTo(0.7);
    engine.pause();
    expect(rafs.size).toBe(0);
  });

  it('starts the active source unmuted and exposes the synchronous playing state', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const engine = new VideoTrackEngine();
    engine.setSource('main', 'blob:audible-source');
    engine.setSegments([{ key: 'main', elKey: 'main', srcStart: 0, srcEnd: 1 }]);

    engine.play(0);

    const video = document.querySelector('video');
    expect(engine.isPlaying).toBe(true);
    expect(play).toHaveBeenCalledOnce();
    expect(video?.muted).toBe(false);
    engine.dispose();
    expect(engine.isPlaying).toBe(false);
  });

  it('retries the latest hover seek when an in-flight frame capture fails', async () => {
    let rejectStaleCapture!: (reason?: unknown) => void;
    const staleCapture = new Promise<ImageBitmap>((_resolve, reject) => {
      rejectStaleCapture = reject;
    });
    const freshFrame = { width: 1080, height: 1920, close: vi.fn() } as unknown as ImageBitmap;
    const createBitmap = vi.fn()
      .mockImplementationOnce(() => staleCapture)
      .mockResolvedValueOnce(freshFrame);
    vi.stubGlobal('createImageBitmap', createBitmap);

    const engine = new VideoTrackEngine();
    engine.setSource('main', 'blob:hover-source');
    engine.setSegments([{ key: 'main', elKey: 'main', srcStart: 0, srcEnd: 1 }]);
    const video = document.querySelector('video')!;
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 4 },
      videoWidth: { configurable: true, value: 1080 },
      videoHeight: { configurable: true, value: 1920 },
    });
    const onFrame = vi.fn();
    const onBlank = vi.fn();
    engine.onFrame = onFrame;
    engine.onBlank = onBlank;

    engine.seek(0.1); // starts an async frame capture
    engine.seek(1); // hovering the segment end clears the canvas
    engine.seek(0.5); // latest valid hover seek arrives while the old capture is still pending
    rejectStaleCapture(new Error('video moved during capture'));

    await vi.waitFor(() => expect(createBitmap).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(onFrame).toHaveBeenCalledOnce());
    expect(onBlank).toHaveBeenCalledOnce();
    expect(onFrame.mock.calls[0]?.[1]).toMatchObject({ t: 0.5, srcT: 0.5 });
    engine.dispose();
  });

  it('routes cross-origin lane audio through the authenticated same-origin media proxy', () => {
    expect(previewAudioSource('blob:local-audio')).toBe('blob:local-audio');
    expect(previewAudioSource('/audio/local.mp3')).toBe('/audio/local.mp3');
    expect(previewAudioSource('https://cdn.example/generated.mp3')).toBe(
      '/api/media/fetch?url=https%3A%2F%2Fcdn.example%2Fgenerated.mp3',
    );

    const engine = new VideoTrackEngine();
    engine.setAudioClips([{
      id: 'speech',
      url: 'https://cdn.example/generated.mp3',
      speed: 1,
      gainAt: () => 1,
      srcTimeAt: () => 0,
    }]);
    const audio = document.querySelector('audio');
    expect(audio?.getAttribute('src')).toContain('/api/media/fetch?url=');
    expect(audio?.crossOrigin).toBe('anonymous');
    engine.dispose();
  });

  it('keeps an explicit leading video gap instead of compacting or skipping it', () => {
    const engine = new VideoTrackEngine();
    const ticks: number[] = [];
    const blank = vi.fn();
    engine.onTick = (t) => ticks.push(t);
    engine.onBlank = blank;
    engine.setSegments([{
      key: 'unresolved-main', elKey: 'main', srcStart: 0, srcEnd: 0.2, timelineStart: 0.2, timelineEnd: 0.5,
    }]);

    expect(engine.durationSec).toBeCloseTo(0.5);
    engine.play(0);
    step(100);
    expect(ticks.at(-1)).toBeCloseTo(0.1);
    step(100);
    expect(ticks.at(-1)).toBeCloseTo(0.2);
    expect(blank).toHaveBeenCalled();
    step(100);
    step(100);
    step(100);
    expect(ticks.at(-1)).toBeCloseTo(0.5);
  });
});
