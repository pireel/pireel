import { describe, expect, it } from 'vitest';
import { applyCaptionDocumentEdit } from './caption-document-edit';
import { emptyEditorDocumentV2 } from './editor-document';
import { runAgentTimelineTool } from './agent-timeline';

describe('shared agent timeline atoms', () => {
  it('binds planned native visuals and reassigns them when they move across Director scenes', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document.semantics.directorPlan = {
      version: 1,
      goal: 'Move from claim to proof.',
      creativeThesis: 'Evidence replaces assertion.',
      scenes: [
        { id: 'claim', label: 'Claim', startFrame: 0, durationFrames: 120, viewerTask: 'understand', narrativeRole: 'explain', sceneFamily: 'speaker-clean', purpose: 'State the idea.' },
        { id: 'proof', label: 'Proof', startFrame: 120, durationFrames: 180, viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'media-evidence', purpose: 'Show evidence.' },
      ],
    };
    document.semantics.scenes = [
      { id: 'claim', clipIds: [] },
      { id: 'proof', clipIds: [] },
    ];
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [{ id: 'evidence', kind: 'image', url: 'https://cdn.example/evidence.png' }],
    }).document!;
    const placed = runAgentTimelineTool(document, 'add_clips', {
      clips: [{ id: 'evidence-clip', assetId: 'evidence', startSec: 1, durationSec: 2, sceneId: 'claim' }],
    });
    expect(placed.ok).toBe(true);
    expect(placed.document!.semantics.scenes.find((scene) => scene.id === 'claim')?.clipIds).toContain('evidence-clip');
    expect((placed.data as { clipIds: string[] }).clipIds).toEqual(['evidence-clip']);
    expect((runAgentTimelineTool(placed.document!, 'get_timeline', {}).data as { semantics: { directorPlan?: unknown } }).semantics.directorPlan).toBeDefined();

    const moved = runAgentTimelineTool(placed.document!, 'move_clips', {
      items: [{ clipId: 'evidence-clip', startSec: 5 }],
    });
    expect(moved.ok).toBe(true);
    expect(moved.document!.semantics.scenes.find((scene) => scene.id === 'claim')?.clipIds).not.toContain('evidence-clip');
    expect(moved.document!.semantics.scenes.find((scene) => scene.id === 'proof')?.clipIds).toContain('evidence-clip');
  });

  it('registers exact TTS text, places narration audio, and relays audio-only captions', () => {
    const empty = emptyEditorDocumentV2({ fps: 30 });
    const registered = runAgentTimelineTool(empty, 'register_media', {
      assets: [{ id: 'tts-1', kind: 'audio', url: 'https://cdn.example/tts.mp3', durationSec: 4, transcriptText: '第一句。第二句。' }],
    });
    expect(registered.ok).toBe(true);
    const placed = runAgentTimelineTool(registered.document!, 'add_clips', {
      clips: [{ assetId: 'tts-1', role: 'narration', startSec: 0, durationSec: 4 }],
    });
    expect(placed.ok).toBe(true);
    const narration = placed.document!.timeline.tracks.find((track) => track.role === 'narration')!;
    expect(narration).toMatchObject({ type: 'audio', clips: [{ kind: 'audio', assetId: 'tts-1' }] });
    const captions = applyCaptionDocumentEdit({
      document: placed.document!, patch: { on: true, preset: 'ln-clean' }, source: { mode: 'track', trackId: narration.id }, mainTranscript: null, clipTranscripts: {},
    });
    expect(captions.ok).toBe(true);
    if (!captions.ok) return;
    expect(captions.document.semantics.managedCaptionSource).toEqual({ mode: 'track', trackId: narration.id });
    expect(captions.document.timeline.tracks.find((track) => track.role === 'managedCaptions')!.clips.length).toBeGreaterThan(0);
  });

  it('links and moves typed clips through one shared command path', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [
        { id: 'visual', kind: 'image', url: 'https://cdn.example/image.png' },
        { id: 'voice', kind: 'audio', url: 'https://cdn.example/voice.mp3', durationSec: 3 },
      ],
    }).document!;
    document = runAgentTimelineTool(document, 'add_clips', { clips: [
      { id: 'visual-clip', assetId: 'visual', startSec: 0, durationSec: 3 },
      { id: 'voice-clip', assetId: 'voice', role: 'narration', startSec: 0, durationSec: 3 },
    ] }).document!;
    document = runAgentTimelineTool(document, 'manage_clip_links', { action: 'link', clipIds: ['visual-clip', 'voice-clip'] }).document!;
    const moved = runAgentTimelineTool(document, 'move_clips', { items: [{ clipId: 'visual-clip', startSec: 2 }] });
    expect(moved.ok).toBe(true);
    expect(['visual-clip', 'voice-clip'].map((id) => {
      const clip = moved.document!.timeline.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === id)!;
      return clip.startFrame;
    })).toEqual([60, 60]);
  });

  it('persists composable media boxes and clip-local keyframes', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [{ id: 'image', kind: 'image', url: 'https://cdn.example/image.png' }],
    }).document!;
    document = runAgentTimelineTool(document, 'add_clips', {
      clips: [{ id: 'image-clip', assetId: 'image', startSec: 0, durationSec: 4, box: { x: 0, y: 0, w: 0.5, h: 1 }, opacity: 0.5 }],
    }).document!;
    const animated = runAgentTimelineTool(document, 'set_keyframes', {
      clipId: 'image-clip', property: 'box', keyframes: [
        { atSec: 0, x: 0, y: 0, w: 0.5, h: 1 },
        { atSec: 2, x: 0.5, y: 0, w: 0.5, h: 1 },
      ],
    });
    expect(animated.ok).toBe(true);
    const clip = animated.document!.timeline.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === 'image-clip');
    expect(clip).toMatchObject({
      kind: 'media', box: { x: 0, y: 0, w: 0.5, h: 1 }, opacity: 0.5,
      keyframes: { box: [{ frame: 0, x: 0, y: 0, w: 0.5, h: 1 }, { frame: 60, x: 0.5, y: 0, w: 0.5, h: 1 }] },
    });
  });

  it('exposes primary-video canvas placement through the shared live/offline/MCP atom', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.main = { id: 'main', kind: 'video', locator: { remoteUrl: 'https://cdn.example/main.mp4' }, metadata: { durationSec: 3 } };
    document.semantics.primaryNarrativeAssetId = 'main';
    document.timeline.tracks[0]!.clips = [{
      id: 'shot', kind: 'narrative', assetId: 'main', startFrame: 0, durationFrames: 90,
      sourceInSec: 0, sourceOutSec: 3, properties: { treatment: 'punch-in' }, enabled: true,
    }];
    const placed = runAgentTimelineTool(document, 'set_clip_properties', {
      items: [{ clipId: 'shot', box: { x: 0.15, y: 0.1, w: 0.7, h: 0.7 } }],
    });
    expect(placed.ok).toBe(true);
    expect(placed.document!.timeline.tracks[0]!.clips[0]).toMatchObject({
      kind: 'narrative', box: { x: 0.15, y: 0.1, w: 0.7, h: 0.7 },
      properties: { treatment: 'punch-in' },
    });
  });

  it('removes a cross-track linked batch only once', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', { assets: [
      { id: 'image', kind: 'image', url: 'https://cdn.example/image.png' },
      { id: 'audio', kind: 'audio', url: 'https://cdn.example/audio.mp3', durationSec: 2 },
    ] }).document!;
    document = runAgentTimelineTool(document, 'add_clips', { clips: [
      { id: 'image-clip', assetId: 'image', durationSec: 2, linkGroupId: 'pair' },
      { id: 'audio-clip', assetId: 'audio', durationSec: 2, linkGroupId: 'pair' },
    ] }).document!;
    const removed = runAgentTimelineTool(document, 'remove_clips', { clipIds: ['image-clip', 'audio-clip'] });
    expect(removed.ok).toBe(true);
    expect(removed.document!.timeline.tracks.flatMap((track) => track.clips)).toEqual([]);
  });

  it('aligns explicit matching markers and links the synced clips', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', { assets: [
      { id: 'camera', kind: 'video', url: 'https://cdn.example/camera.mp4', durationSec: 8 },
      { id: 'mic', kind: 'audio', url: 'https://cdn.example/mic.wav', durationSec: 8 },
    ] }).document!;
    document = runAgentTimelineTool(document, 'add_clips', { clips: [
      { id: 'camera-clip', assetId: 'camera', startSec: 1, durationSec: 8 },
      { id: 'mic-clip', assetId: 'mic', startSec: 0, durationSec: 8 },
    ] }).document!;
    const synced = runAgentTimelineTool(document, 'sync_clips', {
      referenceClipId: 'camera-clip', referenceMarkerSec: 2,
      targets: [{ clipId: 'mic-clip', markerSec: 3 }],
    });
    expect(synced.ok).toBe(true);
    const clips = synced.document!.timeline.tracks.flatMap((track) => track.clips);
    expect(clips.find((clip) => clip.id === 'camera-clip')).toMatchObject({ startFrame: 30 });
    expect(clips.find((clip) => clip.id === 'mic-clip')).toMatchObject({ startFrame: 0 });
    expect(clips.find((clip) => clip.id === 'camera-clip')!.linkGroupId).toBe(clips.find((clip) => clip.id === 'mic-clip')!.linkGroupId);
  });

  it('maps a declared source BPM grid through a trimmed/retimed audio clip', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', { assets: [
      { id: 'music', kind: 'audio', url: 'https://cdn.example/music.wav', durationSec: 20, bpm: 120, beatOffsetSec: 0 },
    ] }).document!;
    document = runAgentTimelineTool(document, 'add_clips', { clips: [
      { id: 'music-clip', assetId: 'music', role: 'music', startSec: 3, durationSec: 4, sourceInSec: 2, sourceOutSec: 10, speed: 2 },
    ] }).document!;
    const grid = runAgentTimelineTool(document, 'get_beat_grid', { clipId: 'music-clip', startSec: 3, endSec: 4, subdivision: 1 });
    expect(grid.ok).toBe(true);
    expect((grid.data as { beats: Array<{ sourceSec: number; timelineSec: number; timelineFrame: number }> }).beats.slice(0, 3)).toEqual([
      { index: 4, sourceSec: 2, timelineSec: 3, timelineFrame: 90 },
      { index: 5, sourceSec: 2.5, timelineSec: 3.25, timelineFrame: 98 },
      { index: 6, sourceSec: 3, timelineSec: 3.5, timelineFrame: 105 },
    ]);
  });
});
