/** Native bulk transaction for an AI-generated storyboard draft. */

import type { Composition } from './composition-core';
import {
  applyEditorCommand,
  type EditorCommandError,
  type EditorDocumentV2,
  type EditorMediaAsset,
  type EditorTrack,
  type TimelineClip,
} from './editor-document';
import { compositionToEditorDocument } from './project-document';

export interface GeneratedDraftDocumentEditInput {
  projectId: string;
  document: EditorDocumentV2;
  draft: Composition;
  plan?: unknown;
}

export type GeneratedDraftDocumentEditResult =
  | { ok: true; document: EditorDocumentV2 }
  | { ok: false; document: EditorDocumentV2; error: EditorCommandError };

function failure(
  document: EditorDocumentV2,
  code: EditorCommandError['code'],
  message: string,
  details: Pick<EditorCommandError, 'path' | 'trackIds'> = {},
): Extract<GeneratedDraftDocumentEditResult, { ok: false }> {
  return { ok: false, document, error: { code, message, ...details } };
}

function sameAssetIdentity(left: EditorMediaAsset, right: EditorMediaAsset): boolean {
  if (left.kind !== right.kind) return false;
  return Boolean(
    (left.locator.localSig && left.locator.localSig === right.locator.localSig)
    || (left.locator.cloudKey && left.locator.cloudKey === right.locator.cloudKey)
    || (left.locator.remoteUrl && left.locator.remoteUrl === right.locator.remoteUrl),
  );
}

function clipAssetId(clip: TimelineClip | undefined): string | undefined {
  return clip && 'assetId' in clip ? clip.assetId : undefined;
}

function uniqueAssetId(preferred: string, used: ReadonlySet<string>): string {
  let id = preferred;
  let suffix = 2;
  while (used.has(id)) id = `${preferred}_${suffix++}`;
  return id;
}

function remapClipAsset(clip: TimelineClip, assetId: string | undefined): TimelineClip {
  if (!('assetId' in clip) || !assetId) return clip;
  return { ...clip, assetId } as TimelineClip;
}

/**
 * Replace only the domains owned by storyboard generation: the primary narrative contents,
 * graphics contents, canvas and appearance. Native B-roll/audio/caption lanes, empty custom
 * lanes, lane flags and durable asset identities remain owned by the current V2 document.
 */
