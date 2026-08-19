/**
 * Native project-document helpers. Persisted/runtime state is always EditorDocumentV2;
 * Composition exists only as an explicit render/import projection.
 */

import type { Composition } from './composition-core';
import {
  emptyEditorDocumentV2,
  projectV2ToLegacyComposition,
  syncCaptionTranscripts,
  type EditorDocumentV2,
  type LegacyProjectionOptions,
} from './editor-document';
import { migrateLegacyProjectToV2 } from './editor-document/migration';
import type { LocalAssetIndexEntry, ProjectCloudMediaIndex, TranscriptSegment } from './project-dto';
import { normalizeEditorDocumentArtifacts } from './director-plan-artifact';

export interface CompositionDocumentInput {
  projectId: string;
  composition: Composition;
  videoSig?: string | null;
  videoDurationSec?: number | null;
  fps?: number;
}

export interface CompositionDocumentResult {
  document: EditorDocumentV2;
  issues: ReturnType<typeof migrateLegacyProjectToV2>['issues'];
}

function durableRemoteUrl(url: string | undefined): string | undefined {
  if (!url || /^(?:blob|data):/i.test(url)) return undefined;
  return url;
}

/** Drops runtime-only object/data URLs before hashing or persistence. */
export function prepareEditorDocumentForPersistence(document: EditorDocumentV2): EditorDocumentV2 {
  const canonical = normalizeEditorDocumentArtifacts(document).document;
  const assets = Object.fromEntries(Object.entries(canonical.assets).map(([id, asset]) => {
    const remoteUrl = durableRemoteUrl(asset.locator.remoteUrl);
    if (remoteUrl === asset.locator.remoteUrl) return [id, asset];
    const { remoteUrl: _runtime, ...durableLocator } = asset.locator;
    return [id, { ...asset, locator: durableLocator }];
  }));
  // Rebuild the known top-level schema instead of spreading untrusted JSON. Besides making the
  // persisted format canonical, this drops legacy/runtime keys (notably `video`) that a malformed
  // JSON patch could otherwise smuggle next to the V2 fields.
  return {
    version: canonical.version,
    canvas: canonical.canvas,
    appearance: canonical.appearance,
    assets,
    timeline: canonical.timeline,
    semantics: canonical.semantics,
    ...(canonical.processing ? { processing: canonical.processing } : {}),
  };
}

