/**
 * Preview narration sound on the Web Audio clock.
 *
 * The narration used to play through one `<video>` element per source, and that element was the
 * master clock. A jump cut within a source meant seeking the playing element, and every such seek
 * cost the clock ~75–120 ms (measured in Chrome on 1080p, 2 s GOP footage): the sound dropped out
 * and the picture, slaved to the clock, stood still at every cut. A second element parked at the
 * in-point only won back ~25 ms — starting a paused element costs most of it.
 *
 * Here the narration is rendered the way the export renders it (same readers, retime stretch, shot
 * gain × fades, word masks and beep tones) in short chunks a little ahead of the playhead, and each
 * chunk is scheduled sample-accurately on the AudioContext. A cut is just the next sample, and the
 * clock is the AudioContext's, which never stalls.
 */

import type { InputAudioTrack } from 'mediabunny';
import { type MaskedAudioRange, maskedAudioAt } from '@pireel/studio-engine/word-masks';
import { MIX_CH, MIX_RATE, type MixTone, PcmStream, TONE_HZ, TONE_LEVEL, toneGainAt } from './export-audio-mix';
import { type TimeStretch, defaultTimeStretch, needsStretch } from './time-stretch';

/** One narration shot on the edited timeline (timeline span already resolved). */
export interface NarrationSeg {
  key: string;
  srcStart: number;
  srcEnd: number;
  timelineStart: number;
  timelineEnd: number;
  /** Linear shot gain (absent = 1; 0 = silent). */
  gain?: number;
  /** Segment-local fade factor (segmentFadeFn: shot fades × seam micro-fades). */
  fadeAt?: (tLocal: number) => number;
}

/** Sequential PCM over one source: `read` adds [srcT0, srcT0 + frames / MIX_RATE) into `out`. */
export interface PcmReader {
  read(srcT0: number, frames: number, out: Float32Array, outOffset: number, gainAt: (k: number) => number, sourceRate?: number): Promise<void>;
}

/** Opens a reader over [from, to) source seconds of a source's narration sound; null = no sound. */
export type OpenPcmReader = (key: string, from: number, to: number) => PcmReader | null;

export function trackReader(track: InputAudioTrack | null | undefined): OpenPcmReader {
  return (_key, from, to) => (track ? new PcmStream(track, Math.max(0, from), to) : null);
}

const sourceRateOf = (seg: NarrationSeg) => (seg.srcEnd - seg.srcStart) / Math.max(1e-6, seg.timelineEnd - seg.timelineStart);
const segSig = (seg: NarrationSeg) => `${seg.key}|${seg.srcStart}|${seg.srcEnd}|${seg.timelineStart}|${seg.timelineEnd}`;

/**
 * Renders the narration of any span of the edited timeline to interleaved 48 kHz stereo PCM.
 * Each shot keeps its own reader, so a render that walks forward continues one decode per shot and a
 * render that lands somewhere else (a seek) opens a fresh one there.
 */
export class NarrationRenderer {
  private segs: NarrationSeg[] = [];
  private masks = new Map<string, readonly MaskedAudioRange[]>();
  private tones: MixTone[] = [];
  private readers = new Map<string, { reader: PcmReader | null; next: number }>();
  private stretched = new Map<string, Promise<Float32Array[] | null>>();

  constructor(private open: OpenPcmReader, private stretch: TimeStretch = defaultTimeStretch) {}

  setSegments(segs: readonly NarrationSeg[]): void {
    this.segs = [...segs];
    const live = new Set(this.segs.map(segSig));
    for (const sig of this.readers.keys()) if (!live.has(sig)) this.readers.delete(sig);
    for (const sig of this.stretched.keys()) if (!live.has(sig.slice(0, sig.lastIndexOf('#')))) this.stretched.delete(sig);
    this.rebuildTones();
  }

  /** Word masks of one source (source seconds); empty removes them. */
  setMasks(key: string, ranges: readonly MaskedAudioRange[]): void {
    if (ranges.length) this.masks.set(key, ranges);
    else this.masks.delete(key);
    this.rebuildTones();
  }

  /** The source's sound changed underneath (a dub mounted or removed): drop what was read from it. */
  resetSource(key: string, open?: OpenPcmReader): void {
    if (open) this.open = open;
    for (const sig of this.readers.keys()) if (sig.startsWith(`${key}|`)) this.readers.delete(sig);
    for (const sig of this.stretched.keys()) if (sig.startsWith(`${key}|`)) this.stretched.delete(sig);
  }

  setOpener(open: OpenPcmReader): void {
    this.open = open;
    this.readers.clear();
    this.stretched.clear();
  }

