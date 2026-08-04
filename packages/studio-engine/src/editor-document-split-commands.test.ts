import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  applyNarrationSplitCommands,
  emptyEditorDocumentV2,
  type EditorDocumentV2,
} from './editor-document';

function documentWithGap(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.main = { id: 'main', kind: 'video', locator: { localSig: 'main-sig' }, metadata: { durationSec: 10 } };
  document.semantics.primaryNarrativeAssetId = 'main';
  document.semantics.scenes = [{ id: 'scene', clipIds: ['talk'] }];
  document.timeline.tracks[0]!.clips = [{
    id: 'talk', kind: 'narrative', assetId: 'main', startFrame: 45, durationFrames: 300,
    sourceInSec: 0, sourceOutSec: 10, properties: { treatment: 'full' }, enabled: true,
  }];
  return document;
}

describe('V2 clip split commands', () => {
  it('splits inside native timeline geometry without collapsing a leading gap', () => {
    const document = documentWithGap();
    const result = applyEditorCommand(document, {
      type: 'clip.split',
      trackId: document.semantics.primaryNarrativeTrackId,
      clipId: 'talk',
      atFrame: 195,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips).toMatchObject([
      { id: 'talk', startFrame: 45, durationFrames: 150, sourceInSec: 0, sourceOutSec: 5 },
      { id: 'talk~split-195', startFrame: 195, durationFrames: 150, sourceInSec: 5, sourceOutSec: 10 },
    ]);
    expect(result.document.semantics.scenes[0]?.clipIds).toEqual(['talk', 'talk~split-195']);
  });

  it('resolves multiple compatibility points by clip lineage plus source seconds', () => {
    const document = documentWithGap();
    const result = applyNarrationSplitCommands(document, [
      { clipId: 'talk', sourceSec: 2 },
      { clipId: 'talk', sourceSec: 5 },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips).toMatchObject([
      { startFrame: 45, sourceInSec: 0, sourceOutSec: 2 },
      { startFrame: 105, sourceInSec: 2, sourceOutSec: 5 },
      { startFrame: 195, sourceInSec: 5, sourceOutSec: 10 },
    ]);
  });

  it('splits linked partners atomically and keeps the right halves linked', () => {
    const document = documentWithGap();
    document.timeline.tracks[0]!.clips[0]!.linkGroupId = 'av';
    document.timeline.tracks.push({
      id: 'audio', type: 'audio', role: 'music', muted: false, hidden: false, locked: false,
      syncLocked: true, stackOrder: 1, clips: [{
        id: 'audio-talk', kind: 'audio', assetId: 'main', startFrame: 45, durationFrames: 300,
        sourceInSec: 0, sourceOutSec: 10, properties: {}, anchor: { type: 'timeline' },
        linkGroupId: 'av', enabled: true,
      }],
    });
    const result = applyEditorCommand(document, {
      type: 'clip.split', trackId: document.semantics.primaryNarrativeTrackId, clipId: 'talk', atFrame: 195,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.receipt.affectedTrackIds).toEqual([document.semantics.primaryNarrativeTrackId, 'audio']);
    expect(result.document.timeline.tracks[1]!.clips).toMatchObject([
      { id: 'audio-talk', durationFrames: 150, linkGroupId: 'av' },
      { id: 'audio-talk~split-195', startFrame: 195, durationFrames: 150, linkGroupId: 'av~split-195' },
    ]);
    expect(result.document.timeline.tracks[0]!.clips[1]).toMatchObject({ linkGroupId: 'av~split-195' });
  });

  it('fails atomically when the primary lane is locked', () => {
    const document = documentWithGap();
    document.timeline.tracks[0]!.locked = true;
    const result = applyNarrationSplitCommands(document, [{ clipId: 'talk', sourceSec: 5 }]);
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked' } });
    expect(document.timeline.tracks[0]!.clips).toHaveLength(1);
  });

  it('fails atomically when a linked lane is locked', () => {
    const document = documentWithGap();
    document.timeline.tracks[0]!.clips[0]!.linkGroupId = 'av';
    document.timeline.tracks.push({
      id: 'audio', type: 'audio', muted: false, hidden: false, locked: true,
      syncLocked: true, stackOrder: 1, clips: [{
        id: 'audio-talk', kind: 'audio', assetId: 'main', startFrame: 45, durationFrames: 300,
        sourceInSec: 0, sourceOutSec: 10, properties: {}, anchor: { type: 'timeline' },
        linkGroupId: 'av', enabled: true,
      }],
    });
    const result = applyEditorCommand(document, {
      type: 'clip.split', trackId: document.semantics.primaryNarrativeTrackId, clipId: 'talk', atFrame: 195,
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked', trackIds: ['audio'] } });
    expect(document.timeline.tracks.every((candidate) => candidate.clips.length === 1)).toBe(true);
  });
});
