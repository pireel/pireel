import { describe, expect, it } from 'vitest';
import {
  emptyEditorDocumentV2,
  isEditorDocumentV2,
  parseEditorDocumentV2,
  validateEditorDocumentV2,
} from './editor-document';
import { prepareEditorDocumentForPersistence } from './project-document';
import {
  DIRECTOR_PLAN_ARTIFACT_KIND,
  directorPlanFromDocument,
  directorPlanMarkdownFromDocument,
  withDirectorPlanInSemantics,
  withoutDirectorPlanInSemantics,
} from './director-plan-artifact';
import { directorPlanFromSeconds } from './director-plan';

const planInput = {
  goal: 'Teach one durable idea.',
  creativeThesis: 'Evidence first, explanation second.',
  rhythmArc: 'Orient, build pressure, prove, and hold.',
  designSystem: {
    visualConcept: 'One evidence-led visual system.',
    composition: 'Source first with one clear evidence plane.',
    typography: 'One display role and restrained labels.',
    colorAndMaterial: 'Neutral field with one accent.',
    imagery: 'Preserve authentic source pixels.',
    motion: 'Motivated reveals and clean holds.',
    sound: 'Dialogue first with truthful source sound.',
  },
  scenes: [{
    id: 'proof', label: 'Proof', startSec: 0, durationSec: 2,
    viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'media-evidence',
    purpose: 'Show evidence.', treatmentId: 'evidence-plane', visualAnchor: 'The evidence.',
    visualTreatment: 'Let the evidence lead.', motionPlan: 'Reveal, hold, clear.',
    soundPlan: 'Keep dialogue audible.', assetStrategy: 'Use supplied evidence.',
    brollDecision: 'source', brollRationale: 'The claim must be seen.',
  }],
} as const;

describe('Director Plan semantic artifact boundary', () => {
  it('upgrades an inline V1 plan without changing the core timeline', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    const timeline = document.timeline;
    const legacyPlan = {
      version: 1,
      goal: 'Teach one durable idea.',
      creativeThesis: 'Evidence first, explanation second.',
      scenes: [{
        id: 'proof', label: 'Proof', startFrame: 0, durationFrames: 60,
        viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'media-evidence',
        purpose: 'Show evidence.',
      }],
    };
    const persisted = {
      ...document,
      semantics: { ...document.semantics, directorPlan: legacyPlan },
    };

    const parsed = parseEditorDocumentV2(persisted)!;
    expect(parsed.timeline).toBe(timeline);
    expect(directorPlanFromDocument(parsed)).toMatchObject({ goal: legacyPlan.goal });
    expect(directorPlanFromDocument(parsed)).not.toHaveProperty('version');
    expect(directorPlanMarkdownFromDocument(parsed)).toContain('# Director Plan');
    expect(directorPlanMarkdownFromDocument(parsed)).not.toContain('"creativeThesis"');
    expect((parsed.semantics as unknown as Record<string, unknown>).directorPlan).toBeUndefined();
    expect(validateEditorDocumentV2(parsed)).toEqual([]);
  });

  it('preserves an unsupported future plan while keeping the editor document readable', () => {
    const document = emptyEditorDocumentV2();
    const future = { version: 3, privateField: { untouched: true } };
    document.semantics.artifacts = {
      directorPlan: {
        kind: DIRECTOR_PLAN_ARTIFACT_KIND,
        schemaVersion: 3,
        payload: future,
      },
    };

    const parsed = parseEditorDocumentV2(document)!;
    expect(isEditorDocumentV2(parsed)).toBe(true);
    expect(directorPlanFromDocument(parsed)).toBeNull();
    expect(validateEditorDocumentV2(parsed)).toEqual([]);
    expect(prepareEditorDocumentForPersistence(parsed).semantics.artifacts).toEqual(document.semantics.artifacts);
  });

  it('sets and removes the current plan without disturbing unrelated artifacts', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.semantics.artifacts = {
      analytics: { kind: 'pireel.analytics', schemaVersion: 7, payload: { score: 1 } },
    };
    const plan = directorPlanFromSeconds(planInput, 30).plan!;
    document.semantics = withDirectorPlanInSemantics(document.semantics, plan);
    expect(directorPlanFromDocument(document)).toEqual(plan);

    document.semantics = withoutDirectorPlanInSemantics(document.semantics);
    expect(directorPlanFromDocument(document)).toBeNull();
    expect(document.semantics.artifacts).toMatchObject({ analytics: { schemaVersion: 7 } });
  });
});
