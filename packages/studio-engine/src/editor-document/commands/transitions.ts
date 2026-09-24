import type { EditorDocumentV2, TimelineTransition } from '../types';
import { isTransitionEffect, maxTransitionFrames, sortTransitions, transitionEnd } from '../transitions';
import { commandFailure, emptyCommandReceipt, type EditorCommandResult } from './types';

export type TransitionPatch = Partial<Pick<TimelineTransition, 'startFrame' | 'durationFrames' | 'effect' | 'direction'>>;

function transitionIssue(document: EditorDocumentV2, transition: TimelineTransition, others: readonly TimelineTransition[]): string | null {
  if (!transition.id) return 'Transition id is required.';
  if (!isTransitionEffect(transition.effect)) return `Unknown transition effect: ${String(transition.effect)}`;
  if (!Number.isInteger(transition.startFrame) || transition.startFrame < 0) return 'Transition start must be a non-negative integer frame.';
  if (!Number.isInteger(transition.durationFrames) || transition.durationFrames < 1) return 'Transition length must be at least one frame.';
  if (transition.durationFrames > maxTransitionFrames(document.canvas.fps)) return `Transition length exceeds ${maxTransitionFrames(document.canvas.fps)} frames.`;
  const clash = others.find((other) => other.startFrame < transitionEnd(transition) && transition.startFrame < transitionEnd(other));
  if (clash) return `Transition overlaps ${clash.id} (${clash.startFrame}–${transitionEnd(clash)}).`;
  return null;
}

function withTransitions(document: EditorDocumentV2, transitions: TimelineTransition[]): EditorDocumentV2 {
  return { ...document, timeline: { ...document.timeline, transitions: sortTransitions(transitions) } };
}

export function insertTransition(document: EditorDocumentV2, transition: TimelineTransition): EditorCommandResult {
  const list = document.timeline.transitions ?? [];
  if (list.some((other) => other.id === transition.id)) return commandFailure(document, 'invalid-command', `Transition already exists: ${transition.id}`, { path: 'transition.id' });
  const issue = transitionIssue(document, transition, list);
  if (issue) return commandFailure(document, 'invalid-command', issue, { path: 'transition' });
  return { ok: true, document: withTransitions(document, [...list, transition]), receipt: { ...emptyCommandReceipt('transitions.insert'), createdClipIds: [transition.id] } };
}

export function patchTransition(document: EditorDocumentV2, id: string, patch: TransitionPatch): EditorCommandResult {
  const list = document.timeline.transitions ?? [];
  const current = list.find((transition) => transition.id === id);
  if (!current) return commandFailure(document, 'clip-not-found', `Transition does not exist: ${id}`, { path: 'id' });
  const next: TimelineTransition = { ...current, ...patch };
  if (patch.direction === undefined && 'direction' in patch) delete next.direction;
  const issue = transitionIssue(document, next, list.filter((transition) => transition.id !== id));
  if (issue) return commandFailure(document, 'invalid-command', issue, { path: 'patch' });
  return { ok: true, document: withTransitions(document, list.map((transition) => (transition.id === id ? next : transition))), receipt: { ...emptyCommandReceipt('transitions.patch'), shiftedClipIds: [id] } };
}

export function removeTransitions(document: EditorDocumentV2, ids: readonly string[]): EditorCommandResult {
  const list = document.timeline.transitions ?? [];
  const missing = ids.filter((id) => !list.some((transition) => transition.id === id));
  if (missing.length) return commandFailure(document, 'clip-not-found', `Transition does not exist: ${missing.join(', ')}`, { path: 'ids' });
  const wanted = new Set(ids);
  return { ok: true, document: withTransitions(document, list.filter((transition) => !wanted.has(transition.id))), receipt: { ...emptyCommandReceipt('transitions.remove'), removedClipIds: [...ids] } };
}
