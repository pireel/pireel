import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  emptyEditorDocumentV2,
  validateEditorDocumentV2,
  type AudioTimelineClip,
  type CaptionTimelineClip,
  type EditorDocumentV2,
  type EditorTrack,
  type GraphicTimelineClip,
  type NarrativeTimelineClip,
} from './editor-document';

function testDocument(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.video = {
    id: 'video',
    kind: 'video',
    locator: { localSig: 'video-sig' },
    metadata: { durationSec: 20 },
  };
  document.assets.audio = {
    id: 'audio',
    kind: 'audio',
    locator: { localSig: 'audio-sig' },
    metadata: { durationSec: 20 },
  };
  document.semantics.primaryNarrativeAssetId = 'video';
  return document;
}

function narrativeClip(overrides: Partial<NarrativeTimelineClip> = {}): NarrativeTimelineClip {
  return {
    id: 'talk',
    kind: 'narrative',
    assetId: 'video',
    startFrame: 0,
    durationFrames: 300,
    sourceInSec: 0,
    sourceOutSec: 10,
    properties: { treatment: 'full', transIn: { prevId: 'previous', effect: 'fade', durationSec: 1 } },
    enabled: true,
    ...overrides,
  };
}

function graphicClip(id: string, startFrame: number, durationFrames: number, linkGroupId?: string): GraphicTimelineClip {
  return {
    id,
    kind: 'graphic',
    startFrame,
    durationFrames,
    enabled: true,
    ...(linkGroupId ? { linkGroupId } : {}),
    block: { templateId: 'custom', slots: {} },
    anchor: { type: 'timeline' },
  };
}

function audioClip(id: string, startFrame: number, durationFrames: number): AudioTimelineClip {
  return {
    id,
    kind: 'audio',
    assetId: 'audio',
    startFrame,
    durationFrames,
    sourceInSec: 0,
    sourceOutSec: durationFrames / 30,
    properties: {},
    anchor: { type: 'timeline' },
    enabled: true,
  };
}

function track(input: Pick<EditorTrack, 'id' | 'type' | 'clips'> & Partial<EditorTrack>): EditorTrack {
  return {
    muted: false,
    hidden: false,
    locked: false,
    syncLocked: true,
    stackOrder: 1,
    ...input,
  };
}