  /** Beeped words on the narration become tones on the timeline (same mapping as the export). */
  private rebuildTones(): void {
    const tones: MixTone[] = [];
    for (const seg of this.segs) {
      const masks = this.masks.get(seg.key);
      if (!masks?.length) continue;
      const rate = sourceRateOf(seg);
      for (const range of masks) {
        if (range.audio !== 'beep') continue;
        const a = Math.max(range.start, seg.srcStart);
        const b = Math.min(range.end, seg.srcEnd);
        if (b <= a) continue;
        tones.push({ timelineStart: seg.timelineStart + (a - seg.srcStart) / rate, timelineEnd: seg.timelineStart + (b - seg.srcStart) / rate });
      }
    }
    this.tones = tones;
  }

  /** Shot gain × fades, silenced across masked source seconds. */
  private envelope(seg: NarrationSeg): (tLocal: number) => number {
    const gain = seg.gain ?? 1;
    const masks = this.masks.get(seg.key);
    const rate = sourceRateOf(seg);
    return (tLocal) => {
      if (masks?.length && maskedAudioAt(masks, seg.srcStart + tLocal * rate)) return 0;
      return gain * (seg.fadeAt ? seg.fadeAt(tLocal) : 1);
    };
  }

  private readerFor(seg: NarrationSeg, srcT: number): PcmReader | null {
    const sig = segSig(seg);
    const cur = this.readers.get(sig);
    // Forward continues the running decode; anything else (a seek, a re-render after an edit) restarts.
    if (cur && srcT >= cur.next - 0.5 / MIX_RATE && srcT < cur.next + 0.25) return cur.reader;
    const reader = this.open(seg.key, Math.max(0, srcT - 0.05), seg.srcEnd + 0.1);
    this.readers.set(sig, { reader, next: srcT });
    return reader;
  }

  /** A retimed shot plays from a pitch-preserving stretch of its whole span, made once. */
  private stretchedPcm(seg: NarrationSeg): Promise<Float32Array[] | null> {
    const rate = sourceRateOf(seg);
    const sig = `${segSig(seg)}#${rate}`;
    let pending = this.stretched.get(sig);
    if (!pending) {
      pending = (async () => {
        const frames = Math.round((seg.srcEnd - seg.srcStart) * MIX_RATE);
        const reader = this.open(seg.key, Math.max(0, seg.srcStart - 0.1), seg.srcEnd + 0.1);
        if (!reader || frames <= 0) return null;
        const interleaved = new Float32Array(frames * MIX_CH);
        await reader.read(seg.srcStart, frames, interleaved, 0, () => 1, 1);
        const channels = Array.from({ length: MIX_CH }, (_, c) => {
          const ch = new Float32Array(frames);
          for (let k = 0; k < frames; k++) ch[k] = interleaved[k * MIX_CH + c]!;
          return ch;
        });
        return this.stretch({ channels, sampleRate: MIX_RATE, rate });
      })();
      this.stretched.set(sig, pending);
    }
    return pending;
  }

  /** Start the slow part of rendering [t0, t1) early: a retimed shot's stretch is made once for its
   *  whole span, which can take a moment on a long shot. */
  prepare(t0: number, t1: number): void {
    for (const seg of this.segs) {
      if (seg.timelineEnd <= t0 || seg.timelineStart >= t1 || (seg.gain ?? 1) <= 0) continue;
      if (needsStretch(sourceRateOf(seg))) void this.stretchedPcm(seg).catch(() => null);
    }
  }

