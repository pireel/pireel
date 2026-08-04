/**
 * Stored project-document boundary.
 *
 * The existing `studio_projects.comp` JSON column is reused: old rows contain Composition V1,
 * new rows contain EditorDocumentV2. Callers never inspect that column directly; they normalize
 * it here and use a read-only Composition projection only while the UI/server tools are cut over.
 */

import type { Composition } from './composition-core';
import {
  emptyEditorDocumentV2,
  isEditorDocumentV2,
  mergeLegacyProjectionEdit,
  migrateLegacyProjectToV2,
  projectV2ToLegacyComposition,
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
  /** Previous V2 authority when `value` is an edit made through its compatibility projection. */
  previousDocument?: EditorDocumentV2;
  /** The resolved runtime projection paired with previousDocument, when the caller owns it. */
  previousProjection?: Composition;
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
    previousDocument: input.previousDocument,
  });
  const document = input.previousDocument
    ? mergeLegacyProjectionEdit({
        previousDocument: input.previousDocument,
        migratedDocument: migrated.document,
        composition,
        previousComposition: input.previousProjection,
      })
    : migrated.document;
  return {
    document: prepareEditorDocumentForPersistence(document),
    migrated: true,
    issues: input.previousDocument
      ? [...migrated.issues.filter((issue) => issue.severity !== 'error'), ...validateEditorDocumentV2(document)]
      : migrated.issues,
  };
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
