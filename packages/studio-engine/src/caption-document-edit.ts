/** Atomic managed-caption lifecycle over sparse appearance and a stable semantic lane. */

import type { AsrSegment } from './build-blocks';
import {
  clearManagedCaptionLayout,
  lockManagedCaptionLayout,
  remapCaptionCopyToManagedLayout,
} from './caption-layout-state';
import {
  applyEditorCommand,
  secondsToTimelineFrames,
  syncCaptionTranscripts,
  type CaptionStylePatch,
  type EditorCommandError,
  type EditorCommandReceipt,
  type EditorDocumentV2,
} from './editor-document';

export type ManagedCaptionResizeResult =
  | { ok: true; document: EditorDocumentV2 }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

/** Trim one derived caption without mutating ASR word timing. The persisted offsets remain attached
 * to the source word range, so later narrative ripple edits move the customized caption with speech. */
export function resizeManagedCaptionTiming(
  document: EditorDocumentV2,
  clipId: string,
  edge: 'left' | 'right',
  atSec: number,
): ManagedCaptionResizeResult {
  const trackId = document.semantics.managedCaptionTrackId;
  const trackIndex = document.timeline.tracks.findIndex((track) => track.id === trackId);
  if (trackIndex < 0) {
    return { ok: false, document, error: { code: 'track-not-found', message: 'Managed caption track does not exist.', trackIds: trackId ? [trackId] : [] } };
  }
  const track = document.timeline.tracks[trackIndex]!;
  if (track.locked) {
    return { ok: false, document, error: { code: 'track-locked', message: `Track is locked: ${track.id}`, trackIds: [track.id] } };
  }
  const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
  const clip = track.clips[clipIndex];
  if (!clip || clip.kind !== 'caption' || !clip.managed) {
    return { ok: false, document, error: { code: 'clip-not-found', message: `Managed caption does not exist: ${clipId}` } };
  }
  if (!Number.isFinite(atSec)) {
    return { ok: false, document, error: { code: 'invalid-range', message: 'Caption trim time must be finite.' } };
  }

  const currentEndFrame = clip.startFrame + clip.durationFrames;
  const requestedFrame = secondsToTimelineFrames(Math.max(0, atSec), document.canvas.fps);
  const nextStartFrame = edge === 'left'
    ? Math.min(currentEndFrame - 1, requestedFrame)
    : clip.startFrame;
  const nextEndFrame = edge === 'right'
    ? Math.max(clip.startFrame + 1, requestedFrame)
    : currentEndFrame;
  if (nextStartFrame === clip.startFrame && nextEndFrame === currentEndFrame) {
    return { ok: true, document };
  }
  const prior = clip.timingOverride ?? { startOffsetFrames: 0, endOffsetFrames: 0 };
  const timingOverride = {
    startOffsetFrames: prior.startOffsetFrames + nextStartFrame - clip.startFrame,
    endOffsetFrames: prior.endOffsetFrames + nextEndFrame - currentEndFrame,
  };
  const clips = [...track.clips];
  clips[clipIndex] = {
    ...clip,
    startFrame: nextStartFrame,
    durationFrames: nextEndFrame - nextStartFrame,
    timingOverride,
  };
  const tracks = [...document.timeline.tracks];
  tracks[trackIndex] = { ...track, clips };
  return { ok: true, document: { ...document, timeline: { ...document.timeline, tracks } } };
}

export interface CaptionDocumentEditInput {
  document: EditorDocumentV2;
  patch?: CaptionStylePatch;
  /** Explicit user/agent action: discard the current cue boundaries and regenerate them from the
   *  current canvas/font metrics. Corrected caption copy is remapped onto the new ranges. */
  relayout?: boolean;
  /** Select any speech-bearing clip/track; omitted preserves the current selection. */
  source?:
    | { mode: 'auto' }
    | { mode: 'track'; trackId: string }
    | { mode: 'clip'; clipId: string };
  mainTranscript: readonly AsrSegment[] | null;
  clipTranscripts: Readonly<Record<string, readonly AsrSegment[]>>;
}

export type CaptionDocumentEditResult =
  | { ok: true; document: EditorDocumentV2; receipts: EditorCommandReceipt[] }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

