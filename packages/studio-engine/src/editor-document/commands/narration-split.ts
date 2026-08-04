import type { EditorDocumentV2 } from '../types';
import { narrativeAtTimelineSecond } from '../read-model';
import { applyEditorCommand } from './dispatcher';
import type { EditorCommandError, EditorCommandReceipt } from './types';

export type NarrationSplitCommandResult =
  | { ok: true; document: EditorDocumentV2; receipts: EditorCommandReceipt[] }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

export function normalizeNarrationSplitPoints(
  atSecs: readonly unknown[],
  maxPoints = Number.POSITIVE_INFINITY,
): number[] | { error: string } {
  if (!atSecs.length) return { error: 'pass atSec or atSecs' };
  if (atSecs.length > maxPoints) return { error: `split_shot supports at most ${maxPoints} points per call` };
  if (atSecs.some((atSec) => typeof atSec !== 'number' || !Number.isFinite(atSec))) {
    return { error: 'every split point must be a finite number' };
  }
  return [...new Set(atSecs as number[])].sort((left, right) => left - right);
}

/** Split at real V2 timeline seconds. Gaps are rejected instead of being compacted away. */
export function applyNarrationSplitCommands(
  document: EditorDocumentV2,
  atSecs: readonly unknown[],
): NarrationSplitCommandResult {
  const normalized = normalizeNarrationSplitPoints(atSecs);
  if ('error' in normalized) {
    return { ok: false, document, error: { code: 'invalid-range', message: normalized.error, path: 'atSecs' } };
  }
  const points = normalized;

  let current = document;
  const receipts: EditorCommandReceipt[] = [];
  for (const atSec of points) {
    const hit = narrativeAtTimelineSecond(current, atSec);
    if (!hit) {
      return { ok: false, document, error: { code: 'invalid-range', message: `Timeline split is in a gap or on a clip edge: ${atSec}`, path: 'atSecs' } };
    }
    const result = applyEditorCommand(current, {
      type: 'clip.split',
      trackId: current.semantics.primaryNarrativeTrackId,
      clipId: hit.clip.id,
      atFrame: hit.atFrame,
    });
    if (!result.ok) return { ok: false, document, error: result.error };
    current = result.document;
    receipts.push(result.receipt);
  }
  return { ok: true, document: current, receipts };
}
