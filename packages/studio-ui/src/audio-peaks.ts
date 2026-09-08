/** Peak envelope of decoded audio at ~100 bins per second (the timeline waveform's resolution). */
export function peaksOf(buf: AudioBuffer): Float32Array {
  const n = Math.min(30000, Math.max(200, Math.round(buf.duration * 100)));
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
