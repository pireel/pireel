import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2, isEditorDocumentV2, parseEditorDocumentV2, validateEditorDocumentV2 } from './editor-document';
import { directorPlanFromSeconds, isDirectorPlan } from './director-plan';
import { directorPlanFromDocument } from './director-plan-artifact';

const input = {
  goal: 'Make a first-time viewer understand and remember the product mechanism.',
  creativeThesis: 'Move from human problem to visible proof, then return to the speaker for the payoff.',
  rhythmArc: 'Begin intimate and compressed, open into a slower proof passage, then hold the human payoff.',
  deliverySafety: 'YouTube 16:9; reserve the lower caption band and keep identity, evidence and CTA clear of edge overlays.',
  designSystem: {
    visualConcept: 'Human explanation resolving into inspectable product evidence.',
    composition: 'Speaker-led negative space gives way to one full, legible evidence plane.',
    typography: 'One restrained display statement with plain evidence labels and tabular numbers.',
    colorAndMaterial: 'Warm neutral footage with one precise dark-ink accent system.',
    imagery: 'Preserve real faces and interface pixels; crop only to direct attention.',
    motion: 'Thought-led punch-ins, localized evidence tracking, clean holds and cuts.',
    sound: 'Continuous dialogue and room tone; product source sound only when truthful.',
  },
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

describe('Director Plan structure', () => {
  it('converts seconds into the editor timebase and validates a rich plan', () => {
    const parsed = directorPlanFromSeconds(input, 30);
    expect(parsed.issues).toEqual([]);
    expect(parsed.plan?.scenes.map((scene) => [scene.startFrame, scene.durationFrames])).toEqual([[0, 120], [120, 240]]);
    expect(parsed.plan?.scenes[1]).toMatchObject({ treatmentId: 'evidence-plane', brollDecision: 'source' });
    expect(parsed.plan?.deliverySafety).toContain('YouTube 16:9');
    expect(isDirectorPlan(parsed.plan)).toBe(true);
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
      'missing-treatment-id',
      'invalid-broll-decision',
    ]));
  });

  it('rejects a scene list that has no whole-film rhythm or design system', () => {
    const { rhythmArc: _rhythmArc, designSystem: _designSystem, ...incomplete } = input;
    const parsed = directorPlanFromSeconds(incomplete, 30);
    expect(parsed.plan).toBeUndefined();
    expect(parsed.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'missing-rhythm-arc',
      'missing-design-system',
    ]));
  });

  it('keeps optional planning artifacts independent from core document readability', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    const valid = directorPlanFromSeconds(input, 30).plan!;
    (document.semantics as typeof document.semantics & { directorPlan?: unknown }).directorPlan = valid;
    document.semantics.plan = { legacy: true };
    expect(isEditorDocumentV2(document)).toBe(true);
    const normalized = parseEditorDocumentV2(document)!;
    expect(validateEditorDocumentV2(normalized)).toEqual([]);
    expect(directorPlanFromDocument(normalized)).toEqual(valid);

    const damaged = emptyEditorDocumentV2({ fps: 30 });
    (damaged.semantics as typeof damaged.semantics & { directorPlan?: unknown }).directorPlan = { ...valid, goal: '' };
    expect(isEditorDocumentV2(damaged)).toBe(true);
    const recovered = parseEditorDocumentV2(damaged)!;
    expect(directorPlanFromDocument(recovered)).toBeNull();
    expect(validateEditorDocumentV2(recovered)).toEqual([]);
  });
});