/** Explicitly import an in-memory Composition produced by current UI/generation code into V2. */
export function compositionToEditorDocument(input: CompositionDocumentInput): CompositionDocumentResult {
  const converted = migrateLegacyProjectToV2({
    projectId: input.projectId,
    composition: input.composition,
    videoSig: input.videoSig ?? undefined,
    videoDurationSec: input.videoDurationSec ?? undefined,
    fps: input.fps,
  });
  return {
    document: prepareEditorDocumentForPersistence(converted.document),
    issues: converted.issues,
  };
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

export interface EditorDocumentPersistenceMetadataInput {
  projectId: string;
  document: EditorDocumentV2;
  mainTranscript?: readonly TranscriptSegment[] | null;
  clipTranscripts?: Readonly<Record<string, readonly TranscriptSegment[]>>;
  plan?: unknown;
  cloudMedia?: ProjectCloudMediaIndex;
  localAssets?: readonly LocalAssetIndexEntry[];
  videoSig?: string | null;
  videoDurationSec?: number | null;
}

/** Fold current native session metadata into V2 without reconstructing timeline state. */
export function applyEditorDocumentPersistenceMetadata(
  input: EditorDocumentPersistenceMetadataInput,
): EditorDocumentV2 {
  const assets = Object.fromEntries(Object.entries(input.document.assets).map(([id, asset]) => [id, {
    ...asset,
    locator: {
      ...asset.locator,
      ...(asset.locator.localSig && input.cloudMedia?.clips?.[asset.locator.localSig]?.key
        ? { cloudKey: input.cloudMedia.clips[asset.locator.localSig]!.key }
        : {}),
    },
  }]));
  const mainId = input.document.semantics.primaryNarrativeAssetId;
  if (mainId && assets[mainId]) {
    const main = assets[mainId]!;
    assets[mainId] = {
      ...main,
      locator: {
        ...main.locator,
        ...(input.videoSig ? { localSig: input.videoSig } : {}),
        ...(input.cloudMedia?.video?.key ? { cloudKey: input.cloudMedia.video.key } : {}),
      },
      metadata: {
        ...main.metadata,
        ...(input.videoDurationSec && input.videoDurationSec > 0 ? { durationSec: input.videoDurationSec } : {}),
      },
    };
  }
  for (const entry of input.localAssets ?? []) {
    const existing = Object.values(assets).find((asset) => asset.locator.localSig === entry.sig);
    const cloudKey = input.cloudMedia?.clips?.[entry.sig]?.key;
    if (existing) {
      assets[existing.id] = {
        ...existing,
        // The project media directory owns the user-authored semantic name. File identity remains
        // the localSig; persisting a rename must update an already-registered timeline asset too.
        label: entry.label,
        locator: { ...existing.locator, ...(cloudKey ? { cloudKey } : {}) },
        metadata: {
          ...existing.metadata,
          ...(entry.w && entry.w > 0 ? { width: entry.w } : {}),
          ...(entry.h && entry.h > 0 ? { height: entry.h } : {}),
        },
        library: {
          createdAt: entry.createdAt,
          ...(entry.folder ? { folder: entry.folder } : {}),
        },
      };
      continue;
    }
    const kind = entry.kind ?? 'video';
    const stem = `asset_${kind}_${stableHash(`${input.projectId}\u0000${entry.sig}`)}`;
    let id = stem;
    let suffix = 2;
    while (assets[id]) id = `${stem}_${suffix++}`;
    assets[id] = {
      id,
      kind,
      label: entry.label,
      locator: { localSig: entry.sig, ...(cloudKey ? { cloudKey } : {}) },
      metadata: {
        ...(entry.w && entry.w > 0 ? { width: entry.w } : {}),
        ...(entry.h && entry.h > 0 ? { height: entry.h } : {}),
      },
      library: {
        createdAt: entry.createdAt,
        ...(entry.folder ? { folder: entry.folder } : {}),
      },
    };
  }
  for (const [sig, ref] of Object.entries(input.cloudMedia?.clips ?? {})) {
    if (Object.values(assets).some((asset) => asset.locator.localSig === sig)) continue;
    const stem = `asset_video_${stableHash(`${input.projectId}\u0000${sig}`)}`;
    let id = stem;
    let suffix = 2;
    while (assets[id]) id = `${stem}_${suffix++}`;
    assets[id] = {
      id,
      kind: 'video',
      locator: { localSig: sig, cloudKey: ref.key },
      metadata: {},
    };
  }
  let document: EditorDocumentV2 = { ...input.document, assets };
  document = syncCaptionTranscripts(document, input.mainTranscript ?? null, input.clipTranscripts ?? {});
  if (input.plan !== undefined && document.semantics.plan !== input.plan) {
    document = { ...document, semantics: { ...document.semantics, plan: input.plan } };
  }
  return prepareEditorDocumentForPersistence(document);
}

export function projectDocumentToComposition(
  document: EditorDocumentV2,
  options: LegacyProjectionOptions = {},
): Composition {
  return projectV2ToLegacyComposition(document, options);
}

export function emptyProjectDocument(): EditorDocumentV2 {
  return emptyEditorDocumentV2();
}

export function projectDocumentStats(document: EditorDocumentV2): { blocks: number; shots: number } {
  let blocks = 0;
  let shots = 0;
  for (const track of document.timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.kind === 'narrative' || clip.kind === 'media') shots += 1;
      else if (clip.kind === 'graphic' || clip.kind === 'caption') blocks += 1;
    }
  }
  return { blocks, shots };
}

/** Content gate for project lifecycle decisions; unlike V1 checks it includes every lane kind. */
export function projectDocumentHasTimelineContent(document: EditorDocumentV2): boolean {
  return document.timeline.tracks.some((track) => track.clips.length > 0);
}
