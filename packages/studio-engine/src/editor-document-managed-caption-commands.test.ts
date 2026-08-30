import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  dominantTimelineSpeechTrack,
  emptyEditorDocumentV2,
  spokenTimelineBeats,
  timelineSpeechRangesForAsset,
  managedCaptionLineRows,
  timelineTranscriptionTargets,
  type CaptionTimelineClip,
  type EditorDocumentV2,
  type NarrativeTimelineClip,
} from './editor-document';

const transcript = [{
  start: 0,
  end: 6,
  text: 'hello world',
  words: [
    { text: 'hello', start: 0, end: 1 },
    { text: 'world', start: 4, end: 5 },
  ],
}];

function narrative(overrides: Partial<NarrativeTimelineClip> = {}): NarrativeTimelineClip {
  return {
    id: 'talk-a',
    kind: 'narrative',
    assetId: 'main-asset',
    startFrame: 0,
    durationFrames: 60,
    enabled: true,
    sourceInSec: 0,
    sourceOutSec: 2,
    properties: { treatment: 'full' },
    ...overrides,
  };
}

function oldCaption(overrides: Partial<CaptionTimelineClip> = {}): CaptionTimelineClip {
  return {
    id: 'capd_main_0_0',
    kind: 'caption',
    startFrame: 0,
    durationFrames: 180,
    enabled: false,
    managed: true,
    block: { templateId: 'caption', slots: {} },
    anchor: { type: 'timeline' },
    ...overrides,
  };
}

function documentWithCaptions(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets['main-asset'] = {
    id: 'main-asset', kind: 'video', locator: { localSig: 'main-sig' }, metadata: { durationSec: 6 },
  };
  document.semantics.transcripts['main-asset'] = transcript;
  document.timeline.tracks[0]!.clips = [
    narrative(),
    narrative({ id: 'talk-b', startFrame: 120, durationFrames: 30, sourceInSec: 4, sourceOutSec: 6 }),
  ];
  document.timeline.tracks.push({
    id: 'managed-captions',
    type: 'caption',
    role: 'managedCaptions',
    name: 'Captions',
    muted: true,
    hidden: true,
    locked: false,
    syncLocked: true,
    stackOrder: 8,
    clips: [oldCaption()],
  });
  document.semantics.managedCaptionTrackId = 'managed-captions';
  return document;
}

