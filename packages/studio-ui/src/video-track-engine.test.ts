import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoTrackEngine } from './video-track-engine';

describe('VideoTrackEngine timeline-only clock', () => {
  let now = 0;
  let nextRafId = 1;
  let rafs = new Map<number, FrameRequestCallback>();

  beforeEach(() => {
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
});
