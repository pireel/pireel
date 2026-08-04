import type { EditorDocumentV2 } from '../types';
import { secondsToTimelineFrames } from '../time';
import { applyEditorCommand } from './dispatcher';
import type { EditorCommandError, EditorCommandReceipt } from './types';

export interface NarrationSecondRange {
  fromSec: number;
  toSec: number;
}

export type NarrationRangeCommandResult =
  | {
      ok: true;
      document: EditorDocumentV2;
      receipts: EditorCommandReceipt[];
      removedFrames: number;
    }
  | {
      ok: false;
      document: EditorDocumentV2;
      error: EditorCommandError;
    };

/**
 * Atomic multi-range ripple edit on the semantic primary lane. Ranges are timeline seconds and are
 * applied back-to-front so earlier coordinates stay stable. Every touched sync-locked/linked lane
 * is handled by the same range command; a locked lane rejects the whole batch.
 */
export function applyNarrationRangeCommands(
  document: EditorDocumentV2,
  ranges: readonly NarrationSecondRange[],
): NarrationRangeCommandResult {
  const normalized = ranges
    .map((range) => ({
      startFrame: secondsToTimelineFrames(range.fromSec, document.canvas.fps),
      endFrame: secondsToTimelineFrames(range.toSec, document.canvas.fps),
    }))
    .filter((range) => range.startFrame >= 0 && range.endFrame > range.startFrame)
    .sort((left, right) => right.startFrame - left.startFrame || right.endFrame - left.endFrame);
  if (!normalized.length) {
    return {
      ok: false,
      document,
      error: { code: 'invalid-range', message: 'At least one non-empty narration range is required.', path: 'ranges' },
    };
  }

  let current = document;
  const receipts: EditorCommandReceipt[] = [];
  for (const range of normalized) {
    const result = applyEditorCommand(current, {
      type: 'range.remove',
      trackId: current.semantics.primaryNarrativeTrackId,
      startFrame: range.startFrame,
      endFrame: range.endFrame,
      mode: 'ripple',
      includeLinked: true,
    });
    if (!result.ok) return { ok: false, document, error: result.error };
    current = result.document;
    receipts.push(result.receipt);
  }
  return {
    ok: true,
    document: current,
    receipts,
    removedFrames: receipts.reduce((total, receipt) => total + (receipt.removedFrames ?? 0), 0),
  };
}
