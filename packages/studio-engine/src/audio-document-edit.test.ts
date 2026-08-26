import { describe, expect, it } from 'vitest';
import {
  addAudioDocumentClip,
  applyAudioDocumentEdits,
  moveAudioDocumentClip,
  removeAudioDocumentClips,
  splitAudioDocumentClip,
} from './audio-document-edit';
import { emptyComposition } from './composition-core';
import { applyEditorCommand } from './editor-document';
import { compositionToEditorDocument, projectDocumentToComposition } from './project-document';

function emptyDocument() {
  return compositionToEditorDocument({ projectId: 'audio-test', composition: emptyComposition() }).document;
}

describe('native audio document edits', () => {
  it('inserts a collision lane at the timeline gap chosen by the user', () => {
    const component = applyEditorCommand(emptyDocument(), {
      type: 'track.insert',
      index: 1,
      track: {
        id: 'track_component',
        type: 'graphics',
        name: 'Components',
        stackOrder: 1,
        clips: [{
          id: 'component-card',
          kind: 'graphic',
          startFrame: 0,
          durationFrames: 30,
          enabled: true,
          block: { templateId: 'custom', slots: {} },
          anchor: { type: 'timeline' },
        }],
      },
    });
    expect(component.ok).toBe(true);
    if (!component.ok) return;
    const first = addAudioDocumentClip({
      document: component.document,
      clip: { id: 'foley-a', src: 'https://cdn.test/a.wav', durationSec: 4 },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addAudioDocumentClip({
      document: first.document,
      clip: { id: 'foley-b', src: 'https://cdn.test/b.wav', durationSec: 4, startSec: 5 },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const sourceTrack = second.document.timeline.tracks.find((track) =>
      track.clips.some((clip) => clip.id === 'foley-b'))!;

    const moved = moveAudioDocumentClip({
      document: second.document,
      clipId: 'foley-b',
      startSec: 2,
      toTrackId: sourceTrack.id,
      newTrackIndex: 1,
    });

    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.document.timeline.tracks.map((track) => track.id)).toEqual([
      'track_primary_narrative',
      moved.trackId,
      'track_component',
      sourceTrack.id,
    ]);
  });

  it('moves a clip into an explicit row gap and prunes its empty source lane', () => {
    const component = applyEditorCommand(emptyDocument(), {
      type: 'track.insert',
      index: 1,
      track: {
        id: 'track_component',
        type: 'graphics',
        stackOrder: 1,
        clips: [{
          id: 'component-card',
          kind: 'graphic',
          startFrame: 0,
          durationFrames: 30,
          enabled: true,
          block: { templateId: 'custom', slots: {} },
          anchor: { type: 'timeline' },
        }],
      },
    });
    expect(component.ok).toBe(true);
    if (!component.ok) return;
    const added = addAudioDocumentClip({
      document: component.document,
      clip: { id: 'foley', src: 'https://cdn.test/foley.wav', durationSec: 4 },
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const sourceTrackId = added.trackId!;

    const moved = moveAudioDocumentClip({
      document: added.document,
      clipId: 'foley',
      startSec: 0,
      newTrackIndex: 1,
      forceNewTrack: true,
    });

    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    expect(moved.document.timeline.tracks.map((track) => track.id)).toEqual([
      'track_primary_narrative',
      moved.trackId,
      'track_component',
    ]);
    expect(moved.document.timeline.tracks.some((track) => track.id === sourceTrackId)).toBe(false);
  });

  it('moves a colliding clip onto a free parallel lane and creates one when needed', () => {
    const first = addAudioDocumentClip({
      document: emptyDocument(),
      clip: { id: 'foley-a', src: 'https://cdn.test/a.wav', durationSec: 4 },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addAudioDocumentClip({
      document: first.document,
      clip: { id: 'foley-b', src: 'https://cdn.test/b.wav', durationSec: 4, startSec: 5 },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.document.timeline.tracks.filter((track) => track.type === 'audio')).toHaveLength(1);

    const moved = moveAudioDocumentClip({
      document: second.document,
      clipId: 'foley-b',
      startSec: 2,
    });

    expect(moved.ok).toBe(true);
    if (!moved.ok) return;
    const audioTracks = moved.document.timeline.tracks.filter((track) => track.type === 'audio');
    expect(audioTracks).toHaveLength(2);
    expect(audioTracks.find((track) => track.clips.some((clip) => clip.id === 'foley-a'))?.id)
      .not.toBe(audioTracks.find((track) => track.clips.some((clip) => clip.id === 'foley-b'))?.id);
    expect(moved.trackId).toBe(audioTracks.find((track) => track.clips.some((clip) => clip.id === 'foley-b'))?.id);
  });

  it('puts overlapping inserts on parallel lanes, reuses durable assets, patches geometry and prunes empty lanes', () => {
    const initial = emptyDocument();
    const first = addAudioDocumentClip({
      document: initial,
      clip: { id: 'music-a', src: 'https://cdn.test/music.mp3', durationSec: 10, startSec: 2 },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addAudioDocumentClip({
      document: first.document,
      clip: { id: 'music-b', src: 'https://cdn.test/music.mp3', durationSec: 10, startSec: 3, volumeDb: -12 },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(Object.values(second.document.assets).filter((asset) => asset.kind === 'audio')).toHaveLength(1);
    expect(second.document.timeline.tracks.filter((track) => track.type === 'audio')).toHaveLength(2);

    const patched = applyAudioDocumentEdits({
      document: second.document,
      updates: [{ clipId: 'music-a', patch: { startSec: 3, inSec: 1, outSec: 9, speed: 2, muted: true } }],
    });
    expect(patched.ok).toBe(true);
    if (!patched.ok) return;
    expect(patched.document.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'music-a')).toMatchObject({
      kind: 'audio', startFrame: 90, durationFrames: 120, sourceInSec: 1, sourceOutSec: 9,
      properties: { speed: 2, muted: true },
    });
    const projected = projectDocumentToComposition(patched.document);
    expect(projected.audioTracks?.find((clip) => clip.id === 'music-a')).toMatchObject({
      startSec: 3, inSec: 1, outSec: 9, speed: 2, muted: true,
    });

    const removed = removeAudioDocumentClips(patched.document, ['music-a', 'music-b']);
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(projectDocumentToComposition(removed.document).audioTracks).toBeUndefined();
    expect(removed.document.timeline.tracks.find((track) => track.type === 'audio')).toBeUndefined();
  });

  it('splits without adding default fades at the internal seam', () => {
    const added = addAudioDocumentClip({
      document: emptyDocument(),
      clip: { id: 'music', src: 'https://cdn.test/music.mp3', durationSec: 8 },
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const split = splitAudioDocumentClip(added.document, 'music', 3);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const clips = split.document.timeline.tracks.find((track) => track.type === 'audio')!.clips;
    expect(clips).toHaveLength(2);
    expect(clips[0]).toMatchObject({ id: 'music', durationFrames: 90, sourceOutSec: 3, properties: { fadeOutSec: 0 } });
    expect(clips[1]).toMatchObject({ id: split.newClipId, startFrame: 90, durationFrames: 150, sourceInSec: 3, properties: { fadeInSec: 0 } });
  });

  it('rolls a multi-clip edit back when any target lane is locked', () => {
    const first = addAudioDocumentClip({
      document: emptyDocument(),
      clip: { id: 'music-a', src: 'https://cdn.test/a.mp3', durationSec: 5 },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const document = first.document;
    document.timeline.tracks.find((track) => track.type === 'audio')!.locked = true;
    const result = applyAudioDocumentEdits({ document, updates: [{ clipId: 'music-a', patch: { volumeDb: -8 } }] });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked' } });
    expect(document.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'music-a')).toMatchObject({
      kind: 'audio', properties: {},
    });
  });

  it('rejects ephemeral audio without a durable identity', () => {
    const document = emptyDocument();
    const result = addAudioDocumentClip({ document, clip: { id: 'ephemeral', src: 'blob:runtime', durationSec: 2 } });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'invalid-command' } });
  });

  it('persists local audio by signature without storing its runtime blob URL', () => {
    const result = addAudioDocumentClip({
      document: emptyDocument(),
      clip: { id: 'local', src: 'blob:runtime-audio', sig: 'sha256-local', durationSec: 4 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.assets[result.assetId!]).toMatchObject({
      kind: 'audio', locator: { localSig: 'sha256-local' }, metadata: { durationSec: 4 },
    });
    expect(result.document.assets[result.assetId!]!.locator).not.toHaveProperty('remoteUrl');
  });
});
