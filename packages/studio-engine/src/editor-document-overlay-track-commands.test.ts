import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  emptyEditorDocumentV2,
  type EditorDocumentV2,
  type GraphicTimelineClip,
} from './editor-document';

function graphic(id: string): GraphicTimelineClip {
  return {
    id,
    kind: 'graphic',
    startFrame: 30,
    durationFrames: 60,
    enabled: true,
    block: { templateId: 'custom', slots: { innerHtml: '<div>card</div>' } },
    anchor: { type: 'clip', clipId: 'anchor', offsetFrames: 3 },
  };
}

function documentWithTracks(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2();
  document.timeline.tracks[0]!.clips = [{
    id: 'anchor', kind: 'narrative', assetId: 'main', startFrame: 0, durationFrames: 90,
    enabled: true, sourceInSec: 0, sourceOutSec: 3, properties: { treatment: 'full' },
  }];
  document.assets.main = { id: 'main', kind: 'video', locator: { localSig: 'sig' }, metadata: {} };
  document.timeline.tracks.push({
    id: 'graphics-low', type: 'graphics', muted: false, hidden: true, locked: false,
    syncLocked: false, stackOrder: 2, clips: [graphic('card')],
  }, {
    id: 'graphics-high', type: 'graphics', muted: true, hidden: false, locked: false,
    syncLocked: true, stackOrder: 7, clips: [],
  });
  return document;
}

describe('EditorDocument V2 overlay lane commands', () => {
  it('moves a stable identity, prunes the emptied source lane and retains clip metadata', () => {
    const document = documentWithTracks();
    const result = applyEditorCommand(document, { type: 'overlay.move', clipId: 'card', toTrackId: 'graphics-high' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.id === 'graphics-low')).toBeUndefined();
    expect(result.document.timeline.tracks.find((track) => track.id === 'graphics-high')).toMatchObject({
      muted: true,
      clips: [{ id: 'card', startFrame: 30, durationFrames: 60, anchor: { type: 'clip', clipId: 'anchor', offsetFrames: 3 } }],
    });
    expect(document.timeline.tracks.find((track) => track.id === 'graphics-low')!.clips).toHaveLength(1);
    expect(result.receipt.removedTrackIds).toEqual(['graphics-low']);
  });

  it('duplicates payload and anchors onto a target lane without sharing mutable slot objects', () => {
    const document = documentWithTracks();
    const result = applyEditorCommand(document, {
      type: 'overlay.duplicate', clipId: 'card', newClipId: 'card-copy', startFrame: 120, toTrackId: 'graphics-high',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const source = document.timeline.tracks.find((track) => track.id === 'graphics-low')!.clips[0];
    const copy = result.document.timeline.tracks.find((track) => track.id === 'graphics-high')!.clips[0];
    expect(copy).toMatchObject({ id: 'card-copy', startFrame: 120, durationFrames: 60, anchor: { type: 'clip', clipId: 'anchor' } });
    if (source.kind !== 'graphic' || copy.kind !== 'graphic') throw new Error('expected graphics');
    expect(copy.block.slots).not.toBe(source.block.slots);
    expect(result.receipt.createdClipIds).toEqual(['card-copy']);
  });

  it('rejects moves and duplicates into a locked target without changing either lane', () => {
    const document = documentWithTracks();
    document.timeline.tracks.find((track) => track.id === 'graphics-high')!.locked = true;
    expect(applyEditorCommand(document, { type: 'overlay.move', clipId: 'card', toTrackId: 'graphics-high' })).toMatchObject({
      ok: false, document, error: { code: 'track-locked', trackIds: ['graphics-high'] },
    });
    expect(applyEditorCommand(document, {
      type: 'overlay.duplicate', clipId: 'card', newClipId: 'copy', startFrame: 120, toTrackId: 'graphics-high',
    })).toMatchObject({ ok: false, document, error: { code: 'track-locked', trackIds: ['graphics-high'] } });
  });
});
