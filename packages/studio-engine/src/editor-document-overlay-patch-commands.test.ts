import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  emptyEditorDocumentV2,
  type CaptionTimelineClip,
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
    block: {
      templateId: 'custom',
      slots: { innerHtml: '<div>card</div>' },
      box: { x: 0.1, y: 0.2, w: 0.4, h: 0.2 },
      contentBox: { x: 0.05, y: 0.1, w: 0.5, h: 0.3 },
    },
    anchor: { type: 'timeline' },
  };
}

function caption(id: string): CaptionTimelineClip {
  return {
    id,
    kind: 'caption',
    startFrame: 0,
    durationFrames: 45,
    enabled: false,
    managed: true,
    block: { templateId: 'caption', slots: {} },
    anchor: { type: 'word', assetId: 'main', segmentIndex: 0, wordIndex: 0, offsetFrames: 0 },
  };
}

function overlayDocument(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.main = { id: 'main', kind: 'video', locator: { localSig: 'sig' }, metadata: {} };
  document.timeline.tracks.push({
    id: 'graphics', type: 'graphics', muted: false, hidden: true, locked: false,
    syncLocked: false, stackOrder: 7, clips: [graphic('card')],
  }, {
    id: 'captions', type: 'caption', role: 'managedCaptions', muted: true, hidden: false,
    locked: false, syncLocked: true, stackOrder: 8, clips: [caption('caption')],
  });
  document.semantics.managedCaptionTrackId = 'captions';
  return document;
}

describe('EditorDocument V2 overlay patch command', () => {
  it('patches multiple overlay lanes atomically while retaining payload, anchors and flags', () => {
    const document = overlayDocument();
    const result = applyEditorCommand(document, {
      type: 'overlay.patch',
      updates: [
        { clipId: 'card', patch: { startFrame: 90, durationFrames: 75, block: { box: { x: 0.5, y: 0.2, w: 0.4, h: 0.2 }, contentBox: undefined } } },
        { clipId: 'caption', patch: { startFrame: 15 } },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(document.timeline.tracks.find((track) => track.id === 'graphics')!.clips[0]).toMatchObject({ startFrame: 30, durationFrames: 60 });
    expect(result.document.timeline.tracks.find((track) => track.id === 'graphics')).toMatchObject({
      hidden: true,
      syncLocked: false,
      stackOrder: 7,
      clips: [{
        id: 'card', startFrame: 90, durationFrames: 75, enabled: true,
        block: { templateId: 'custom', slots: { innerHtml: '<div>card</div>' }, box: { x: 0.5 } },
        anchor: { type: 'timeline' },
      }],
    });
    expect(result.document.timeline.tracks.find((track) => track.id === 'graphics')!.clips[0]).not.toHaveProperty('block.contentBox');
    expect(result.document.timeline.tracks.find((track) => track.id === 'captions')!.clips[0]).toMatchObject({
      startFrame: 15,
      enabled: false,
      anchor: { type: 'word', assetId: 'main' },
    });
    expect(result.receipt.affectedTrackIds).toEqual(['graphics', 'captions']);
  });

  it('rejects the whole multi-lane patch when one target lane is locked', () => {
    const document = overlayDocument();
    document.timeline.tracks.find((track) => track.id === 'captions')!.locked = true;
    const result = applyEditorCommand(document, {
      type: 'overlay.patch',
      updates: [
        { clipId: 'card', patch: { startFrame: 90 } },
        { clipId: 'caption', patch: { startFrame: 15 } },
      ],
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked', trackIds: ['captions'] } });
    expect(document.timeline.tracks.find((track) => track.id === 'graphics')!.clips[0]).toMatchObject({ startFrame: 30 });
  });
});
