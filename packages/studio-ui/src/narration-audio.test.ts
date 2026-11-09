import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIX_CH, MIX_RATE } from './export-audio-mix';
import { NarrationPlayer, NarrationRenderer, type OpenPcmReader, type PcmReader, type PlayerContext } from './narration-audio';

/** A source whose PCM sample at source time s is the value s: the output says which source moment played where. */
function clockSource(opens: string[] = []): OpenPcmReader {
  return (key, from) => {
    opens.push(`${key}@${from.toFixed(2)}`);
    const reader: PcmReader = {
      read: async (srcT0, frames, out, outOffset, gainAt, sourceRate = 1) => {
        for (let k = 0; k < frames; k++) {
          const v = (srcT0 + (k / MIX_RATE) * sourceRate) * gainAt(k);
          for (let ch = 0; ch < MIX_CH; ch++) out[(outOffset + k) * MIX_CH + ch]! += v;
        }
      },
    };
    return reader;
  };
}

const jumpCut = [
  { key: 'a', srcStart: 1, srcEnd: 3, timelineStart: 0, timelineEnd: 2 },
  { key: 'a', srcStart: 7, srcEnd: 9, timelineStart: 2, timelineEnd: 4 },
];
const at = (pcm: Float32Array, frame: number) => pcm[frame * MIX_CH]!;

describe('NarrationRenderer', () => {
  it('joins a jump cut on the exact sample: A runs to its out-point, B starts at its in-point', async () => {
    const renderer = new NarrationRenderer(clockSource());
    renderer.setSegments(jumpCut);
    const pcm = await renderer.render(1.9, Math.round(0.2 * MIX_RATE));
    const cut = Math.round(0.1 * MIX_RATE);
    expect(at(pcm, 0)).toBeCloseTo(2.9, 6);
    expect(at(pcm, cut - 1)).toBeCloseTo(3 - 1 / MIX_RATE, 6);
    expect(at(pcm, cut)).toBeCloseTo(7, 6);
    expect(at(pcm, cut + 1)).toBeCloseTo(7 + 1 / MIX_RATE, 6);
  });

  it('continues one read per shot while walking forward and reopens after a jump', async () => {
    const opens: string[] = [];
    const renderer = new NarrationRenderer(clockSource(opens));
    renderer.setSegments(jumpCut);
    for (let t = 0; t < 1.5; t += 0.5) await renderer.render(t, MIX_RATE / 2);
    expect(opens).toEqual(['a@0.95']);
    await renderer.render(0.2, MIX_RATE / 2); // a seek back
    expect(opens).toEqual(['a@0.95', 'a@1.15']);
  });

  it('closes a reader it replaces or drops, so no decoded sample is left unclosed', async () => {
    const closed: string[] = [];
    let n = 0;
    const open: OpenPcmReader = (key, from) => {
      const name = `${key}#${n++}@${from.toFixed(2)}`;
      return { read: async () => {}, close: () => { closed.push(name); } };
    };
    const renderer = new NarrationRenderer(open);
    renderer.setSegments(jumpCut);
    await renderer.render(0, MIX_RATE / 2);
    await renderer.render(0.2, MIX_RATE / 2); // a seek: the first reader is replaced
    expect(closed).toEqual(['a#0@0.95']);
    renderer.setSegments([jumpCut[1]!]); // the first shot leaves the timeline
    expect(closed).toEqual(['a#0@0.95', 'a#1@1.15']);
    await renderer.render(2, MIX_RATE / 2);
    renderer.dispose();
    expect(closed).toHaveLength(3);
  });

  it('applies shot gain and fades, silences masked words and lays a tone on beeped ones', async () => {
    const renderer = new NarrationRenderer(clockSource());
    renderer.setSegments([{ ...jumpCut[0]!, gain: 0.5, fadeAt: (local) => (local < 0.1 ? 0 : 1) }]);
    renderer.setMasks('a', [{ start: 1.5, end: 1.6, audio: 'mute' }, { start: 2.5, end: 2.6, audio: 'beep' }]);
    const pcm = await renderer.render(0, 2 * MIX_RATE);
    expect(at(pcm, Math.round(0.05 * MIX_RATE))).toBe(0); // fade
    expect(at(pcm, Math.round(0.3 * MIX_RATE))).toBeCloseTo(1.3 * 0.5, 6); // gain
    expect(at(pcm, Math.round(0.55 * MIX_RATE))).toBe(0); // muted word
    const beep = Array.from({ length: 200 }, (_, k) => Math.abs(at(pcm, Math.round(1.55 * MIX_RATE) + k)));
    expect(Math.max(...beep)).toBeGreaterThan(0.1); // tone only: the word itself is silenced
    expect(Math.max(...beep)).toBeLessThan(0.23);
  });

  it('plays a retimed shot from a stretch of its whole span', async () => {
    const stretch = vi.fn(async ({ channels, rate }: { channels: Float32Array[]; rate: number }) =>
      channels.map(() => new Float32Array(Math.round(channels[0]!.length / rate)).fill(0.25)));
    const renderer = new NarrationRenderer(clockSource(), stretch);
    renderer.setSegments([{ key: 'a', srcStart: 1, srcEnd: 3, timelineStart: 0, timelineEnd: 1 }]);
    const pcm = await renderer.render(0.2, 100);
    expect(stretch).toHaveBeenCalledOnce();
    expect(stretch.mock.calls[0]![0].rate).toBeCloseTo(2, 6);
    expect(at(pcm, 0)).toBeCloseTo(0.25, 6);
    await renderer.render(0.4, 100);
    expect(stretch).toHaveBeenCalledOnce();
  });

  it('starts a retimed shot\'s stretch ahead of time and reuses it when the shot plays', async () => {
    const stretch = vi.fn(async ({ channels, rate }: { channels: Float32Array[]; rate: number }) =>
      channels.map(() => new Float32Array(Math.round(channels[0]!.length / rate))));
    const renderer = new NarrationRenderer(clockSource(), stretch);
    renderer.setSegments([jumpCut[0]!, { key: 'a', srcStart: 7, srcEnd: 9, timelineStart: 2, timelineEnd: 3 }]);
    renderer.prepare(0, 1);
    expect(stretch).not.toHaveBeenCalled();
    renderer.prepare(1, 5);
    await Promise.resolve();
    await renderer.render(2.1, 100);
    expect(stretch).toHaveBeenCalledOnce();
  });
});

