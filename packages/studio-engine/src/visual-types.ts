/**
 * Visual-analysis data contracts. The ANALYSIS itself (MediaPipe/VLM) lives in the
 * app layer; the engine only consumes these shapes (e.g. layoutFromPlan). Owning the
 * types here keeps the engine self-contained and the analysis implementation swappable.
 */

import type { NRect, SafeZone } from './geometry-math';
import type { VideoShot } from './composition-core';
import { editedToSrc, spans as clipSpans } from './trim';
import type { VisualQualityWindow } from './visual-quality';

/** Palette derived from footage base colors (CSS var overrides). */
export type DerivedPalette = Record<string, string>;

export interface VisualLabel {
  content: 'talkinghead' | 'screen' | 'broll' | 'slide' | 'other';
  person: 'left' | 'center' | 'right' | 'none';
  safe: 'left' | 'right' | 'top' | 'bottom' | 'full' | 'none';
  hasText: boolean;
  desc: string;
}

export interface VisualSegment {
  start: number;
  end: number;
  /** Semantic label (sparse, VLM). */
  label: VisualLabel;
  /** Geometric safe zone (dense, MediaPipe; absent on failure). */
  geom?: SafeZone;
}

export interface VisualTimeline {
  /** Real scene-cut points in source seconds — hard boundaries for auto-storyboarding. */
  cuts: number[];
  segments: VisualSegment[];
  /** Geometry-pass diagnostics (for tests). */
  geomNote?: string;
  palette?: DerivedPalette;
  /** Bottom band reserved for captions (global no-go zone for graphics). */
  textBands?: NRect[];
  /** Ranked browser-local technical-quality source ranges. Absent only when local measurement failed. */
  qualityWindows?: VisualQualityWindow[];
}

export interface AgentVisualRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AgentVisualSegment {
  startSec: number;
  endSec: number;
  content: VisualLabel['content'];
  person: VisualLabel['person'];
  safe: VisualLabel['safe'];
  description?: string;
}

export interface AgentSubjectTrack {
  startSec: number;
  endSec: number;
  samples: number;
  /** Geometry is measured on the original source frame, not the current canvas. */
  subject: AgentVisualRect & {
    coordinateSpace: 'source-normalized';
    anchorX: number;
    anchorY: number;
  };
  face?: AgentVisualRect;
  /** Representative local safe areas from the longest observation in this stable interval. */
  safeAreas?: AgentVisualRect[];
}

export interface AgentVisualSummary {
  sceneCutsSec: number[];
  /** Locally clustered geometry. Agents should consume these instead of re-grouping raw samples. */
  subjectTracks: AgentSubjectTrack[];
  /** Compact semantic intervals; repeated geometry intentionally lives only in subjectTracks. */
  segments: AgentVisualSegment[];
  /** Browser-local technical measurements; use as a shortlist, then apply semantic/editorial judgment. */
  qualityWindows?: VisualQualityWindow[];
}

/** Token-free/local observations that are sufficient for crop, framing and empty-space decisions.
 * Deliberately excludes semantic labels so callers cannot mistake geometry for content understanding. */
