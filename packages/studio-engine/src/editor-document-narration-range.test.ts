import { describe, expect, it } from 'vitest';
import {
  applyNarrationRangeCommands,
  emptyEditorDocumentV2,
  type EditorDocumentV2,
  type NarrativeTimelineClip,
} from './editor-document';

function documentWithNarration(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.main = { id: 'main', kind: 'video', locator: { localSig: 'main-sig' }, metadata: { durationSec: 10 } };
  document.assets.broll = { id: 'broll', kind: 'video', locator: { localSig: 'broll-sig' }, metadata: { durationSec: 4 } };
  const clip: NarrativeTimelineClip = {
    id: 'talk', kind: 'narrative', assetId: 'main', startFrame: 0, durationFrames: 300,
    sourceInSec: 0, sourceOutSec: 10, properties: { treatment: 'full' }, enabled: true,
  };
  document.timeline.tracks[0]!.clips = [clip];
  document.timeline.tracks.push({
    id: 'broll-track', type: 'visual', role: 'broll', muted: false, hidden: false,
    locked: false, syncLocked: true, stackOrder: 1,
    clips: [{ id: 'broll-clip', kind: 'media', assetId: 'broll', startFrame: 120, durationFrames: 120, sourceInSec: 0, sourceOutSec: 4, enabled: true }],
  });
  return document;
}

describe('primary narration range command orchestration', () => {
  it('applies multiple ranges atomically from the end and ripples native media lanes', () => {
    const document = documentWithNarration();
    const result = applyNarrationRangeCommands(document, [
      { fromSec: 1, toSec: 2 },
      { fromSec: 7, toSec: 8 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.removedFrames).toBe(60);
    expect(result.receipts).toHaveLength(2);
    expect(result.document.timeline.tracks[0]!.clips).toMatchObject([
      { id: 'talk', startFrame: 0, durationFrames: 30, sourceInSec: 0, sourceOutSec: 1 },
      { startFrame: 30, sourceInSec: 2, sourceOutSec: 7 },
      { startFrame: 180, sourceInSec: 8, sourceOutSec: 10 },
    ]);
    expect(result.document.timeline.tracks.find((track) => track.id === 'broll-track')?.clips[0]).toMatchObject({
      id: 'broll-clip',
      startFrame: 90,
    });
  });

  it('rolls the entire batch back when a later range touches a locked lane', () => {
    const document = documentWithNarration();
    document.timeline.tracks.find((track) => track.id === 'broll-track')!.locked = true;
    const result = applyNarrationRangeCommands(document, [
      { fromSec: 1, toSec: 2 },
      { fromSec: 7, toSec: 8 },
    ]);
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked', trackIds: ['broll-track'] } });
    expect(document.timeline.tracks[0]!.clips).toHaveLength(1);
  });
});
