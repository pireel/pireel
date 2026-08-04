import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2, type GraphicTimelineClip } from './editor-document';
import {
  duplicateOverlayDocumentClip,
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
  it('creates a new lane and moves a clip without pruning the source, then reorders empty lanes', () => {
    const document = documentWithGraphics();
    const moved = moveOverlayDocumentClip({
      document,
      clipId: 'card',
      newTrack: { id: 'middle', name: 'Graphics', stackOrder: 5 },
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.document.timeline.tracks.find((track) => track.id === 'low')).toMatchObject({ stackOrder: 2, clips: [] });
    expect(moved.document.timeline.tracks.find((track) => track.id === 'middle')).toMatchObject({ stackOrder: 5, clips: [{ id: 'card' }] });

    const reordered = reorderOverlayDocumentTracks(moved.document, ['low', 'middle', 'high']);
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(Object.fromEntries(reordered.document.timeline.tracks.filter((track) => track.type === 'graphics').map((track) => [track.id, track.stackOrder]))).toEqual({
      low: 8,
      middle: 5,
      high: 2,
    });
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
