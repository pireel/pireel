import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  captionsAreTopmost,
  emptyEditorDocumentV2,
  parseEditorDocumentV2,
  pinCaptionsOnTop,
  type EditorDocumentV2,
  type EditorTrackRole,
  type EditorTrackType,
} from './editor-document';
import { reorderOverlayDocumentTracks } from './overlay-track-edit';

/** Primary lane + managed captions on top (stackOrder 1), the state every transcribed project starts in. */
function documentWithCaptions(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2();
  const inserted = applyEditorCommand(document, {
    type: 'track.insert',
    track: { id: 'track_managed_captions', type: 'caption', role: 'managedCaptions' },
  });
  if (!inserted.ok) throw new Error(inserted.error.message);
  return inserted.document;
}

const stackOf = (document: EditorDocumentV2, id: string) => document.timeline.tracks.find((track) => track.id === id)!.stackOrder;

function insert(document: EditorDocumentV2, track: { id: string; type: EditorTrackType; role?: EditorTrackRole; stackOrder?: number; syncLocked?: boolean }): EditorDocumentV2 {
  const result = applyEditorCommand(document, { type: 'track.insert', track });
  if (!result.ok) throw new Error(result.error.message);
  return result.document;
}

describe('managed captions are pinned above every visual lane', () => {
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

  it('an explicit stackOrder above the captions still ends up under them', () => {
    const document = documentWithCaptions();
    const next = insert(document, { id: 'track_visual_x', type: 'visual', role: 'broll', stackOrder: 9 });
    expect(stackOf(next, 'track_visual_x')).toBe(9);
    expect(stackOf(next, 'track_managed_captions')).toBe(10);
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

  it('patching a graphics lane above the captions re-pins them (agent update_track cannot demote captions)', () => {
    let document = documentWithCaptions();
    document = insert(document, { id: 'track_graphics', type: 'graphics', role: 'graphics' });
    expect(stackOf(document, 'track_graphics')).toBe(2);
    expect(stackOf(document, 'track_managed_captions')).toBe(3);
    const patched = applyEditorCommand(document, { type: 'track.patch', trackId: 'track_graphics', patch: { stackOrder: 7 } });
    expect(patched.ok).toBe(true);
    if (!patched.ok) return;
    expect(stackOf(patched.document, 'track_graphics')).toBe(7);
    expect(stackOf(patched.document, 'track_managed_captions')).toBe(8);
    expect(patched.receipt.affectedTrackIds).toEqual(['track_graphics', 'track_managed_captions']);
  });

  it('patching the caption lane itself below picture is undone by the pin', () => {
    let document = documentWithCaptions();
    document = insert(document, { id: 'track_broll', type: 'visual', role: 'broll' });
    const patched = applyEditorCommand(document, { type: 'track.patch', trackId: 'track_managed_captions', patch: { stackOrder: 0.5 } });
    expect(patched.ok).toBe(true);
    if (!patched.ok) return;
    expect(captionsAreTopmost(patched.document)).toBe(true);
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
    expect(inserted.receipt.affectedTrackIds).toEqual(['track_music']);
  });
});

describe('lane reorder leaves the pinned captions alone', () => {
  function threeLanes(): EditorDocumentV2 {
    let document = documentWithCaptions();
    document = insert(document, { id: 'track_a', type: 'visual', role: 'broll' });
    document = insert(document, { id: 'track_b', type: 'graphics', role: 'graphics' });
    return document;
  }

  it('accepts the full top-to-bottom order including the caption lane and swaps only the others', () => {
    const document = threeLanes();
    const before = { a: stackOf(document, 'track_a'), b: stackOf(document, 'track_b'), c: stackOf(document, 'track_managed_captions') };
    expect(before.c).toBeGreaterThan(before.b);
    const reordered = reorderOverlayDocumentTracks(document, ['track_managed_captions', 'track_a', 'track_b']);
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(stackOf(reordered.document, 'track_a')).toBe(before.b);
    expect(stackOf(reordered.document, 'track_b')).toBe(before.a);
    expect(stackOf(reordered.document, 'track_managed_captions')).toBe(before.c);
    expect(captionsAreTopmost(reordered.document)).toBe(true);
  });

  it('a list that puts the captions in the middle changes nothing about them', () => {
    const document = threeLanes();
    const reordered = reorderOverlayDocumentTracks(document, ['track_a', 'track_managed_captions', 'track_b']);
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) return;
    expect(captionsAreTopmost(reordered.document)).toBe(true);
  });

  it('still refuses an order that misses a visual lane', () => {
    const document = threeLanes();
    expect(reorderOverlayDocumentTracks(document, ['track_a']).ok).toBe(false);
  });
});

describe('load-time repair: captions covered by older lanes come back on top', () => {
  function coveredCaptions(): EditorDocumentV2 {
    const base = documentWithCaptions();
    return {
      ...base,
      timeline: {
        ...base.timeline,
        tracks: [
          ...base.timeline.tracks,
          { id: 'track_broll', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 2, clips: [] },
        ],
      },
    };
  }

  it('pinCaptionsOnTop lifts the caption lane above the covering lane', () => {
    const document = coveredCaptions();
    const repaired = pinCaptionsOnTop(document);
    expect(repaired).not.toBe(document);
    expect(stackOf(repaired, 'track_managed_captions')).toBe(3);
    expect(stackOf(repaired, 'track_broll')).toBe(2);
  });

  it('captions already on top: same document instance back', () => {
    const document = documentWithCaptions();
    expect(pinCaptionsOnTop(document)).toBe(document);
  });

  it('parseEditorDocumentV2 applies the pin to stored documents', () => {
    const parsed = parseEditorDocumentV2(JSON.parse(JSON.stringify(coveredCaptions())));
    expect(parsed).not.toBeNull();
    expect(captionsAreTopmost(parsed!)).toBe(true);
  });
});
