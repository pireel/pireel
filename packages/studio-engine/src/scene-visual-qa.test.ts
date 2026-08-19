import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from './editor-document';
import type { AudioTimelineClip, EditorDocumentV2, GraphicTimelineClip, MediaTimelineClip } from './editor-document/types';
import { auditSceneVisualStructure, planSceneVisualReview, sceneAtSecond, sceneVisualRepairScope } from './scene-visual-qa';
import { directorPlanFromDocument, withDirectorPlanInSemantics } from './director-plan-artifact';

const treatment = {
  treatmentId: 'authored-scene', visualAnchor: 'The scene subject.',
  visualTreatment: 'One explicit full-canvas hierarchy using the planned source.',
  motionPlan: 'Enter, develop with the idea, hold the payoff, and clear.',
  soundPlan: 'Keep the primary voice audible.', assetStrategy: 'Use the strongest supplied source.',
  brollDecision: 'none' as const, brollRationale: 'No picture change is needed by this fixture.',
};

function documentWithPlan(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
  document.appearance.frameId = 'knowledge-cards';
  document.semantics = withDirectorPlanInSemantics(document.semantics, {
    goal: 'Teach one model',
    creativeThesis: 'The relation becomes visible',
    rhythmArc: 'Question, build, correction, proof, synthesis.',
    designSystem: {
      visualConcept: 'A relation assembled in one calm visual language.',
      composition: 'Source-led openings alternate with full-field explanations.',
      typography: 'Large thesis type with restrained labels.',
      colorAndMaterial: 'Neutral paper field with one evidence accent.',
      imagery: 'Use real proof as a primary plate and preserve its context.',
      motion: 'Build relations in sequence, hold conclusions, clear fully.',
      sound: 'Speech first with sparse transition punctuation.',
    },
    frameId: 'knowledge-cards',
    scenes: [
      { ...treatment, id: 'open', label: 'Question', startFrame: 0, durationFrames: 90, viewerTask: 'orient', narrativeRole: 'hook', sceneFamily: 'speaker-clean', purpose: 'Open on the real question' },
      { ...treatment, id: 'build', label: 'Build', startFrame: 90, durationFrames: 120, viewerTask: 'understand', narrativeRole: 'explain', sceneFamily: 'structure-explain', purpose: 'Build the relation' },
      { ...treatment, id: 'turn', label: 'Turn', startFrame: 210, durationFrames: 90, viewerTask: 'feel', narrativeRole: 'turn', sceneFamily: 'designed-fullscreen', purpose: 'Correct the model' },
      { ...treatment, id: 'proof', label: 'Proof', startFrame: 300, durationFrames: 120, viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'media-evidence', purpose: 'Show the evidence', evidence: ['Recorded result'], brollDecision: 'source', brollRationale: 'The result must be seen.' },
      { ...treatment, id: 'close', label: 'Synthesis', startFrame: 420, durationFrames: 90, viewerTask: 'remember', narrativeRole: 'payoff', sceneFamily: 'speaker-clean', purpose: 'Return to the whole' },
    ],
  });
  document.semantics.scenes = directorPlanFromDocument(document)!.scenes.map((scene) => ({ id: scene.id, clipIds: [], label: scene.label }));
  return document;
}

function graphic(id: string, startFrame: number): GraphicTimelineClip {
  return {
    id,
    kind: 'graphic',
    startFrame,
    durationFrames: 60,
    enabled: true,
    anchor: { type: 'timeline' },
    block: { templateId: 'custom', slots: {}, box: { x: 0.1, y: 0.2, w: 0.8, h: 0.3 } },
  };
}

function media(id: string): MediaTimelineClip {
  return { id, kind: 'media', assetId: 'asset', startFrame: 300, durationFrames: 90, enabled: true, sourceInSec: 0, sourceOutSec: 3 };
}

