import { CUT_TRANSITION_EFFECTS, MAX_TRANSITION_SEC, type CutTransitionEffect, type TransitionDirection } from '../composition-core';
import { primaryNarrativeTrack } from './create';
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

/** A cut on the story spine: two enabled primary-lane clips meeting at `frame` (the rule
 *  `transitionWindows` hands over at). `from`/`to` bound the two clips, so a window stays on them. */
export interface SpineCut {
  frame: number;
  from: number;
  to: number;
}

export function spineCuts(document: EditorDocumentV2): SpineCut[] {
  const clips = (primaryNarrativeTrack(document)?.clips ?? [])
    .filter((clip) => clip.kind === 'narrative' && clip.enabled)
    .sort((left, right) => left.startFrame - right.startFrame);
  const cuts: SpineCut[] = [];
  for (let index = 1; index < clips.length; index++) {
    const previous = clips[index - 1]!;
    const clip = clips[index]!;
    if (previous.startFrame + previous.durationFrames === clip.startFrame) {
      cuts.push({ frame: clip.startFrame, from: previous.startFrame, to: clip.startFrame + clip.durationFrames });
    }
  }
  return cuts;
}

/** The spine cut a transition hands over at: strictly inside it, the one nearest its middle. */
export function transitionCut(cuts: readonly SpineCut[], transition: TimelineTransition): SpineCut | null {
  const middle = transition.startFrame + transition.durationFrames / 2;
  return cuts
    .filter((cut) => cut.frame > transition.startFrame && cut.frame < transitionEnd(transition))
    .reduce<SpineCut | null>((best, cut) => (!best || Math.abs(cut.frame - middle) < Math.abs(best.frame - middle) ? cut : best), null);
}

export type TransitionAtCut =
  | { kind: 'insert'; startFrame: number; durationFrames: number }
  /** `timing` is set when the one already there only touched the cut and gets re-centred on it. */
  | { kind: 'replace'; id: string; timing?: { startFrame: number; durationFrames: number } }
  | { kind: 'none'; reason: 'no-cut' | 'no-room' };

/** Where a transition picked at `atFrame` goes: centred on the spine cut nearest to it, clamped to
 *  the two clips and the neighbouring transitions. A transition already on that cut is replaced. */
export function transitionAtNearestCut(document: EditorDocumentV2, atFrame: number, wantedFrames = Math.round(DEFAULT_TRANSITION_SEC * document.canvas.fps)): TransitionAtCut {
  const cut = spineCuts(document).reduce<SpineCut | null>(
    (best, candidate) => (!best || Math.abs(candidate.frame - atFrame) < Math.abs(best.frame - atFrame) ? candidate : best),
    null,
  );
  if (!cut) return { kind: 'none', reason: 'no-cut' };
  const list = document.timeline.transitions ?? [];
  const onCut = list.filter((transition) => transition.startFrame <= cut.frame && transitionEnd(transition) >= cut.frame);
  const existing = onCut.find((transition) => transition.startFrame < cut.frame && transitionEnd(transition) > cut.frame) ?? onCut[0];
  const others = list.filter((transition) => transition !== existing);
  const left = Math.max(cut.from, ...others.filter((transition) => transitionEnd(transition) <= cut.frame).map(transitionEnd));
  const right = Math.min(cut.to, ...others.filter((transition) => transition.startFrame >= cut.frame).map((transition) => transition.startFrame));
  const centred = (frames: number) => {
    const before = Math.min(Math.floor(frames / 2), cut.frame - left);
    const after = Math.min(frames - Math.floor(frames / 2), right - cut.frame);
    return before >= 1 && after >= 1 ? { startFrame: cut.frame - before, durationFrames: before + after } : null;
  };
  if (existing) {
    if (existing.startFrame < cut.frame && transitionEnd(existing) > cut.frame) return { kind: 'replace', id: existing.id };
    const timing = centred(Math.max(2, existing.durationFrames));
    return timing ? { kind: 'replace', id: existing.id, timing } : { kind: 'none', reason: 'no-room' };
  }
  const timing = centred(Math.max(2, wantedFrames));
  return timing ? { kind: 'insert', ...timing } : { kind: 'none', reason: 'no-room' };
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