describe('EditorDocument V2 managed caption command', () => {
  it('finds captionable timeline media without requiring a primary narrative clip', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.video = {
      id: 'video', kind: 'video', locator: { localSig: 'video-sig' }, metadata: { durationSec: 5, hasAudio: true },
    };
    document.assets.silent = {
      id: 'silent', kind: 'video', locator: { localSig: 'silent-sig' }, metadata: { durationSec: 5, hasAudio: false },
    };
    document.timeline.tracks.push({
      id: 'media', type: 'visual', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 1,
      clips: [
        { id: 'video-clip', kind: 'media', assetId: 'video', startFrame: 30, durationFrames: 150, enabled: true, sourceInSec: 0, sourceOutSec: 5 },
        { id: 'silent-clip', kind: 'media', assetId: 'silent', startFrame: 180, durationFrames: 150, enabled: true, sourceInSec: 0, sourceOutSec: 5 },
      ],
    });

    expect(timelineTranscriptionTargets(document)).toMatchObject([
      { trackId: 'media', clipId: 'video-clip', assetId: 'video' },
    ]);
  });

  it('keeps captions OFF through bare relays and excludes muted lanes from the dominant vote', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.broll = {
      id: 'broll', kind: 'video', locator: { localSig: 'broll-sig' }, metadata: { durationSec: 10, hasAudio: true },
    };
    document.assets.voice = {
      id: 'voice', kind: 'audio', locator: { localSig: 'voice-sig' }, metadata: { durationSec: 10 },
    };
    // Polluted state: the muted montage lane carries a chatter transcript with MORE words than the narration.
    document.semantics.transcripts.broll = [{
      start: 0, end: 8, text: 'one two three four five six seven eight nine ten', words: [],
    }];
    document.semantics.transcripts.voice = [{ start: 0, end: 6, text: 'hello world', words: [] }];
    document.timeline.tracks[0]!.clips = [
      narrative({ id: 'broll-clip', assetId: 'broll', properties: { treatment: 'full', audioMuted: true } }),
    ];
    document.timeline.tracks.push({
      id: 'track-narration', type: 'audio', role: 'narration', muted: false, hidden: false, locked: false,
      syncLocked: true, stackOrder: 2,
      clips: [{
        id: 'voice-clip', kind: 'audio', assetId: 'voice', startFrame: 0, durationFrames: 300,
        enabled: true, sourceInSec: 0, sourceOutSec: 10, properties: {}, anchor: { type: 'timeline' },
      }],
    });
    document.timeline.tracks.push({
      id: 'managed-captions', type: 'caption', role: 'managedCaptions', muted: true, hidden: true,
      locked: false, syncLocked: true, stackOrder: 8, clips: [],
    });
    document.semantics.managedCaptionTrackId = 'managed-captions';
    document.appearance.captionStyle = { on: false, preset: 'ln-clean' };

    // The muted montage lane must not win the dominant-speech vote despite its larger word count.
    expect(dominantTimelineSpeechTrack(document)?.trackId).toBe('track-narration');

    // A bare relay while captions are OFF materializes nothing.
    const relaid = applyEditorCommand(document, { type: 'captions.relay' });
    expect(relaid.ok).toBe(true);
    const lane = (relaid.ok ? relaid.document : document).timeline.tracks.find((track) => track.id === 'managed-captions');
    expect(lane?.clips).toHaveLength(0);
  });

  it('derives panel line rows from the managed lane, carrying the audio-lane transcript owner', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.voice = {
      id: 'voice', kind: 'audio', locator: { localSig: 'voice-sig' }, metadata: { durationSec: 10 },
    };
    document.timeline.tracks.push({
      id: 'managed-captions', type: 'caption', role: 'managedCaptions', muted: true, hidden: true,
      locked: false, syncLocked: true, stackOrder: 8,
      clips: [{
        id: 'cue-1', kind: 'caption', startFrame: 30, durationFrames: 60, enabled: true, managed: true,
        block: {
          templateId: 'caption',
          label: '普通的人生，依然值得被爱',
          slots: { ref: { src: 'voice', seg: 2, w0: 0, w1: 5 } },
        } as unknown as CaptionTimelineClip['block'],
        sourceRef: { assetId: 'voice', segmentIndex: 2, wordStart: 0, wordEnd: 5 },
        anchor: { type: 'timeline' },
      }],
    });
    document.semantics.managedCaptionTrackId = 'managed-captions';

    expect(managedCaptionLineRows(document)).toEqual([{
      clipId: 'cue-1',
      assetId: 'voice',
      src: 'voice',
      seg: 2,
      w0: 0,
      w1: 5,
      text: '普通的人生，依然值得被爱',
      editedStartSec: 1,
      durationSec: 2,
    }]);
    expect(managedCaptionLineRows(emptyEditorDocumentV2({ fps: 30 }))).toBeNull();
  });

  it('never treats muted montage footage as the narration script source', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.broll = {
      id: 'broll', kind: 'video', locator: { localSig: 'broll-sig' }, metadata: { durationSec: 10, hasAudio: true },
    };
    document.assets.voice = {
      id: 'voice', kind: 'audio', locator: { localSig: 'voice-sig' }, metadata: { durationSec: 10 },
    };
    document.timeline.tracks[0]!.clips = [
      narrative({ id: 'broll-clip', assetId: 'broll', properties: { treatment: 'full', audioMuted: true } }),
    ];
    document.timeline.tracks.push({
      id: 'track-narration', type: 'audio', role: 'narration', muted: false, hidden: false, locked: false,
      syncLocked: true, stackOrder: 2,
      clips: [{
        id: 'voice-clip', kind: 'audio', assetId: 'voice', startFrame: 0, durationFrames: 300,
        enabled: true, sourceInSec: 0, sourceOutSec: 10, properties: {}, anchor: { type: 'timeline' },
      }],
    });

    // Auto mode: the muted primary-lane video is outside the mix and must not be transcribed.
    expect(timelineTranscriptionTargets(document)).toMatchObject([
      { trackId: 'track-narration', clipId: 'voice-clip', assetId: 'voice' },
    ]);
    // A pinned narration source resolves to the same single target.
    expect(timelineTranscriptionTargets(document, { mode: 'track', trackId: 'track-narration' })).toMatchObject([
      { trackId: 'track-narration', clipId: 'voice-clip', assetId: 'voice' },
    ]);
  });

  it('builds the manual transcript from the dominant speech track without a primary clip', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.voice = {
      id: 'voice', kind: 'audio', locator: { localSig: 'voice-sig' }, metadata: { durationSec: 10 },
    };
    document.semantics.transcripts.voice = [{
      start: 2, end: 8, text: 'one two three', words: [
        { text: 'one', start: 2, end: 3 },
        { text: 'two', start: 4, end: 5 },
        { text: 'three', start: 7, end: 8 },
      ],
    }];
    document.timeline.tracks.push({
      id: 'voice-track', type: 'audio', role: 'narration', muted: false, hidden: false, locked: false, syncLocked: false, stackOrder: 1,
      clips: [{
        id: 'voice-clip', kind: 'audio', assetId: 'voice', startFrame: 60, durationFrames: 90,
        enabled: true, sourceInSec: 2, sourceOutSec: 8, properties: { speed: 2 }, anchor: { type: 'timeline' },
      }],
    });

    expect(dominantTimelineSpeechTrack(document)).toMatchObject({
      trackId: 'voice-track',
      clips: [{ id: 'voice-clip', assetId: 'voice' }],
    });
    expect(timelineSpeechRangesForAsset(document, 'voice-track', 'voice', 4, 5)).toEqual([{
      trackId: 'voice-track', clipId: 'voice-clip', assetId: 'voice',
      startFrame: 90, endFrame: 105, sourceFromSec: 4, sourceToSec: 5,
    }]);
    expect(spokenTimelineBeats(document, 2.75, 1)).toEqual([{
      text: 'one two three',
      start: 0,
      end: 1,
    }]);
  });

  it('maps separate audio narration sentences into local Motion Graphic reveal beats', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.voice = {
      id: 'voice', kind: 'audio', locator: { localSig: 'voice-sig' }, metadata: { durationSec: 8 },
    };
    document.semantics.transcripts.voice = [
      { start: 2, end: 3, text: '先看问题' },
      { start: 4, end: 5, text: '再看方法' },
      { start: 7, end: 8, text: '最后结论' },
    ];
    document.timeline.tracks.push({
      id: 'voice-track', type: 'audio', role: 'narration', muted: false, hidden: false,
      locked: false, syncLocked: false, stackOrder: 1,
      clips: [{
        id: 'voice-clip', kind: 'audio', assetId: 'voice', startFrame: 60, durationFrames: 90,
        enabled: true, sourceInSec: 2, sourceOutSec: 8, properties: { speed: 2 }, anchor: { type: 'timeline' },
      }],
    });

    expect(spokenTimelineBeats(document, 2.5, 2)).toEqual([
      { text: '再看方法', start: 0.5, end: 1 },
    ]);
  });

  it('uses a linked audio partner once instead of transcribing linked video audio twice', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.camera = {
      id: 'camera', kind: 'video', locator: { localSig: 'camera-sig' }, metadata: { durationSec: 5, hasAudio: true },
    };
    document.assets.mic = {
      id: 'mic', kind: 'audio', locator: { localSig: 'mic-sig' }, metadata: { durationSec: 5 },
    };
    document.timeline.tracks.push(
      {
        id: 'camera-track', type: 'visual', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 1,
        clips: [{ id: 'camera-clip', kind: 'media', assetId: 'camera', linkGroupId: 'av', startFrame: 0, durationFrames: 150, enabled: true, sourceInSec: 0, sourceOutSec: 5 }],
      },
      {
        id: 'mic-track', type: 'audio', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 2,
        clips: [{ id: 'mic-clip', kind: 'audio', assetId: 'mic', linkGroupId: 'av', startFrame: 0, durationFrames: 150, enabled: true, sourceInSec: 0, sourceOutSec: 5, properties: {}, anchor: { type: 'timeline' } }],
      },
    );

    expect(timelineTranscriptionTargets(document)).toMatchObject([
      { trackId: 'mic-track', clipId: 'mic-clip', assetId: 'mic' },
    ]);
    expect(timelineTranscriptionTargets(document, { mode: 'clip', clipId: 'camera-clip' })).toMatchObject([
      { trackId: 'mic-track', clipId: 'mic-clip', assetId: 'mic' },
    ]);
    document.semantics.transcripts.mic = transcript;
    expect(dominantTimelineSpeechTrack(document)?.trackId).toBe('mic-track');
  });

  it('derives through native gaps and retiming while preserving track and clip flags', () => {
    const document = documentWithCaptions();
    const result = applyEditorCommand(document, { type: 'captions.relay' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const track = result.document.timeline.tracks.find((candidate) => candidate.id === 'managed-captions')!;
    expect(track).toMatchObject({ muted: true, hidden: true, stackOrder: 8 });
    expect(track.clips).toMatchObject([
      { id: 'capd_main_0_0', startFrame: 0, durationFrames: 39, enabled: false, sourceRef: { assetId: 'main-asset' } },
      { id: 'capd_emainasset_0_1', startFrame: 120, durationFrames: 24, enabled: true, sourceRef: { assetId: 'main-asset' } },
    ]);
    expect(result.receipt).toMatchObject({ affectedTrackIds: ['managed-captions'], createdClipIds: ['capd_emainasset_0_1'] });
  });

  it('clears stale managed captions when the primary lane is deliberately empty', () => {
    const document = documentWithCaptions();
    document.timeline.tracks[0]!.clips = [];
    const result = applyEditorCommand(document, { type: 'captions.relay' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.id === 'managed-captions')!.clips).toEqual([]);
    expect(result.receipt.removedClipIds).toEqual(['capd_main_0_0']);
  });

  it('rejects a derived write to a locked managed-caption lane', () => {
    const document = documentWithCaptions();
    document.timeline.tracks.find((track) => track.id === 'managed-captions')!.locked = true;
    const result = applyEditorCommand(document, { type: 'captions.relay' });
    expect(result).toMatchObject({ ok: false, error: { code: 'track-locked', trackIds: ['managed-captions'] } });
    expect(result.document).toBe(document);
  });

  it('auto-selects a narration audio lane when the visual narrative is empty', () => {
    const document = documentWithCaptions();
    document.timeline.tracks[0]!.clips = [];
    document.assets.voice = { id: 'voice', kind: 'audio', locator: { remoteUrl: 'https://cdn.example/voice.mp3' }, metadata: { durationSec: 6 } };
    document.semantics.transcripts.voice = transcript;
    document.timeline.tracks.push({
      id: 'narration', type: 'audio', role: 'narration', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 1,
      clips: [{ id: 'voice-clip', kind: 'audio', assetId: 'voice', startFrame: 30, durationFrames: 180, enabled: true, sourceInSec: 0, sourceOutSec: 6, properties: {}, anchor: { type: 'timeline' } }],
    });
    const result = applyEditorCommand(document, { type: 'captions.relay', source: { mode: 'auto' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.semantics.managedCaptionSource).toEqual({ mode: 'track', trackId: 'narration' });
    expect(result.document.timeline.tracks.find((track) => track.id === 'managed-captions')!.clips[0]).toMatchObject({ startFrame: 30, sourceRef: { assetId: 'voice' } });
  });

  it('keeps generated captions pinned when their source track is muted', () => {
    const document = documentWithCaptions();
    document.timeline.tracks[0]!.clips = [];
    document.assets.voice = { id: 'voice', kind: 'audio', locator: { remoteUrl: 'https://cdn.example/voice.mp3' }, metadata: { durationSec: 6 } };
    document.semantics.transcripts.voice = transcript;
    document.timeline.tracks.push({
      id: 'narration', type: 'audio', role: 'narration', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 1,
      clips: [{ id: 'voice-clip', kind: 'audio', assetId: 'voice', startFrame: 30, durationFrames: 180, enabled: true, sourceInSec: 0, sourceOutSec: 6, properties: {}, anchor: { type: 'timeline' } }],
    });
    const generated = applyEditorCommand(document, { type: 'captions.relay', source: { mode: 'auto' } });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    const muted = applyEditorCommand(generated.document, { type: 'track.patch', trackId: 'narration', patch: { muted: true } });
    expect(muted.ok).toBe(true);
    if (!muted.ok) return;
    const relaid = applyEditorCommand(muted.document, { type: 'captions.relay' });
    expect(relaid.ok).toBe(true);
    if (!relaid.ok) return;
    expect(relaid.document.semantics.managedCaptionSource).toEqual({ mode: 'track', trackId: 'narration' });
    expect(relaid.document.timeline.tracks.find((track) => track.id === 'managed-captions')!.clips.length).toBeGreaterThan(0);
  });

  it('auto-selects the track with the most spoken words instead of preferring a shorter primary transcript', () => {
    const document = documentWithCaptions();
    document.semantics.transcripts['main-asset'] = [{ start: 0, end: 1, text: 'hello', words: [{ text: 'hello', start: 0, end: 1 }] }];
    document.assets.voice = { id: 'voice', kind: 'audio', locator: { remoteUrl: 'https://cdn.example/voice.mp3' }, metadata: { durationSec: 6 } };
    document.semantics.transcripts.voice = transcript;
    document.timeline.tracks.push({
      id: 'voice-track', type: 'audio', role: 'narration', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 1,
      clips: [{ id: 'voice-clip', kind: 'audio', assetId: 'voice', startFrame: 30, durationFrames: 180, enabled: true, sourceInSec: 0, sourceOutSec: 6, properties: {}, anchor: { type: 'timeline' } }],
    });

    const result = applyEditorCommand(document, { type: 'captions.relay', source: { mode: 'auto' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.id === 'managed-captions')!.clips[0]).toMatchObject({
      startFrame: 30,
      sourceRef: { assetId: 'voice' },
    });
  });

  it('ignores muted tracks for automatic transcription and caption source selection', () => {
    const document = documentWithCaptions();
    document.assets.voice = { id: 'voice', kind: 'audio', locator: { remoteUrl: 'https://cdn.example/voice.mp3' }, metadata: { durationSec: 6 } };
    document.semantics.transcripts.voice = transcript;
    document.timeline.tracks.push({
      id: 'muted-voice', type: 'audio', role: 'narration', muted: true, hidden: false, locked: false, syncLocked: true, stackOrder: 1,
      clips: [{ id: 'muted-voice-clip', kind: 'audio', assetId: 'voice', startFrame: 0, durationFrames: 180, enabled: true, sourceInSec: 0, sourceOutSec: 6, properties: {}, anchor: { type: 'timeline' } }],
    });

    expect(timelineTranscriptionTargets(document)).not.toContainEqual(expect.objectContaining({ trackId: 'muted-voice' }));
    expect(dominantTimelineSpeechTrack(document)?.trackId).toBe('track_primary_narrative');
    expect(timelineTranscriptionTargets(document, { mode: 'track', trackId: 'muted-voice' })).toMatchObject([
      { trackId: 'muted-voice', clipId: 'muted-voice-clip', assetId: 'voice' },
    ]);
  });
});
