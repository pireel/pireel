import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2, isEditorDocumentV2, validateEditorDocumentV2 } from './editor-document';
import { directorPlanFromSeconds, isDirectorPlanV1, validateDirectorPlanV1 } from './director-plan';

const input = {
  goal: 'Make a first-time viewer understand and remember the product mechanism.',
  creativeThesis: 'Move from human problem to visible proof, then return to the speaker for the payoff.',
  skillId: 'product-demo',
  frameId: 'zen-white',
  audience: 'Busy product leads',
  scenes: [
    {
      id: 'hook',
      label: 'The friction',
      startSec: 0,
      durationSec: 4,
      viewerTask: 'orient',
      narrativeRole: 'hook',
      sceneFamily: 'speaker-emphasis',
      purpose: 'State the concrete problem without losing the speaker.',
      evidence: ['Transcript sentence 0 names the repeated manual task.'],
      visualTreatment: 'Restrained punch-in with one short phrase, not a stock quote card.',
      assetStrategy: 'Use source speaker footage; no B-roll is needed yet.',
    },
    {
      id: 'proof',
      label: 'Mechanism in use',
      startSec: 4,
      durationSec: 8,
      viewerTask: 'believe',
      narrativeRole: 'prove',
      sceneFamily: 'demo-focus',
      purpose: 'Show the product completing the task the hook promised.',
      evidence: ['Screen recording shows input, processing, and the result.'],
      visualTreatment: 'Follow the active UI region while retaining enough surrounding context.',
      assetStrategy: 'Use the supplied screen recording as evidence.',
    },
  ],
};

describe('Director Plan V1', () => {
  it('converts seconds into the editor timebase and validates a rich plan', () => {
    const parsed = directorPlanFromSeconds(input, 30);
    expect(parsed.issues).toEqual([]);
    expect(parsed.plan?.scenes.map((scene) => [scene.startFrame, scene.durationFrames])).toEqual([[0, 120], [120, 240]]);
    expect(isDirectorPlanV1(parsed.plan)).toBe(true);
  });

  it('rejects overlapping intervals, duplicate ids, and unnamed custom families', () => {
    const broken = {
      ...input,
      scenes: [
        input.scenes[0],
        { ...input.scenes[1], id: 'hook', startSec: 3, sceneFamily: 'custom' },
      ],
    };
    const parsed = directorPlanFromSeconds(broken, 30);
    expect(parsed.plan).toBeUndefined();
    expect(parsed.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'duplicate-scene-id',
      'overlapping-scenes',
      'missing-custom-family',
    ]));
  });

  it('does not silently repair a negative scene duration', () => {
    const parsed = directorPlanFromSeconds({
      ...input,
      scenes: [{ ...input.scenes[0], durationSec: -2 }],
    }, 30);
    expect(parsed.plan).toBeUndefined();
    expect(parsed.issues.map((issue) => issue.code)).toContain('invalid-scene-duration');
  });

  it('participates in persisted editor-document validation while legacy plan remains compatible', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    const valid = directorPlanFromSeconds(input, 30).plan!;
    document.semantics.directorPlan = valid;
    document.semantics.plan = { legacy: true };
    expect(isEditorDocumentV2(document)).toBe(true);
    expect(validateEditorDocumentV2(document)).toEqual([]);

    document.semantics.directorPlan = { ...valid, goal: '' };
    expect(isEditorDocumentV2(document)).toBe(false);
    expect(validateDirectorPlanV1(document.semantics.directorPlan).map((issue) => issue.code)).toContain('missing-goal');
    expect(validateEditorDocumentV2(document).map((issue) => issue.code)).toContain('director-plan-missing-goal');
  });
});
