import { CUT_TRANSITION_EFFECTS, MAX_TRANSITION_SEC, type CutTransitionEffect, type TransitionDirection } from '../composition-core';
import type { EditorDocumentV2, NarrativeTimelineClip, TimelineTransition } from './types';

/**
 * Transitions are free items on their own lane, placed by time. These helpers keep them in step
 * with ripple edits (the lane is sync-locked with the spine) and migrate the older model, where a
 * transition hung on the incoming spine clip as `properties.transIn`.
 */

export const DEFAULT_TRANSITION_SEC = 0.6;

export const isTransitionEffect = (value: unknown): value is CutTransitionEffect =>
  typeof value === 'string' && CUT_TRANSITION_EFFECTS.some((effect) => effect.id === value);

export const transitionEnd = (transition: TimelineTransition) => transition.startFrame + transition.durationFrames;

export const sortTransitions = (list: readonly TimelineTransition[]) =>
  [...list].sort((left, right) => left.startFrame - right.startFrame || left.id.localeCompare(right.id));

export const maxTransitionFrames = (fps: number) => Math.round(MAX_TRANSITION_SEC * fps);

/** Where a new transition starts: at the playhead, or right after any transitions already there. */
export function transitionSlotAt(list: readonly TimelineTransition[], atFrame: number): number {
  let start = Math.max(0, atFrame);
  for (const transition of sortTransitions(list)) {
    if (transition.startFrame <= start && transitionEnd(transition) > start) start = transitionEnd(transition);
  }
  return start;
}

/** Ripple removal of [start, end): later items move up, items inside are dropped, straddlers shrink. */
export function transitionsAfterRangeRemoval(list: readonly TimelineTransition[], startFrame: number, endFrame: number): TimelineTransition[] {
  const gap = endFrame - startFrame;
  return list.flatMap((transition) => {
    const end = transitionEnd(transition);
    if (end <= startFrame) return [transition];
    if (transition.startFrame >= endFrame) return [{ ...transition, startFrame: transition.startFrame - gap }];
    const kept = Math.max(0, startFrame - transition.startFrame) + Math.max(0, end - endFrame);
    if (kept <= 0) return [];
    return [{ ...transition, startFrame: Math.min(transition.startFrame, startFrame), durationFrames: kept }];
  });
}

/** Ripple insertion of `spanFrames` at `atFrame`: items starting at or after it move later. */
export function transitionsAfterInsertion(list: readonly TimelineTransition[], atFrame: number, spanFrames: number): TimelineTransition[] {
  if (!spanFrames) return [...list];
  return list.map((transition) => (transition.startFrame >= atFrame ? { ...transition, startFrame: transition.startFrame + spanFrames } : transition));
}

/** A ripple retime changes the timeline length from `fromFrame` by `deltaFrames` (negative = shorter). */
export function transitionsAfterRetime(list: readonly TimelineTransition[], fromFrame: number, deltaFrames: number): TimelineTransition[] {
  if (deltaFrames < 0) return transitionsAfterRangeRemoval(list, fromFrame + deltaFrames, fromFrame);
  return transitionsAfterInsertion(list, fromFrame, deltaFrames);
}

/** Older documents: a spine clip's `properties.transIn` becomes a lane item centred on the cut it
 *  followed (same place and length as it played). The clip property is removed. */
export function withMigratedTransitions(document: EditorDocumentV2): EditorDocumentV2 {
  const fps = document.canvas.fps;
  const migrated: TimelineTransition[] = [];
  let changed = false;
  const tracks = document.timeline.tracks.map((track) => {
    if (!track.clips.some((clip) => clip.kind === 'narrative' && clip.properties.transIn)) return track;
    const ordered = [...track.clips].sort((left, right) => left.startFrame - right.startFrame);
    const clips = track.clips.map((clip) => {
      if (clip.kind !== 'narrative' || !clip.properties.transIn) return clip;
      changed = true;
      const { transIn, ...properties } = clip.properties;
      const index = ordered.findIndex((candidate) => candidate.id === clip.id);
      const previous = index > 0 ? ordered[index - 1] : undefined;
      const adjacent = previous && previous.id === transIn.prevId && previous.startFrame + previous.durationFrames === clip.startFrame;
      if (adjacent && isTransitionEffect(transIn.effect)) {
        const half = Math.max(1, Math.min(
          Math.round((Math.min(MAX_TRANSITION_SEC, transIn.durationSec) / 2) * fps),
          previous.durationFrames,
          clip.durationFrames,
        ));
        migrated.push({
          id: `transition_${clip.id}`,
          startFrame: Math.max(0, clip.startFrame - half),
          durationFrames: half * 2,
          effect: transIn.effect,
          ...(transIn.direction ? { direction: transIn.direction as TransitionDirection } : {}),
        });
      }
      return { ...clip, properties } as NarrativeTimelineClip;
    });
    return { ...track, clips };
  });
  if (!changed) return document;
  const existing = document.timeline.transitions ?? [];
  const known = new Set(existing.map((transition) => transition.id));
  return {
    ...document,
    timeline: { ...document.timeline, tracks, transitions: sortTransitions([...existing, ...migrated.filter((transition) => !known.has(transition.id))]) },
  };
}
