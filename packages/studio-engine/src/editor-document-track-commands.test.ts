import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  emptyEditorDocumentV2,
  validateEditorDocumentV2,
  type EditorDocumentV2,
  type AudioTimelineClip,
  type GraphicTimelineClip,
  type MediaTimelineClip,
} from './editor-document';

function mediaClip(id: string): MediaTimelineClip {
  return {
    id,
    kind: 'media',
    assetId: 'asset-video',
    startFrame: 0,
    durationFrames: 30,
    sourceInSec: 0,
    sourceOutSec: 1,
    enabled: true,
  };
}

function graphicClip(id: string, anchor: GraphicTimelineClip['anchor'] = { type: 'timeline' }): GraphicTimelineClip {
  return {
    id,
    kind: 'graphic',
    startFrame: 0,
    durationFrames: 30,
    enabled: true,
    block: { templateId: 'custom', slots: {} },
    anchor,
  };
}

function audioClip(id: string): AudioTimelineClip {
  return {
    id,
    kind: 'audio',
    assetId: 'asset-audio',
    startFrame: 0,
    durationFrames: 30,
    sourceInSec: 0,
    sourceOutSec: 1,
    enabled: true,
    properties: {},
    anchor: { type: 'timeline' },
  };
}

function documentWithAsset(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2();
  document.assets['asset-video'] = {
    id: 'asset-video',
    kind: 'video',
    locator: { localSig: 'video-sig' },
    metadata: { durationSec: 10 },
  };
  return document;
}

