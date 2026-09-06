/**
 * Pitch-preserving time stretch for the export mixer.
 *
 * Speed used to be a linear resample on export (pitch shifted with the rate — 1.5× on a voice was a
 * clear "chipmunk"), with the preview forced to preservesPitch=false so it would not lie about the
 * result. Now both ends keep the pitch: the preview leans on the browser's own preservesPitch time
 * stretch, and the export runs Signalsmith Stretch (MIT, WASM + AudioWorklet) through an
 * OfflineAudioContext — measured offline in headless Chromium: 3 s of audio in 30–70 ms, pitch and
 * level intact, onset/end within ±15 ms at any rate in 0.25..4.
 *
 * Shape: `stretchPcm` takes planar channels + a rate (source seconds per output second) and returns
 * planar channels of length ≈ frames / rate. Long inputs are processed in overlapping tiles so peak
 * memory stays bounded (an OfflineAudioContext renders its whole length into one AudioBuffer); tiles
 * are cross-faded at the seams. Environments without AudioWorklet (or a failed WASM boot) fall back
 * to the old linear resample so an export never fails just because of a speed change.
 */

export interface StretchInput {
  /** Planar channel data, equal lengths. */
  channels: Float32Array[];
  sampleRate: number;
  /** Source seconds per output second (2 = twice as fast). */
  rate: number;
}

export type TimeStretch = (input: StretchInput) => Promise<Float32Array[]>;

/** Output frame count for a stretch: what the timeline expects for this source span. */
export function stretchedFrames(inputFrames: number, rate: number): number {
  return Math.max(0, Math.round(inputFrames / rate));
}

/** Rates this close to 1 are not worth a stretch pass (and the preview treats them as 1× too). */
export const STRETCH_EPS = 1e-3;

export function needsStretch(rate: number): boolean {
  return Number.isFinite(rate) && rate > 0 && Math.abs(rate - 1) > STRETCH_EPS;
}

/** Plain linear resample (the pre-stretch behaviour) — the fallback when no worklet is available. */
export const resampleLinear: TimeStretch = async ({ channels, rate }) => {
  const inFrames = channels[0]?.length ?? 0;
  const outFrames = stretchedFrames(inFrames, rate);
  return channels.map((ch) => {
    const out = new Float32Array(outFrames);
    for (let k = 0; k < outFrames; k++) {
      const p = k * rate;
      const i0 = Math.min(inFrames - 1, Math.floor(p));
      const i1 = Math.min(inFrames - 1, i0 + 1);
      const frac = p - Math.floor(p);
      out[k] = ch[i0]! + (ch[i1]! - ch[i0]!) * frac;
    }
    return out;
  });
};

/** Signalsmith Stretch over an OfflineAudioContext. One node, one render, no tiling here. */
export const signalsmithStretch: TimeStretch = async ({ channels, sampleRate, rate }) => {
  const inFrames = channels[0]?.length ?? 0;
  const outFrames = stretchedFrames(inFrames, rate);
  if (outFrames === 0 || channels.length === 0) return channels.map(() => new Float32Array(0));
  const { default: SignalsmithStretch } = await import('signalsmith-stretch');
  const ctx = new OfflineAudioContext(channels.length, outFrames, sampleRate);
  const node = await SignalsmithStretch(ctx, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [channels.length] });
  await node.addBuffers(channels.map((ch) => ch.slice()));
  node.connect(ctx.destination);
  await node.schedule({ output: 0, input: 0, rate, active: true });
  const rendered = await ctx.startRendering();
  return channels.map((_, i) => rendered.getChannelData(Math.min(i, rendered.numberOfChannels - 1)).slice());
};

/** Tile length in source seconds: bounds the OfflineAudioContext render (and its output buffer). */
export const STRETCH_TILE_SEC = 90;
/** Overlap between adjacent tiles (source seconds): the seam is a linear cross-fade inside it. */
export const STRETCH_TILE_OVERLAP_SEC = 0.5;

/**
 * Stretch in overlapping tiles and cross-fade the seams. For inputs under one tile this is exactly
 * one call to `impl`. Tiles are cut in SOURCE time; each tile's output is placed at
 * round(tileStart / rate) so the timeline mapping stays consistent with the whole-span math.
 */
export function tiledStretch(
  impl: TimeStretch,
  tileSec = STRETCH_TILE_SEC,
  overlapSec = STRETCH_TILE_OVERLAP_SEC,
): TimeStretch {
  return async (input) => {
    const { channels, sampleRate, rate } = input;
    const inFrames = channels[0]?.length ?? 0;
    const tile = Math.max(1, Math.round(tileSec * sampleRate));
    const overlap = Math.max(0, Math.min(Math.round(overlapSec * sampleRate), Math.floor(tile / 4)));
    if (inFrames <= tile + overlap) return impl(input);

    const outFrames = stretchedFrames(inFrames, rate);
    const outs = channels.map(() => new Float32Array(outFrames));
    let start = 0;
    let prevOutEnd = 0; // output frame where the previous tile's placed audio ends
    while (start < inFrames) {
      const end = Math.min(inFrames, start + tile);
      const piece = await impl({ channels: channels.map((ch) => ch.subarray(start, end)), sampleRate, rate });
      const outStart = Math.round(start / rate);
      const fadeLen = start === 0 ? 0 : Math.max(0, Math.min(prevOutEnd - outStart, piece[0]?.length ?? 0));
      for (let c = 0; c < outs.length; c++) {
        const dst = outs[c]!;
        const src = piece[c] ?? piece[0]!;
        for (let k = 0; k < src.length; k++) {
          const o = outStart + k;
          if (o >= outFrames) break;
          if (k < fadeLen) {
            const w = (k + 1) / (fadeLen + 1);
            dst[o] = dst[o]! * (1 - w) + src[k]! * w;
          } else {
            dst[o] = src[k]!;
          }
        }
      }
      prevOutEnd = outStart + (piece[0]?.length ?? 0);
      if (end >= inFrames) break;
      start = end - overlap;
    }
    return outs;
  };
}

/** True when this runtime can host the worklet path at all. */
export function canStretchOffline(): boolean {
  return typeof OfflineAudioContext === 'function' && typeof AudioWorkletNode === 'function';
}

/**
 * The mixer's default: Signalsmith in tiles, falling back to the linear resample when the worklet
 * cannot boot (old WebViews, restrictive CSP on blob: workers). The fallback is logged once so a
 * pitch-shifted export can be traced to it.
 */
let warnedFallback = false;
export const defaultTimeStretch: TimeStretch = async (input) => {
  if (!needsStretch(input.rate)) return input.channels.map((ch) => ch.slice());
  if (canStretchOffline()) {
    try {
      return await tiledStretch(signalsmithStretch)(input);
    } catch (e) {
      if (!warnedFallback) {
        warnedFallback = true;
        console.warn('[export] pitch-preserving stretch unavailable, falling back to linear resample (pitch will shift):', e);
      }
    }
  }
  return resampleLinear(input);
};