  /** Interleaved stereo PCM for [t0, t0 + frames / MIX_RATE) of the edited timeline. */
  async render(t0: number, frames: number): Promise<Float32Array> {
    const out = new Float32Array(frames * MIX_CH);
    const t1 = t0 + frames / MIX_RATE;
    for (const seg of this.segs) {
      const a = Math.max(t0, seg.timelineStart);
      const b = Math.min(t1, seg.timelineEnd);
      if (b <= a || (seg.gain ?? 1) <= 0) continue;
      const outOffset = Math.round((a - t0) * MIX_RATE);
      const n = Math.min(frames - outOffset, Math.round((b - a) * MIX_RATE));
      if (n <= 0) continue;
      const local = a - seg.timelineStart;
      const env = this.envelope(seg);
      const rate = sourceRateOf(seg);
      if (needsStretch(rate)) {
        const pcm = await this.stretchedPcm(seg);
        if (!pcm?.length) continue;
        const base = Math.round(local * MIX_RATE);
        const len = pcm[0]!.length;
        for (let k = 0; k < n; k++) {
          const f = base + k;
          if (f >= len) break;
          const g = env(local + k / MIX_RATE);
          if (g <= 0) continue;
          const o = (outOffset + k) * MIX_CH;
          for (let ch = 0; ch < MIX_CH; ch++) out[o + ch]! += (pcm[Math.min(ch, pcm.length - 1)]![f] ?? 0) * g;
        }
        continue;
      }
      const srcT = seg.srcStart + local * rate;
      const reader = this.readerFor(seg, srcT);
      if (!reader) continue;
      await reader.read(srcT, n, out, outOffset, (k) => env(local + k / MIX_RATE), rate);
      const entry = this.readers.get(segSig(seg));
      if (entry) entry.next = srcT + (n / MIX_RATE) * rate;
    }
    for (const tone of this.tones) {
      const a = Math.max(t0, tone.timelineStart);
      const b = Math.min(t1, tone.timelineEnd);
      if (b <= a) continue;
      const k0 = Math.max(0, Math.round((a - t0) * MIX_RATE));
      const k1 = Math.min(frames, Math.round((b - t0) * MIX_RATE));
      for (let k = k0; k < k1; k++) {
        const t = t0 + k / MIX_RATE;
        const g = TONE_LEVEL * toneGainAt(tone, t);
        if (g <= 0) continue;
        const v = Math.sin(2 * Math.PI * TONE_HZ * t) * g;
        for (let ch = 0; ch < MIX_CH; ch++) out[k * MIX_CH + ch]! += v;
      }
    }
    return out;
  }
}

/** Chunk length, and how much rendered sound is kept queued ahead of what is heard. */
const CHUNK_SEC = 0.5;
const AHEAD_SEC = 2;
/** Lead for the first chunk after a start, and for a splice after an edit. */
const START_LEAD_SEC = 0.04;
const SPLICE_LEAD_SEC = 0.12;
const PUMP_MS = 40;
/** How far ahead a retimed shot's stretch is started. */
const PREPARE_SEC = 8;

interface Scheduled {
  node: AudioBufferSourceNode;
  /** Context seconds this chunk plays over. */
  from: number;
  to: number;
}

/** The slice of AudioContext the player needs (tests stand in for it). */
export type PlayerContext = Pick<AudioContext, 'currentTime' | 'sampleRate' | 'createBuffer' | 'createBufferSource'> & {
  getOutputTimestamp?: () => AudioTimestamp;
  outputLatency?: number;
  baseLatency?: number;
};

export interface NarrationPlayerStats {
  /** Chunks whose render finished after the moment they were due (an audible gap). */
  late: number;
  scheduled: number;
}

/**
 * Plays rendered narration on the AudioContext: chunks are queued back to back, so their joins are
 * sample-exact, and the edited time being HEARD is the playback clock. `splice` swaps the queued
 * sound for a fresh render after an edit, at a sample boundary a little ahead of the playhead.
 */
export class NarrationPlayer {
  private queue: Scheduled[] = [];
  /** Edited time `t` plays at context time `ctx`. */
  private anchor: { ctx: number; t: number } | null = null;
  /** Edited time up to which sound is rendered and queued. */
  private queuedUntil = 0;
  private gen = 0;
  private pumping = false;
  /** A splice owns the queue while it renders; the pump stays out. */
  private splicing = false;
  /** Renders run one at a time: they share each shot's sequential reader. */
  private rendering: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | null = null;
  readonly stats: NarrationPlayerStats = { late: 0, scheduled: 0 };

  constructor(
    private ctx: PlayerContext,
    private output: () => AudioNode | null,
    private renderer: NarrationRenderer,
    private totalSec: () => number,
  ) {}

  get playing(): boolean {
    return this.anchor !== null;
  }

  /** Start playing at edited time t. Resolves false when superseded by another start/stop. */
  async start(t: number): Promise<boolean> {
    this.stop();
    const gen = this.gen;
    const pcm = await this.render(t);
    if (gen !== this.gen) return false;
    const at = this.onGrid(this.ctx.currentTime + START_LEAD_SEC);
    this.anchor = { ctx: at, t };
    this.enqueue(pcm, at);
    this.queuedUntil = t + pcm.length / MIX_CH / MIX_RATE;
    this.timer = setInterval(() => void this.pump(), PUMP_MS);
    void this.pump();
    return true;
  }

