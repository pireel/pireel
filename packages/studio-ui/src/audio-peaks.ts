const binCount = (durationSec: number) => Math.min(30000, Math.max(200, Math.round(durationSec * 100)));

/**
 * The same envelope built while the audio is read, for a recording too long to hold decoded:
 * `frames` is the track's whole length, known before its first sample, and each piece raises the
 * bins it covers. Only the bins are kept. Every sample is looked at, so a bin is never lower than
 * the one peaksOf finds by sampling.
 */
export function peakReader(frames: number, sampleRate: number) {
  const n = binCount(frames / sampleRate);
  const peaks = new Float32Array(n);
  const step = frames / n;
  let at = 0;
  let bin = 0;
  let binEnd = Math.floor(step);
  return {
    peaks,
    /** The next samples of the track, one array per channel. */
    push(channels: readonly Float32Array[]) {
      const ch0 = channels[0];
      if (!ch0) return;
      const ch1 = channels[1] ?? ch0;
      for (let j = 0; j < ch0.length && at < frames; j++, at++) {
        while (at >= binEnd && bin < n - 1) { bin += 1; binEnd = Math.floor((bin + 1) * step); }
        const v = Math.max(Math.abs(ch0[j]!), Math.abs(ch1[j]!));
        if (v > peaks[bin]!) peaks[bin] = v;
      }
    },
  };
}

/** Peak envelope of decoded audio at ~100 bins per second (the timeline waveform's resolution). */
export function peaksOf(buf: AudioBuffer): Float32Array {
  const n = binCount(buf.duration);
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
  const out = new Float32Array(n);
  const step = ch0.length / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step);
    const b = Math.min(ch0.length, Math.floor((i + 1) * step));
    let peak = 0;
    // stride-sample long windows: a 5-minute track has ~1M samples per bucket, full scan is wasteful
    const stride = Math.max(1, Math.floor((b - a) / 400));
    for (let j = a; j < b; j += stride) {
      const v = Math.max(Math.abs(ch0[j]!), Math.abs(ch1[j]!));
      if (v > peak) peak = v;
    }
    out[i] = peak;
  }
  return out;
}