describe('EditorDocument V2 track commands', () => {
  it('inserts, patches and removes an empty lane without mutating prior snapshots', () => {
    const original = documentWithAsset();
    const inserted = applyEditorCommand(original, {
      type: 'track.insert',
      index: 1,
      track: { id: 'graphics', type: 'graphics', role: 'graphics', name: 'Cards' },
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(original.timeline.tracks).toHaveLength(1);
    expect(inserted.document.timeline.tracks[1]).toMatchObject({
      id: 'graphics',
      name: 'Cards',
      clips: [],
      locked: false,
      syncLocked: true,
    });

    const patched = applyEditorCommand(inserted.document, {
      type: 'track.patch',
      trackId: 'graphics',
      patch: { hidden: true, syncLocked: false },
    });
    expect(patched.ok).toBe(true);
    if (!patched.ok) return;
    expect(patched.document.timeline.tracks[1]).toMatchObject({ hidden: true, syncLocked: false });
    expect(inserted.document.timeline.tracks[1]).toMatchObject({ hidden: false, syncLocked: true });

    const moved = applyEditorCommand(patched.document, {
      type: 'track.move',
      trackId: 'graphics',
      toIndex: 0,
    });
    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.document.timeline.tracks.map((track) => track.id)).toEqual(['graphics', 'track_primary_narrative']);
    expect(moved.document.timeline.tracks[0]!.stackOrder).toBe(patched.document.timeline.tracks[1]!.stackOrder);

    const removed = applyEditorCommand(moved.document, { type: 'track.remove', trackId: 'graphics' });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(removed.document.timeline.tracks.map((track) => track.id)).toEqual(['track_primary_narrative']);
    expect(validateEditorDocumentV2(removed.document)).toEqual([]);
  });

  it('keeps the semantic primary lane even when it is empty', () => {
    const document = emptyEditorDocumentV2();
    const result = applyEditorCommand(document, {
      type: 'track.remove',
      trackId: document.semantics.primaryNarrativeTrackId,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'primary-track-required' } });
    expect(result.document).toBe(document);
  });

  it('removes scene references and detaches surviving clip anchors when a lane is removed', () => {
    const document = documentWithAsset();
    document.timeline.tracks.push({
      id: 'broll',
      type: 'visual',
      role: 'broll',
      muted: false,
      hidden: false,
      locked: false,
      syncLocked: true,
      stackOrder: 1,
      clips: [mediaClip('broll-clip')],
    }, {
      id: 'graphics',
      type: 'graphics',
      muted: false,
      hidden: false,
      locked: false,
      syncLocked: false,
      stackOrder: 2,
      clips: [graphicClip('label', { type: 'clip', clipId: 'broll-clip', offsetFrames: 0 })],
    });
    document.semantics.scenes = [{ id: 'scene', clipIds: ['broll-clip'] }];

    const result = applyEditorCommand(document, { type: 'track.remove', trackId: 'broll' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const graphic = result.document.timeline.tracks.find((track) => track.id === 'graphics')!.clips[0];
    expect(graphic).toMatchObject({ anchor: { type: 'timeline' } });
    expect(result.document.semantics.scenes[0]!.clipIds).toEqual([]);
    expect(result.receipt.affectedTrackIds).toEqual(['broll', 'graphics']);
    expect(validateEditorDocumentV2(result.document)).toEqual([]);
  });

  it('refuses a lane removal atomically when it would mutate an anchored clip on a locked lane', () => {
    const document = documentWithAsset();
    document.timeline.tracks.push({
      id: 'broll',
      type: 'visual',
      muted: false,
      hidden: false,
      locked: false,
      syncLocked: true,
      stackOrder: 1,
      clips: [mediaClip('broll-clip')],
    }, {
      id: 'graphics',
      type: 'graphics',
      muted: false,
      hidden: false,
      locked: true,
      syncLocked: false,
      stackOrder: 2,
      clips: [graphicClip('label', { type: 'clip', clipId: 'broll-clip', offsetFrames: 0 })],
    });
    const before = structuredClone(document);
    const result = applyEditorCommand(document, { type: 'track.remove', trackId: 'broll' });
    expect(result).toMatchObject({ ok: false, error: { code: 'track-locked', trackIds: ['graphics'] } });
    expect(result.document).toBe(document);
    expect(document).toEqual(before);
  });

  it('treats every non-audio lane as one NLE-style visual compatibility group', () => {
    const document = documentWithAsset();
    document.timeline.tracks.push({
      id: 'mixed',
      type: 'graphics',
      role: 'graphics',
      name: 'Mixed visual lane',
      muted: false,
      hidden: false,
      locked: false,
      syncLocked: false,
      stackOrder: 2,
      clips: [graphicClip('title')],
    }, {
      id: 'audio',
      type: 'audio',
      role: 'music',
      muted: false,
      hidden: false,
      locked: false,
      syncLocked: false,
      stackOrder: 0,
      clips: [],
    });

    const inserted = applyEditorCommand(document, {
      type: 'clips.insert',
      trackId: 'mixed',
      atFrame: 60,
      clips: [{ ...mediaClip('video-on-graphics'), offsetFrames: 0 }],
      mode: 'overwrite',
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    expect(inserted.document.timeline.tracks.find((track) => track.id === 'mixed')?.clips.map((clip) => clip.kind)).toEqual([
      'graphic',
      'media',
    ]);
    expect(validateEditorDocumentV2(inserted.document)).toEqual([]);

    const rejected = applyEditorCommand(inserted.document, {
      type: 'clip.move',
      trackId: 'mixed',
      clipId: 'video-on-graphics',
      startFrame: 60,
      toTrackId: 'audio',
    });
    expect(rejected).toMatchObject({ ok: false, error: { code: 'invalid-command', path: 'toTrackId' } });
    expect(rejected.document).toBe(inserted.document);
  });

  it('moves an audio clip in time and between native audio tracks as one transaction', () => {
    const document = documentWithAsset();
    document.assets['asset-audio'] = {
      id: 'asset-audio',
      kind: 'audio',
      locator: { localSig: 'audio-sig' },
      metadata: { durationSec: 10 },
    };
    document.timeline.tracks.push({
      id: 'foley-1',
      type: 'audio',
      role: 'sfx',
      muted: false,
      hidden: false,
      locked: false,
      syncLocked: false,
      stackOrder: 0,
      clips: [audioClip('foley')],
    }, {
      id: 'foley-2',
      type: 'audio',
      role: 'sfx',
      muted: false,
      hidden: false,
      locked: false,
      syncLocked: false,
      stackOrder: 0,
      clips: [],
    });

    const moved = applyEditorCommand(document, {
      type: 'clip.move',
      trackId: 'foley-1',
      clipId: 'foley',
      startFrame: 45,
      toTrackId: 'foley-2',
      includeLinked: false,
    });

    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.document.timeline.tracks.find((track) => track.id === 'foley-1')?.clips).toEqual([]);
    expect(moved.document.timeline.tracks.find((track) => track.id === 'foley-2')?.clips).toMatchObject([
      { id: 'foley', startFrame: 45 },
    ]);
    expect(moved.receipt.affectedTrackIds).toEqual(expect.arrayContaining(['foley-1', 'foley-2']));
    expect(validateEditorDocumentV2(moved.document)).toEqual([]);
  });
});