describe('scene-level visual QA', () => {
  it('selects temporal scene states across entrance, development, payoff and exit', () => {
    const moments = planSceneVisualReview(documentWithPlan());
    expect(moments).toHaveLength(18);
    expect(new Set(moments.map((moment) => moment.sceneId))).toEqual(new Set(['open', 'build', 'turn', 'proof', 'close']));
    expect(new Set(moments.map((moment) => moment.phase))).toEqual(new Set(['entrance', 'develop', 'payoff', 'exit']));
    expect(moments.filter((moment) => moment.phase === 'payoff')).toHaveLength(5);
    const proofPayoff = moments.find((moment) => moment.sceneId === 'proof' && moment.phase === 'payoff');
    expect(proofPayoff?.expected).toContain('evidence: Recorded result');
    expect(proofPayoff?.expected).toContain('visualConcept: A relation assembled in one calm visual language.');
    expect(proofPayoff?.expected).toContain('frameId: knowledge-cards');
  });

  it('caps long plans while keeping critical scene phases and supports exact scene scopes', () => {
    const document = documentWithPlan();
    const scoped = planSceneVisualReview(document, { sceneIds: ['proof'], maxMoments: 18 });
    expect(scoped).toHaveLength(4);
    expect(scoped.map((moment) => moment.phase)).toEqual(['entrance', 'develop', 'payoff', 'exit']);
    expect(sceneAtSecond(document, 11)?.id).toBe('proof');
  });

  it('finds an approved source visual omitted from the timeline and geometry repeated across three scenes', () => {
    const document = documentWithPlan();
    const graphics = [graphic('g-open', 0), graphic('g-build', 90), graphic('g-turn', 210)];
    document.timeline.tracks.push({
      id: 'graphics', type: 'graphics', role: 'graphics', muted: false, hidden: false,
      locked: false, syncLocked: false, stackOrder: 2, clips: [],
    });
    const track = document.timeline.tracks.find((candidate) => candidate.type === 'graphics')!;
    track.clips.push(...graphics);
    for (const [index, sceneId] of ['open', 'build', 'turn'].entries()) {
      document.semantics.scenes.find((scene) => scene.id === sceneId)!.clipIds.push(graphics[index]!.id);
    }
    const issuesBefore = auditSceneVisualStructure(document);
    expect(issuesBefore.filter((issue) => issue.kind === 'repeated-geometry')).toHaveLength(3);
    expect(issuesBefore).toContainEqual(expect.objectContaining({ sceneId: 'proof', kind: 'missing-planned-visual' }));

    document.timeline.tracks.push({
      id: 'broll', type: 'visual', role: 'broll', muted: false, hidden: false,
      locked: false, syncLocked: false, stackOrder: 1, clips: [],
    });
    const broll = document.timeline.tracks.find((candidate) => candidate.role === 'broll')!;
    broll.clips.push(media('proof-source'));
    document.semantics.scenes.find((scene) => scene.id === 'proof')!.clipIds.push('proof-source');
    expect(auditSceneVisualStructure(document)).not.toContainEqual(expect.objectContaining({ sceneId: 'proof', kind: 'missing-planned-visual' }));
  });

  it('audits planned opening imagery even when the scene is not a proof beat', () => {
    const document = documentWithPlan();
    const plan = directorPlanFromDocument(document)!;
    plan.scenes[0]!.brollDecision = 'source';
    plan.scenes[0]!.assetStrategy = 'Open on the supplied title image before returning to the speaker.';
    document.semantics = withDirectorPlanInSemantics(document.semantics, plan);

    expect(auditSceneVisualStructure(document)).toContainEqual(expect.objectContaining({
      sceneId: 'open',
      kind: 'missing-planned-visual',
    }));

    document.timeline.tracks.push({
      id: 'opening-visual', type: 'visual', role: 'broll', muted: false, hidden: false,
      locked: false, syncLocked: false, stackOrder: 1, clips: [
        { ...media('opening-image'), startFrame: 0, durationFrames: 90 },
      ],
    });
    document.semantics.scenes.find((scene) => scene.id === 'open')!.clipIds.push('opening-image');
    expect(auditSceneVisualStructure(document)).not.toContainEqual(expect.objectContaining({
      sceneId: 'open',
      kind: 'missing-planned-visual',
    }));
  });

  it('finds a sound plan whose only overlapping audio is muted', () => {
    const document = documentWithPlan();
    document.assets.voice = { id: 'voice', kind: 'audio', locator: { remoteUrl: 'https://cdn.example/voice.mp3' }, metadata: { durationSec: 3, hasAudio: true } };
    const voice: AudioTimelineClip = {
      id: 'voice-clip', kind: 'audio', assetId: 'voice', startFrame: 0, durationFrames: 90,
      sourceInSec: 0, sourceOutSec: 3, enabled: true, properties: { muted: true }, anchor: { type: 'timeline' },
    };
    document.timeline.tracks.push({
      id: 'voice', type: 'audio', role: 'narration', muted: false, hidden: false,
      locked: false, syncLocked: false, stackOrder: 1, clips: [voice],
    });
    expect(auditSceneVisualStructure(document)).toContainEqual(expect.objectContaining({ sceneId: 'open', kind: 'missing-audible-audio' }));
    voice.properties.muted = false;
    expect(auditSceneVisualStructure(document)).not.toContainEqual(expect.objectContaining({ sceneId: 'open', kind: 'missing-audible-audio' }));
  });

  it('returns an exact, deduplicated Semantic Scene repair boundary', () => {
    expect(sceneVisualRepairScope([
      { sceneId: 'proof', kind: 'missing-evidence' },
      { sceneId: 'proof', kind: 'unsafe-delivery-crop' },
      { sceneId: 'turn', kind: 'frame-drift' },
    ])).toEqual({
      sceneIds: ['proof', 'turn'],
      instruction: 'Repair only the affected Semantic Scenes: proof, turn. Preserve unaffected scenes, then recheck each repaired moment and its immediate boundaries.',
    });
    expect(sceneVisualRepairScope([]).sceneIds).toEqual([]);
  });
});
