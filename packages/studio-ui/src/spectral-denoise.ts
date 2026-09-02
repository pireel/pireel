/**
 * Light narration denoise — stationary spectral noise reduction, pure DSP.
 *
 * What a mainstream editor's one-click "降噪" does: estimate the steady noise floor (hiss, hum,
 * fan, air) from the quiet parts of the recording and subtract only THAT, leaving the voice and
 * the room's own tone alone. A neural enhancer (RNNoise / DeepFilterNet) rebuilds the whole
 * signal and can strip the ambience with it — the "sounds like a different room" complaint.
 * Pipeline: STFT (Hann, 1024/256 at 48 kHz) → per-bin noise PSD as a low percentile of the
 * frame energies (speech is sparse per bin, the floor is not) → decision-directed a-priori SNR →
 * Wiener gain with a floor (the floor is what keeps the environment audible) → overlap-add.
 * Runs in a few hundred ms per minute of audio.
 */

const N = 1024;
const HOP = 256;
const NOISE_PERCENTILE = 0.2;
const SNR_SMOOTHING = 0.98;
const GAIN_SMOOTHING = 0.6;

export interface SpectralDenoiseOptions {
  /** Maximum attenuation of the noise floor in dB (gain floor). 12–18 dB reads as "the hiss is gone"; more sounds processed. */
  reductionDb?: number;
  /** Over-subtraction of the estimated noise (1 = exact estimate; a little above hides residual sparkle). */
  oversubtract?: number;
  onProgress?: (fraction: number) => void;
}

/** In-place iterative radix-2 FFT (re/im arrays of length N, N a power of two). */
function fft(re: Float64Array, im: Float64Array, inverse = false): void {
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
    const angle = (2 * Math.PI) / len * (inverse ? 1 : -1);
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const aRe = re[i + k]!;
        const aIm = im[i + k]!;
        const bRe = re[i + k + len / 2]! * curRe - im[i + k + len / 2]! * curIm;
        const bIm = re[i + k + len / 2]! * curIm + im[i + k + len / 2]! * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
  if (inverse) {
    for (let i = 0; i < n; i += 1) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

const hann = new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));

export function spectralDenoise(dry: Float32Array, options: SpectralDenoiseOptions = {}): Float32Array {
  const reductionDb = options.reductionDb ?? 15;
  const gainFloor = Math.pow(10, -reductionDb / 20);
  const over = options.oversubtract ?? 1.5;
  const frames = Math.max(1, Math.ceil((dry.length + N - HOP) / HOP));
  const bins = N / 2 + 1;
  // Pass 1: frame energies per bin, kept to estimate the noise floor as a low percentile.
  const power = new Float32Array(frames * bins);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const spectra: Array<{ re: Float64Array; im: Float64Array }> = [];
  for (let f = 0; f < frames; f += 1) {
    const start = f * HOP - (N - HOP);
    for (let i = 0; i < N; i += 1) {
      const idx = start + i;
      re[i] = (idx >= 0 && idx < dry.length ? dry[idx]! : 0) * hann[i]!;
      im[i] = 0;
    }
    fft(re, im);
    const fr = new Float64Array(bins);
    const fi = new Float64Array(bins);
    for (let b = 0; b < bins; b += 1) {
      fr[b] = re[b]!;
      fi[b] = im[b]!;
      power[f * bins + b] = re[b]! * re[b]! + im[b]! * im[b]!;
    }
    spectra.push({ re: fr, im: fi });
    if (options.onProgress && f % 200 === 0) options.onProgress((f / frames) * 0.5);
  }
  const noise = new Float64Array(bins);
  const column = new Float32Array(frames);
  for (let b = 0; b < bins; b += 1) {
    for (let f = 0; f < frames; f += 1) column[f] = power[f * bins + b]!;
    column.sort();
    noise[b] = Math.max(1e-12, column[Math.min(frames - 1, Math.floor(frames * NOISE_PERCENTILE))]!);
  }
  // Pass 2: gains + overlap-add.
  const out = new Float32Array(dry.length);
  const norm = new Float32Array(dry.length);
  const prevGain = new Float64Array(bins).fill(1);
  const prevSnr = new Float64Array(bins).fill(1);
  for (let f = 0; f < frames; f += 1) {
    const spectrum = spectra[f]!;
    for (let b = 0; b < bins; b += 1) {
      const p = power[f * bins + b]!;
      const posterior = p / (over * noise[b]!);
      // Decision-directed a-priori SNR (Ephraim–Malah): smooth with the previous frame's cleaned
      // estimate so musical noise does not sparkle between frames.
      const prior = SNR_SMOOTHING * prevSnr[b]! + (1 - SNR_SMOOTHING) * Math.max(0, posterior - 1);
      const wiener = prior / (1 + prior);
      const gain = Math.max(gainFloor, Math.min(1, GAIN_SMOOTHING * prevGain[b]! + (1 - GAIN_SMOOTHING) * wiener));
      prevGain[b] = gain;
      prevSnr[b] = gain * gain * posterior;
      re[b] = spectrum.re[b]! * gain;
      im[b] = spectrum.im[b]! * gain;
      if (b > 0 && b < bins - 1) {
        re[N - b] = re[b]!;
        im[N - b] = -im[b]!;
      }
    }
    fft(re, im, true);
    const start = f * HOP - (N - HOP);
    for (let i = 0; i < N; i += 1) {
      const idx = start + i;
      if (idx < 0 || idx >= dry.length) continue;
      out[idx] = out[idx]! + re[i]! * hann[i]!;
      norm[idx] = norm[idx]! + hann[i]! * hann[i]!;
    }
    if (options.onProgress && f % 200 === 0) options.onProgress(0.5 + (f / frames) * 0.5);
  }
  for (let i = 0; i < dry.length; i += 1) out[i] = norm[i]! > 1e-6 ? out[i]! / norm[i]! : dry[i]!;
  options.onProgress?.(1);
  return out;
}
