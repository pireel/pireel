/**
 * Where a press or a drag lands on the canvas timeline: which edge of a clip, which lane, or which
 * gap between lanes. Pure functions over the layout, with the DOM timeline's rules (it resolves the
 * same targets from element positions), so a drag commits the same edit in either.
 */
import type { TimelineMediaDropTarget, TimelineVisualDropTarget } from '../timeline-asset-drop';
import { type TimelineTrackDropRow, type TimelineTrackDropTarget, timelineCompatibleTrackDropTarget, timelineTrackDropTarget } from '../timeline-audio-tracks';
import { type LaneKey, type TimelineItem, type TimelineLayout, itemBox } from './layout';

/** How far in from a clip's edge a press trims instead of moving, in px. */
const edgeGrab = (item: TimelineItem) => (item.kind === 'shot' ? 8 : 6);

/** The trim edge of an item under a content-px position, if the item has one there. */
export function edgeAt(item: TimelineItem, contentX: number, pps: number): 'left' | 'right' | null {
  if (item.kind === 'pending' || item.kind === 'audio' || item.kind === 'transition') return null;
  const { left, width } = itemBox(item, pps);
  if (item.kind === 'caption' && width < 18) return null; // too narrow to tell a trim from a click
  const grab = edgeGrab(item);
  // On a card narrower than two handles the right one wins, as it does when the handles overlap.
  if (contentX >= left + width - grab) return 'right';
  if (contentX <= left + grab) return 'left';
  return null;
}

export const trimHandleWidth = edgeGrab;

/** The button on a shot's card that opens its slip panel: top right, clear of the trim handle. Null on a card too narrow for it. */
export function slipButtonBox(card: { x: number; y: number; w: number }): { x: number; y: number; size: number } | null {
  return card.w >= 44 ? { x: card.x + card.w - 28, y: card.y + 2, size: 16 } : null;
}

/** The lanes a dragged clip can land on or between: every lane backed by a track of the document. */
export function dropRows(layout: TimelineLayout): TimelineTrackDropRow[] {
  return layout.lanes.flatMap((lane) => lane.trackId != null && lane.track && lane.track.timelineIndex >= 0
    ? [{ trackId: lane.trackId, trackIndex: lane.track.timelineIndex, top: lane.top, height: lane.height }]
    : []);
}

/** A new media lane at a document index: its place in the stack is between its neighbours'. */
export function newVisualTarget(layout: TimelineLayout, rows: readonly TimelineTrackDropRow[], indexWish: number): Extract<TimelineVisualDropTarget, { kind: 'visual-new' }> {
  const slot = Math.max(0, Math.min(rows.length, indexWish));
  const layerOf = new Map(layout.lanes.flatMap((lane) => (lane.layer && lane.trackId != null ? [[lane.trackId, lane] as const] : [])));
  const layerRows = rows.filter((row) => layerOf.has(row.trackId));
  const layerSlot = layerRows.filter((row) => row.trackIndex < slot).length;
  const above = layerOf.get(layerRows[layerSlot - 1]?.trackId ?? '')?.stackOrder;
  const below = layerOf.get(layerRows[layerSlot]?.trackId ?? '')?.stackOrder;
  const stackOrder = above == null
    ? (below ?? 1) + 1
    : below == null
      ? (above > 1 ? (above + 1) / 2 : above - 1)
      : (above + below) / 2;
  return { kind: 'visual-new', stackOrder, slot };
}

/** Where the line for a new lane at a document index is drawn. */
export function insertionLineTop(rows: readonly TimelineTrackDropRow[], indexWish: number): number {
  const index = Math.max(0, Math.min(rows.length, indexWish));
  const below = rows.find((row) => row.trackIndex >= index);
  const above = [...rows].reverse().find((row) => row.trackIndex < index);
  if (below && above) return (above.top + above.height + below.top) / 2;
  if (below) return below.top;
  return above ? above.top + above.height : 0;
}

