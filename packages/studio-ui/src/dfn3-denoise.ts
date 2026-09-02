/**
 * DeepFilterNet3 narration enhancement — the "strong" denoise engine.
 *
 * The three official ONNX graphs (encoder, ERB decoder, deep-filter decoder) run on
 * onnxruntime-web; everything around them is the libDF signal pipeline ported to TypeScript:
 * Vorbis-window STFT (960/480 @ 48 kHz, analysis scaled 1/N), 32-band ERB power features with
 * exponential mean normalization, 96-bin complex features with exponential unit normalization,
 * a 2-frame lookahead shift on the features, ERB gain mask over the full spectrum, 5-tap complex
 * deep filtering over the low 96 bins, overlap-add synthesis and delay compensation. Long input is
 * enhanced in 45 s windows stitched with an equal-power 500 ms crossfade while the STFT and
 * normalization state carry across the seam (only the recurrent state inside the graphs resets).
 * These constants mirror the pretrained model's config.ini and the reference desktop port.
 */

import type * as OrtNs from 'onnxruntime-web';
import { dfn3ModelUrls, ortWasmUrls } from './matte-assets';

export const DFN3 = {
  sampleRate: 48_000,
  fftSize: 960,
  hopSize: 480,
  erbBands: 32,
  dfBins: 96,
  dfOrder: 5,
  lookahead: 2, // max(conv_lookahead, df_lookahead)
  minErbFreqs: 2,
  normAlpha: 0.99, // libDF get_norm_alpha(tau=1s) rounds exp(-hop/sr/tau) to 3 decimals
  meanNormInit: [-60, -90] as const,
  unitNormInit: [0.001, 0.0001] as const,
  chunkSeconds: 45,
  overlapMs: 500,
} as const;

const FREQ_BINS = DFN3.fftSize / 2 + 1; // 481

/** w[n] = sin(π/2 · sin²(π(n+0.5)/N)) — the window DeepFilterNet trains and infers with. */
export function vorbisWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const s = Math.sin((Math.PI * (i + 0.5)) / size);
    w[i] = Math.sin((Math.PI / 2) * s * s);
  }
  return w;
}

const freq2erb = (hz: number) => 9.265 * Math.log1p(hz / (24.7 * 9.265));
const erb2freq = (erb: number) => 24.7 * 9.265 * (Math.exp(erb / 9.265) - 1);

/** Bins per ERB band, exactly as libDF's erb_fb (widths sum to fftSize/2+1). */
export function erbWidths(sr = DFN3.sampleRate, fftSize = DFN3.fftSize, nbBands = DFN3.erbBands, minFreqs = DFN3.minErbFreqs): number[] {
  const freqWidth = sr / fftSize;
  const erbLow = freq2erb(0);
  const erbHigh = freq2erb(sr / 2);
  const step = (erbHigh - erbLow) / nbBands;
  const widths = new Array<number>(nbBands).fill(0);
  let prevFreq = 0;
  let freqOver = 0;
  for (let i = 1; i <= nbBands; i += 1) {
    const f = erb2freq(erbLow + i * step);
    const fb = Math.round(f / freqWidth);
    let nb = fb - prevFreq - freqOver;
    if (nb < minFreqs) {
      freqOver = minFreqs - nb;
      nb = minFreqs;
    } else {
      freqOver = 0;
    }
    widths[i - 1] = nb;
    prevFreq = fb;
  }
  widths[nbBands - 1] += 1;
  const tooLarge = widths.reduce((sum, w) => sum + w, 0) - (fftSize / 2 + 1);
  if (tooLarge > 0) widths[nbBands - 1] -= tooLarge;
  return widths;
}

/* ---------- FFT (size 960 = not a power of two → Bluestein over a 2048-point radix-2 FFT) ---------- */

function radix2(re: Float64Array, im: Float64Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let cRe = 1;
      let cIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const a = i + k;
        const b = a + len / 2;
        const tRe = re[b]! * cRe - im[b]! * cIm;
        const tIm = re[b]! * cIm + im[b]! * cRe;
        re[b] = re[a]! - tRe;
        im[b] = im[a]! - tIm;
        re[a] = re[a]! + tRe;
        im[a] = im[a]! + tIm;
        const nRe = cRe * wRe - cIm * wIm;
        cIm = cRe * wIm + cIm * wRe;
        cRe = nRe;
      }
    }
  }
}

export class ComplexFft {
  private readonly m: number;
  private readonly chirpRe: Float64Array;
  private readonly chirpIm: Float64Array;
  private readonly bRe: Float64Array;
  private readonly bIm: Float64Array;
  private readonly aRe: Float64Array;
  private readonly aIm: Float64Array;

