/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeSample {
  timestamp: number;
  duration: number;
  closed: boolean;
  draw: ReturnType<typeof vi.fn>;
  close: () => void;
}

/** Frames every 0.1s; each `samples(start)` call is one decode run that yields from the frame containing start. */
const runs: number[] = [];
const FRAME = 0.1;
function sample(index: number): FakeSample {
  const s: FakeSample = {
    timestamp: Math.round(index * FRAME * 1000) / 1000,
    duration: FRAME,
    closed: false,
    draw: vi.fn(),
    close: () => { s.closed = true; },
  };
  return s;
}

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  UrlSource: class {},
  Input: class {},
  VideoSampleSink: class {
    samples(start = 0) {
      runs.push(start);
      let index = Math.floor(start / FRAME + 1e-9);
      return (async function* () {
        for (;;) yield sample(index++);
      })();
    }
  },
}));

vi.mock('@pireel/studio-engine/video-edit/mediabunny-warnings', () => ({}));

import { FrameCursor, decodableMediaUrl } from './video-frame-decoder';

describe('FrameCursor', () => {
  beforeEach(() => {
    runs.length = 0;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn() } as unknown as CanvasRenderingContext2D);
  });
  afterEach(() => vi.restoreAllMocks());

  const cursor = () => new FrameCursor({} as never, 1080, 1920);

  it('answers the frame at or before the requested time and continues the same decode for forward reads', async () => {
    const c = cursor();
    const first = await c.frameAt(0.25);
    expect(first).toMatchObject({ timestamp: 0.2, width: 1080, height: 1920 });
    const next = await c.frameAt(0.31);
    expect(next?.timestamp).toBe(0.3);
    const held = await c.frameAt(0.34);
    expect(held?.timestamp).toBe(0.3);
    expect(runs).toEqual([0.25]); // one decode run served all three reads
  });

  it('restarts the decode for a jump or a backward read', async () => {
    const c = cursor();
    await c.frameAt(0.25);
    await c.frameAt(5);
    await c.frameAt(0.05);
    expect(runs).toEqual([0.25, 5, 0.05]);
    expect((await c.frameAt(0.05))?.timestamp).toBe(0);
  });

  it('serves only the newest of a burst of reads', async () => {
    const c = cursor();
    const [a, b, d] = await Promise.all([c.frameAt(0.1), c.frameAt(0.5), c.frameAt(0.9)]);
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(d?.timestamp).toBe(0.9);
  });

  it('draws the frame once per timestamp and closes what it holds', async () => {
    const c = cursor();
    const frame = await c.frameAt(0.25);
    await c.frameAt(0.26);
    const drawn = frame && (c as unknown as { current: FakeSample }).current;
    expect(drawn?.draw).toHaveBeenCalledTimes(1);
    c.close();
    expect(drawn?.closed).toBe(true);
    expect(await c.frameAt(0.3)).toBeNull();
  });
});

describe('decodableMediaUrl', () => {
  it('keeps local and same-origin sources direct and routes cross-origin media through the proxy', () => {
    expect(decodableMediaUrl('blob:http://localhost/x')).toBe('blob:http://localhost/x');
    expect(decodableMediaUrl('/media/a.mp4')).toBe('/media/a.mp4');
    expect(decodableMediaUrl('https://cdn.example/a.mp4')).toBe('/api/media/fetch?url=https%3A%2F%2Fcdn.example%2Fa.mp4');
  });
});
