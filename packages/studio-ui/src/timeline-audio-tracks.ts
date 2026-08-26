import type { AudioClip } from '@pireel/studio-engine/composition';

export interface TimelineAudioTrackIdentity {
  trackId: string;
  clipIds: readonly string[];
}

export interface TimelineAudioLaneState {
  trackId?: string;
  clips: AudioClip[];
}

export interface TimelineTrackDropRow {
  trackId: string;
  trackIndex: number;
  top: number;
  height: number;
}

export type TimelineTrackDropTarget =
  | { kind: 'existing-track'; trackId: string; trackIndex: number; top: number }
  | { kind: 'new-track'; newTrackIndex: number; lineTop: number; top: number };

export function timelineTrackDisplayOrder(
  tracks: readonly { trackId: string; timelineIndex: number }[],
): string[] {
  return [...tracks]
    .sort((left, right) => left.timelineIndex - right.timelineIndex)
    .map((track) => track.trackId);
}

/**
 * Resolve one authoritative vertical drop target for preview and commit.
 *
 * Track bodies remain existing-track targets. A new track is requested only inside the narrow
 * boundary band between two rows (or beyond the first/last row), matching conventional NLE
 * timelines. `top` is the ghost row position; `lineTop` is the exact insertion indicator.
 */
export function timelineTrackDropTarget(
  rows: readonly TimelineTrackDropRow[],
  pointerY: number,
  ghostHeight: number,
  boundaryThreshold = 10,
): TimelineTrackDropTarget | null {
  if (!rows.length) return null;
  const first = rows[0]!;
  if (pointerY < first.top) {
    return {
      kind: 'new-track',
      newTrackIndex: first.trackIndex,
      lineTop: first.top,
      top: Math.max(0, pointerY - ghostHeight / 2),
    };
  }

  for (let index = 0; index < rows.length - 1; index += 1) {
    const above = rows[index]!;
    const below = rows[index + 1]!;
    const aboveBottom = above.top + above.height;
    const lineTop = (aboveBottom + below.top) / 2;
    if (pointerY >= aboveBottom - boundaryThreshold && pointerY <= below.top + boundaryThreshold) {
      return {
        kind: 'new-track',
        newTrackIndex: below.trackIndex,
        lineTop,
        top: Math.max(0, pointerY - ghostHeight / 2),
      };
    }
  }

  const last = rows.at(-1)!;
  const lastBottom = last.top + last.height;
  if (pointerY >= lastBottom) {
    return {
      kind: 'new-track',
      newTrackIndex: last.trackIndex + 1,
      lineTop: lastBottom,
      top: Math.max(0, pointerY - ghostHeight / 2),
    };
  }

  const row = rows.find((candidate) => (
    pointerY >= candidate.top && pointerY <= candidate.top + candidate.height
  ));
  if (row) {
    return {
      kind: 'existing-track',
      trackId: row.trackId,
      trackIndex: row.trackIndex,
      top: row.top,
    };
  }

  // A large custom row gap can sit outside the insertion threshold. Keep it attached to the
  // nearest physical row instead of silently manufacturing another track.
  const nearest = rows.reduce((best, candidate) => {
    const center = candidate.top + candidate.height / 2;
    const bestCenter = best.top + best.height / 2;
    return Math.abs(pointerY - center) < Math.abs(pointerY - bestCenter) ? candidate : best;
  });
  return {
    kind: 'existing-track',
    trackId: nearest.trackId,
    trackIndex: nearest.trackIndex,
    top: nearest.top,
  };
}

/**
 * Apply clip-type compatibility after the shared physical hit test.
 *
 * Every clip type can create its own lane at any document boundary. Existing row bodies remain
 * typed. Hovering an incompatible body keeps the ghost under the pointer and selects the nearest
 * adjacent boundary, so release creates a compatible lane without jumping back to the source.
 * Protected rows (the primary narrative track) always insert after themselves.
 */
export function timelineCompatibleTrackDropTarget(
  rows: readonly TimelineTrackDropRow[],
  pointerY: number,
  ghostHeight: number,
  compatibleTrackIds: ReadonlySet<string>,
  protectedTrackIds?: ReadonlySet<string>,
): TimelineTrackDropTarget | null {
  const target = timelineTrackDropTarget(rows, pointerY, ghostHeight);
  if (!target || target.kind === 'new-track' || compatibleTrackIds.has(target.trackId)) return target;
  const rowIndex = rows.findIndex((row) => row.trackId === target.trackId);
  const row = rows[rowIndex];
  if (!row) return null;
  const insertAfter = protectedTrackIds?.has(row.trackId) === true
    || pointerY >= row.top + row.height / 2;
  const above = insertAfter ? row : rows[rowIndex - 1];
  const below = insertAfter ? rows[rowIndex + 1] : row;
  const lineTop = above && below
    ? (above.top + above.height + below.top) / 2
    : above
      ? above.top + above.height
      : below?.top ?? row.top;
  return {
    kind: 'new-track',
    newTrackIndex: row.trackIndex + (insertAfter ? 1 : 0),
    lineTop,
    top: Math.max(0, pointerY - ghostHeight / 2),
  };
}

/** Keep native audio lanes distinct. The single-lane branch exists only for legacy compositions. */
export function timelineAudioLanes(
  clips: readonly AudioClip[],
  tracks: readonly TimelineAudioTrackIdentity[],
): TimelineAudioLaneState[] {
  if (!tracks.length) return clips.length ? [{ trackId: undefined, clips: [...clips] }] : [];
  const byId = new Map(clips.map((clip) => [clip.id, clip] as const));
  return tracks.map((track) => ({
    trackId: track.trackId,
    clips: track.clipIds.flatMap((id) => {
      const clip = byId.get(id);
      return clip ? [clip] : [];
    }),
  }));
}