  constructor(private readonly n: number) {
    let m = 1;
    while (m < 2 * n - 1) m <<= 1;
    this.m = m;
    this.chirpRe = new Float64Array(n);
    this.chirpIm = new Float64Array(n);
    for (let k = 0; k < n; k += 1) {
      const angle = (Math.PI * ((k * k) % (2 * n))) / n;
      this.chirpRe[k] = Math.cos(angle);
      this.chirpIm[k] = -Math.sin(angle);
    }
    this.bRe = new Float64Array(m);
    this.bIm = new Float64Array(m);
    this.bRe[0] = this.chirpRe[0]!;
    this.bIm[0] = -this.chirpIm[0]!;
    for (let k = 1; k < n; k += 1) {
      this.bRe[k] = this.bRe[m - k] = this.chirpRe[k]!;
      this.bIm[k] = this.bIm[m - k] = -this.chirpIm[k]!;
    }
    radix2(this.bRe, this.bIm, false);
    this.aRe = new Float64Array(m);
    this.aIm = new Float64Array(m);
  }

  /** In-place forward (inverse=false) or unscaled inverse (inverse=true, no 1/N) transform. */
  transform(re: Float64Array, im: Float64Array, inverse = false): void {
    const { n, m, chirpRe, chirpIm, bRe, bIm, aRe, aIm } = this;
    aRe.fill(0);
    aIm.fill(0);
    for (let k = 0; k < n; k += 1) {
      const cIm = inverse ? -chirpIm[k]! : chirpIm[k]!;
      aRe[k] = re[k]! * chirpRe[k]! - im[k]! * cIm;
      aIm[k] = re[k]! * cIm + im[k]! * chirpRe[k]!;
    }
    radix2(aRe, aIm, false);
    for (let k = 0; k < m; k += 1) {
      const bi = inverse ? -bIm[k]! : bIm[k]!;
      const r = aRe[k]! * bRe[k]! - aIm[k]! * bi;
      const i = aRe[k]! * bi + aIm[k]! * bRe[k]!;
      aRe[k] = r;
      aIm[k] = i;
    }
    radix2(aRe, aIm, true);
    for (let k = 0; k < n; k += 1) {
      const cIm = inverse ? -chirpIm[k]! : chirpIm[k]!;
      const r = aRe[k]! / m;
      const i = aIm[k]! / m;
      re[k] = r * chirpRe[k]! - i * cIm;
      im[k] = r * cIm + i * chirpRe[k]!;
    }
  }
}

/* ---------- Streaming STFT state (carries across chunks like libDF's DFState) ---------- */

export interface Dfn3State {
  analysisMem: Float32Array; // last fft-hop input samples
  synthesisMem: Float32Array; // pending overlap-add tail
  meanNorm: Float32Array; // [erbBands]
  unitNorm: Float32Array; // [dfBins]
}

export function createDfn3State(): Dfn3State {
  const overlap = DFN3.fftSize - DFN3.hopSize;
  const meanNorm = new Float32Array(DFN3.erbBands);
  const unitNorm = new Float32Array(DFN3.dfBins);
  const [m0, m1] = DFN3.meanNormInit;
  const [u0, u1] = DFN3.unitNormInit;
  for (let b = 0; b < DFN3.erbBands; b += 1) meanNorm[b] = m0 + ((m1 - m0) * b) / (DFN3.erbBands - 1);
  for (let f = 0; f < DFN3.dfBins; f += 1) unitNorm[f] = u0 + ((u1 - u0) * f) / (DFN3.dfBins - 1);
  return { analysisMem: new Float32Array(overlap), synthesisMem: new Float32Array(overlap), meanNorm, unitNorm };
}

const window = vorbisWindow(DFN3.fftSize);
const widths = erbWidths();
const bandOfBin = (() => {
  const map = new Int16Array(FREQ_BINS);
  let bin = 0;
  widths.forEach((w, band) => {
    for (let j = 0; j < w && bin < FREQ_BINS; j += 1, bin += 1) map[bin] = band;
  });
  return map;
})();

