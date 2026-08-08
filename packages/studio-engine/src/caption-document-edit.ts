/** Atomic managed-caption lifecycle over sparse appearance and a stable semantic lane. */

import type { AsrSegment } from './build-blocks';
import {
  clearManagedCaptionLayout,
  lockManagedCaptionLayout,
  remapCaptionCopyToManagedLayout,
} from './caption-layout-state';
import {
  applyEditorCommand,
  syncCaptionTranscripts,
  type CaptionStylePatch,
  type EditorCommandError,
  type EditorCommandReceipt,
  type EditorDocumentV2,
} from './editor-document';

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
    return { ok: true, document, receipts };
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
  return { ok: true, document: lockManagedCaptionLayout(document), receipts };
}
