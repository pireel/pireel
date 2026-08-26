import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from '../create';
import type { AudioTimelineClip, NarrativeTimelineClip } from '../types';
import { applyEditorCommand } from './dispatcher';

function narrative(id: string, startFrame: number, durationFrames: number, sourceInSec: number, sourceOutSec: number): NarrativeTimelineClip {
  return {
    id,
    kind: 'narrative',
    assetId: 'video',
    startFrame,
    durationFrames,
    sourceInSec,
    sourceOutSec,
    properties: { treatment: 'full' },
    enabled: true,
  };
}

describe('clip.retime', () => {
  it('keeps the source range and ripples later sync-locked material by the duration delta', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.video = {
      id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.example/video.mp4' }, metadata: { durationSec: 10 },
    };
    document.assets.voice = {
      id: 'voice', kind: 'audio', locator: { remoteUrl: 'https://cdn.example/voice.wav' }, metadata: { durationSec: 2 },
    };
    document.timeline.tracks[0]!.clips = [
      narrative('first', 0, 120, 0, 4),
      narrative('second', 120, 60, 4, 6),
    ];
    const voice: AudioTimelineClip = {
      id: 'voice-clip', kind: 'audio', assetId: 'voice', startFrame: 120, durationFrames: 60,
      sourceInSec: 0, sourceOutSec: 2, properties: {}, anchor: { type: 'timeline' }, enabled: true,
    };
    document.timeline.tracks.push({
      id: 'voice-track', type: 'audio', role: 'narration', muted: false, hidden: false,
      locked: false, syncLocked: true, stackOrder: 0, clips: [voice],
    });

    const result = applyEditorCommand(document, {
      type: 'clip.retime', trackId: document.semantics.primaryNarrativeTrackId,
      clipId: 'first', durationFrames: 60, ripple: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips).toMatchObject([
      { id: 'first', startFrame: 0, durationFrames: 60, sourceInSec: 0, sourceOutSec: 4 },
      { id: 'second', startFrame: 60, durationFrames: 60, sourceInSec: 4, sourceOutSec: 6 },
    ]);
    expect(result.document.timeline.tracks[1]!.clips[0]).toMatchObject({ id: 'voice-clip', startFrame: 60 });
    expect(result.receipt.shiftedClipIds).toEqual(expect.arrayContaining(['second', 'voice-clip']));
  });

  it('scales clip-local visual keyframe timing without rippling an overlay-video lane by default', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.video = {
      id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.example/video.mp4' }, metadata: { durationSec: 4 },
    };
    document.timeline.tracks.push({
      id: 'broll', type: 'visual', role: 'broll', muted: false, hidden: false,
      locked: false, syncLocked: true, stackOrder: 1,
      clips: [{
        id: 'broll-clip', kind: 'media', assetId: 'video', startFrame: 30, durationFrames: 120,
        sourceInSec: 0, sourceOutSec: 4, enabled: true,
        keyframes: { opacity: [{ frame: 60, value: 0.5 }] },
      }],
    });

    const result = applyEditorCommand(document, {
      type: 'clip.retime', trackId: 'broll', clipId: 'broll-clip', durationFrames: 60,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[1]!.clips[0]).toMatchObject({
      durationFrames: 60,
      sourceInSec: 0,
      sourceOutSec: 4,
      keyframes: { opacity: [{ frame: 30, value: 0.5 }] },
    });
  });
});
