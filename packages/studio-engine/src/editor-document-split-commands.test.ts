import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  applyNarrationSplitCommands,
  emptyEditorDocumentV2,
  narrativeTimelineRangesForAssetSourceRange,
  narrativeTrimRangeAtTimelineSecond,
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
  it('resolves native trim and source ranges around gaps', () => {
    const document = documentWithGap();
    expect(narrativeTrimRangeAtTimelineSecond(document, 5, 'left')).toEqual({ fromSec: 1.5, toSec: 5 });
    expect(narrativeTrimRangeAtTimelineSecond(document, 5, 'right')).toEqual({ fromSec: 5, toSec: 11.5 });
    expect(narrativeTrimRangeAtTimelineSecond(document, 1, 'left')).toBeNull();
    expect(narrativeTimelineRangesForAssetSourceRange(document, 'main', 2, 5)).toMatchObject([
      { clipId: 'talk', fromSec: 3.5, toSec: 6.5, sourceFromSec: 2, sourceToSec: 5 },
    ]);
  });

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

  it('splits selected media and graphic clips on non-primary tracks', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.cutaway = {
      id: 'cutaway', kind: 'video', locator: { localSig: 'cutaway-sig' }, metadata: { durationSec: 3 },
    };
    document.timeline.tracks.push({
      id: 'media', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false,
      syncLocked: false, stackOrder: 2, clips: [{
        id: 'cutaway-clip', kind: 'media', assetId: 'cutaway', startFrame: 0, durationFrames: 90,
        sourceInSec: 0, sourceOutSec: 3, enabled: true,
      }],
    });
    document.timeline.tracks.push({
      id: 'graphics', type: 'graphics', role: 'graphics', muted: false, hidden: false, locked: false,
      syncLocked: false, stackOrder: 3, clips: [{
        id: 'card', kind: 'graphic', startFrame: 0, durationFrames: 90, enabled: true,
        block: { templateId: 'custom', slots: { title: 'Selected clip' } }, anchor: { type: 'timeline' },
      }],
    });

    const mediaSplit = applyEditorCommand(document, {
      type: 'clip.split', trackId: 'media', clipId: 'cutaway-clip', atFrame: 30,
    });
    expect(mediaSplit.ok).toBe(true);
    if (!mediaSplit.ok) return;
    const graphicSplit = applyEditorCommand(mediaSplit.document, {
      type: 'clip.split', trackId: 'graphics', clipId: 'card', atFrame: 60,
    });
    expect(graphicSplit.ok).toBe(true);
    if (!graphicSplit.ok) return;

    expect(graphicSplit.document.timeline.tracks.find((track) => track.id === 'media')?.clips).toMatchObject([
      { id: 'cutaway-clip', durationFrames: 30, sourceInSec: 0, sourceOutSec: 1 },
      { id: 'cutaway-clip~split-30', startFrame: 30, durationFrames: 60, sourceInSec: 1, sourceOutSec: 3 },
    ]);
    expect(graphicSplit.document.timeline.tracks.find((track) => track.id === 'graphics')?.clips).toMatchObject([
      { id: 'card', durationFrames: 60, block: { slots: { title: 'Selected clip' } } },
      { id: 'card~split-60', startFrame: 60, durationFrames: 30, block: { slots: { title: 'Selected clip' } } },
    ]);
  });

  it('resolves multiple native timeline points without collapsing the leading gap', () => {
    const document = documentWithGap();
    const result = applyNarrationSplitCommands(document, [3.5, 6.5]);
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
    const result = applyNarrationSplitCommands(document, [6.5]);
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked' } });
    expect(document.timeline.tracks[0]!.clips).toHaveLength(1);
  });

  it('rejects a split in a native timeline gap', () => {
    const document = documentWithGap();
    const result = applyNarrationSplitCommands(document, [1]);
    expect(result).toMatchObject({ ok: false, document, error: { code: 'invalid-range' } });
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