export function applyGeneratedDraftDocument(input: GeneratedDraftDocumentEditInput): GeneratedDraftDocumentEditResult {
  const original = input.document;
  const imported = compositionToEditorDocument({
    projectId: input.projectId,
    composition: input.draft,
    fps: original.canvas.fps,
  }).document;
  const currentPrimary = original.timeline.tracks.find((track) => track.id === original.semantics.primaryNarrativeTrackId);
  const importedPrimary = imported.timeline.tracks.find((track) => track.id === imported.semantics.primaryNarrativeTrackId);
  if (!currentPrimary || !importedPrimary) {
    return failure(original, 'primary-track-required', 'Generated draft requires the primary narrative lane.');
  }

  const currentGraphics = original.timeline.tracks.filter((track) => track.type === 'graphics');
  const importedGraphics = imported.timeline.tracks.filter((track) => track.type === 'graphics');
  const changedLocked = [currentPrimary, ...currentGraphics]
    .filter((track) => track.locked && (track.id === currentPrimary.id || track.clips.length > 0 || importedGraphics.some((candidate) => candidate.stackOrder === track.stackOrder)))
    .map((track) => track.id);
  if (changedLocked.length) {
    return failure(original, 'track-locked', `Generated storyboard touches locked track(s): ${changedLocked.join(', ')}`, { trackIds: changedLocked });
  }

  const currentClipById = new Map(original.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, clip] as const)));
  const assetMap = new Map<string, string>();
  const importedPrimaryAssetId = imported.semantics.primaryNarrativeAssetId;
  if (importedPrimaryAssetId && original.semantics.primaryNarrativeAssetId) {
    assetMap.set(importedPrimaryAssetId, original.semantics.primaryNarrativeAssetId);
  }
  for (const track of imported.timeline.tracks) {
    for (const clip of track.clips) {
      const incomingAssetId = clipAssetId(clip);
      const priorAssetId = clipAssetId(currentClipById.get(clip.id));
      if (incomingAssetId && priorAssetId && !assetMap.has(incomingAssetId)) assetMap.set(incomingAssetId, priorAssetId);
    }
  }
  for (const [incomingId, incoming] of Object.entries(imported.assets)) {
    if (assetMap.has(incomingId)) continue;
    const same = Object.values(original.assets).find((asset) => sameAssetIdentity(asset, incoming));
    if (same) assetMap.set(incomingId, same.id);
  }

  const assets = { ...original.assets };
  const usedAssetIds = new Set(Object.keys(assets));
  for (const [incomingId, incoming] of Object.entries(imported.assets)) {
    if (assetMap.has(incomingId)) continue;
    const targetId = usedAssetIds.has(incomingId) ? uniqueAssetId(incomingId, usedAssetIds) : incomingId;
    usedAssetIds.add(targetId);
    assetMap.set(incomingId, targetId);
    assets[targetId] = targetId === incoming.id ? incoming : { ...incoming, id: targetId };
  }
  const remapClip = (clip: TimelineClip): TimelineClip => {
    const incomingAssetId = clipAssetId(clip);
    return remapClipAsset(clip, incomingAssetId ? assetMap.get(incomingAssetId) : undefined);
  };

  const unusedImportedGraphics = [...importedGraphics];
  const tracks: EditorTrack[] = original.timeline.tracks.map((track): EditorTrack => {
    if (track.id === currentPrimary.id) {
      return { ...track, clips: importedPrimary.clips.map(remapClip) };
    }
    if (track.type !== 'graphics') return track;
    const exactIndex = unusedImportedGraphics.findIndex((candidate) => candidate.id === track.id);
    const stackIndex = exactIndex >= 0
      ? exactIndex
      : unusedImportedGraphics.findIndex((candidate) => candidate.stackOrder === track.stackOrder);
    const replacement = stackIndex >= 0 ? unusedImportedGraphics.splice(stackIndex, 1)[0] : undefined;
    return { ...track, clips: replacement ? replacement.clips.map(remapClip) : [] };
  });
  const usedTrackIds = new Set(tracks.map((track) => track.id));
  for (const importedTrack of unusedImportedGraphics) {
    let id = importedTrack.id;
    let suffix = 2;
    while (usedTrackIds.has(id)) id = `${importedTrack.id}_${suffix++}`;
    usedTrackIds.add(id);
    tracks.push({ ...importedTrack, id, clips: importedTrack.clips.map(remapClip) });
  }

  const transcripts = { ...original.semantics.transcripts };
  for (const [incomingId, transcript] of Object.entries(imported.semantics.transcripts)) {
    const targetId = assetMap.get(incomingId);
    if (targetId) transcripts[targetId] = transcript;
  }
  const primaryNarrativeAssetId = importedPrimaryAssetId
    ? assetMap.get(importedPrimaryAssetId)
    : original.semantics.primaryNarrativeAssetId;
  let next: EditorDocumentV2 = {
    ...original,
    canvas: { ...imported.canvas, fps: original.canvas.fps },
    appearance: imported.appearance,
    assets,
    timeline: { tracks },
    semantics: {
      ...original.semantics,
      primaryNarrativeTrackId: currentPrimary.id,
      ...(primaryNarrativeAssetId ? { primaryNarrativeAssetId } : {}),
      transcripts,
      scenes: imported.semantics.scenes,
      ...(input.plan !== undefined ? { plan: input.plan } : {}),
    },
  };
  const relaid = applyEditorCommand(next, { type: 'captions.relay' });
  if (!relaid.ok) return { ok: false, document: original, error: relaid.error };
  next = relaid.document;
  return { ok: true, document: next };
}