/** Analysis STFT of `audio` continuing from `state.analysisMem`; consumes whole hops. */
export function stftAnalysis(audio: Float32Array, state: Dfn3State, fft: ComplexFft): { re: Float32Array; im: Float32Array; frames: number } {
  const { fftSize, hopSize } = DFN3;
  const overlap = fftSize - hopSize;
  const buffer = new Float32Array(state.analysisMem.length + audio.length);
  buffer.set(state.analysisMem, 0);
  buffer.set(audio, state.analysisMem.length);
  const frames = Math.max(0, Math.floor((buffer.length - fftSize) / hopSize) + 1);
  const re = new Float32Array(frames * FREQ_BINS);
  const im = new Float32Array(frames * FREQ_BINS);
  const fr = new Float64Array(fftSize);
  const fi = new Float64Array(fftSize);
  const scale = 1 / fftSize; // libDF wnorm = 1 / (N² / (2·hop)) = 1/N for hop = N/2
  for (let f = 0; f < frames; f += 1) {
    const start = f * hopSize;
    for (let i = 0; i < fftSize; i += 1) {
      fr[i] = buffer[start + i]! * window[i]!;
      fi[i] = 0;
    }
    fft.transform(fr, fi, false);
    const base = f * FREQ_BINS;
    for (let k = 0; k < FREQ_BINS; k += 1) {
      re[base + k] = fr[k]! * scale;
      im[base + k] = fi[k]! * scale;
    }
  }
  const consumed = frames * hopSize;
  const rest = buffer.subarray(consumed);
  const mem = new Float32Array(overlap);
  if (rest.length >= overlap) mem.set(rest.subarray(rest.length - overlap));
  else mem.set(rest, overlap - rest.length);
  state.analysisMem = mem;
  return { re, im, frames };
}

/** Synthesis iSTFT with overlap-add continuing from `state.synthesisMem`; returns frames·hop samples. */
export function stftSynthesis(re: Float32Array, im: Float32Array, frames: number, state: Dfn3State, fft: ComplexFft): Float32Array {
  const { fftSize, hopSize } = DFN3;
  const overlap = fftSize - hopSize;
  const out = new Float32Array(frames * hopSize);
  const fr = new Float64Array(fftSize);
  const fi = new Float64Array(fftSize);
  for (let f = 0; f < frames; f += 1) {
    const base = f * FREQ_BINS;
    for (let k = 0; k < FREQ_BINS; k += 1) {
      fr[k] = re[base + k]!;
      fi[k] = im[base + k]!;
    }
    for (let k = 1; k < fftSize / 2; k += 1) {
      fr[fftSize - k] = fr[k]!;
      fi[fftSize - k] = -fi[k]!;
    }
    fft.transform(fr, fi, true);
    const frame = new Float32Array(fftSize);
    for (let i = 0; i < fftSize; i += 1) frame[i] = fr[i]! * window[i]!;
    for (let i = 0; i < overlap; i += 1) frame[i] = frame[i]! + state.synthesisMem[i]!;
    out.set(frame.subarray(0, hopSize), f * hopSize);
    const mem = new Float32Array(overlap);
    mem.set(frame.subarray(hopSize, fftSize));
    state.synthesisMem = mem;
  }
  return out;
}

/* ---------- Features ---------- */

export function erbFeatures(re: Float32Array, im: Float32Array, frames: number, state: Dfn3State): Float32Array {
  const { erbBands, normAlpha } = DFN3;
  const out = new Float32Array(frames * erbBands);
  for (let t = 0; t < frames; t += 1) {
    const base = t * FREQ_BINS;
    const acc = new Float64Array(erbBands);
    for (let k = 0; k < FREQ_BINS; k += 1) acc[bandOfBin[k]!] += re[base + k]! * re[base + k]! + im[base + k]! * im[base + k]!;
    for (let b = 0; b < erbBands; b += 1) {
      const x = 10 * Math.log10(acc[b]! / widths[b]! + 1e-10);
      state.meanNorm[b] = x * (1 - normAlpha) + state.meanNorm[b]! * normAlpha;
      out[t * erbBands + b] = (x - state.meanNorm[b]!) / 40;
    }
  }
  return out;
}

export function specFeatures(re: Float32Array, im: Float32Array, frames: number, state: Dfn3State): { re: Float32Array; im: Float32Array } {
  const { dfBins, normAlpha } = DFN3;
  const outRe = new Float32Array(frames * dfBins);
  const outIm = new Float32Array(frames * dfBins);
  for (let t = 0; t < frames; t += 1) {
    for (let f = 0; f < dfBins; f += 1) {
      const r = re[t * FREQ_BINS + f]!;
      const i = im[t * FREQ_BINS + f]!;
      state.unitNorm[f] = Math.hypot(r, i) * (1 - normAlpha) + state.unitNorm[f]! * normAlpha;
      const norm = Math.sqrt(Math.max(state.unitNorm[f]!, 1e-10));
      outRe[t * dfBins + f] = r / norm;
      outIm[t * dfBins + f] = i / norm;
    }
  }
  return { re: outRe, im: outIm };
}

