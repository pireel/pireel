import { describe, expect, it } from 'vitest';
import { directorPlanFromSeconds } from './director-plan';
import { applyDirectorPlanToDocument } from './director-plan-document';
import { applyEditorCommand, emptyEditorDocumentV2 } from './editor-document';
import { formatDirectorSceneContext, resolveDirectorSceneContext } from './semantic-scenes';
import { directorPlanFromDocument } from './director-plan-artifact';

function documentWithNarration() {
  const empty = emptyEditorDocumentV2({ fps: 30 });
  const inserted = applyEditorCommand(empty, {
    type: 'narrative.insert',
    atFrame: 0,
    asset: {
      id: 'source',
      kind: 'video',
      locator: { localSig: 'source.mp4:10:1' },
      metadata: { durationSec: 10, hasAudio: true },
    },
    clip: {
      id: 'main',
      kind: 'narrative',
      assetId: 'source',
      durationFrames: 300,
      enabled: true,
      sourceInSec: 0,
      sourceOutSec: 10,
      properties: { treatment: 'full' },
    },
  });
  if (!inserted.ok) throw new Error(inserted.error.message);
  return inserted.document;
}

const planInput = {
  goal: 'Move the viewer from problem to visible proof.',
  creativeThesis: 'Human problem first, product evidence second.',
  rhythmArc: 'Hold on the human problem, accelerate into the action, then settle on proof.',
  designSystem: {
    visualConcept: 'Human friction becoming a visible working state.',
    composition: 'Speaker-led opening followed by an edge-to-edge authentic product plane.',
    typography: 'Restrained display type and small precise evidence labels.',
    colorAndMaterial: 'Neutral source color with one measured accent and no decorative glass.',
    imagery: 'Real speaker and product pixels remain primary evidence.',
    motion: 'One motivated camera move per thought and localized product-state motion.',
    sound: 'Continuous voice, source response at proof, sparse punctuation.',
  },
  skillId: 'product-demo',
  frameId: 'zen-white',
  scenes: [
    {
      id: 'problem', label: 'The problem', startSec: 0, durationSec: 4,
      viewerTask: 'orient', narrativeRole: 'hook', sceneFamily: 'speaker-emphasis',
      purpose: 'Make the repeated manual work recognizable.',
      evidence: ['The opening sentence names the manual work.'],
      treatmentId: 'speaker-distillation',
      visualAnchor: 'The speaker and their repeated gesture.',
      visualTreatment: 'Keep the speaker present with one restrained emphasis.',
      motionPlan: 'One thought-led punch-in, then a clean return.',
      soundPlan: 'Keep voice continuous and the room present.',
      assetStrategy: 'Use source footage.',
      brollDecision: 'none',
      brollRationale: 'The face and cadence are the strongest carrier.',
    },
    {
      id: 'proof', label: 'Visible proof', startSec: 4, durationSec: 6,
      viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'demo-focus',
      purpose: 'Show the product completing that same work.',
      evidence: ['The screen recording shows input and final result.'],
      treatmentId: 'evidence-plane',
      visualAnchor: 'The real product state change.',
      visualTreatment: 'Follow the active UI region without losing orientation.',
      motionPlan: 'Reveal input, follow the change, and hold the result.',
      soundPlan: 'Keep narration primary with one restrained source response.',
      assetStrategy: 'Use the supplied screen recording.',
      brollDecision: 'source',
      brollRationale: 'Visible product evidence is required for belief.',
    },
  ],
};

