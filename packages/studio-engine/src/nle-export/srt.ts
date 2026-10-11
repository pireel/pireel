/** SubRip subtitles: every editor imports them onto its own caption track, still editable as text. */

export interface SubtitleCue {
  startSec: number;
  endSec: number;
  text: string;
}

const stamp = (seconds: number): string => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
};

export function toSrt(cues: readonly SubtitleCue[]): string {
  return [...cues]
    .filter((cue) => cue.text.trim() && cue.endSec > cue.startSec)
    .sort((left, right) => left.startSec - right.startSec)
    .map((cue, index) => `${index + 1}\n${stamp(cue.startSec)} --> ${stamp(cue.endSec)}\n${cue.text.trim()}\n`)
    .join('\n');
}
