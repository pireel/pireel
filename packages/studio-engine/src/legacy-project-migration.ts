/** One-shot persisted V1 -> V2 migration boundary. Runtime code must not import this module. */

import type { Composition } from './composition-core';
import {
  emptyEditorDocumentV2,
  isEditorDocumentV2,
  validateEditorDocumentV2,
  type EditorDocumentIssue,
  type EditorDocumentV2,
} from './editor-document';
import {
  migrateLegacyProjectToV2,
  type LegacyStudioProjectContext,
} from './editor-document/migration';
import {
  applyEditorDocumentPersistenceMetadata,
  prepareEditorDocumentForPersistence,
} from './project-document';
import { normalizeEditorDocumentArtifacts } from './director-plan-artifact';

export interface PersistedLegacyProjectInput {
  projectId: string;
  value: unknown;
  context?: LegacyStudioProjectContext;
  videoSig?: string | null;
  videoDurationSec?: number | null;
  fps?: number;
}

export interface PersistedProjectMigrationResult {
  document: EditorDocumentV2;
  migrated: boolean;
  issues: EditorDocumentIssue[];
}

export function legacyProjectContextHasState(context: LegacyStudioProjectContext = {}): boolean {
  return ['asr', 'clipAsr', 'plan', 'media', 'localAssets'].some((key) => key in context);
}

export function migratePersistedProjectDocument(
  input: PersistedLegacyProjectInput,
): PersistedProjectMigrationResult {
  const context = input.context ?? {};
  const hasLegacyContext = legacyProjectContextHasState(context);
  if (isEditorDocumentV2(input.value)) {
    const normalized = normalizeEditorDocumentArtifacts(input.value);
    const native = prepareEditorDocumentForPersistence(normalized.document);
    const document = hasLegacyContext
      ? applyEditorDocumentPersistenceMetadata({
          projectId: input.projectId,
          document: native,
          mainTranscript: context.asr ?? null,
          clipTranscripts: context.clipAsr ?? {},
          ...(context.plan !== undefined ? { plan: context.plan } : {}),
          cloudMedia: context.media,
          localAssets: context.localAssets,
          videoSig: input.videoSig,
          videoDurationSec: input.videoDurationSec,
        })
      : native;
    return {
      document,
      migrated: hasLegacyContext || normalized.changed,
      issues: validateEditorDocumentV2(document),
    };
  }

  const composition = input.value && typeof input.value === 'object'
    ? input.value as Composition
    : undefined;
  if (!composition) {
    return { document: emptyEditorDocumentV2(), migrated: true, issues: [] };
  }
  const migrated = migrateLegacyProjectToV2({
    projectId: input.projectId,
    composition,
    context,
    videoSig: input.videoSig,
    videoDurationSec: input.videoDurationSec,
    fps: input.fps,
  });
  return {
    document: prepareEditorDocumentForPersistence(migrated.document),
    migrated: true,
    issues: migrated.issues,
  };
}