describe('Director Plan document execution', () => {
  it('turns scene boundaries into real clips and binds each interval to SemanticScene', () => {
    const document = documentWithNarration();
    const plan = directorPlanFromSeconds(planInput, 30).plan!;
    const applied = applyDirectorPlanToDocument(document, plan);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const clips = applied.document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId)!.clips;
    expect(clips.map((clip) => [clip.startFrame, clip.durationFrames])).toEqual([[0, 120], [120, 180]]);
    expect(applied.createdClipIds).toHaveLength(1);
    expect(applied.document.semantics.scenes).toMatchObject([
      { id: 'problem', viewerTask: 'orient', narrativeRole: 'hook', sceneFamily: 'speaker-emphasis' },
      { id: 'proof', viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'demo-focus' },
    ]);
    expect(applied.document.semantics.scenes.map((scene) => scene.clipIds)).toEqual([[clips[0]!.id], [clips[1]!.id]]);
  });

  it('resolves scene context by placement and emits prose rather than component selection', () => {
    const document = documentWithNarration();
    const plan = directorPlanFromSeconds(planInput, 30).plan!;
    const applied = applyDirectorPlanToDocument(document, plan);
    if (!applied.ok) throw new Error(applied.error);
    const context = resolveDirectorSceneContext(applied.document, { startFrame: 150, durationFrames: 60 });
    expect(context?.scene.id).toBe('proof');
    const brief = formatDirectorSceneContext(context!);
    expect(brief).toContain('Whole-video goal: Move the viewer from problem to visible proof.');
    expect(brief).toContain('Creative thesis: Human problem first, product evidence second.');
    expect(brief).toContain('Shared visual concept: Human friction becoming a visible working state.');
    expect(brief).toContain('Viewer task: believe');
    expect(brief).toContain('The screen recording shows input and final result');
    expect(brief).toContain('Signature treatment: evidence-plane');
    expect(brief).toContain('Visual anchor: The real product state change.');
    expect(brief).toContain('B-roll decision: source');
    expect(brief).toContain('one composed scene');
    expect(brief).not.toContain('kit:');
  });

  it('rejects scene-boundary application atomically when the primary lane is locked', () => {
    const document = documentWithNarration();
    document.timeline.tracks[0]!.locked = true;
    const plan = directorPlanFromSeconds(planInput, 30).plan!;
    const applied = applyDirectorPlanToDocument(document, plan);
    expect(applied).toMatchObject({ ok: false, document });
    expect(directorPlanFromDocument(document)).toBeNull();
  });

  it('keeps plan timing and scene ownership aligned through B-roll insertion and ripple cuts', () => {
    const document = documentWithNarration();
    const plan = directorPlanFromSeconds(planInput, 30).plan!;
    const applied = applyDirectorPlanToDocument(document, plan);
    if (!applied.ok) throw new Error(applied.error);
    const inserted = applyEditorCommand(applied.document, {
      type: 'narrative.insert',
      atFrame: 120,
      sceneId: 'proof',
      asset: {
        id: 'evidence-video', kind: 'video', locator: { remoteUrl: 'https://cdn.test/evidence.mp4' },
        metadata: { durationSec: 2, hasAudio: true },
      },
      clip: {
        id: 'evidence-clip', kind: 'narrative', assetId: 'evidence-video', durationFrames: 60,
        enabled: true, sourceInSec: 0, sourceOutSec: 2, properties: { treatment: 'full' },
      },
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(directorPlanFromDocument(inserted.document)?.scenes.map((scene) => [scene.id, scene.startFrame, scene.durationFrames])).toEqual([
      ['problem', 0, 120],
      ['proof', 120, 240],
    ]);
    expect(inserted.document.semantics.scenes.find((scene) => scene.id === 'proof')?.clipIds).toContain('evidence-clip');

    const cut = applyEditorCommand(inserted.document, {
      type: 'range.remove',
      trackId: inserted.document.semantics.primaryNarrativeTrackId,
      startFrame: 30,
      endFrame: 60,
      mode: 'ripple',
    });
    expect(cut.ok).toBe(true);
    if (!cut.ok) return;
    expect(directorPlanFromDocument(cut.document)?.scenes.map((scene) => [scene.id, scene.startFrame, scene.durationFrames])).toEqual([
      ['problem', 0, 90],
      ['proof', 90, 240],
    ]);
    expect(cut.document.semantics.scenes.find((scene) => scene.id === 'proof')?.clipIds).toContain('evidence-clip');
  });

  it('rejects a B-roll scene assignment outside that scene atomically', () => {
    const document = documentWithNarration();
    const plan = directorPlanFromSeconds(planInput, 30).plan!;
    const applied = applyDirectorPlanToDocument(document, plan);
    if (!applied.ok) throw new Error(applied.error);
    const inserted = applyEditorCommand(applied.document, {
      type: 'narrative.insert',
      atFrame: 0,
      sceneId: 'proof',
      asset: { id: 'wrong', kind: 'video', locator: { remoteUrl: 'https://cdn.test/wrong.mp4' }, metadata: { durationSec: 1 } },
      clip: { id: 'wrong-clip', kind: 'narrative', assetId: 'wrong', durationFrames: 30, enabled: true, sourceInSec: 0, sourceOutSec: 1, properties: { treatment: 'full' } },
    });
    expect(inserted).toMatchObject({ ok: false, document: applied.document, error: { path: 'sceneId' } });
    expect(applied.document.assets.wrong).toBeUndefined();
  });
});
