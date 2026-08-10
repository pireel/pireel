import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from './editor-document';
import type { EditorDocumentV2, GraphicTimelineClip, MediaTimelineClip } from './editor-document/types';
import { auditSceneVisualStructure, planSceneVisualReview, sceneAtSecond, sceneVisualRepairScope } from './scene-visual-qa';

function documentWithPlan(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
  document.appearance.frameId = 'knowledge-cards';
  document.semantics.directorPlan = {
    version: 1,
    goal: 'Teach one model',
    creativeThesis: 'The relation becomes visible',
    frameId: 'knowledge-cards',
    scenes: [
      { id: 'open', label: 'Question', startFrame: 0, durationFrames: 90, viewerTask: 'orient', narrativeRole: 'hook', sceneFamily: 'speaker-clean', purpose: 'Open on the real question' },
      { id: 'build', label: 'Build', startFrame: 90, durationFrames: 120, viewerTask: 'understand', narrativeRole: 'explain', sceneFamily: 'structure-explain', purpose: 'Build the relation' },
      { id: 'turn', label: 'Turn', startFrame: 210, durationFrames: 90, viewerTask: 'feel', narrativeRole: 'turn', sceneFamily: 'designed-fullscreen', purpose: 'Correct the model' },
      { id: 'proof', label: 'Proof', startFrame: 300, durationFrames: 120, viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'media-evidence', purpose: 'Show the evidence', evidence: ['Recorded result'] },
      { id: 'close', label: 'Synthesis', startFrame: 420, durationFrames: 90, viewerTask: 'remember', narrativeRole: 'payoff', sceneFamily: 'speaker-clean', purpose: 'Return to the whole' },
    ],
  };
  document.semantics.scenes = document.semantics.directorPlan.scenes.map((scene) => ({ id: scene.id, clipIds: [], label: scene.label }));
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
  it('selects scene representatives and explicitly covers entrance, pressure, proof and exit', () => {
    const moments = planSceneVisualReview(documentWithPlan());
    expect(moments.map((moment) => moment.sceneId)).toEqual(['open', 'build', 'turn', 'proof', 'close']);
    expect(moments.map((moment) => moment.phase)).toEqual(['entrance', 'scene', 'pressure', 'proof', 'exit']);
    expect(moments[3]?.expected).toContain('evidence: Recorded result');
    expect(moments[3]?.expected).toContain('frameId: knowledge-cards');
  });

  it('caps long plans while keeping critical scene phases and supports exact scene scopes', () => {
    const document = documentWithPlan();
    const scoped = planSceneVisualReview(document, { sceneIds: ['proof'], maxMoments: 18 });
    expect(scoped).toHaveLength(1);
    expect(scoped[0]).toMatchObject({ sceneId: 'proof', phase: 'proof' });
    expect(sceneAtSecond(document, 11)?.id).toBe('proof');
  });

  it('finds proof scenes without source evidence and geometry repeated across three scenes', () => {
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
    expect(issuesBefore).toContainEqual(expect.objectContaining({ sceneId: 'proof', kind: 'missing-evidence' }));

    document.timeline.tracks.push({
      id: 'broll', type: 'visual', role: 'broll', muted: false, hidden: false,
      locked: false, syncLocked: false, stackOrder: 1, clips: [],
    });
    const broll = document.timeline.tracks.find((candidate) => candidate.role === 'broll')!;
    broll.clips.push(media('proof-source'));
    document.semantics.scenes.find((scene) => scene.id === 'proof')!.clipIds.push('proof-source');
    expect(auditSceneVisualStructure(document)).not.toContainEqual(expect.objectContaining({ sceneId: 'proof', kind: 'missing-evidence' }));
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
