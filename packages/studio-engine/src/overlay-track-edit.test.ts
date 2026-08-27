import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2, type GraphicTimelineClip } from './editor-document';
import {
  duplicateOverlayDocumentClip,
  insertOverlayDocumentClip,
  moveOverlayDocumentClip,
  retimeOverlayDocumentClip,
  reorderOverlayDocumentTracks,
} from './overlay-track-edit';
import { directorPlanFromSeconds } from './director-plan';
import { applyDirectorPlanToDocument } from './director-plan-document';
import { applyOverlayDocumentEdits } from './overlay-document-edit';

const clip: GraphicTimelineClip = {
  id: 'card', kind: 'graphic', startFrame: 0, durationFrames: 30, enabled: true,
  block: { templateId: 'custom', slots: {} }, anchor: { type: 'timeline' },
};

const designContract = {
  rhythmArc: 'Setup opens into proof and settles.',
  designSystem: {
    visualConcept: 'Explanation resolving into evidence.', composition: 'Source-led hierarchy.',
    typography: 'One display role and quiet labels.', colorAndMaterial: 'Neutral with one accent.',
    imagery: 'Preserve source truth.', motion: 'Motivated reveal and hold.', sound: 'Voice first.',
  },
};
const treatment = {
  treatmentId: 'source-led', visualAnchor: 'Current subject', visualTreatment: 'One clear full-canvas hierarchy.',
  motionPlan: 'Enter, develop, hold, clear.', soundPlan: 'Keep primary voice audible.',
  assetStrategy: 'Use supplied source.', brollDecision: 'none' as const, brollRationale: 'Continuity is strongest.',
};

function documentWithGraphics() {
  const document = emptyEditorDocumentV2();
  document.timeline.tracks.push({
    id: 'low', type: 'graphics', muted: false, hidden: false, locked: false,
    syncLocked: true, stackOrder: 2, clips: [clip],
  }, {
    id: 'high', type: 'graphics', muted: false, hidden: false, locked: false,
    syncLocked: true, stackOrder: 8, clips: [],
  });
  return document;
}

