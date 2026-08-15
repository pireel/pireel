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
      treatmentId: 'speaker-distillation',
      visualAnchor: 'The speaker\'s face and the repeated hand motion.',
      visualTreatment: 'Restrained punch-in with one short phrase, not a stock quote card.',
      motionPlan: 'Punch in on the named friction, hold through the sentence, then return cleanly.',
      soundPlan: 'Keep voice and room tone continuous; no graphic cue.',
      assetStrategy: 'Use source speaker footage; no B-roll is needed yet.',
      brollDecision: 'none',
      brollRationale: 'The speaker\'s cadence and gesture already carry the friction.',
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
      treatmentId: 'evidence-plane',
      visualAnchor: 'The product input and final result in the supplied recording.',
      visualTreatment: 'Follow the active UI region while retaining enough surrounding context.',
      motionPlan: 'Track input, processing, then hold the result on the spoken proof beat.',
      soundPlan: 'Voice remains primary; retain one truthful interface response if audible.',
      assetStrategy: 'Use the supplied screen recording as evidence.',
      brollDecision: 'source',
      brollRationale: 'The mechanism must be seen to support the claim.',
    },
  ],
};

describe('Director Plan V1', () => {
  it('converts seconds into the editor timebase and validates a rich plan', () => {
    const parsed = directorPlanFromSeconds(input, 30);
    expect(parsed.issues).toEqual([]);
    expect(parsed.plan?.scenes.map((scene) => [scene.startFrame, scene.durationFrames])).toEqual([[0, 120], [120, 240]]);
    expect(parsed.plan?.scenes[1]).toMatchObject({ treatmentId: 'evidence-plane', brollDecision: 'source' });
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
    expect(parsed.issues.find((issue) => issue.code === 'overlapping-scenes')).toEqual({
      code: 'overlapping-scenes',
      path: 'scenes[1].startSec',
      message: 'Scene starts at 3s before the previous planned interval ends at 4s. Set startSec to 4 or later, or shorten an earlier scene.',
    });
  });

  it('does not silently repair a negative scene duration', () => {
    const parsed = directorPlanFromSeconds({
      ...input,
      scenes: [{ ...input.scenes[0], durationSec: -2 }],
    }, 30);
    expect(parsed.plan).toBeUndefined();
    expect(parsed.issues.map((issue) => issue.code)).toContain('invalid-scene-duration');
  });

  it('rejects invalid optional treatment-contract values', () => {
    const parsed = directorPlanFromSeconds({
      ...input,
      scenes: [{ ...input.scenes[0], treatmentId: '', brollDecision: 'always' }],
    }, 30);
    expect(parsed.plan).toBeUndefined();
    expect(parsed.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'invalid-treatment-id',
      'invalid-broll-decision',
    ]));
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
