import { describe, expect, it } from 'vitest';
import { directorPlanFromSeconds } from './director-plan';
import { directorPlanAfterRippleInsertion, directorPlanAfterRippleRemoval } from './director-plan-timing';

const treatment = {
  treatmentId: 'source-led', visualAnchor: 'The current speaker or evidence.',
  visualTreatment: 'Keep one clear full-canvas hierarchy around the current source.',
  motionPlan: 'Enter cleanly, develop with the thought, hold the payoff, and clear.',
  soundPlan: 'Keep the primary voice audible and continuous.',
  assetStrategy: 'Use the supplied source that supports this scene.',
  brollDecision: 'none' as const, brollRationale: 'Source continuity carries this test scene.',
};

const plan = directorPlanFromSeconds({
  goal: 'Explain and prove.',
  creativeThesis: 'Setup first, evidence second.',
  rhythmArc: 'Measured setup opens into proof and then settles.',
  designSystem: {
    visualConcept: 'Explanation resolving into evidence.', composition: 'Source-led hierarchy.',
    typography: 'One clear display and restrained labels.', colorAndMaterial: 'Neutral with one accent.',
    imagery: 'Preserve source truth.', motion: 'Motivated reveals and clean holds.', sound: 'Voice first.',
  },
  scenes: [
    { ...treatment, id: 'setup', label: 'Setup', startSec: 0, durationSec: 4, viewerTask: 'understand', narrativeRole: 'explain', sceneFamily: 'speaker-clean', purpose: 'Explain.' },
    { ...treatment, id: 'proof', label: 'Proof', startSec: 4, durationSec: 6, viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'media-evidence', purpose: 'Prove.' },
  ],
}, 30).plan!;

describe('Director Plan ripple timing', () => {
  it('compresses intersected scenes and shifts later scenes after removal', () => {
    const next = directorPlanAfterRippleRemoval(plan, 30, 60)!;
    expect(next.scenes.map((scene) => [scene.id, scene.startFrame, scene.durationFrames])).toEqual([
      ['setup', 0, 90],
      ['proof', 90, 180],
    ]);
  });

  it('drops a fully removed scene and moves the survivor to the seam', () => {
    const next = directorPlanAfterRippleRemoval(plan, 0, 120)!;
    expect(next.scenes.map((scene) => [scene.id, scene.startFrame, scene.durationFrames])).toEqual([
      ['proof', 0, 180],
    ]);
  });

  it('expands the explicit scene at a shared insertion boundary and shifts later scenes', () => {
    const intoProof = directorPlanAfterRippleInsertion(plan, 120, 60, 'proof');
    expect(intoProof).toMatchObject({ ok: true, sceneId: 'proof' });
    if (!intoProof.ok) return;
    expect(intoProof.plan.scenes.map((scene) => [scene.id, scene.startFrame, scene.durationFrames])).toEqual([
      ['setup', 0, 120],
      ['proof', 120, 240],
    ]);

    const intoSetup = directorPlanAfterRippleInsertion(plan, 120, 60, 'setup');
    expect(intoSetup).toMatchObject({ ok: true, sceneId: 'setup' });
    if (!intoSetup.ok) return;
    expect(intoSetup.plan.scenes.map((scene) => [scene.id, scene.startFrame, scene.durationFrames])).toEqual([
      ['setup', 0, 180],
      ['proof', 180, 180],
    ]);
  });

  it('rejects an explicit scene when the insertion is outside its interval', () => {
    expect(directorPlanAfterRippleInsertion(plan, 0, 60, 'proof')).toMatchObject({ ok: false });
  });
});