describe('overlay track transactions', () => {
  it('inserts a generated block into a stable existing lane or creates that lane once', () => {
    const document = documentWithGraphics();
    const first = insertOverlayDocumentClip({
      document,
      block: { id: 'generated', templateId: 'custom', slots: { innerHtml: '<b>Hi</b>' }, startSec: 2, durationSec: 3, trackIndex: 5 },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.trackId).toBe('track_graphics_5');
    expect(first.document.timeline.tracks.find((track) => track.id === first.trackId)).toMatchObject({
      stackOrder: 5,
      clips: [{ id: 'generated', startFrame: 60, durationFrames: 90, block: { templateId: 'custom' } }],
    });
    const second = insertOverlayDocumentClip({
      document: first.document,
      block: { id: 'generated-2', templateId: 'custom', slots: {}, startSec: 0, durationSec: 1, trackIndex: 5 },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.trackId).toBe(first.trackId);
    expect(second.document.timeline.tracks.filter((track) => track.type === 'graphics' && track.stackOrder === 5)).toHaveLength(1);
  });

  it('never reuses or clears a same-level visual media lane for a generated Motion Graphic', () => {
    const document = emptyEditorDocumentV2();
    document.assets.video = {
      id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.test/video.mp4' }, metadata: { durationSec: 4 },
    };
    document.timeline.tracks.push({
      id: 'media-lane', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false,
      syncLocked: false, stackOrder: 5, clips: [{
        id: 'video-clip', kind: 'media', assetId: 'video', startFrame: 0, durationFrames: 120,
        sourceInSec: 0, sourceOutSec: 4, enabled: true,
      }],
    });

    const inserted = insertOverlayDocumentClip({
      document,
      block: { id: 'proof-card', templateId: 'custom', slots: {}, startSec: 1, durationSec: 2, trackIndex: 5 },
    });

    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.trackId).not.toBe('media-lane');
    expect(inserted.document.timeline.tracks.find((track) => track.id === 'media-lane')?.clips).toEqual([
      expect.objectContaining({ id: 'video-clip', startFrame: 0, durationFrames: 120 }),
    ]);
    expect(inserted.document.timeline.tracks.find((track) => track.id === inserted.trackId)).toMatchObject({
      type: 'graphics', stackOrder: 5, clips: [expect.objectContaining({ id: 'proof-card' })],
    });
  });

  it('binds a generated overlay to its explicit Director Plan scene', () => {
    const base = documentWithGraphics();
    const plan = directorPlanFromSeconds({
      goal: 'Explain then prove.',
      creativeThesis: 'Quiet setup, visible proof.',
      ...designContract,
      scenes: [
        { ...treatment, id: 'setup', label: 'Setup', startSec: 0, durationSec: 2, viewerTask: 'understand', narrativeRole: 'explain', sceneFamily: 'speaker-clean', purpose: 'Explain the setup.' },
        { ...treatment, id: 'proof', label: 'Proof', startSec: 2, durationSec: 3, viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'data-explain', purpose: 'Show the result.' },
      ],
    }, 30).plan!;
    const planned = applyDirectorPlanToDocument(base, plan);
    if (!planned.ok) throw new Error(planned.error);
    const inserted = insertOverlayDocumentClip({
      document: planned.document,
      sceneId: 'proof',
      block: { id: 'proof-stat', templateId: 'custom', slots: {}, startSec: 2.2, durationSec: 1, trackIndex: 5 },
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.sceneId).toBe('proof');
    expect(inserted.document.semantics.scenes.find((scene) => scene.id === 'proof')?.clipIds).toContain('proof-stat');
    expect(inserted.document.semantics.scenes.find((scene) => scene.id === 'setup')?.clipIds).not.toContain('proof-stat');
  });

  it('creates a new lane, moves the clip and prunes every empty graphics lane', () => {
    const document = documentWithGraphics();
    const moved = moveOverlayDocumentClip({
      document,
      clipId: 'card',
      newTrack: { id: 'middle', name: 'Graphics', stackOrder: 5 },
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.document.timeline.tracks.find((track) => track.id === 'low')).toBeUndefined();
    expect(moved.document.timeline.tracks.find((track) => track.id === 'high')).toBeUndefined();
    expect(moved.document.timeline.tracks.find((track) => track.id === 'middle')).toMatchObject({ stackOrder: 5, clips: [{ id: 'card' }] });
    expect(moved.document.timeline.tracks.filter((track) => track.type === 'graphics').map((track) => track.id)).toEqual(['middle']);
  });

  it('compacts a retimed non-overlapping graphic onto the lowest free existing lane', () => {
    const document = documentWithGraphics();
    const low = document.timeline.tracks.find((track) => track.id === 'low')!;
    low.clips[0] = { ...low.clips[0]!, durationFrames: 60 };
    const high = document.timeline.tracks.find((track) => track.id === 'high')!;
    high.clips.push({
      ...clip,
      id: 'late-card',
      startFrame: 15,
      durationFrames: 30,
    });

    const retimed = retimeOverlayDocumentClip({
      document,
      clipId: 'late-card',
      startSec: 3,
      durationSec: 1,
    });
    expect(retimed.ok).toBe(true);
    if (!retimed.ok) return;
    expect(retimed.document.timeline.tracks.find((track) => track.id === 'low')?.clips.map((item) => item.id)).toEqual(['card', 'late-card']);
    expect(retimed.document.timeline.tracks.find((track) => track.id === 'high')).toBeUndefined();
  });

  it('rejects moving a Motion Graphic onto a media lane without changing either lane', () => {
    const document = documentWithGraphics();
    document.assets.video = {
      id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.test/video.mp4' }, metadata: { durationSec: 3 },
    };
    document.timeline.tracks.push({
      id: 'media-lane', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false,
      syncLocked: false, stackOrder: 2, clips: [{
        id: 'video-clip', kind: 'media', assetId: 'video', startFrame: 0, durationFrames: 90,
        sourceInSec: 0, sourceOutSec: 3, enabled: true,
      }],
    });

    const moved = moveOverlayDocumentClip({
      document,
      clipId: 'card',
      toTrackId: 'media-lane',
    });
    expect(moved).toMatchObject({ ok: false, error: { code: 'invalid-track-role', trackIds: ['media-lane'] } });
    expect(moved.document).toBe(document);
  });

  it('overwrites blockers when a component is dragged horizontally on the same lane', () => {
    const document = documentWithGraphics();
    document.assets.video = {
      id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.test/video.mp4' }, metadata: { durationSec: 3 },
    };
    const lane = document.timeline.tracks.find((track) => track.id === 'low')!;
    lane.clips.push({
      id: 'video-clip', kind: 'media', assetId: 'video', startFrame: 60, durationFrames: 90,
      sourceInSec: 0, sourceOutSec: 3, enabled: true,
    });

    const moved = applyOverlayDocumentEdits({ document, updates: [{ clipId: 'card', startSec: 2 }] });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const clips = moved.document.timeline.tracks.find((track) => track.id === 'low')?.clips ?? [];
    expect(clips.find((item) => item.id === 'card')).toMatchObject({ startFrame: 60, durationFrames: 30 });
    expect(clips.find((item) => item.id === 'video-clip')).toMatchObject({
      startFrame: 90, durationFrames: 60, sourceInSec: 1, sourceOutSec: 3,
    });
  });

  it('commits track and time together without clearing the pointer\'s old destination range', () => {
    const document = documentWithGraphics();
    document.assets.video = {
      id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.test/video.mp4' }, metadata: { durationSec: 4 },
    };
    document.timeline.tracks.push({
      id: 'media-lane', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false,
      syncLocked: false, stackOrder: 2, clips: [{
        id: 'old-position', kind: 'media', assetId: 'video', startFrame: 0, durationFrames: 30,
        sourceInSec: 0, sourceOutSec: 1, enabled: true,
      }, {
        id: 'final-position', kind: 'media', assetId: 'video', startFrame: 60, durationFrames: 90,
        sourceInSec: 1, sourceOutSec: 4, enabled: true,
      }],
    });

    const moved = moveOverlayDocumentClip({
      document,
      clipId: 'card',
      toTrackId: 'media-lane',
      startSec: 2,
    });
    expect(moved).toMatchObject({ ok: false, error: { code: 'invalid-track-role', trackIds: ['media-lane'] } });
    expect(moved.document).toBe(document);
  });

  it('reassigns duplicated and retimed graphics to the scene at their new placement', () => {
    const base = documentWithGraphics();
    const plan = directorPlanFromSeconds({
      goal: 'Explain then prove.', creativeThesis: 'Setup then evidence.', ...designContract,
      scenes: [
        { ...treatment, id: 'setup', label: 'Setup', startSec: 0, durationSec: 2, viewerTask: 'understand', narrativeRole: 'explain', sceneFamily: 'speaker-clean', purpose: 'Explain.' },
        { ...treatment, id: 'proof', label: 'Proof', startSec: 2, durationSec: 3, viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'data-explain', purpose: 'Prove.' },
      ],
    }, 30).plan!;
    const planned = applyDirectorPlanToDocument(base, plan);
    if (!planned.ok) throw new Error(planned.error);

    const duplicated = duplicateOverlayDocumentClip({
      document: planned.document,
      clipId: 'card',
      newClipId: 'proof-copy',
      startSec: 2.5,
      toTrackId: 'low',
    });
    expect(duplicated.ok).toBe(true);
    if (!duplicated.ok) return;
    expect(duplicated.document.semantics.scenes.find((scene) => scene.id === 'proof')?.clipIds).toContain('proof-copy');

    const moved = applyOverlayDocumentEdits({
      document: duplicated.document,
      updates: [{ clipId: 'card', startSec: 2.2 }],
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.document.semantics.scenes.find((scene) => scene.id === 'proof')?.clipIds).toEqual(expect.arrayContaining(['card', 'proof-copy']));
    expect(moved.document.semantics.scenes.find((scene) => scene.id === 'setup')?.clipIds).not.toContain('card');
  });

  it('rekeys custom HTML and animation selectors when duplicating a graphic', () => {
    const document = documentWithGraphics();
    const source = document.timeline.tracks.find((track) => track.id === 'low')!.clips[0]!;
    if (source.kind !== 'graphic') throw new Error('fixture must be a graphic');
    source.block.slots = {
      innerHtml: '<style>#card .title{color:red}</style><div id="card"><b class="title">Hi</b></div>',
      timelineBody: 'tl.to("#card .title", {opacity:1})',
    };
    const result = duplicateOverlayDocumentClip({
      document,
      clipId: 'card',
      newClipId: 'card-copy',
      startSec: 2,
      toTrackId: 'low',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const copy = result.document.timeline.tracks.flatMap((track) => track.clips).find((item) => item.id === 'card-copy');
    if (!copy || copy.kind !== 'graphic') throw new Error('duplicate must be a graphic');
    expect(copy.block.slots).toMatchObject({
      innerHtml: expect.stringContaining('#card-copy .title'),
      timelineBody: expect.stringContaining('#card-copy .title'),
    });
    expect(JSON.stringify(copy.block.slots)).not.toContain('#card .title');
  });

  it('does not treat caption timing as Director Scene visual ownership', () => {
    const base = documentWithGraphics();
    base.timeline.tracks.push({
      id: 'captions', type: 'caption', muted: false, hidden: false, locked: false,
      syncLocked: true, stackOrder: 20,
      clips: [{ id: 'caption', kind: 'caption', startFrame: 0, durationFrames: 30, enabled: true, managed: false, block: { templateId: 'caption', slots: {} }, anchor: { type: 'timeline' } }],
    });
    const plan = directorPlanFromSeconds({
      goal: 'Explain.', creativeThesis: 'Keep it clear.', ...designContract,
      scenes: [{ ...treatment, id: 'setup', label: 'Setup', startSec: 0, durationSec: 2, viewerTask: 'understand', narrativeRole: 'explain', sceneFamily: 'speaker-clean', purpose: 'Explain.' }],
    }, 30).plan!;
    const planned = applyDirectorPlanToDocument(base, plan);
    if (!planned.ok) throw new Error(planned.error);
    const moved = applyOverlayDocumentEdits({ document: planned.document, updates: [{ clipId: 'caption', startSec: 0.5 }] });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.document.semantics.scenes[0]?.clipIds).not.toContain('caption');
  });

  it('rolls back a newly inserted lane when the following duplicate command fails', () => {
    const document = documentWithGraphics();
    const result = duplicateOverlayDocumentClip({
      document,
      clipId: 'card',
      newClipId: 'card',
      startSec: 2,
      newTrack: { id: 'should-not-land', stackOrder: 5 },
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'duplicate-clip-id' } });
    expect(document.timeline.tracks.some((track) => track.id === 'should-not-land')).toBe(false);
  });

  it('rejects a reorder atomically when a changed lane is locked', () => {
    const document = documentWithGraphics();
    document.timeline.tracks.find((track) => track.id === 'low')!.locked = true;
    const result = reorderOverlayDocumentTracks(document, ['low', 'high']);
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked', trackIds: ['low'] } });
    expect(document.timeline.tracks.find((track) => track.id === 'low')!.stackOrder).toBe(2);
  });
});
