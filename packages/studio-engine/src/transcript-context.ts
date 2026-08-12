import type { AsrSegment } from './build-blocks';
import { videoShotTimelineSpans, type VideoShot, type VideoShotTimelinePlacement } from './composition-core';

export interface TranscriptContextInput {
  shots: VideoShot[];
  placements?: readonly VideoShotTimelinePlacement[];
  mainTranscript: AsrSegment[];
  clipTranscripts?: Readonly<Record<string, AsrSegment[]>>;
  /** Edited-timeline second whose spoken context the generated block should describe. */
  atSec: number;
  maxChars?: number;
}

function distanceToSegment(segment: AsrSegment, second: number): number {
  if (second < segment.start) return segment.start - second;
  if (second > segment.end) return second - segment.end;
  return 0;
}

/** Return a compact transcript window around an edited-timeline moment.
 * This intentionally maps through cuts (and inserted sources) before selecting text; sending the
 * beginning of a long transcript for a late block makes otherwise-correct visual generation guess
 * from the wrong topic. */
export function transcriptContextAt(input: TranscriptContextInput): string {
  const maxChars = Math.max(200, Math.min(4_000, Math.round(input.maxChars ?? 1_200)));
  const spans = videoShotTimelineSpans(input.shots, input.placements);
  if (!spans.length) return '';
  const atSec = Number.isFinite(input.atSec) ? input.atSec : 0;
  const span = spans.find((candidate) => atSec >= candidate.editedStart && atSec < candidate.editedEnd)
    ?? spans.reduce((best, candidate) => {
      const distance = atSec < candidate.editedStart
        ? candidate.editedStart - atSec
        : atSec - candidate.editedEnd;
      return distance < best.distance ? { span: candidate, distance } : best;
    }, { span: spans[0]!, distance: Number.POSITIVE_INFINITY }).span;
  const timelineDuration = Math.max(1e-6, span.editedEnd - span.editedStart);
  const progress = Math.min(1, Math.max(0, (atSec - span.editedStart) / timelineDuration));
  const sourceSec = span.clip.srcStart + progress * Math.max(0, span.clip.srcEnd - span.clip.srcStart);
  const transcript = span.clip.src
    ? input.clipTranscripts?.[span.clip.src] ?? []
    : input.mainTranscript;
  if (!transcript.length) return '';

  const targetIndex = transcript.reduce((best, segment, index) => {
    const distance = distanceToSegment(segment, sourceSec);
    return distance < best.distance ? { index, distance } : best;
  }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;
  const selected = new Set<number>([targetIndex]);
  let chars = transcript[targetIndex]!.text.trim().length;
  let left = targetIndex - 1;
  let right = targetIndex + 1;
  while ((left >= 0 || right < transcript.length) && chars < maxChars) {
    const leftDistance = left >= 0 ? distanceToSegment(transcript[left]!, sourceSec) : Number.POSITIVE_INFINITY;
    const rightDistance = right < transcript.length ? distanceToSegment(transcript[right]!, sourceSec) : Number.POSITIVE_INFINITY;
    // Character limits alone still return an entire sparse/terse transcript. Keep the prompt local
    // in time as well: roughly the spoken thought before and after the target moment.
    if (Math.min(leftDistance, rightDistance) > 40) break;
    const next = leftDistance <= rightDistance ? left-- : right++;
    const text = transcript[next]!.text.trim();
    if (!text) continue;
    if (chars + text.length + 1 > maxChars) break;
    selected.add(next);
    chars += text.length + 1;
  }
  const script = [...selected]
    .sort((a, b) => a - b)
    .map((index) => transcript[index]!.text.trim())
    .filter(Boolean)
    .join(' ');
  if (script.length <= maxChars) return script;
  return script.slice(0, maxChars);
}
