import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from './editor-document';
import { applyVideoClipSettingsPatches, mediaVideoClipEntries } from './media-video-edit';

function documentWithVideoLanes() {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.primary = {
    id: 'primary', kind: 'video', locator: { remoteUrl: 'https://cdn.test/primary.mp4' }, metadata: { durationSec: 4 },
  };
  document.assets.broll = {
    id: 'broll', kind: 'video', locator: { remoteUrl: 'https://cdn.test/broll.mp4' }, metadata: { durationSec: 4 },
  };
  document.assets.still = {
    id: 'still', kind: 'image', locator: { remoteUrl: 'https://cdn.test/still.jpg' }, metadata: {},
  };
  document.semantics.primaryNarrativeAssetId = 'primary';
  document.timeline.tracks[0]!.clips.push({
    id: 'story', kind: 'narrative', assetId: 'primary', startFrame: 0, durationFrames: 120,
    enabled: true, sourceInSec: 0, sourceOutSec: 4, properties: { treatment: 'full' },
  });
  document.timeline.tracks.push({
    id: 'visual-2', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false,
    syncLocked: false, stackOrder: 2,
    clips: [
      {
        id: 'insert', kind: 'media', assetId: 'broll', startFrame: 30, durationFrames: 90,
        enabled: true, sourceInSec: 0, sourceOutSec: 3,
      },
      {
        id: 'poster', kind: 'media', assetId: 'still', startFrame: 120, durationFrames: 30,
        enabled: true, sourceInSec: 0, sourceOutSec: 1,
      },
    ],
  });
  return document;
}

describe('clip-scoped video settings', () => {
  it('updates primary and ordinary visual-lane videos in one transaction', () => {
    const result = applyVideoClipSettingsPatches(documentWithVideoLanes(), [
      { clipId: 'story', patch: { audio: { volumeDb: -3 } } },
      {
        clipId: 'insert',
        patch: {
          framing: { treatment: 'split-r', size: 44 },
          filter: { brightness: 1.2, saturate: 0.8 },
          audio: { volumeDb: -12, fadeInSec: 0.5, fadeOutSec: 0.7 },
        },
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips[0]).toMatchObject({
      kind: 'narrative', properties: { treatment: 'full', volumeDb: -3 },
    });
    expect(result.document.timeline.tracks[1]!.clips[0]).toMatchObject({
      kind: 'media',
      video: {
        treatment: 'split-r', treatSize: 44,
        filter: { brightness: 1.2, saturate: 0.8 },
        volumeDb: -12, audioFadeInSec: 0.5, audioFadeOutSec: 0.7,
      },
      mediaFraming: {
        transform: { scale: 1, offsetX: 0.262, offsetY: 0 },
        crop: { top: 0, right: 0.262, bottom: 0, left: 0.262 },
      },
    });
    expect(mediaVideoClipEntries(result.document).map((entry) => entry.shot)).toMatchObject([
      {
        id: 'insert', treatment: 'split-r', treatSize: 44, volumeDb: -12,
        audioFadeInSec: 0.5, audioFadeOutSec: 0.7,
      },
    ]);
  });

  it('rejects a non-video target without publishing an earlier valid patch', () => {
    const document = documentWithVideoLanes();
    const result = applyVideoClipSettingsPatches(document, [
      { clipId: 'story', patch: { audio: { mute: true } } },
      { clipId: 'poster', patch: { audio: { volumeDb: -10 } } },
    ]);
    expect(result).toMatchObject({ ok: false, error: 'Clip is not video media: poster' });
    expect(document.timeline.tracks[0]!.clips[0]).not.toMatchObject({ properties: { audioMuted: true } });
  });
});