export interface AgentVisualGeometrySummary {
  sceneCutsSec: number[];
  subjectTracks: AgentSubjectTrack[];
  qualityWindows?: VisualQualityWindow[];
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const agentRect = (rect: NRect): AgentVisualRect => ({
  x: round3(rect.x),
  y: round3(rect.y),
  w: round3(rect.w),
  h: round3(rect.h),
});

const segmentKey = (segment: VisualSegment) =>
  [segment.label.content, segment.label.person, segment.label.safe, segment.label.desc.trim()].join('\u0000');

function compactSemanticSegments(segments: VisualSegment[]): AgentVisualSegment[] {
  const compact: (AgentVisualSegment & { key: string })[] = [];
  for (const segment of segments) {
    const key = segmentKey(segment);
    const prev = compact[compact.length - 1];
    if (prev && prev.key === key && segment.start <= prev.endSec + 0.25) {
      prev.endSec = round3(Math.max(prev.endSec, segment.end));
      continue;
    }
    compact.push({
      key,
      startSec: round3(segment.start),
      endSec: round3(segment.end),
      content: segment.label.content,
      person: segment.label.person,
      safe: segment.label.safe,
      ...(segment.label.desc ? { description: segment.label.desc } : {}),
    });
  }
  return compact.map((segment) => ({
    startSec: segment.startSec,
    endSec: segment.endSec,
    content: segment.content,
    person: segment.person,
    safe: segment.safe,
    ...(segment.description ? { description: segment.description } : {}),
  }));
}

interface MutableSubjectTrack {
  start: number;
  end: number;
  samples: number;
  weight: number;
  subject: NRect;
  face?: NRect;
  faceWeight: number;
  representativeDuration: number;
  safeAreas?: NRect[];
}

const rectCenter = (rect: NRect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
const stableWith = (track: MutableSubjectTrack, subject: NRect, start: number) => {
  if (start - track.end > 1.25) return false;
  const a = rectCenter(track.subject);
  const b = rectCenter(subject);
  return Math.hypot(a.x - b.x, a.y - b.y) <= 0.1 && Math.abs(track.subject.w - subject.w) <= 0.12 && Math.abs(track.subject.h - subject.h) <= 0.14;
};

function weightedRect(previous: NRect, previousWeight: number, next: NRect, nextWeight: number): NRect {
  const total = previousWeight + nextWeight;
  return {
    x: (previous.x * previousWeight + next.x * nextWeight) / total,
    y: (previous.y * previousWeight + next.y * nextWeight) / total,
    w: (previous.w * previousWeight + next.w * nextWeight) / total,
    h: (previous.h * previousWeight + next.h * nextWeight) / total,
  };
}

function stableSubjectTracks(segments: VisualSegment[]): AgentSubjectTrack[] {
  const tracks: MutableSubjectTrack[] = [];
  for (const segment of segments) {
    const subject = segment.geom?.subject;
    if (!subject) continue;
    const duration = Math.max(0.01, segment.end - segment.start);
    const current = tracks[tracks.length - 1];
    if (!current || !stableWith(current, subject, segment.start)) {
      tracks.push({
        start: segment.start,
        end: segment.end,
        samples: 1,
        weight: duration,
        subject: { ...subject },
        ...(segment.geom?.face ? { face: { ...segment.geom.face } } : {}),
        faceWeight: segment.geom?.face ? duration : 0,
        representativeDuration: duration,
        ...(segment.geom?.rects.length ? { safeAreas: segment.geom.rects.map((rect) => ({ ...rect })) } : {}),
      });
      continue;
    }
    current.subject = weightedRect(current.subject, current.weight, subject, duration);
    current.weight += duration;
    current.end = Math.max(current.end, segment.end);
    current.samples += 1;
    if (segment.geom?.face) {
      current.face = current.face
        ? weightedRect(current.face, current.faceWeight, segment.geom.face, duration)
        : { ...segment.geom.face };
      current.faceWeight += duration;
    }
    if (duration > current.representativeDuration) {
      current.representativeDuration = duration;
      current.safeAreas = segment.geom?.rects.length ? segment.geom.rects.map((rect) => ({ ...rect })) : undefined;
    }
  }
  return tracks.map((track) => {
    const subject = agentRect(track.subject);
    return {
      startSec: round3(track.start),
      endSec: round3(track.end),
      samples: track.samples,
      subject: {
        ...subject,
        coordinateSpace: 'source-normalized' as const,
        anchorX: round3(subject.x + subject.w / 2),
        anchorY: round3(subject.y + subject.h / 2),
      },
      ...(track.face ? { face: agentRect(track.face) } : {}),
      ...(track.safeAreas?.length ? { safeAreas: track.safeAreas.map(agentRect) } : {}),
    };
  });
}

export interface FramingSplitRejection {
  atSec: number;
  sourceSec: number;
  stableSourceRange: [number, number];
  suggestedAtSecs: number[];
}

/** A framing-purpose split inside a stable local subject track adds no new framing information.
 * Keep this as an observation guard: non-framing edits and footage without subject evidence remain
 * untouched, while the LLM still decides what framing to apply at actual track boundaries. */
export function rejectStableFramingSplits(
  shots: VideoShot[],
  timeline: VisualTimeline,
  atSecs: readonly number[],
  marginSec = 0.75,
): FramingSplitRejection[] {
  const tracks = stableSubjectTracks(timeline.segments);
  const spans = clipSpans(shots);
  const rejected: FramingSplitRejection[] = [];
  for (const atSec of atSecs) {
    const hit = editedToSrc(shots, atSec);
    if (!hit) continue;
    const shot = shots[hit.index];
    // The cached visual timeline describes the main source only; inserted sources need their own
    // observations and must not be rejected using numerically coincident source seconds.
    if (!shot || shot.src) continue;
    const stable = tracks.find(
      (track) => hit.src > track.startSec + marginSec && hit.src < track.endSec - marginSec,
    );
    if (!stable) continue;
    const span = spans[hit.index]!;
    const suggestedAtSecs = [stable.startSec, stable.endSec]
      .filter((sourceSec) => sourceSec > shot.srcStart + 0.05 && sourceSec < shot.srcEnd - 0.05)
      .map((sourceSec) => round3(span.editedStart + sourceSec - shot.srcStart));
    rejected.push({
      atSec: round3(atSec),
      sourceSec: round3(hit.src),
      stableSourceRange: [stable.startSec, stable.endSec],
      suggestedAtSecs,
    });
  }
  return rejected;
}

/** Compact perception output for an agent. This deliberately contains observations, not edit
 * decisions: the LLM chooses whether to split, change canvas, or frame a shot. */
export function visualTimelineForAgent(timeline: VisualTimeline): AgentVisualSummary {
  return {
    sceneCutsSec: timeline.cuts.map(round3),
    subjectTracks: stableSubjectTracks(timeline.segments),
    segments: compactSemanticSegments(timeline.segments),
    ...(timeline.qualityWindows?.length ? { qualityWindows: timeline.qualityWindows } : {}),
  };
}

export function visualGeometryForAgent(timeline: VisualTimeline): AgentVisualGeometrySummary {
  return {
    sceneCutsSec: timeline.cuts.map(round3),
    subjectTracks: stableSubjectTracks(timeline.segments),
    ...(timeline.qualityWindows?.length ? { qualityWindows: timeline.qualityWindows } : {}),
  };
}
