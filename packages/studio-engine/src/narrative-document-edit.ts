/** Native primary-narrative insertion and ordering transactions. */

import type { VideoShot } from './composition-core';
import {
  applyEditorCommand,
  positiveDurationFrames,
  secondsToTimelineFrames,
  type EditorCommandError,
  type EditorCommandReceipt,
  type EditorDocumentV2,
  type EditorMediaAsset,
  type NarrativeTimelineClip,
  type NarrativeProperties,
} from './editor-document';

export type NarrativeStructureEditResult =
  | { ok: true; document: EditorDocumentV2; receipts: EditorCommandReceipt[]; clipId?: string; assetId?: string }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

export interface AddNarrativeDocumentClipInput {
  document: EditorDocumentV2;
  shot: VideoShot;
  atSec: number;
  sourceWidth?: number;
  sourceHeight?: number;
  configureCanvas?: boolean;
  mode?: 'ripple' | 'overwrite';
}

export interface InsertNarrativeAssetRangeInput {
  document: EditorDocumentV2;
  assetId: string;
  clipId: string;
  atSec: number;
  sourceInSec: number;
  sourceOutSec: number;
  properties: NarrativeProperties;
}

function failure(
  document: EditorDocumentV2,
  code: EditorCommandError['code'],
  message: string,
  path?: string,
): Extract<NarrativeStructureEditResult, { ok: false }> {
  return { ok: false, document, error: { code, message, ...(path ? { path } : {}) } };
}

function uniqueId(base: string, used: ReadonlySet<string>): string {
  const stem = base.replace(/[^a-zA-Z0-9_-]+/g, '_') || 'narrative';
  let id = stem;
  let suffix = 2;
  while (used.has(id)) id = `${stem}_${suffix++}`;
  return id;
}

function durableLocator(shot: VideoShot): EditorMediaAsset['locator'] {
  return {
    ...(shot.srcSig ? { localSig: shot.srcSig } : {}),
    ...(shot.src && !/^(?:blob|data):/i.test(shot.src) ? { remoteUrl: shot.src } : {}),
  };
}

function existingAsset(document: EditorDocumentV2, shot: VideoShot): EditorMediaAsset | undefined {
  return Object.values(document.assets).find((asset) => asset.kind === 'video' && (
    (shot.srcSig && asset.locator.localSig === shot.srcSig)
    || (shot.src && !/^(?:blob|data):/i.test(shot.src) && asset.locator.remoteUrl === shot.src)
  ));
}

function narrativeProperties(shot: VideoShot): NarrativeTimelineClip['properties'] {
  const {
    id: _id, src: _src, srcSig: _srcSig, srcStart: _srcStart, srcEnd: _srcEnd,
    ...properties
  } = shot;
  return properties;
}

