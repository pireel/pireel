/** Pure source-time ↔ native-timeline geometry shared by preview and browser export. */
export interface PlacedSourceSegment {
  srcStart: number;
  srcEnd: number;
  timelineStart?: number;
  timelineEnd?: number;
}

export function segmentTimelineStart(segment: PlacedSourceSegment, contiguousFallback: number): number {
  return Number.isFinite(segment.timelineStart) ? Math.max(0, segment.timelineStart!) : contiguousFallback;
}

export function segmentTimelineEnd(segment: PlacedSourceSegment, start: number): number {
  if (Number.isFinite(segment.timelineEnd) && segment.timelineEnd! >= start) return segment.timelineEnd!;
  return start + Math.max(0, segment.srcEnd - segment.srcStart);
}

export function segmentSourceRate(segment: PlacedSourceSegment, start: number, end: number): number {
  const timelineDuration = Math.max(0, end - start);
  const sourceDuration = Math.max(0, segment.srcEnd - segment.srcStart);
  return timelineDuration > 1e-9 ? sourceDuration / timelineDuration : 0;
}

export function segmentSourceTimeAt(segment: PlacedSourceSegment, timelineTime: number, start: number, end: number): number {
  const rate = segmentSourceRate(segment, start, end);
  return Math.min(segment.srcEnd, Math.max(segment.srcStart, segment.srcStart + (timelineTime - start) * rate));
}

export function segmentTimelineTimeAt(segment: PlacedSourceSegment, sourceTime: number, start: number, end: number): number {
  const rate = segmentSourceRate(segment, start, end);
  if (rate <= 1e-9) return start;
  return Math.min(end, Math.max(start, start + (sourceTime - segment.srcStart) / rate));
}