  stop(): void {
    this.gen += 1;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const item of this.queue) this.silence(item.node);
    this.queue = [];
    this.anchor = null;
    this.pumping = false;
    this.splicing = false;
  }

  /** The edited time being heard right now (null when stopped). Holds at the start until sound begins. */
  now(): number | null {
    if (!this.anchor) return null;
    const heard = this.heardContextTime();
    return Math.min(this.totalSec(), this.anchor.t + Math.max(0, heard - this.anchor.ctx));
  }

  /** Re-render everything not yet played (an edit changed the sound) and splice it in seamlessly. */
  async splice(): Promise<void> {
    if (!this.anchor) return;
    this.gen += 1;
    const gen = this.gen;
    this.splicing = true;
    this.pumping = false; // an in-flight pump sees the new generation and drops its chunk
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const anchor: { ctx: number; t: number } | null = this.anchor;
        if (!anchor) return;
        const at = this.onGrid(this.ctx.currentTime + SPLICE_LEAD_SEC * (attempt + 1));
        const t = anchor.t + (at - anchor.ctx);
        const pcm = await this.render(t);
        if (gen !== this.gen || this.anchor !== anchor) return;
        if (this.ctx.currentTime > at - 0.005) continue; // rendered too slowly for this splice point: try further out
        for (const item of this.queue) {
          if (item.from >= at) this.silence(item.node);
          else if (item.to > at) {
            item.node.stop(at);
            item.to = at;
          }
        }
        this.queue = this.queue.filter((item) => item.from < at);
        this.enqueue(pcm, at);
        this.queuedUntil = t + pcm.length / MIX_CH / MIX_RATE;
        return;
      }
    } finally {
      if (gen === this.gen) {
        this.splicing = false;
        void this.pump();
      }
    }
  }

  private render(t: number): Promise<Float32Array> {
    const run = this.rendering.then(() => this.renderer.render(t, this.chunkFrames(t)));
    this.rendering = run.catch(() => undefined);
    return run;
  }

  private async pump(): Promise<void> {
    if (this.pumping || this.splicing || !this.anchor) return;
    this.pumping = true;
    const gen = this.gen;
    try {
      const now = this.ctx.currentTime;
      this.queue = this.queue.filter((item) => item.to > now - 1);
      this.renderer.prepare(this.queuedUntil, this.queuedUntil + PREPARE_SEC);
      while (this.anchor && gen === this.gen) {
        const heard = this.anchor.t + Math.max(0, now - this.anchor.ctx);
        if (this.queuedUntil >= heard + AHEAD_SEC || this.queuedUntil >= this.totalSec() - 1e-6) break;
        const t = this.queuedUntil;
        const pcm = await this.render(t);
        if (gen !== this.gen || !this.anchor) return;
        const at = this.anchor.ctx + (t - this.anchor.t);
        if (this.ctx.currentTime > at) this.stats.late += 1;
        this.enqueue(pcm, at);
        this.queuedUntil = t + pcm.length / MIX_CH / MIX_RATE;
      }
    } finally {
      if (gen === this.gen) this.pumping = false;
    }
  }

  private chunkFrames(t: number): number {
    const left = Math.max(0, this.totalSec() - t);
    return Math.max(1, Math.round(Math.min(CHUNK_SEC, left || CHUNK_SEC) * MIX_RATE));
  }

  private enqueue(pcm: Float32Array, at: number): void {
    const out = this.output();
    if (!out) return;
    const frames = pcm.length / MIX_CH;
    const buffer = this.ctx.createBuffer(MIX_CH, frames, MIX_RATE);
    for (let ch = 0; ch < MIX_CH; ch++) {
      const plane = new Float32Array(frames);
      for (let k = 0; k < frames; k++) plane[k] = pcm[k * MIX_CH + ch]!;
      buffer.copyToChannel(plane, ch);
    }
    const node = this.ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(out);
    node.start(at);
    this.queue.push({ node, from: at, to: at + frames / MIX_RATE });
    this.stats.scheduled += 1;
  }

  private silence(node: AudioBufferSourceNode): void {
    try {
      node.stop();
    } catch {
      /* never started */
    }
    node.disconnect();
  }

  /** Snap a context time to the sample grid, so queued chunks meet exactly. */
  private onGrid(t: number): number {
    return Math.round(t * MIX_RATE) / MIX_RATE;
  }

  /** The context time leaving the speakers now: what is heard, which the picture should match. */
  private heardContextTime(): number {
    const stamp = this.ctx.getOutputTimestamp?.();
    if (stamp && stamp.contextTime !== undefined && stamp.performanceTime !== undefined && stamp.performanceTime > 0) {
      return stamp.contextTime + Math.max(0, (performance.now() - stamp.performanceTime) / 1000);
    }
    return this.ctx.currentTime - (this.ctx.outputLatency ?? this.ctx.baseLatency ?? 0);
  }
}
