import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  captionsAreTopmost,
  emptyEditorDocumentV2,
  liftCaptionsAboveFullFrameMedia,
  parseEditorDocumentV2,
  type EditorDocumentV2,
  type MediaTimelineClip,
} from './editor-document';

function mediaClip(id: string, box?: MediaTimelineClip['box']): MediaTimelineClip {
  return {
    id,
    kind: 'media',
    assetId: 'asset-video',
    startFrame: 0,
    durationFrames: 30,
    sourceInSec: 0,
    sourceOutSec: 1,
    enabled: true,
    ...(box ? { box } : {}),
  };
}

/** Primary lane + managed captions on top (stackOrder 1), the state every transcribed project starts in. */
function documentWithCaptions(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2();
  document.assets['asset-video'] = {
    id: 'asset-video',
    kind: 'video',
    locator: { localSig: 'video-sig' },
    metadata: { durationSec: 10 },
  };
  const inserted = applyEditorCommand(document, {
    type: 'track.insert',
    track: { id: 'track_managed_captions', type: 'caption', role: 'managedCaptions' },
  });
  if (!inserted.ok) throw new Error(inserted.error.message);
  return inserted.document;
}

const stackOf = (document: EditorDocumentV2, id: string) => document.timeline.tracks.find((track) => track.id === id)!.stackOrder;

describe('managed captions stay above new visual lanes', () => {
  it('a B-roll lane inserted after captions (default stackOrder) lands below them', () => {
    const document = documentWithCaptions();
    expect(captionsAreTopmost(document)).toBe(true);
    const inserted = applyEditorCommand(document, {
      type: 'track.insert',
      track: { id: 'track_broll', type: 'visual', role: 'broll' },
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(stackOf(inserted.document, 'track_broll')).toBeLessThan(stackOf(inserted.document, 'track_managed_captions'));
    expect(captionsAreTopmost(inserted.document)).toBe(true);
    expect(inserted.receipt.affectedTrackIds).toEqual(['track_broll', 'track_managed_captions']);
  });

  it('an explicit stackOrder at the caption level still keeps captions on top', () => {
    const document = documentWithCaptions();
    const inserted = applyEditorCommand(document, {
      type: 'track.insert',
      track: { id: 'track_visual_x', type: 'visual', role: 'broll', stackOrder: stackOf(document, 'track_managed_captions') },
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(stackOf(inserted.document, 'track_visual_x')).toBe(1);
    expect(stackOf(inserted.document, 'track_managed_captions')).toBe(2);
  });

  it('a lane inserted below the captions leaves them untouched', () => {
    const document = documentWithCaptions();
    const inserted = applyEditorCommand(document, {
      type: 'track.insert',
      track: { id: 'track_low', type: 'visual', role: 'broll', stackOrder: 0.5 },
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(stackOf(inserted.document, 'track_managed_captions')).toBe(1);
    expect(inserted.receipt.affectedTrackIds).toEqual(['track_low']);
  });

  it('once the user has demoted the captions, new lanes no longer push them around', () => {
    let document = documentWithCaptions();
    const graphics = applyEditorCommand(document, {
      type: 'track.insert',
      track: { id: 'track_graphics_top', type: 'graphics', role: 'graphics', stackOrder: 5 },
    });
    if (!graphics.ok) throw new Error(graphics.error.message);
    // Simulate the lane reorder: graphics above captions on purpose
    document = {
      ...graphics.document,
      timeline: {
        ...graphics.document.timeline,
        tracks: graphics.document.timeline.tracks.map((track) => (track.id === 'track_managed_captions' ? { ...track, stackOrder: 1 } : track)),
      },
    };
    expect(captionsAreTopmost(document)).toBe(false);
    const inserted = applyEditorCommand(document, {
      type: 'track.insert',
      track: { id: 'track_broll', type: 'visual', role: 'broll' },
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(stackOf(inserted.document, 'track_managed_captions')).toBe(1);
    expect(stackOf(inserted.document, 'track_broll')).toBe(6);
  });

  it('audio lanes never interact with the caption stack', () => {
    const document = documentWithCaptions();
    const inserted = applyEditorCommand(document, {
      type: 'track.insert',
      track: { id: 'track_music', type: 'audio', role: 'music', syncLocked: false },
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(stackOf(inserted.document, 'track_managed_captions')).toBe(1);
  });
});

describe('load-time repair: captions lifted above full-frame media lanes', () => {
  function withLaneAbove(clip: MediaTimelineClip, stackOrder = 2): EditorDocumentV2 {
    const base = documentWithCaptions();
    // Build the pre-rule state by hand: a B-roll lane above the captions
    return {
      ...base,
      timeline: {
        ...base.timeline,
        tracks: [
          ...base.timeline.tracks,
          { id: 'track_broll', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder, clips: [clip] },
        ],
      },
    };
  }

  it('a full-frame B-roll lane above the captions → captions move to the top', () => {
    const document = withLaneAbove(mediaClip('broll_1'));
    const repaired = liftCaptionsAboveFullFrameMedia(document);
    expect(repaired).not.toBe(document);
    expect(stackOf(repaired, 'track_managed_captions')).toBe(3);
    expect(stackOf(repaired, 'track_broll')).toBe(2);
    expect(captionsAreTopmost(repaired)).toBe(true);
  });

  it('a boxed (PiP) media lane above the captions is left alone — that can be deliberate', () => {
    const document = withLaneAbove(mediaClip('pip_1', { x: 0.6, y: 0.6, w: 0.3, h: 0.3 }));
    expect(liftCaptionsAboveFullFrameMedia(document)).toBe(document);
  });

  it('captions already on top: same document instance back', () => {
    const document = documentWithCaptions();
    expect(liftCaptionsAboveFullFrameMedia(document)).toBe(document);
  });

  it('parseEditorDocumentV2 applies the repair to stored documents', () => {
    const stored = JSON.parse(JSON.stringify(withLaneAbove(mediaClip('broll_1'))));
    const parsed = parseEditorDocumentV2(stored);
    expect(parsed).not.toBeNull();
    expect(captionsAreTopmost(parsed!)).toBe(true);
  });
});
