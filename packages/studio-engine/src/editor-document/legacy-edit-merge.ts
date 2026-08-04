/**
 * Reconcile an edit made through the temporary Composition projection with its V2 authority.
 *
 * Composition cannot express empty/custom tracks, media clips, track flags, anchors, scene
 * membership or narrative gaps. A full V1 remigration would therefore erase valid V2 state on
 * the next legacy panel edit. This module treats the projection as a patch surface: visible clips
 * may be added/changed/removed, while information absent from that surface stays owned by V2.
 */

import type { AudioClip } from '../audio-tracks';
import type { Block, Composition, VideoShot } from '../composition-core';
import { projectV2ToLegacyComposition } from './legacy-projection';
import type {
  EditorDocumentV2,
  EditorMediaAsset,
  EditorTrack,
  TimelineClip,
} from './types';

type LegacyItem = VideoShot | Block | AudioClip;

interface LegacyProjectionItems {
  byId: Map<string, LegacyItem>;
  visibleIds: Set<string>;
}

function legacyProjectionItems(composition: Composition): LegacyProjectionItems {
  const byId = new Map<string, LegacyItem>();
  for (const shot of composition.shots ?? []) byId.set(shot.id, shot);
  for (const block of composition.blocks ?? []) byId.set(block.id, block);
  for (const audio of composition.audioTracks ?? []) byId.set(audio.id, audio);
  return { byId, visibleIds: new Set(byId.keys()) };
}

function sameLegacyItem(left: LegacyItem | undefined, right: LegacyItem | undefined): boolean {
  return left !== undefined && right !== undefined && JSON.stringify(left) === JSON.stringify(right);
}

function sameAssetIdentity(left: EditorMediaAsset | undefined, right: EditorMediaAsset | undefined): boolean {
  if (!left || !right || left.kind !== right.kind) return false;
  const a = left.locator;
  const b = right.locator;
  return !!(
    (a.localSig && a.localSig === b.localSig)
    || (a.cloudKey && a.cloudKey === b.cloudKey)
    || (a.remoteUrl && a.remoteUrl === b.remoteUrl)
  );
}

function clipAssetId(clip: TimelineClip): string | undefined {
  return 'assetId' in clip ? clip.assetId : undefined;
}

/** Preserve fields which V1 has no vocabulary for even when it changes a visible clip. */
function mergeVisibleClip(
  previousDocument: EditorDocumentV2,
  migratedDocument: EditorDocumentV2,
  previous: TimelineClip | undefined,
  migrated: TimelineClip,
): TimelineClip {
  if (!previous || previous.kind !== migrated.kind) return migrated;
  let assetId = clipAssetId(migrated);
  const previousAssetId = clipAssetId(previous);
  if (assetId && previousAssetId && sameAssetIdentity(previousDocument.assets[previousAssetId], migratedDocument.assets[assetId])) {
    assetId = previousAssetId;
  }
  const opaque = {
    enabled: previous.enabled,
    ...(previous.linkGroupId ? { linkGroupId: previous.linkGroupId } : {}),
  };
  switch (migrated.kind) {
    case 'narrative':
      return { ...migrated, ...opaque, assetId: assetId! };
    case 'media':
      return { ...migrated, ...opaque, assetId: assetId! };
    case 'graphic':
      return { ...migrated, ...opaque, ...(assetId ? { assetId } : {}), anchor: previous.kind === 'graphic' ? previous.anchor : migrated.anchor };
    case 'caption':
      return {
        ...migrated,
        ...opaque,
        anchor: previous.kind === 'caption' ? previous.anchor : migrated.anchor,
        ...(previous.kind === 'caption' && previous.sourceRef ? { sourceRef: previous.sourceRef } : {}),
      };
    case 'audio':
      return { ...migrated, ...opaque, assetId: assetId!, anchor: previous.kind === 'audio' ? previous.anchor : migrated.anchor };
  }
}

function previousTrackForClip(document: EditorDocumentV2): Map<string, EditorTrack> {
  return new Map(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, track] as const)));
}

function compatibleTrack(
  tracks: EditorTrack[],
  previousDocument: EditorDocumentV2,
  previousTrack: EditorTrack | undefined,
  migratedTrack: EditorTrack,
  clip: TimelineClip,
  unchanged: boolean,
): EditorTrack | undefined {
  if (clip.kind === 'narrative') {
    return tracks.find((track) => track.id === previousDocument.semantics.primaryNarrativeTrackId);
  }
  if (migratedTrack.role === 'managedCaptions') {
    const managedId = previousDocument.semantics.managedCaptionTrackId;
    if (managedId) return tracks.find((track) => track.id === managedId);
  }
  if (unchanged && previousTrack) return tracks.find((track) => track.id === previousTrack.id);
  if (clip.kind === 'audio' && previousTrack?.type === 'audio') {
    return tracks.find((track) => track.id === previousTrack.id);
  }
  if (previousTrack && previousTrack.type === migratedTrack.type && previousTrack.stackOrder === migratedTrack.stackOrder) {
    return tracks.find((track) => track.id === previousTrack.id);
  }
  return tracks.find((track) => track.id === migratedTrack.id)
    ?? tracks.find((track) => track.type === migratedTrack.type && track.role === migratedTrack.role && track.stackOrder === migratedTrack.stackOrder)
    ?? tracks.find((track) => track.type === migratedTrack.type && track.stackOrder === migratedTrack.stackOrder);
}

