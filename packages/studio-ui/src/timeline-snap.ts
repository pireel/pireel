import { audioClipWindow, type AudioClip } from '@pireel/studio-engine/composition';
import { SNAP_PX } from './timeline-utils';

export interface TimelineSnapSpan {
  start: number;
  end: number;
}

export interface TimelineSnapBlock {
  startSec: number;
  durationSec: number;
}

/** Preserve the cursor's grab offset in the interior, but let the playhead land exactly on endpoints. */
export function draggedPlayheadSecond(pointerSecond: number, grabOffset: number, durationSec: number): number {
  if (pointerSecond <= 0) return 0;
  if (pointerSecond >= durationSec) return durationSec;
  return Math.max(0, Math.min(durationSec, pointerSecond - grabOffset));
}

/** Every visible edit boundary the playhead and direct-manipulation gestures may snap to. */
export function timelineSnapPoints(
  durationSec: number,
  scenes: readonly TimelineSnapSpan[],
  blocks: readonly TimelineSnapBlock[],
  audioClips: readonly AudioClip[],
): number[] {
  const points = new Set<number>([0, durationSec]);
  for (let second = 0; second <= durationSec; second += 1) points.add(second);
  for (const span of scenes) {
    points.add(span.start);
    points.add(span.end);
  }
  for (const block of blocks) {
    points.add(block.startSec);
    points.add(block.startSec + block.durationSec);
  }
  for (const clip of audioClips) {
    const window = audioClipWindow(clip, durationSec);
    points.add(window.start);
    points.add(window.end);
  }
  return [...points].filter(Number.isFinite).sort((left, right) => left - right);
}

export interface SnapTimelineSecondOptions {
  pps: number;
  dynamicPoints?: readonly number[];
  exclude?: readonly number[];
  /** Keep an already acquired magnet until the pointer crosses the wider release radius. */
  lockedPoint?: number | null;
}

/** Resolve the nearest boundary inside the fixed pixel magnet radius. */
export function snapTimelineSecond(
  second: number,
  points: readonly number[],
  options: SnapTimelineSecondOptions,
): { second: number; hit: number | null } {
  const tolerance = SNAP_PX / options.pps;
  const lockedPoint = options.lockedPoint;
  if (lockedPoint != null && Math.abs(lockedPoint - second) < tolerance * 1.75) {
    return { second: Math.round(lockedPoint * 100) / 100, hit: lockedPoint };
  }
  let best = second;
  let bestDistance = tolerance;
  let hit: number | null = null;
  for (const point of [...points, ...(options.dynamicPoints ?? [])]) {
    if (options.exclude?.some((excluded) => Math.abs(excluded - point) < 1e-3)) continue;
    const distance = Math.abs(point - second);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
      hit = point;
    }
  }
  return { second: Math.round(best * 100) / 100, hit };
}
