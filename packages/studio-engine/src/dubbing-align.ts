/**
 * Placing a dub on the picture, shared by every host that aligns one: where each voiced line goes,
 * how much faster it is spoken, and what is reported. Pure numbers, so the browser and the server
 * lay a dub out the same way. Sample positions are integers at one sample rate.
 */

/** Gentle post stretch that is not worth mentioning. */
export const DUB_POST_STRETCH = 1.15;
/** Beyond the gentle stretch a line is spoken faster still, up to this; past it the end is cut with a short fade. */
export const DUB_MAX_STRETCH = 1.4;
/** How far a line may run into the next one, pushing the lines after it later, before anything is cut. */
export const DUB_MAX_LAG_SEC = .6;

export interface DubLine { start: number; end: number; natural: number }
export interface DubPlacement { start: number; end: number; trim: boolean; squeeze: number }
export interface DubLayout { placed: DubPlacement[]; notes: { index: number; kind: 'faster' | 'trimmed' }[] }

/**
 * Lay voiced lines (in time order) onto the picture: a line keeps its natural length when it fits in
 * its window and the pause after it; it may run up to DUB_MAX_LAG_SEC into the next line, which then
 * starts that much later; when lines back to back still do not fit, the run is spoken faster together
 * (up to DUB_MAX_STRETCH) rather than one line being cut. Only past that is a line's end cut.
 * Overlapping speakers keep their own times.
 */
export function layoutDubbing(lines: readonly DubLine[], total: number, sampleRate: number): DubLayout {
  const maxLag = Math.round(DUB_MAX_LAG_SEC * sampleRate);
  const speeds = lines.map(() => 1);
  const place = () => {
    let lag = 0; let over = -1; const placed: { start: number; end: number; pushed: boolean }[] = [];
    lines.forEach((line, index) => {
      const start = Math.min(total - 1, line.start + lag); const own = Math.min(total, line.end + lag);
      const next = lines[index + 1]?.start;
      const available = Math.max(own, next === undefined ? total : Math.min(total, next + maxLag)) - start;
      const wanted = Math.round(line.natural / speeds[index]!);
      if (wanted > available && over < 0) over = index;
      const end = start + Math.max(1, Math.min(wanted, available));
      // Only running past its own window into the next line pushes that line later.
      placed.push({ start, end, pushed: lag > 0 }); lag = next === undefined ? 0 : Math.max(0, end - Math.max(own, next));
    });
    return { placed, over };
  };
  let result = place();
  for (let round = 0; round < 200 && result.over >= 0; round++) {
    // Speed up the line that does not fit together with the lines that pushed it, a little at a time.
    let first = result.over; while (first > 0 && result.placed[first]!.pushed) first--;
    if (speeds.slice(first, result.over + 1).every(speed => speed >= DUB_MAX_STRETCH - 1e-6)) break;
    for (let index = first; index <= result.over; index++) speeds[index] = Math.min(DUB_MAX_STRETCH, speeds[index]! + .02);
    result = place();
  }
  const notes: DubLayout['notes'] = [];
  const placed = result.placed.map(({ start, end }, index) => {
    const squeeze = lines[index]!.natural / (end - start);
    const trim = squeeze > DUB_MAX_STRETCH + 1e-3;
    if (squeeze > DUB_POST_STRETCH + 1e-3) notes.push({ index, kind: trim ? 'trimmed' : 'faster' });
    return { start, end, trim, squeeze };
  });
  return { placed, notes };
}

/**
 * Pitch-keeping speech time stretch (WSOLA): `rate` is input seconds per output second (1.2 = 20 %
 * faster). Good for speech within the dub's 1–1.4 range; runs anywhere (no audio APIs).
 */
export function stretchSpeech(input: Float32Array, rate: number, sampleRate: number): Float32Array {
  const length = Math.max(0, Math.round(input.length / rate));
  if (Math.abs(rate - 1) < 1e-3 || input.length < 2) return input.slice(0, length || input.length);
  const frame = Math.max(64, Math.round(.03 * sampleRate)); const hop = frame >> 1; const tolerance = Math.round(.012 * sampleRate);
  const window = new Float32Array(frame); for (let i = 0; i < frame; i++) window[i] = .5 - .5 * Math.cos(2 * Math.PI * i / (frame - 1));
  const output = new Float32Array(length + frame); const weight = new Float32Array(length + frame);
  const at = (index: number) => index >= 0 && index < input.length ? input[index]! : 0;
  let previous = 0;
  for (let out = 0; out < length; out += hop) {
    const nominal = Math.round(out * rate);
    let best = nominal;
    if (out > 0) {
      // The segment that would naturally follow the last one; pick the nearby input that matches it best.
      const target = previous + hop; let score = -Infinity;
      for (let delta = -tolerance; delta <= tolerance; delta += 2) {
        const candidate = nominal + delta; let sum = 0;
        for (let i = 0; i < frame; i += 8) sum += at(candidate + i) * at(target + i);
        if (sum > score) { score = sum; best = candidate; }
      }
    }
    for (let i = 0; i < frame; i++) { output[out + i]! += at(best + i) * window[i]!; weight[out + i]! += window[i]!; }
    previous = best;
  }
  const result = new Float32Array(length);
  for (let i = 0; i < length; i++) result[i] = weight[i]! > 1e-3 ? output[i]! / weight[i]! : 0;
  return result;
}

/** One voiced line fitted to its slot: stretched to it, or (a cut line) sped up as far as allowed and faded out at the slot's end. */
export function fitDubLine(pcm: Float32Array, placement: DubPlacement, sampleRate: number): Float32Array {
  const target = placement.end - placement.start;
  const rate = placement.trim ? DUB_MAX_STRETCH : pcm.length / target;
  const fitted = Math.abs(rate - 1) < 1e-3 ? pcm : stretchSpeech(pcm, rate, sampleRate);
  const length = Math.min(fitted.length, target);
  const fade = placement.trim && fitted.length > target ? Math.min(length, Math.round(sampleRate * .12)) : 0;
  const result = fitted.slice(0, length);
  for (let i = length - fade; i < length; i++) result[i]! *= (length - i) / fade;
  return result;
}

/** Mix laid-out lines into one track: each fitted to its slot (stretched, or cut with a short fade). */
export function mixDub(total: number, sampleRate: number, lines: { pcm: Float32Array; placement: DubPlacement }[]): Float32Array {
  const output = new Float32Array(total);
  for (const { pcm, placement } of lines) {
    const fitted = fitDubLine(pcm, placement, sampleRate);
    for (let i = 0; i < Math.min(fitted.length, total - placement.start); i++) output[placement.start + i]! += fitted[i]!;
  }
  let peak = 1; for (const sample of output) peak = Math.max(peak, Math.abs(sample));
  if (peak > 1) for (let i = 0; i < output.length; i++) output[i]! /= peak;
  return output;
}

/** 16-bit little-endian PCM (as speech services return it) to samples. */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); const samples = new Float32Array(bytes.byteLength >> 1);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return samples;
}

/** A mono 16-bit WAV file. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2); const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i]!)) * 32767, true);
  return bytes;
}