/** Trim `lookahead` frames from the front and zero-pad the end: the graphs see two future frames. */
export function shiftLookahead(data: Float32Array, perFrame: number, frames: number, lookahead = DFN3.lookahead): Float32Array {
  if (lookahead <= 0 || frames <= lookahead) return data;
  const out = new Float32Array(data.length);
  out.set(data.subarray(lookahead * perFrame));
  return out;
}

/* ---------- Model sessions ---------- */

interface Dfn3Sessions {
  ort: typeof OrtNs;
  enc: OrtNs.InferenceSession;
  erbDec: OrtNs.InferenceSession;
  dfDec: OrtNs.InferenceSession;
}

let sessionsPromise: Promise<Dfn3Sessions> | null = null;

/** Graph sources: URLs in the browser (default), bytes for tests/scripts. */
export interface Dfn3ModelSources {
  enc: string | Uint8Array;
  erbDec: string | Uint8Array;
  dfDec: string | Uint8Array;
}

function loadSessions(sources?: Dfn3ModelSources): Promise<Dfn3Sessions> {
  if (sessionsPromise && !sources) return sessionsPromise;
  const p = (async () => {
    const ort = await import('onnxruntime-web');
    if (!sources) {
      const u = ortWasmUrls(ort.env.versions?.web);
      ort.env.wasm.wasmPaths = { wasm: u.wasm, mjs: u.mjs };
    }
    const urls = sources ?? dfn3ModelUrls();
    // GRU/Einsum/ConvTranspose are CPU kernels: the wasm EP runs the whole graph; WebGPU would
    // only hand pieces back and forth.
    const options: OrtNs.InferenceSession.SessionOptions = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
    const create = (source: string | Uint8Array) => (typeof source === 'string'
      ? ort.InferenceSession.create(source, options)
      : ort.InferenceSession.create(source, options));
    const [enc, erbDec, dfDec] = await Promise.all([create(urls.enc), create(urls.erbDec), create(urls.dfDec)]);
    return { ort, enc, erbDec, dfDec };
  })();
  if (!sources) {
    sessionsPromise = p;
    p.catch(() => {
      if (sessionsPromise === p) sessionsPromise = null;
    });
  }
  return p;
}

/* ---------- Enhancement core (one chunk, state carried) ---------- */

async function enhanceCore(samples: Float32Array, state: Dfn3State, fft: ComplexFft, sessions: Dfn3Sessions): Promise<Float32Array> {
  const { fftSize, hopSize, erbBands, dfBins, dfOrder, lookahead } = DFN3;
  const { ort } = sessions;
  // libDF appends one full window so the streaming delay can be removed without truncating.
  const padded = new Float32Array(samples.length + fftSize);
  padded.set(samples);
  const { re, im, frames } = stftAnalysis(padded, state, fft);
  if (!frames) return new Float32Array(0);

  const erb = shiftLookahead(erbFeatures(re, im, frames, state), erbBands, frames, lookahead);
  const spec = specFeatures(re, im, frames, state);
  const specRe = shiftLookahead(spec.re, dfBins, frames, lookahead);
  const specIm = shiftLookahead(spec.im, dfBins, frames, lookahead);
  const featSpec = new Float32Array(2 * frames * dfBins);
  featSpec.set(specRe, 0);
  featSpec.set(specIm, frames * dfBins);

  const encOut = await sessions.enc.run({
    feat_erb: new ort.Tensor('float32', erb, [1, 1, frames, erbBands]),
    feat_spec: new ort.Tensor('float32', featSpec, [1, 2, frames, dfBins]),
  });
  const [maskOut, dfOut] = await Promise.all([
    sessions.erbDec.run({ emb: encOut.emb!, e3: encOut.e3!, e2: encOut.e2!, e1: encOut.e1!, e0: encOut.e0! }),
    sessions.dfDec.run({ emb: encOut.emb!, c0: encOut.c0! }),
  ]);
  const mask = maskOut.m!.data as Float32Array; // [1,1,T,32]
  const coefs = dfOut.coefs!.data as Float32Array; // [1,T,96,order·2] (re,im interleaved per tap)

  // ERB gain over the full spectrum.
  const outRe = new Float32Array(re.length);
  const outIm = new Float32Array(im.length);
  for (let t = 0; t < frames; t += 1) {
    const base = t * FREQ_BINS;
    for (let k = 0; k < FREQ_BINS; k += 1) {
      const g = mask[t * erbBands + bandOfBin[k]!]!;
      outRe[base + k] = re[base + k]! * g;
      outIm[base + k] = im[base + k]! * g;
    }
  }
  // Deep filtering of the low bins from the ORIGINAL spectrum: Y(t,f) = Σₙ X(t+n−padBefore, f)·W(n,t,f).
  const padBefore = dfOrder - 1 - DFN3.lookahead;
  for (let t = 0; t < frames; t += 1) {
    for (let f = 0; f < dfBins; f += 1) {
      let sumRe = 0;
      let sumIm = 0;
      for (let n = 0; n < dfOrder; n += 1) {
        const srcT = t + n - padBefore;
        if (srcT < 0 || srcT >= frames) continue;
        const c = ((t * dfBins + f) * dfOrder + n) * 2;
        const wRe = coefs[c]!;
        const wIm = coefs[c + 1]!;
        const xRe = re[srcT * FREQ_BINS + f]!;
        const xIm = im[srcT * FREQ_BINS + f]!;
        sumRe += xRe * wRe - xIm * wIm;
        sumIm += xIm * wRe + xRe * wIm;
      }
      outRe[t * FREQ_BINS + f] = sumRe;
      outIm[t * FREQ_BINS + f] = sumIm;
    }
  }
  const raw = stftSynthesis(outRe, outIm, frames, state, fft);
  const trimStart = fftSize - hopSize;
  const trimEnd = Math.min(trimStart + samples.length, raw.length);
  return trimEnd > trimStart ? raw.slice(trimStart, trimEnd) : new Float32Array(0);
}

