/**
 * Where a footage file's shots sit, from its scene cuts: pure, so the page (frames it decodes) and
 * the measuring service (frames from ffmpeg) pick the same windows and the same frames.
 */

/** A long take with no hard cuts still needs action/content observations across time. */
const MAX_SEMANTIC_SPAN_SEC = 12;
/** Seconds a cut-away holds (the B-roll planner's longest shot). */
export const FOOTAGE_SHOT_SEC = 5;
/** A shot's frames: this wide, JPEG at this quality. */
export const FOOTAGE_FRAME = { width: 448, quality: 0.75 } as const;
/** Where in a shot's window its frames are taken: start, middle and end. */
const FRAME_AT = [0.15, 0.5, 0.85] as const;

/** Real cuts -> analysis segments. Long takes are subdivided only for observation coverage;
 * the cuts remain the source of truth for actual edit boundaries. */
export function analysisSegmentsFromCuts(cuts: number[], durationSec: number): { start: number; end: number }[] {
  const inner = cuts.filter((t) => t > 0.3 && t < durationSec - 0.1).sort((a, b) => a - b);
  const bounds = [0, ...inner, durationSec];
  const segs: { start: number; end: number }[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const start = bounds[i]!;
    const end = bounds[i + 1]!;
    const span = end - start;
    if (span <= 0.4) continue;
    const pieces = Math.max(1, Math.ceil(span / MAX_SEMANTIC_SPAN_SEC));
    for (let piece = 0; piece < pieces; piece++) {
      segs.push({
        start: start + (span * piece) / pieces,
        end: start + (span * (piece + 1)) / pieces,
      });
    }
  }
  return segs.length ? segs : [{ start: 0, end: durationSec }];
}

/** Too many segments -> evenly pick max of them (preserving boundary distribution). */
export function capSegments<T>(segs: T[], max: number): T[] {
  if (segs.length <= max) return segs;
  const step = segs.length / max;
  return Array.from({ length: max }, (_, i) => segs[Math.floor(i * step)]!);
}

export interface FootageWindow { start: number; end: number; frames: number[] }

/**
 * A footage file's shots for cut-aways: its shots (scene cuts, long takes split), at most `maxShots`,
 * each as the five-second window a cut-away would use from its middle, with the times of the frames a
 * description looks at (its start, middle and end).
 */
export function footageWindows(cuts: number[], durationSec: number, maxShots: number): FootageWindow[] {
  const inner = cuts.filter((t) => t > 0.3 && t < durationSec - 0.1);
  return capSegments(analysisSegmentsFromCuts(inner, durationSec), maxShots).map((segment) => {
    const length = Math.min(FOOTAGE_SHOT_SEC, segment.end - segment.start);
    const start = segment.start + (segment.end - segment.start - length) / 2;
    return { start, end: start + length, frames: FRAME_AT.map((at) => start + length * at) };
  });
}