function sceneState(previous: EditorDocumentV2, survivingIds: Set<string>) {
  return previous.semantics.scenes.map((scene) => ({
    ...scene,
    clipIds: scene.clipIds.filter((clipId) => survivingIds.has(clipId)),
  }));
}

export interface MergeLegacyProjectionEditInput {
  previousDocument: EditorDocumentV2;
  migratedDocument: EditorDocumentV2;
  composition: Composition;
  /** Runtime projection when available; it distinguishes an explicit main-source removal. */
  previousComposition?: Composition;
}

export function mergeLegacyProjectionEdit(input: MergeLegacyProjectionEditInput): EditorDocumentV2 {
  const { previousDocument, migratedDocument, composition } = input;
  const previousComposition = input.previousComposition ?? projectV2ToLegacyComposition(previousDocument);
  const before = legacyProjectionItems(previousComposition);
  const after = legacyProjectionItems(composition);
  const priorTrackByClip = previousTrackForClip(previousDocument);
  const previousClipById = new Map(previousDocument.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, clip] as const)));

  // Start with the exact V2 layout, retaining only clips the compatibility projection could not
  // see. Its visible clips are patched back below or intentionally omitted when V1 deleted them.
  const tracks: EditorTrack[] = previousDocument.timeline.tracks.map((track) => ({
    ...track,
    clips: track.clips.filter((clip) => !before.visibleIds.has(clip.id)),
  }));

  for (const migratedTrack of migratedDocument.timeline.tracks) {
    for (const migratedClip of migratedTrack.clips) {
      const previousClip = previousClipById.get(migratedClip.id);
      const unchanged = sameLegacyItem(before.byId.get(migratedClip.id), after.byId.get(migratedClip.id));
      const clip = unchanged && previousClip
        ? previousClip
        : mergeVisibleClip(previousDocument, migratedDocument, previousClip, migratedClip);
      let target = compatibleTrack(tracks, previousDocument, priorTrackByClip.get(migratedClip.id), migratedTrack, clip, unchanged);
      if (!target) {
        target = { ...migratedTrack, clips: [] };
        tracks.push(target);
      }
      target.clips.push(clip);
    }
  }

  for (const track of tracks) {
    // Modern JS sort is stable: equal-time overlay order is intentional and must not be
    // alphabetized (that would turn one property edit into a whole-array persistence patch).
    track.clips.sort((left, right) => left.startFrame - right.startFrame);
  }

  const assets = { ...previousDocument.assets, ...migratedDocument.assets };
  const survivingIds = new Set(tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
  const previousPrimary = previousDocument.timeline.tracks.find((track) => track.id === previousDocument.semantics.primaryNarrativeTrackId);
  // Persistence intentionally strips Composition.video while retaining its narrative clips. In
  // that ordinary case the durable primary asset identity must not churn. The video field is only
  // decisive for a source-only project whose primary lane has no clips yet.
  const primarySourceUnchanged = (previousPrimary?.clips.length ?? 0) > 0
    || JSON.stringify(previousComposition.video) === JSON.stringify(composition.video);
  const primaryUnchanged = primarySourceUnchanged
    && (previousPrimary?.clips ?? []).every((clip) => {
    const next = previousClipById.get(clip.id);
    return next && survivingIds.has(clip.id) && sameLegacyItem(before.byId.get(clip.id), after.byId.get(clip.id));
    })
    && (previousPrimary?.clips.length ?? 0) === (tracks.find((track) => track.id === previousDocument.semantics.primaryNarrativeTrackId)?.clips.length ?? 0);

  const managedCaptionTrackId = previousDocument.semantics.managedCaptionTrackId
    ?? migratedDocument.semantics.managedCaptionTrackId;
  return {
    ...migratedDocument,
    assets,
    timeline: { tracks },
    semantics: {
      ...migratedDocument.semantics,
      primaryNarrativeTrackId: previousDocument.semantics.primaryNarrativeTrackId,
      ...(primaryUnchanged && previousDocument.semantics.primaryNarrativeAssetId
        ? { primaryNarrativeAssetId: previousDocument.semantics.primaryNarrativeAssetId }
        : {}),
      ...(managedCaptionTrackId ? { managedCaptionTrackId } : {}),
      transcripts: { ...previousDocument.semantics.transcripts, ...migratedDocument.semantics.transcripts },
      scenes: sceneState(previousDocument, survivingIds),
      ...(migratedDocument.semantics.plan !== undefined
        ? { plan: migratedDocument.semantics.plan }
        : previousDocument.semantics.plan !== undefined
          ? { plan: previousDocument.semantics.plan }
          : {}),
    },
  };
}
