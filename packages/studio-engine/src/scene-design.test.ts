import { describe, expect, it } from 'vitest';
import { directorPlanFromSeconds } from './director-plan';
import { emptyEditorDocumentV2 } from './editor-document';
import {
  sceneDesignCollectionFromInput,
  sceneDesignsFromDocument,
  sceneDesignsFromMarkdown,
  sceneDesignsMarkdownFromDocument,
  sceneDesignsToMarkdown,
  withSceneDesignsInSemantics,
} from './scene-design';

const plan = directorPlanFromSeconds({
  goal: 'Explain one idea.', creativeThesis: 'Meaning drives the picture.', rhythmArc: 'Build then hold.',
  designSystem: {
    visualConcept: 'One coherent field.', composition: 'Source and graphics share one hierarchy.',
    typography: 'Clear hierarchy.', colorAndMaterial: 'Neutral with one accent.', imagery: 'Truthful source.',
    motion: 'Motivated movement.', sound: 'Voice first.',
  },
  scenes: [{
    id: 'explain', label: 'Explain', startSec: 0, durationSec: 4, viewerTask: 'understand', narrativeRole: 'explain',
    sceneFamily: 'custom', customFamily: 'authored-composition', purpose: 'Make the relation visible.', treatmentId: 'relation-field',
    visualAnchor: 'The relation.', visualTreatment: 'Compose the source and relation together.',
    motionPlan: 'Establish, develop, hold, clear.', soundPlan: 'Voice first.', assetStrategy: 'Use source and one graphic.',
    brollDecision: 'none', brollRationale: 'The source remains meaningful.',
  }],
}, 30).plan!;

const design = {
  sceneId: 'explain',
  designIntent: 'Turn the spoken relation into one connected visual field.',
  composition: 'Speaker occupies the right third while the relation develops in shared negative space.',
  choreography: 'Begin clean, draw the relation from the spoken noun, hold both subjects, then clear the line.',
  continuity: 'Inherit the previous camera direction and carry the final relation into the next crop.',
  successCriteria: 'Speaker and relation are readable together at delivery size.',
};

describe('progressive Scene design artifact', () => {
  it('round-trips open prose without turning it into enums', () => {
    const markdown = sceneDesignsToMarkdown({ scenes: [design] });
    expect(markdown).toContain('# Scene Designs');
    expect(markdown).toContain('Speaker occupies the right third');
    expect(sceneDesignsFromMarkdown(markdown)).toEqual({ scenes: [design] });
  });

  it('validates exact Director Scene identity and merges later revisions', () => {
    expect(sceneDesignCollectionFromInput({ scenes: [{ ...design, sceneId: 'missing' }] }, plan).issues[0]?.path).toBe('scenes[0].sceneId');
    const document = emptyEditorDocumentV2();
    document.semantics = withSceneDesignsInSemantics(document.semantics, { scenes: [design] });
    document.semantics = withSceneDesignsInSemantics(document.semantics, { scenes: [{ ...design, choreography: 'Revised temporal design.' }] });
    expect(sceneDesignsFromDocument(document)?.scenes).toEqual([{ ...design, choreography: 'Revised temporal design.' }]);
    expect(sceneDesignsMarkdownFromDocument(document)).toContain('Revised temporal design.');
  });
});
