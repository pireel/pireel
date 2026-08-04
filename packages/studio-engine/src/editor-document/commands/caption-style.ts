import { CAPTION_PRESETS } from '../../caption-presets';
import type { CaptionStyle } from '../../composition-core';
import type { EditorDocumentV2 } from '../types';
import { validateEditorDocumentV2 } from '../validation';
import { commandFailure, emptyCommandReceipt, type CaptionStylePatch, type EditorCommandResult } from './types';

const presetIds = new Set(CAPTION_PRESETS.map((preset) => preset.id));

function patchError(patch: CaptionStylePatch): string | null {
  if (!Object.keys(patch).length) return 'Caption style patch is empty.';
  if (patch.preset != null && !presetIds.has(patch.preset)) return `Unknown caption preset: ${patch.preset}`;
  if (patch.on != null && typeof patch.on !== 'boolean') return 'Caption on must be boolean.';
  for (const key of ['yPct', 'xPct', 'wPct', 'scale', 'hPct'] as const) {
    if (patch[key] != null && !Number.isFinite(patch[key])) return `Caption ${key} must be finite.`;
  }
  if (patch.sub != null && (typeof patch.sub !== 'object' || Array.isArray(patch.sub))) return 'Caption sub style must be an object.';
  if (patch.sub?.preset != null && !presetIds.has(patch.sub.preset)) return `Unknown subtitle preset: ${patch.sub.preset}`;
  return null;
}

function mergedStyle(current: Partial<CaptionStyle> | undefined, patch: CaptionStylePatch): Partial<CaptionStyle> {
  const next: Partial<CaptionStyle> = { ...(current ?? {}), ...patch };
  for (const key of Object.keys(patch) as (keyof CaptionStyle)[]) {
    if (patch[key] === undefined) delete next[key];
  }
  return next;
}

/** Patch sparse global caption appearance without rebuilding or reindexing its semantic lane. */
export function patchCaptionStyle(document: EditorDocumentV2, patch: CaptionStylePatch): EditorCommandResult {
  const issue = validateEditorDocumentV2(document).find((candidate) => candidate.severity === 'error');
  if (issue) return commandFailure(document, 'invalid-document', issue.message, { path: issue.path });
  const invalid = patchError(patch);
  if (invalid) return commandFailure(document, 'invalid-command', invalid, { path: 'patch' });
  const track = document.semantics.managedCaptionTrackId
    ? document.timeline.tracks.find((candidate) => candidate.id === document.semantics.managedCaptionTrackId)
    : undefined;
  if (track?.locked) return commandFailure(document, 'track-locked', `Track is locked: ${track.id}`, { trackIds: [track.id] });
  const current = document.appearance.captionStyle;
  const captionStyle = mergedStyle(current, patch);
  if (JSON.stringify(current ?? {}) === JSON.stringify(captionStyle)) {
    return { ok: true, document, receipt: emptyCommandReceipt('captions.style') };
  }
  const next: EditorDocumentV2 = {
    ...document,
    appearance: { ...document.appearance, captionStyle },
  };
  const receipt = emptyCommandReceipt('captions.style');
  if (track) receipt.affectedTrackIds = [track.id];
  return { ok: true, document: next, receipt };
}
