import { describe, expect, it } from 'vitest';
import {
  addAudioDocumentClip,
  applyAudioDocumentEdits,
  removeAudioDocumentClips,
  splitAudioDocumentClip,
} from './audio-document-edit';
import { emptyComposition } from './composition-core';
import { compositionToEditorDocument, projectDocumentToComposition } from './project-document';

function emptyDocument() {
  return compositionToEditorDocument({ projectId: 'audio-test', composition: emptyComposition() }).document;
}

describe('native audio document edits', () => {
  it('adds overlapping clips with durable asset reuse, patches coupled geometry and prunes the empty lane after removal', () => {
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
    expect(second.document.timeline.tracks.filter((track) => track.type === 'audio')).toHaveLength(1);

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
