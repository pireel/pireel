/** Shared contract between the timeline drop planner and the media insertion hook. */
export type TimelineInsertMode = 'overwrite' | 'ripple';

export type TimelineVisualDropTarget =
  | { kind: 'visual'; trackId: string }
  | { kind: 'visual-new'; stackOrder: number; slot: number };

export type TimelineMediaDropTarget =
  | { kind: 'primary'; insertIndex?: number }
  | TimelineVisualDropTarget;

/** Minimal document shape the range planner reads. */
interface RangeTargetDocument {
  canvas: { fps: number };
  semantics: { primaryNarrativeTrackId?: string | null };
  timeline: { tracks: Array<{ id: string; type: string; role?: string; stackOrder: number; clips: Array<{ startFrame: number; durationFrames: number }> }> };
}

/**
 * Where a B-roll covering [startSec, endSec) goes: the lowest B-roll lane that is free over the
 * range, else a new lane directly above the story spine (below every other layer).
 */
export function brollTargetForRange(document: RangeTargetDocument, startSec: number, endSec: number): TimelineVisualDropTarget {
  const fps = document.canvas.fps;
  const from = Math.round(startSec * fps);
  const to = Math.round(endSec * fps);
  const tracks = document.timeline.tracks;
  const primaryId = document.semantics.primaryNarrativeTrackId;
  const free = tracks
    .filter((track) => track.type === 'visual' && track.id !== primaryId && track.role === 'broll')
    .filter((track) => track.clips.every((clip) => clip.startFrame + clip.durationFrames <= from || clip.startFrame >= to))
    .sort((a, b) => a.stackOrder - b.stackOrder)[0];
  if (free) return { kind: 'visual', trackId: free.id };
  const primaryIndex = tracks.findIndex((track) => track.id === primaryId);
  const base = primaryIndex >= 0 ? tracks[primaryIndex]!.stackOrder : 0;
  const nextAbove = tracks.map((track) => track.stackOrder).filter((order) => order > base).sort((a, b) => a - b)[0];
  return { kind: 'visual-new', stackOrder: nextAbove == null ? base + 1 : (base + nextAbove) / 2, slot: Math.max(0, primaryIndex) };
}