/** Callers use reference identity as "nothing changed" (the workbench relays captions from a reactive
 * effect and publishes whenever the returned document differs). A pipeline stage that rebuilt the
 * document without changing its content must therefore hand back the caller's own object. */
function settleUnchanged(input: EditorDocumentV2, output: EditorDocumentV2): EditorDocumentV2 {
  if (output === input) return output;
  return JSON.stringify(output) === JSON.stringify(input) ? input : output;
}

function uniqueTrackId(document: EditorDocumentV2): string {
  const used = new Set(document.timeline.tracks.map((track) => track.id));
  const stem = 'track_managed_captions';
  let id = stem;
  let suffix = 2;
  while (used.has(id)) id = `${stem}_${suffix++}`;
  return id;
}

function captionsOn(document: EditorDocumentV2): boolean {
  const track = document.semantics.managedCaptionTrackId
    ? document.timeline.tracks.find((candidate) => candidate.id === document.semantics.managedCaptionTrackId)
    : undefined;
  return document.appearance.captionStyle?.on ?? Boolean(track?.clips.length);
}

/**
 * Sync transcript truth, ensure the semantic lane when enabling, patch sparse style and either relay
 * or clear managed clips. Callers publish only the final document, so a locked lane rolls back style,
 * transcript sync and provisional lane creation together.
 */
export function applyCaptionDocumentEdit(input: CaptionDocumentEditInput): CaptionDocumentEditResult {
  // Existing managed clips are already user-visible layout truth. Snapshot them before any style
  // patch so drafts created before cueLayout was introduced do not silently reflow on first touch.
  let document = lockManagedCaptionLayout(syncCaptionTranscripts(input.document, input.mainTranscript, input.clipTranscripts));
  const receipts: EditorCommandReceipt[] = [];
  const nextOn = input.patch?.on ?? captionsOn(document);
  if (nextOn && !document.semantics.managedCaptionTrackId) {
    const inserted = applyEditorCommand(document, {
      type: 'track.insert',
      track: {
        id: uniqueTrackId(document),
        type: 'caption',
        role: 'managedCaptions',
        name: 'Managed captions',
        syncLocked: true,
        stackOrder: document.timeline.tracks.reduce((max, track) => Math.max(max, track.stackOrder), 0) + 1,
      },
    });
    if (!inserted.ok) return { ok: false, document: input.document, error: inserted.error };
    document = inserted.document;
    receipts.push(inserted.receipt);
  }
  if (input.patch && Object.keys(input.patch).length) {
    const styled = applyEditorCommand(document, { type: 'captions.style', patch: input.patch });
    if (!styled.ok) return { ok: false, document: input.document, error: styled.error };
    document = styled.document;
    receipts.push(styled.receipt);
  }

  const trackId = document.semantics.managedCaptionTrackId;
  const track = trackId ? document.timeline.tracks.find((candidate) => candidate.id === trackId) : undefined;
  if (!nextOn) {
    if (track?.clips.length) {
      const removed = applyEditorCommand(document, {
        type: 'clips.remove',
        trackId: track.id,
        clipIds: track.clips.map((clip) => clip.id),
        includeLinked: false,
      });
      if (!removed.ok) return { ok: false, document: input.document, error: removed.error };
      document = removed.document;
      receipts.push(removed.receipt);
    }
    return { ok: true, document: settleUnchanged(input.document, document), receipts };
  }

  if (input.relayout) document = clearManagedCaptionLayout(document);
  const relaid = applyEditorCommand(document, { type: 'captions.relay', ...(input.source ? { source: input.source } : {}) });
  if (!relaid.ok) return { ok: false, document: input.document, error: relaid.error };
  document = relaid.document;
  receipts.push(relaid.receipt);
  if (input.relayout) {
    document = remapCaptionCopyToManagedLayout(document);
    const copyRelaid = applyEditorCommand(document, { type: 'captions.relay', ...(input.source ? { source: input.source } : {}) });
    if (!copyRelaid.ok) return { ok: false, document: input.document, error: copyRelaid.error };
    document = copyRelaid.document;
    receipts.push(copyRelaid.receipt);
  }
  return { ok: true, document: settleUnchanged(input.document, lockManagedCaptionLayout(document)), receipts };
}
