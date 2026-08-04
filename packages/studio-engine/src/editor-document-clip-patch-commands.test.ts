import { describe, expect, it } from 'vitest';
import { applyEditorCommand, emptyEditorDocumentV2 } from './editor-document';

describe('EditorDocument V2 clip patch command', () => {
  it('toggles enabled without changing native geometry or prior snapshots', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.main = { id: 'main', kind: 'video', locator: { localSig: 'main' }, metadata: { durationSec: 4 } };
    const track = document.timeline.tracks[0]!;
    track.clips = [{
      id: 'talk', kind: 'narrative', assetId: 'main', startFrame: 90, durationFrames: 60,
      sourceInSec: 2, sourceOutSec: 4, properties: { treatment: 'full' }, enabled: true,
    }];

    const result = applyEditorCommand(document, {
      type: 'clip.patch', trackId: track.id, clipId: 'talk', patch: { enabled: false },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips[0]).toMatchObject({
      id: 'talk', enabled: false, startFrame: 90, durationFrames: 60, sourceInSec: 2, sourceOutSec: 4,
    });
    expect(document.timeline.tracks[0]!.clips[0]!.enabled).toBe(true);
    expect(result.receipt).toMatchObject({ commandType: 'clip.patch', affectedTrackIds: [track.id] });
  });

  it('rejects changes on a locked lane atomically', () => {
    const document = emptyEditorDocumentV2();
    document.assets.main = { id: 'main', kind: 'video', locator: { localSig: 'main' }, metadata: { durationSec: 1 } };
    const track = document.timeline.tracks[0]!;
    track.locked = true;
    track.clips = [{
      id: 'talk', kind: 'narrative', assetId: 'main', startFrame: 0, durationFrames: 30,
      sourceInSec: 0, sourceOutSec: 1, properties: { treatment: 'full' }, enabled: true,
    }];
    const result = applyEditorCommand(document, {
      type: 'clip.patch', trackId: track.id, clipId: 'talk', patch: { enabled: false },
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked' } });
  });
});
