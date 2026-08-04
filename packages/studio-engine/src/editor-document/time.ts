export const DEFAULT_TIMELINE_FPS = 30;

export const isFinitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function secondsToTimelineFrames(seconds: number, fps: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.round(seconds * fps);
}

export function timelineFramesToSeconds(frames: number, fps: number): number {
  if (!Number.isFinite(frames) || frames <= 0 || !isFinitePositive(fps)) return 0;
  return frames / fps;
}

export function positiveDurationFrames(seconds: number, fps: number): number {
  if (!isFinitePositive(seconds)) return 1;
  return Math.max(1, secondsToTimelineFrames(seconds, fps));
}