/**
 * The lane a video or image lands on at a height in the tracks area. On a lane's body it is that
 * lane (the story spine only for what may live there); in a gap, or over a lane of another kind, it
 * is a new media lane at that boundary.
 */
export function visualMoveTarget(layout: TimelineLayout, rows: readonly TimelineTrackDropRow[], y: number, allowPrimary: boolean, ghostHeight: number): TimelineMediaDropTarget {
  const primaryId = layout.primaryTrack?.trackId;
  const mediaIds = new Set(layout.lanes.flatMap((lane) => (lane.layer && lane.track?.type === 'visual' && lane.trackId != null ? [lane.trackId] : [])));
  const compatible = new Set([...mediaIds, ...(allowPrimary && primaryId ? [primaryId] : [])]);
  const target = timelineCompatibleTrackDropTarget(rows, y, ghostHeight, compatible, new Set(primaryId ? [primaryId] : []));
  if (target?.kind === 'new-track') return newVisualTarget(layout, rows, target.newTrackIndex);
  if (target?.kind === 'existing-track') {
    if (target.trackId === primaryId && allowPrimary) return { kind: 'primary' };
    if (mediaIds.has(target.trackId)) return { kind: 'visual', trackId: target.trackId };
  }
  // Something dragged in from outside has no lane to fall back to: it gets one where it is held.
  const physical = timelineTrackDropTarget(rows, y, ghostHeight);
  return newVisualTarget(layout, rows, physical?.kind === 'new-track' ? physical.newTrackIndex : physical?.trackIndex ?? rows.length);
}

export type BlockMoveTarget = { to: LaneKey; gap: null } | { to: null; gap: Extract<TimelineTrackDropTarget, { kind: 'new-track' }> };

/**
 * The lane a graphic lands on at a height in the tracks area: a graphics lane's body, or a new
 * graphics lane at a boundary. Null where it can go nowhere new (it then stays on the lane it last had).
 */
export function blockMoveTarget(layout: TimelineLayout, rows: readonly TimelineTrackDropRow[], y: number, ghostHeight: number, allowNewLane: boolean): BlockMoveTarget | null {
  const primaryId = layout.primaryTrack?.trackId;
  const graphicsIds = new Set(layout.lanes.flatMap((lane) => (lane.track?.type === 'graphics' && lane.trackId != null ? [lane.trackId] : [])));
  const target = timelineCompatibleTrackDropTarget(rows, y, ghostHeight, graphicsIds, new Set(primaryId ? [primaryId] : []));
  if (!target || (target.kind === 'new-track' && !allowNewLane)) return null;
  if (target.kind === 'new-track') return { to: null, gap: target };
  const lane = layout.lanes.find((candidate) => candidate.trackId === target.trackId && candidate.track && candidate.track.timelineIndex >= 0);
  return lane ? { to: lane.key, gap: null } : null;
}

export type AudioMoveTarget =
  | { kind: 'track'; trackId: string; newTrackIndex: number; top: number }
  | { kind: 'new-track'; newTrackIndex: number; lineTop: number; top: number };

/** The lane an audio clip lands on at a height in the tracks area: an audio lane's body, or a new
 *  audio lane at a boundary. Null where neither is there. */
export function audioMoveTarget(layout: TimelineLayout, rows: readonly TimelineTrackDropRow[], y: number, ghostHeight: number): AudioMoveTarget | null {
  const primaryId = layout.primaryTrack?.trackId;
  const audioIds = new Set(layout.lanes.flatMap((lane) => (lane.audio && lane.track && lane.trackId != null ? [lane.trackId] : [])));
  const target = timelineCompatibleTrackDropTarget(rows, y, ghostHeight, audioIds, new Set(primaryId ? [primaryId] : []));
  if (!target) return null;
  if (target.kind === 'new-track') return target;
  return audioIds.has(target.trackId) ? { kind: 'track', trackId: target.trackId, newTrackIndex: target.trackIndex + 1, top: target.top } : null;
}