/** Add one equal-standing source and ripple every sync-locked lane in a single publish transaction. */
export function addNarrativeDocumentClip(input: AddNarrativeDocumentClipInput): NarrativeStructureEditResult {
  if (!input.shot.id.trim()) return failure(input.document, 'invalid-command', 'Narrative clip id is required.', 'shot.id');
  if (!input.shot.src?.trim()) return failure(input.document, 'invalid-command', 'Inserted narrative source is required.', 'shot.src');
  if (!Number.isFinite(input.atSec) || input.atSec < 0) return failure(input.document, 'invalid-range', 'Narrative insert time must be non-negative.', 'atSec');
  const durationSec = input.shot.srcEnd - input.shot.srcStart;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return failure(input.document, 'invalid-range', 'Narrative source range must be positive.', 'shot');
  const locator = durableLocator(input.shot);
  if (!locator.localSig && !locator.cloudKey && !locator.remoteUrl) {
    return failure(input.document, 'invalid-command', 'Narrative source needs a durable local signature or remote URL.', 'shot.src');
  }

  let document = input.document;
  const receipts: EditorCommandReceipt[] = [];
  const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  const firstSource = !primary?.clips.length && !document.semantics.primaryNarrativeAssetId;
  if (firstSource && input.configureCanvas !== false && input.sourceWidth && input.sourceHeight) {
    const canvas = applyEditorCommand(document, { type: 'canvas.patch', patch: { width: input.sourceWidth, height: input.sourceHeight } });
    if (!canvas.ok) return { ok: false, document: input.document, error: canvas.error };
    document = canvas.document;
    receipts.push(canvas.receipt);
  }

  const reused = existingAsset(document, input.shot);
  const assetId = reused?.id ?? uniqueId(`asset_video_${input.shot.id}`, new Set(Object.keys(document.assets)));
  const asset: EditorMediaAsset | undefined = reused ? undefined : {
    id: assetId,
    kind: 'video',
    label: input.shot.srcSig ?? 'Narrative source',
    locator,
    metadata: {
      durationSec: input.shot.srcEnd,
      ...(input.sourceWidth ? { width: input.sourceWidth } : {}),
      ...(input.sourceHeight ? { height: input.sourceHeight } : {}),
      hasAudio: true,
    },
  };
  const clip: Omit<NarrativeTimelineClip, 'startFrame'> = {
    id: input.shot.id,
    kind: 'narrative',
    assetId,
    durationFrames: positiveDurationFrames(durationSec, document.canvas.fps),
    enabled: true,
    sourceInSec: input.shot.srcStart,
    sourceOutSec: input.shot.srcEnd,
    properties: narrativeProperties(input.shot),
  };
  const inserted = applyEditorCommand(document, {
    type: 'narrative.insert',
    atFrame: secondsToTimelineFrames(input.atSec, document.canvas.fps),
    clip,
    ...(asset ? { asset } : {}),
    ...(input.mode ? { mode: input.mode } : {}),
  });
  if (!inserted.ok) return { ok: false, document: input.document, error: inserted.error };
  const captions = applyEditorCommand(inserted.document, { type: 'captions.relay' });
  if (!captions.ok) return { ok: false, document: input.document, error: captions.error };
  return {
    ok: true,
    document: captions.document,
    receipts: [...receipts, inserted.receipt, captions.receipt],
    clipId: clip.id,
    assetId,
  };
}

/** Restore/place a range from an asset already owned by the document. */
export function insertNarrativeAssetRange(input: InsertNarrativeAssetRangeInput): NarrativeStructureEditResult {
  const asset = input.document.assets[input.assetId];
  if (!asset || asset.kind !== 'video') return failure(input.document, 'invalid-command', `Narrative video asset does not exist: ${input.assetId}`, 'assetId');
  if (!input.clipId.trim()) return failure(input.document, 'invalid-command', 'Narrative clip id is required.', 'clipId');
  if (!Number.isFinite(input.atSec) || input.atSec < 0) return failure(input.document, 'invalid-range', 'Narrative insert time must be non-negative.', 'atSec');
  const durationSec = input.sourceOutSec - input.sourceInSec;
  if (!Number.isFinite(durationSec) || durationSec <= 0) return failure(input.document, 'invalid-range', 'Narrative source range must be positive.', 'sourceRange');
  const inserted = applyEditorCommand(input.document, {
    type: 'narrative.insert',
    atFrame: secondsToTimelineFrames(input.atSec, input.document.canvas.fps),
    clip: {
      id: input.clipId,
      kind: 'narrative',
      assetId: input.assetId,
      durationFrames: positiveDurationFrames(durationSec, input.document.canvas.fps),
      enabled: true,
      sourceInSec: input.sourceInSec,
      sourceOutSec: input.sourceOutSec,
      properties: input.properties,
    },
  });
  if (!inserted.ok) return { ok: false, document: input.document, error: inserted.error };
  const captions = applyEditorCommand(inserted.document, { type: 'captions.relay' });
  if (!captions.ok) return { ok: false, document: input.document, error: captions.error };
  return { ok: true, document: captions.document, receipts: [inserted.receipt, captions.receipt], clipId: input.clipId, assetId: input.assetId };
}

/** Reorder stable narrative identities and relay managed captions atomically. */
export function reorderNarrativeDocumentClips(
  document: EditorDocumentV2,
  clipIds: readonly string[],
): NarrativeStructureEditResult {
  const reordered = applyEditorCommand(document, { type: 'narrative.reorder', clipIds: [...clipIds] });
  if (!reordered.ok) return { ok: false, document, error: reordered.error };
  const captions = applyEditorCommand(reordered.document, { type: 'captions.relay' });
  if (!captions.ok) return { ok: false, document, error: captions.error };
  return { ok: true, document: captions.document, receipts: [reordered.receipt, captions.receipt] };
}
