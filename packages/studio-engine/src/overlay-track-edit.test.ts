import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2, type GraphicTimelineClip } from './editor-document';
import {
  duplicateOverlayDocumentClip,
  insertOverlayDocumentClip,
  moveOverlayDocumentClip,
  reorderOverlayDocumentTracks,
} from './overlay-track-edit';

const clip: GraphicTimelineClip = {
  id: 'card', kind: 'graphic', startFrame: 0, durationFrames: 30, enabled: true,
  block: { templateId: 'custom', slots: {} }, anchor: { type: 'timeline' },
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
