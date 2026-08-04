import type { EditorDocumentV2, NarrativeTimelineClip } from '../types';
import type { VideoShot } from '../../composition-core';
import { spans } from '../../trim';
import { applyEditorCommand } from './dispatcher';
import type { EditorCommandError, EditorCommandReceipt } from './types';

export interface NarrationSourceSplit {
  clipId: string;
  sourceSec: number;
}

export type NarrationSplitCommandResult =
  | { ok: true; document: EditorDocumentV2; receipts: EditorCommandReceipt[] }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

/** Maps the gapless compatibility timeline back to stable clip lineage and source time. */
export function narrationSourceSplitsAtEditedPoints(
  shots: VideoShot[],
  atSecs: readonly number[],
): NarrationSourceSplit[] | null {
  const timeline = spans(shots);
  const requests: NarrationSourceSplit[] = [];
  for (const atSec of atSecs) {
    const span = timeline.find((candidate) =>
      atSec > candidate.editedStart + 1e-6 && atSec < candidate.editedEnd - 1e-6,
    );
    if (!span) return null;
    requests.push({
      clipId: span.clip.id,
      sourceSec: span.clip.srcStart + (atSec - span.editedStart),
    });
  }
  return requests;
}

function narrativeClips(document: EditorDocumentV2): NarrativeTimelineClip[] {
  const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  return (primary?.clips ?? []).filter((clip): clip is NarrativeTimelineClip => clip.kind === 'narrative');
}

/** Resolve compatibility-surface split points by durable clip lineage and source seconds. */
export function applyNarrationSplitCommands(
  document: EditorDocumentV2,
  splits: readonly NarrationSourceSplit[],
): NarrationSplitCommandResult {
  if (!splits.length || splits.some((split) => !Number.isFinite(split.sourceSec))) {
    return { ok: false, document, error: { code: 'invalid-range', message: 'At least one finite narration source split is required.', path: 'splits' } };
  }
  const roots = new Map<string, { assetId: string; lineage: string }>();
  for (const split of splits) {
    const clip = narrativeClips(document).find((candidate) => candidate.id === split.clipId);
    if (!clip) return { ok: false, document, error: { code: 'clip-not-found', message: `Narration clip does not exist: ${split.clipId}`, path: 'splits.clipId' } };
    roots.set(split.clipId, { assetId: clip.assetId, lineage: clip.id });
  }

  let current = document;
  const receipts: EditorCommandReceipt[] = [];
  for (const split of splits) {
    const root = roots.get(split.clipId)!;
    const clip = narrativeClips(current).find((candidate) =>
      candidate.assetId === root.assetId
      && (candidate.id === root.lineage || candidate.id.startsWith(`${root.lineage}~split-`))
      && split.sourceSec > candidate.sourceInSec + 1e-6
      && split.sourceSec < candidate.sourceOutSec - 1e-6,
    );
    if (!clip) return { ok: false, document, error: { code: 'invalid-range', message: `Source split is outside the surviving clip: ${split.clipId}@${split.sourceSec}`, path: 'splits.sourceSec' } };
    const sourceRatio = (split.sourceSec - clip.sourceInSec) / (clip.sourceOutSec - clip.sourceInSec);
    const atFrame = clip.startFrame + Math.round(sourceRatio * clip.durationFrames);
    const result = applyEditorCommand(current, {
      type: 'clip.split',
      trackId: current.semantics.primaryNarrativeTrackId,
      clipId: clip.id,
      atFrame,
    });
    if (!result.ok) return { ok: false, document, error: result.error };
    current = result.document;
    receipts.push(result.receipt);
  }
  return { ok: true, document: current, receipts };
}
