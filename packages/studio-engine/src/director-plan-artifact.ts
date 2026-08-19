import {
  migrateDirectorPlan,
  type DirectorPlan,
} from './director-plan';
import { directorPlanFromMarkdown, directorPlanToMarkdown } from './director-plan-markdown';
import type { EditorDocumentV2, EditorSemanticState } from './editor-document/types';

export const DIRECTOR_PLAN_ARTIFACT_KEY = 'directorPlan';
export const DIRECTOR_PLAN_ARTIFACT_KIND = 'pireel.director-plan';
export const DIRECTOR_PLAN_MEDIA_TYPE = 'text/markdown';

export interface DirectorPlanMarkdownArtifact {
  kind: typeof DIRECTOR_PLAN_ARTIFACT_KIND;
  mediaType: typeof DIRECTOR_PLAN_MEDIA_TYPE;
  content: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function isDirectorPlanMarkdownArtifact(value: unknown): value is DirectorPlanMarkdownArtifact {
  return isRecord(value)
    && value.kind === DIRECTOR_PLAN_ARTIFACT_KIND
    && value.mediaType === DIRECTOR_PLAN_MEDIA_TYPE
    && typeof value.content === 'string';
}

function currentArtifact(plan: DirectorPlan): DirectorPlanMarkdownArtifact {
  return {
    kind: DIRECTOR_PLAN_ARTIFACT_KIND,
    mediaType: DIRECTOR_PLAN_MEDIA_TYPE,
    content: directorPlanToMarkdown(plan),
  };
}

function artifactRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (value === undefined) return {};
  return {
    legacyArtifacts: {
      kind: 'pireel.opaque',
      payload: value,
    },
  };
}

function planFromArtifact(value: unknown): DirectorPlan | null {
  if (isDirectorPlanMarkdownArtifact(value)) return directorPlanFromMarkdown(value.content);
  if (!isRecord(value) || value.kind !== DIRECTOR_PLAN_ARTIFACT_KIND) return null;
  // Transitional reader for the short-lived JSON envelope and any pre-Markdown persisted rows.
  return migrateDirectorPlan('payload' in value ? value.payload : value);
}

/** Optional planning metadata is independently decoded and can never decide document readability. */
export function directorPlanFromDocument(document: EditorDocumentV2): DirectorPlan | null {
  const artifacts = artifactRecord(document.semantics.artifacts);
  return planFromArtifact(artifacts[DIRECTOR_PLAN_ARTIFACT_KEY]);
}

export function directorPlanMarkdownFromDocument(document: EditorDocumentV2): string | null {
  const artifacts = artifactRecord(document.semantics.artifacts);
  const value = artifacts[DIRECTOR_PLAN_ARTIFACT_KEY];
  return isDirectorPlanMarkdownArtifact(value) ? value.content : null;
}

export function withDirectorPlanInSemantics(
  semantics: EditorSemanticState,
  plan: DirectorPlan,
): EditorSemanticState {
  const artifacts = artifactRecord(semantics.artifacts);
  return {
    ...semantics,
    artifacts: {
      ...artifacts,
      [DIRECTOR_PLAN_ARTIFACT_KEY]: currentArtifact(plan),
    },
  };
}

export function withoutDirectorPlanInSemantics(semantics: EditorSemanticState): EditorSemanticState {
  const artifacts = artifactRecord(semantics.artifacts);
  if (!(DIRECTOR_PLAN_ARTIFACT_KEY in artifacts)) return semantics;
  const { [DIRECTOR_PLAN_ARTIFACT_KEY]: _removed, ...rest } = artifacts;
  return {
    ...semantics,
    ...(Object.keys(rest).length ? { artifacts: rest } : { artifacts: undefined }),
  };
}

export interface NormalizedEditorDocumentArtifacts {
  document: EditorDocumentV2;
  changed: boolean;
  warnings: string[];
}

/**
 * Canonicalize legacy inline planning data into an opaque Markdown artifact.
 * Unsupported payloads remain byte-for-byte available in the envelope while editor consumers
 * simply see no current Director Plan.
 */
export function normalizeEditorDocumentArtifacts(
  document: EditorDocumentV2,
): NormalizedEditorDocumentArtifacts {
  const rawSemantics = document.semantics as EditorSemanticState & Record<string, unknown>;
  const legacyPlan = rawSemantics.directorPlan;
  const artifacts = { ...artifactRecord(rawSemantics.artifacts) };
  const warnings: string[] = [];
  let changed = legacyPlan !== undefined || (rawSemantics.artifacts !== undefined && !isRecord(rawSemantics.artifacts));

  const existing = artifacts[DIRECTOR_PLAN_ARTIFACT_KEY];
  const existingPlan = planFromArtifact(existing);
  if (existingPlan) {
    const canonical = currentArtifact(existingPlan);
    if (!isDirectorPlanMarkdownArtifact(existing) || existing.content !== canonical.content) {
      artifacts[DIRECTOR_PLAN_ARTIFACT_KEY] = canonical;
      changed = true;
    }
  } else if (existing !== undefined) {
    warnings.push('Director Plan artifact is unsupported or invalid; the timeline remains available.');
  }

  if (legacyPlan !== undefined) {
    const migrated = migrateDirectorPlan(legacyPlan);
    if (existing === undefined) {
      artifacts[DIRECTOR_PLAN_ARTIFACT_KEY] = migrated
        ? currentArtifact(migrated)
        : {
            kind: DIRECTOR_PLAN_ARTIFACT_KIND,
            payload: legacyPlan,
          };
      if (!migrated) warnings.push('Legacy Director Plan could not be upgraded; the timeline remains available.');
    } else {
      artifacts.legacyDirectorPlan = {
        kind: 'pireel.legacy-director-plan',
        payload: legacyPlan,
      };
      warnings.push('Both inline and artifact Director Plans existed; the inline value was preserved as legacy metadata.');
    }
  }

  const { directorPlan: _legacy, ...semanticsWithoutLegacy } = rawSemantics;
  const semantics: EditorSemanticState = {
    ...semanticsWithoutLegacy,
    ...(Object.keys(artifacts).length ? { artifacts } : { artifacts: undefined }),
  };
  return {
    document: changed ? { ...document, semantics } : document,
    changed,
    warnings,
  };
}
