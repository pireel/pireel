import { describe, expect, it } from 'vitest';
import { directorPlanFromSeconds } from './director-plan';
import { directorPlanFromMarkdown, directorPlanToMarkdown } from './director-plan-markdown';

const input = {
  goal: 'Teach one durable idea.\n# This is content, not a heading.',
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
  skillId: 'talking-head-edit',
  frameId: 'zen-white',
  audience: 'First-time learners',
  scenes: [{
    id: 'proof', label: 'Proof', startSec: 0, durationSec: 2,
    viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'media-evidence',
    purpose: 'Show evidence.', evidence: ['The supplied recording shows the result.'],
    treatmentId: 'evidence-plane', visualAnchor: 'The evidence.',
    visualTreatment: 'Let the evidence lead.', motionPlan: 'Reveal, hold, clear.',
    soundPlan: 'Keep dialogue audible.', assetStrategy: 'Use supplied evidence.',
    brollDecision: 'source', brollRationale: 'The claim must be seen.',
    visualMetaphor: 'A real result replaces the claim.',
  }],
};

describe('Director Plan Markdown', () => {
  it('is the lossless source artifact for a structured tool result', () => {
    const plan = directorPlanFromSeconds(input, 30).plan!;
    const markdown = directorPlanToMarkdown(plan);
    expect(markdown).toContain('kind: pireel-director-plan');
    expect(markdown).toContain('# Director Plan');
    expect(markdown).toContain('## Scenes');
    expect(markdown).not.toContain('"creativeThesis"');
    expect(directorPlanFromMarkdown(markdown)).toEqual(plan);
  });

  it('rejects arbitrary or damaged Markdown without affecting the editor document', () => {
    expect(directorPlanFromMarkdown('# Notes\nAnything goes.')).toBeNull();
    expect(directorPlanFromMarkdown('---\nkind: pireel-director-plan\n---\n# Director Plan')).toBeNull();
  });
});
