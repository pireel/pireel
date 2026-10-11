/**
 * ITU-R BS.1770-4 integrated loudness (LUFS): K-weighting (high shelf + RLB high-pass, designed
 * for any sample rate), 400 ms blocks with 75% overlap, absolute gate at -70 LUFS and a relative
 * gate 10 LU below the absolute-gated mean. Channels are weighted equally (mono/stereo programme).
 */

/** Programme loudness a scene brings speech to: the common target for short-form video. */
export const SCENE_TARGET_LUFS = -16;

export interface Biquad { b0: number; b1: number; b2: number; a1: number; a2: number }

/** K-weighting stage coefficients for `rate` (at 48 kHz they match the standard's table). */
export function kWeightingFilters(rate: number): [Biquad, Biquad] {
  let K = Math.tan(Math.PI * 1681.974450955533 / rate); const Q1 = 0.7071752369554196;
  const Vh = 10 ** (3.999843853973347 / 20); const Vb = Vh ** 0.4996667741545416;
  let a0 = 1 + K / Q1 + K * K;
  const shelf = { b0: (Vh + Vb * K / Q1 + K * K) / a0, b1: 2 * (K * K - Vh) / a0, b2: (Vh - Vb * K / Q1 + K * K) / a0, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q1 + K * K) / a0 };
  K = Math.tan(Math.PI * 38.13547087602444 / rate); const Q2 = 0.5003270373238773;
  a0 = 1 + K / Q2 + K * K;
  const highPass = { b0: 1, b1: -2, b2: 1, a1: 2 * (K * K - 1) / a0, a2: (1 - K / Q2 + K * K) / a0 };
  return [shelf, highPass];
}

/** Integrated loudness in LUFS; -Infinity when nothing passes the absolute gate (silence, or shorter than one block). */
/**
 * BS.1770 integrated loudness, fed chunk by chunk: per-channel K-weighting state carries across chunks
 * and only one mean square per 100 ms step is kept, so an hour of audio costs a few hundred kilobytes,
 * never the decoded waveform.
 */
export class LoudnessMeter {
  private readonly step: number;
  private readonly filters: [Biquad, Biquad];
  private readonly state: Float64Array[] = [];
  private readonly power: number[] = [];
  private readonly offset: number[] = [];
  constructor(readonly rate: number, readonly channels: number) {
    this.step = Math.round(rate * .1);
    this.filters = kWeightingFilters(rate);
    for (let c = 0; c < channels; c++) { this.state.push(new Float64Array(6)); this.offset.push(0); }
  }

  /** The next samples of each channel (same length per channel). */
  push(chunk: readonly Float32Array[]) {
    if (!(this.rate >= 8000)) return;
    const [s, h] = this.filters;
    for (let c = 0; c < Math.min(this.channels, chunk.length); c++) {
      const channel = chunk[c]!; const st = this.state[c]!;
      let [x1, x2, y1, y2, z1, z2] = st as unknown as number[];
      let at = this.offset[c]!;
      for (let i = 0; i < channel.length; i++, at++) {
        const x = Number.isFinite(channel[i]) ? channel[i]! : 0;
        const y = s.b0 * x + s.b1 * x1! + s.b2 * x2! - s.a1 * y1! - s.a2 * y2!;
        const z = h.b0 * y + h.b1 * y1! + h.b2 * y2! - h.a1 * z1! - h.a2 * z2!;
        x2 = x1; x1 = x; y2 = y1; y1 = y; z2 = z1; z1 = z;
        const index = Math.floor(at / this.step);
        this.power[index] = (this.power[index] ?? 0) + z * z / this.step;
      }
      st.set([x1!, x2!, y1!, y2!, z1!, z2!]);
      this.offset[c] = at;
    }
  }

  /** Integrated loudness of everything pushed so far (only complete 100 ms steps count). */
  integrated(): number {
    if (!this.channels || !(this.rate >= 8000)) return -Infinity;
    const steps = Math.floor(Math.min(...this.offset) / this.step);
    if (steps < 4) return -Infinity;
    const power = Array.from({ length: steps }, (_, i) => this.power[i] ?? 0);
    // 400 ms blocks = four consecutive steps (75% overlap).
    const blocks: number[] = [];
    for (let i = 0; i + 4 <= steps; i++) blocks.push((power[i]! + power[i + 1]! + power[i + 2]! + power[i + 3]!) / 4);
    const loudness = (mean: number) => -0.691 + 10 * Math.log10(mean);
    const absolute = blocks.filter(value => value > 0 && loudness(value) > -70);
    if (!absolute.length) return -Infinity;
    const threshold = loudness(absolute.reduce((sum, value) => sum + value, 0) / absolute.length) - 10;
    const gated = absolute.filter(value => loudness(value) > threshold);
    return loudness(gated.reduce((sum, value) => sum + value, 0) / gated.length);
  }
}

export function integratedLoudness(channels: readonly Float32Array[], rate: number): number {
  // The K-weighting shelf sits at 1.68 kHz: below 8 kHz sampling the filters are not meaningful.
  if (!channels.length || !(rate >= 8000)) return -Infinity;
  const length = Math.min(...channels.map(channel => channel.length));
  const meter = new LoudnessMeter(rate, channels.length);
  meter.push(channels.map(channel => channel.subarray(0, length)));
  return meter.integrated();
}

/** Master gain that brings a programme to `target`, bounded so silence or noise is never pumped up without limit. */
export function loudnessGainDb(measuredLufs: number, target = SCENE_TARGET_LUFS): number | null {
  if (!Number.isFinite(measuredLufs)) return null;
  return Math.round(Math.max(-12, Math.min(24, target - measuredLufs)) * 10) / 10;
}
