import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  emptyEditorDocumentV2,
  type EditorDocumentV2,
  type GraphicTimelineClip,
  type NarrativeTimelineClip,
} from './editor-document';

function narrative(id: string, startFrame: number, linkGroupId?: string): NarrativeTimelineClip {
  return {
    id, kind: 'narrative', assetId: 'video', startFrame, durationFrames: 60,
    sourceInSec: 0, sourceOutSec: 2, properties: { treatment: 'full' }, enabled: true,
    ...(linkGroupId ? { linkGroupId } : {}),
  };
}

function graphic(id: string, anchorId: string, locked = false): { clip: GraphicTimelineClip; track: EditorDocumentV2['timeline']['tracks'][number] } {
  const clip: GraphicTimelineClip = {
    id, kind: 'graphic', startFrame: 0, durationFrames: 60, enabled: true,
    block: { templateId: 'custom', slots: {} }, anchor: { type: 'clip', clipId: anchorId, offsetFrames: 0 },
  };
  return {
    clip,
    track: {
      id: `${id}-track`, type: 'graphics', role: 'graphics', muted: false, hidden: false,
      locked, syncLocked: false, stackOrder: 2, clips: [clip],
    },
  };
}

function testDocument(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.video = { id: 'video', kind: 'video', locator: { localSig: 'sig' }, metadata: { durationSec: 4 } };
  document.semantics.primaryNarrativeAssetId = 'video';
  return document;
}

describe('EditorDocument V2 exact clip removal', () => {
  it('removes only named clips, retains the required empty primary lane and detaches surviving anchors', () => {
    const document = testDocument();
    document.timeline.tracks[0]!.clips = [narrative('remove-me', 0), narrative('overlap-stays', 30)];
    document.semantics.scenes = [{ id: 'scene', clipIds: ['remove-me', 'overlap-stays'] }];
    const anchored = graphic('anchored', 'remove-me');
    document.timeline.tracks.push(anchored.track);

    const result = applyEditorCommand(document, {
      type: 'clips.remove', trackId: document.semantics.primaryNarrativeTrackId,
      clipIds: ['remove-me'], includeLinked: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips.map((clip) => clip.id)).toEqual(['overlap-stays']);
    expect(result.document.timeline.tracks.find((track) => track.id === 'anchored-track')!.clips[0]).toMatchObject({
      anchor: { type: 'timeline' }, startFrame: 0,
    });
    expect(result.document.semantics.scenes[0]!.clipIds).toEqual(['overlap-stays']);
    expect(result.receipt).toMatchObject({
      affectedTrackIds: expect.arrayContaining([document.semantics.primaryNarrativeTrackId, 'anchored-track']),
      removedClipIds: ['remove-me'],
    });
  });

  it('rejects atomically when exact removal would detach an anchor on a locked lane', () => {
    const document = testDocument();
    document.timeline.tracks[0]!.clips = [narrative('talk', 0)];
    document.timeline.tracks.push(graphic('locked-anchor', 'talk', true).track);
    const result = applyEditorCommand(document, {
      type: 'clips.remove', trackId: document.semantics.primaryNarrativeTrackId,
      clipIds: ['talk'], includeLinked: false,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'track-locked', trackIds: ['locked-anchor-track'] } });
    expect(result.document).toBe(document);
  });
});