/** A context whose clock the test moves; nodes record when they were asked to start and stop. */
function fakeContext() {
  const nodes: Array<{ start: number; frames: number; stoppedAt: number | null; connected: boolean }> = [];
  const ctx = {
    currentTime: 10,
    sampleRate: MIX_RATE,
    createBuffer: (_channels: number, frames: number) => ({ length: frames, copyToChannel: () => {} }),
    createBufferSource: () => {
      const entry = { start: -1, frames: 0, stoppedAt: null as number | null, connected: false };
      nodes.push(entry);
      return {
        set buffer(value: { length: number }) { entry.frames = value.length; },
        connect: () => { entry.connected = true; },
        disconnect: () => { entry.connected = false; },
        start: (when: number) => { entry.start = when; },
        stop: (when?: number) => { entry.stoppedAt = when ?? ctx.currentTime; },
      };
    },
  };
  return { ctx: ctx as unknown as PlayerContext & { currentTime: number }, nodes };
}

describe('NarrationPlayer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const settle = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };

  it('queues chunks back to back on the sample grid and reports the heard time as the clock', async () => {
    const { ctx, nodes } = fakeContext();
    const renderer = new NarrationRenderer(clockSource());
    renderer.setSegments(jumpCut);
    const player = new NarrationPlayer(ctx, () => ({}) as AudioNode, renderer, () => 4);
    expect(await player.start(1)).toBe(true);
    await settle();
    const live = nodes.filter((node) => node.connected);
    expect(live.length).toBeGreaterThanOrEqual(4); // ~2 s queued ahead in 0.5 s chunks
    for (let i = 1; i < live.length; i++) expect(live[i]!.start).toBeCloseTo(live[i - 1]!.start + live[i - 1]!.frames / MIX_RATE, 9);
    expect(live[0]!.start * MIX_RATE).toBeCloseTo(Math.round(live[0]!.start * MIX_RATE), 6);
    // Before the first chunk sounds, the clock holds at the start; then it runs with the context.
    expect(player.now()).toBe(1);
    ctx.currentTime = live[0]!.start + 0.75;
    expect(player.now()).toBeCloseTo(1.75, 6);
    player.stop();
    expect(nodes.every((node) => !node.connected)).toBe(true);
    expect(player.now()).toBeNull();
  });

  it('splices a fresh render in at a sample boundary ahead of the playhead after an edit', async () => {
    const { ctx, nodes } = fakeContext();
    const renderer = new NarrationRenderer(clockSource());
    renderer.setSegments(jumpCut);
    const player = new NarrationPlayer(ctx, () => ({}) as AudioNode, renderer, () => 4);
    await player.start(0);
    await settle();
    const before = nodes.filter((node) => node.connected).length;
    ctx.currentTime += 0.3;
    renderer.setSegments(jumpCut.map((seg) => ({ ...seg, gain: 0.5 })));
    await player.splice();
    await settle();
    const spliced = nodes[before]!;
    expect(spliced.start).toBeGreaterThan(ctx.currentTime);
    // The chunk playing at the splice point stops exactly there; later queued ones are dropped.
    const cutShort = nodes.slice(0, before).filter((node) => node.stoppedAt !== null && node.stoppedAt > node.start);
    expect(cutShort.map((node) => node.stoppedAt)).toEqual([spliced.start]);
    expect(nodes.slice(0, before).filter((node) => node.connected).every((node) => node.start < spliced.start)).toBe(true);
    const after = nodes.slice(before).filter((node) => node.connected);
    for (let i = 1; i < after.length; i++) expect(after[i]!.start).toBeCloseTo(after[i - 1]!.start + after[i - 1]!.frames / MIX_RATE, 9);
    player.stop();
  });
});