describe('EditorDocument V2 range commands', () => {
  it('lifts a middle range into a real gap while preserving source coordinates and scene identity', () => {
    const document = testDocument();
    document.timeline.tracks[0]!.clips = [narrativeClip()];
    document.semantics.scenes = [{ id: 'scene', clipIds: ['talk'] }];
    const before = structuredClone(document);

    const result = applyEditorCommand(document, {
      type: 'range.remove',
      trackId: document.semantics.primaryNarrativeTrackId,
      startFrame: 90,
      endFrame: 180,
      mode: 'lift',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(document).toEqual(before);
    expect(result.document.timeline.tracks[0]!.clips).toMatchObject([
      { id: 'talk', startFrame: 0, durationFrames: 90, sourceInSec: 0, sourceOutSec: 3 },
      { id: 'talk~split-180', startFrame: 180, durationFrames: 120, sourceInSec: 6, sourceOutSec: 10 },
    ]);
    const right = result.document.timeline.tracks[0]!.clips[1];
    expect(right).not.toHaveProperty('properties.transIn');
    expect(result.document.semantics.scenes[0]!.clipIds).toEqual(['talk', 'talk~split-180']);
    expect(result.receipt).toMatchObject({ createdClipIds: ['talk~split-180'], shiftedClipIds: [] });
    expect(validateEditorDocumentV2(result.document)).toEqual([]);
  });

  it('allows ripple delete to empty the primary lane and keeps sync-locked audio aligned', () => {
    const document = testDocument();
    document.timeline.tracks[0]!.clips = [narrativeClip({ durationFrames: 60, sourceOutSec: 2 })];
    document.timeline.tracks.push(
      track({ id: 'graphics', type: 'graphics', clips: [graphicClip('title', 0, 60)] }),
      track({ id: 'dialogue', type: 'audio', clips: [audioClip('dialogue-audio', 0, 120)] }),
      track({ id: 'music', type: 'audio', syncLocked: false, clips: [audioClip('music-audio', 0, 120)] }),
    );

    const result = applyEditorCommand(document, {
      type: 'range.remove',
      trackId: document.semantics.primaryNarrativeTrackId,
      startFrame: 0,
      endFrame: 60,
      mode: 'ripple',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips).toEqual([]);
    expect(result.document.timeline.tracks.find((candidate) => candidate.id === 'graphics')!.clips).toEqual([]);
    expect(result.document.timeline.tracks.find((candidate) => candidate.id === 'dialogue')!.clips[0]).toMatchObject({
      id: 'dialogue-audio',
      startFrame: 0,
      durationFrames: 60,
      sourceInSec: 2,
      sourceOutSec: 4,
    });
    expect(result.document.timeline.tracks.find((candidate) => candidate.id === 'music')!.clips[0]).toEqual(audioClip('music-audio', 0, 120));
    expect(result.receipt.removedClipIds).toEqual(expect.arrayContaining(['talk', 'title']));
    expect(result.receipt.removedFrames).toBe(60);
    expect(validateEditorDocumentV2(result.document)).toEqual([]);
  });

  it('clears linked partners even when their lane is not sync-locked', () => {
    const document = testDocument();
    document.timeline.tracks[0]!.clips = [narrativeClip({ durationFrames: 60, sourceOutSec: 2, linkGroupId: 'linked' })];
    document.timeline.tracks.push(
      track({ id: 'linked-graphics', type: 'graphics', syncLocked: false, clips: [graphicClip('linked-title', 0, 60, 'linked')] }),
      track({ id: 'free-graphics', type: 'graphics', syncLocked: false, clips: [graphicClip('free-title', 0, 60)] }),
    );

    const result = applyEditorCommand(document, {
      type: 'range.remove',
      trackId: document.semantics.primaryNarrativeTrackId,
      startFrame: 0,
      endFrame: 60,
      mode: 'lift',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((candidate) => candidate.id === 'linked-graphics')!.clips).toEqual([]);
    expect(result.document.timeline.tracks.find((candidate) => candidate.id === 'free-graphics')!.clips).toHaveLength(1);
  });

  it('fails atomically when ripple would shift a locked sync-locked lane', () => {
    const document = testDocument();
    document.timeline.tracks[0]!.clips = [narrativeClip({ durationFrames: 60, sourceOutSec: 2 })];
    document.timeline.tracks.push(track({
      id: 'locked-audio',
      type: 'audio',
      locked: true,
      clips: [audioClip('locked-clip', 60, 60)],
    }));
    const before = structuredClone(document);

    const result = applyEditorCommand(document, {
      type: 'range.remove',
      trackId: document.semantics.primaryNarrativeTrackId,
      startFrame: 0,
      endFrame: 30,
      mode: 'ripple',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'track-locked', trackIds: ['locked-audio'] } });
    expect(result.document).toBe(document);
    expect(document).toEqual(before);
  });

  it('retains empty lanes by default and only prunes them when explicitly requested', () => {
    const document = testDocument();
    document.timeline.tracks[0]!.clips = [narrativeClip({ durationFrames: 30, sourceOutSec: 1 })];
    const caption: CaptionTimelineClip = {
      id: 'caption',
      kind: 'caption',
      startFrame: 0,
      durationFrames: 30,
      enabled: true,
      managed: true,
      block: { templateId: 'caption', slots: {} },
      anchor: { type: 'timeline' },
    };
    document.timeline.tracks.push(track({
      id: 'captions',
      type: 'caption',
      role: 'managedCaptions',
      clips: [caption],
    }));
    document.semantics.managedCaptionTrackId = 'captions';

    const retained = applyEditorCommand(document, {
      type: 'range.remove',
      trackId: document.semantics.primaryNarrativeTrackId,
      startFrame: 0,
      endFrame: 30,
      mode: 'ripple',
    });
    expect(retained.ok).toBe(true);
    if (!retained.ok) return;
    expect(retained.document.timeline.tracks.map((candidate) => candidate.id)).toContain('captions');
    expect(retained.document.timeline.tracks.find((candidate) => candidate.id === 'captions')!.clips).toEqual([]);

    const pruned = applyEditorCommand(document, {
      type: 'range.remove',
      trackId: document.semantics.primaryNarrativeTrackId,
      startFrame: 0,
      endFrame: 30,
      mode: 'ripple',
      pruneEmptyTracks: true,
    });
    expect(pruned.ok).toBe(true);
    if (!pruned.ok) return;
    expect(pruned.document.timeline.tracks.map((candidate) => candidate.id)).toEqual(['track_primary_narrative']);
    expect(pruned.document.semantics.managedCaptionTrackId).toBeUndefined();
    expect(pruned.receipt.removedTrackIds).toEqual(['captions']);
  });

  it('detaches an unlocked surviving clip anchor when its target is removed', () => {
    const document = testDocument();
    document.timeline.tracks[0]!.clips = [narrativeClip({ durationFrames: 30, sourceOutSec: 1 })];
    document.timeline.tracks.push(track({
      id: 'graphics',
      type: 'graphics',
      syncLocked: false,
      clips: [{
        ...graphicClip('later-title', 90, 30),
        anchor: { type: 'clip', clipId: 'talk', offsetFrames: 90 },
      }],
    }));

    const result = applyEditorCommand(document, {
      type: 'range.remove',
      trackId: document.semantics.primaryNarrativeTrackId,
      startFrame: 0,
      endFrame: 30,
      mode: 'lift',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((candidate) => candidate.id === 'graphics')!.clips[0]).toMatchObject({
      startFrame: 90,
      anchor: { type: 'timeline' },
    });
    expect(result.receipt.affectedTrackIds).toEqual(expect.arrayContaining(['track_primary_narrative', 'graphics']));
  });

  it('rejects invalid frame ranges without changing the input', () => {
    const document = testDocument();
    const result = applyEditorCommand(document, {
      type: 'range.remove',
      trackId: document.semantics.primaryNarrativeTrackId,
      startFrame: 10.5,
      endFrame: 10,
      mode: 'ripple',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid-range' } });
    expect(result.document).toBe(document);
  });
});
