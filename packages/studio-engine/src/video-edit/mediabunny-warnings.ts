/**
 * MediaBunny's ISOBMFF demuxer console.warns once per demux pass for every audio track it cannot
 * decode — iPhone spatial recordings carry an `apac` (Apple Positional Audio Codec) track, and one
 * source is demuxed many times per session (probe, frames, waveform, preview, export). The track is
 * simply ignored, so the message is worth one line per codec, not hundreds. There is no logging
 * option in the library; this wraps console.warn once and mutes repeats of that exact message.
 */
const INSTALLED = Symbol.for('pireel.mediabunny-warning-filter');
const UNSUPPORTED_AUDIO = /^Unsupported audio codec \(sample entry type '([^']+)'\)\.$/;

export function installMediaBunnyWarningFilter(target: { warn: (...args: unknown[]) => void } = console): void {
  const holder = target as typeof target & { [INSTALLED]?: true };
  if (holder[INSTALLED]) return;
  holder[INSTALLED] = true;
  const seen = new Set<string>();
  const original = target.warn.bind(target);
  target.warn = (...args: unknown[]) => {
    const first = args[0];
    const match = typeof first === 'string' ? UNSUPPORTED_AUDIO.exec(first) : null;
    if (match) {
      const codec = match[1]!;
      if (seen.has(codec)) return;
      seen.add(codec);
      original(`${first} That audio track is ignored; further notices for '${codec}' are muted.`);
      return;
    }
    original(...args);
  };
}

installMediaBunnyWarningFilter();