/** Enhance mono 48 kHz PCM. Chunks long input (45 s, 500 ms equal-power crossfade) with the STFT
 *  and normalization state carried across seams; graphs reset their recurrent state per chunk. */
export async function dfn3Enhance(dry: Float32Array, onProgress?: (fraction: number) => void, sources?: Dfn3ModelSources): Promise<Float32Array> {
  const sessions = await loadSessions(sources);
  const fft = new ComplexFft(DFN3.fftSize);
  const state = createDfn3State();
  const rate = DFN3.sampleRate;
  const chunkSamples = DFN3.chunkSeconds * rate;
  if (dry.length <= chunkSamples) {
    const out = await enhanceCore(dry, state, fft, sessions);
    onProgress?.(1);
    return out;
  }
  const overlap = Math.max(1, Math.floor((DFN3.overlapMs * rate) / 1000));
  const hop = chunkSamples - overlap;
  const numChunks = Math.max(2, Math.ceil((dry.length - overlap) / hop));
  const evenChunk = Math.max(overlap + 1, Math.floor((dry.length + overlap * (numChunks - 1) + numChunks - 1) / numChunks));
  const evenHop = evenChunk - overlap;
  const out = new Float32Array(dry.length);
  let written = 0;
  let prevTail: Float32Array | null = null;
  let offset = 0;
  let chunkIndex = 0;
  const push = (data: Float32Array) => {
    const n = Math.min(data.length, out.length - written);
    out.set(data.subarray(0, n), written);
    written += n;
  };
  while (offset < dry.length) {
    const end = Math.min(offset + evenChunk, dry.length);
    const enhanced = await enhanceCore(dry.subarray(offset, end), state, fft, sessions);
    if (!prevTail) {
      const keepEnd = Math.max(0, enhanced.length - overlap);
      push(enhanced.subarray(0, keepEnd));
      prevTail = enhanced.slice(keepEnd);
    } else {
      const effective = Math.min(overlap, enhanced.length, prevTail.length);
      const mixed = new Float32Array(effective);
      for (let i = 0; i < effective; i += 1) {
        const tt = i / Math.max(effective - 1, 1);
        mixed[i] = prevTail[i]! * Math.cos((tt * Math.PI) / 2) + enhanced[i]! * Math.sin((tt * Math.PI) / 2);
      }
      push(mixed);
      if (prevTail.length > effective) push(prevTail.subarray(effective));
      const midEnd = Math.max(effective, enhanced.length - overlap);
      push(enhanced.subarray(effective, midEnd));
      prevTail = enhanced.slice(midEnd);
    }
    chunkIndex += 1;
    onProgress?.(Math.min(0.99, chunkIndex / numChunks));
    offset += evenHop;
    if (dry.length - offset < overlap * 2) break;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (prevTail) push(prevTail);
  onProgress?.(1);
  return out;
}
