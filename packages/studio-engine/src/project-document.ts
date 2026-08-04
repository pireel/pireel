/**
 * Stored project-document boundary.
 *
 * The existing `studio_projects.comp` JSON column is reused: old rows contain Composition V1,
 * new rows contain EditorDocumentV2. Callers never inspect that column directly; they normalize
 * it here and expose Composition only as a read projection for rendering and legacy clients.
 */

import type { Composition } from './composition-core';
import {
  emptyEditorDocumentV2,
  isEditorDocumentV2,
  migrateLegacyProjectToV2,
  projectV2ToLegacyComposition,
  syncCaptionTranscripts,
  validateEditorDocumentV2,
  type EditorDocumentIssue,
  type EditorDocumentV2,
  type LegacyProjectionOptions,
} from './editor-document';
import type { StudioProjectContext } from './project-dto';

export type PersistedProjectDocument = Composition | EditorDocumentV2;

export interface ProjectDocumentInput {
  projectId: string;
  value: unknown;
  context?: StudioProjectContext;
  videoSig?: string | null;
  videoDurationSec?: number | null;
  fps?: number;
}

export interface NormalizedProjectDocument {
  document: EditorDocumentV2;
  migrated: boolean;
  issues: EditorDocumentIssue[];
}

function durableRemoteUrl(url: string | undefined): string | undefined {
  if (!url || /^(?:blob|data):/i.test(url)) return undefined;
  return url;
}

/** Drops runtime-only object/data URLs before hashing or persistence. */
export function prepareEditorDocumentForPersistence(document: EditorDocumentV2): EditorDocumentV2 {
  const assets = Object.fromEntries(Object.entries(document.assets).map(([id, asset]) => {
    const remoteUrl = durableRemoteUrl(asset.locator.remoteUrl);
    if (remoteUrl === asset.locator.remoteUrl) return [id, asset];
    const { remoteUrl: _runtime, ...durableLocator } = asset.locator;
    return [id, { ...asset, locator: durableLocator }];
  }));
  // Rebuild the known top-level schema instead of spreading untrusted JSON. Besides making the
  // persisted format canonical, this drops legacy/runtime keys (notably `video`) that a malformed
  // JSON patch could otherwise smuggle next to the V2 fields.
  return {
    version: document.version,
    canvas: document.canvas,
    appearance: document.appearance,
    assets,
    timeline: document.timeline,
    semantics: document.semantics,
    ...(document.processing ? { processing: document.processing } : {}),
  };
}

/** V1/V2 dual-read. Migration is deterministic for a given project id and complete project context. */
export function normalizeProjectDocument(input: ProjectDocumentInput): NormalizedProjectDocument {
  if (isEditorDocumentV2(input.value)) {
    const document = prepareEditorDocumentForPersistence(input.value);
    return { document, migrated: false, issues: validateEditorDocumentV2(document) };
  }
  const composition = input.value && typeof input.value === 'object'
    ? input.value as Composition
    : undefined;
  if (!composition) {
    const document = emptyEditorDocumentV2();
    return { document, migrated: true, issues: [] };
  }
  const migrated = migrateLegacyProjectToV2({
    projectId: input.projectId,
    composition,
    context: input.context,
    videoSig: input.videoSig ?? undefined,
    videoDurationSec: input.videoDurationSec ?? undefined,
    fps: input.fps,
  });
  const document = migrated.document;
  return {
    document: prepareEditorDocumentForPersistence(document),
    migrated: true,
    issues: migrated.issues,
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

export interface ProjectDocumentContextInput {
  projectId: string;
  document: EditorDocumentV2;
  context?: StudioProjectContext;
  videoSig?: string | null;
  videoDurationSec?: number | null;
}

/** Add persistence metadata to V2 without reconstructing any timeline state from Composition. */
export function mergeProjectContextIntoDocument(input: ProjectDocumentContextInput): EditorDocumentV2 {
  const context = input.context ?? {};
  const assets = Object.fromEntries(Object.entries(input.document.assets).map(([id, asset]) => [id, {
    ...asset,
    locator: {
      ...asset.locator,
      ...(asset.locator.localSig && context.media?.clips?.[asset.locator.localSig]?.key
        ? { cloudKey: context.media.clips[asset.locator.localSig]!.key }
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
        ...(context.media?.video?.key ? { cloudKey: context.media.video.key } : {}),
      },
      metadata: {
        ...main.metadata,
        ...(input.videoDurationSec && input.videoDurationSec > 0 ? { durationSec: input.videoDurationSec } : {}),
      },
    };
  }
  for (const entry of context.localAssets ?? []) {
    const existing = Object.values(assets).find((asset) => asset.locator.localSig === entry.sig);
    const cloudKey = context.media?.clips?.[entry.sig]?.key;
    if (existing) {
      assets[existing.id] = {
        ...existing,
        label: existing.label ?? entry.label,
        locator: { ...existing.locator, ...(cloudKey ? { cloudKey } : {}) },
        metadata: {
          ...existing.metadata,
          ...(entry.w && entry.w > 0 ? { width: entry.w } : {}),
          ...(entry.h && entry.h > 0 ? { height: entry.h } : {}),
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
    };
  }
  for (const [sig, ref] of Object.entries(context.media?.clips ?? {})) {
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
  document = syncCaptionTranscripts(document, context.asr ?? null, context.clipAsr ?? {});
  if (context.plan !== undefined && document.semantics.plan !== context.plan) {
    document = { ...document, semantics: { ...document.semantics, plan: context.plan } };
  }
  return prepareEditorDocumentForPersistence(document);
}

export function projectDocumentToLegacyComposition(
  input: ProjectDocumentInput,
  options: LegacyProjectionOptions = {},
): Composition {
  return projectV2ToLegacyComposition(normalizeProjectDocument(input).document, options);
}

export function emptyPersistedProjectDocument(): EditorDocumentV2 {
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
