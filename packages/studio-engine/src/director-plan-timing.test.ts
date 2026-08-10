import { describe, expect, it } from 'vitest';
import { directorPlanFromSeconds } from './director-plan';
import { directorPlanAfterRippleInsertion, directorPlanAfterRippleRemoval } from './director-plan-timing';

const plan = directorPlanFromSeconds({
  goal: 'Explain and prove.',
  creativeThesis: 'Setup first, evidence second.',
  scenes: [
    { id: 'setup', label: 'Setup', startSec: 0, durationSec: 4, viewerTask: 'understand', narrativeRole: 'explain', sceneFamily: 'speaker-clean', purpose: 'Explain.' },
    { id: 'proof', label: 'Proof', startSec: 4, durationSec: 6, viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'media-evidence', purpose: 'Prove.' },
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
