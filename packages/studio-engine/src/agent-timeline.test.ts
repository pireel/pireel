import { describe, expect, it } from 'vitest';
import { applyCaptionDocumentEdit } from './caption-document-edit';
import { emptyEditorDocumentV2 } from './editor-document';
import { resizeVisualTimelineClip, runAgentTimelineTool } from './agent-timeline';
import { withDirectorPlanInSemantics } from './director-plan-artifact';

describe('shared agent timeline atoms', () => {
  it('binds planned native visuals and reassigns them when they move across Director scenes', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document.semantics = withDirectorPlanInSemantics(document.semantics, {
      goal: 'Move from claim to proof.',
      creativeThesis: 'Evidence replaces assertion.',
      rhythmArc: 'Claim holds, proof accelerates, result settles.',
      designSystem: {
        visualConcept: 'Assertion resolving into evidence.',
        composition: 'Speaker field hands off to a full evidence plane.',
        typography: 'One display claim with restrained evidence labels.',
        colorAndMaterial: 'Neutral source color with one proof accent.',
        imagery: 'Preserve real source and evidence pixels.',
        motion: 'Motivated handoff, localized reveal, clean hold.',
        sound: 'Voice first with truthful source sound at proof.',
      },
      scenes: [
        { id: 'claim', label: 'Claim', startFrame: 0, durationFrames: 120, viewerTask: 'understand', narrativeRole: 'explain', sceneFamily: 'speaker-clean', purpose: 'State the idea.', treatmentId: 'source-claim', visualAnchor: 'Speaker', visualTreatment: 'Speaker-led source field.', motionPlan: 'Enter, develop, hold, clear.', soundPlan: 'Voice first.', assetStrategy: 'Use source.', brollDecision: 'none', brollRationale: 'Continuity carries the claim.' },
        { id: 'proof', label: 'Proof', startFrame: 120, durationFrames: 180, viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'media-evidence', purpose: 'Show evidence.', treatmentId: 'evidence-plane', visualAnchor: 'Evidence', visualTreatment: 'Dominant source evidence plane.', motionPlan: 'Reveal, inspect, hold, clear.', soundPlan: 'Voice with truthful source sound.', assetStrategy: 'Use evidence source.', brollDecision: 'source', brollRationale: 'The claim must be seen.' },
      ],
    });
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
    const planFile = runAgentTimelineTool(placed.document!, 'read_director_plan', {});
    expect(planFile.ok).toBe(true);
    expect((planFile.data as { path: string; content: string }).path).toBe('director-plan.md');
    expect((planFile.data as { content: string }).content).toContain('# Director Plan');

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

  it('uses a generated speech estimate as the initial asset and clip duration', () => {
    const empty = emptyEditorDocumentV2({ fps: 30 });
    const registered = runAgentTimelineTool(empty, 'register_media', {
      assets: [{
        id: 'tts-estimated', kind: 'audio', url: 'https://cdn.example/tts.mp3',
        estimatedDurationSec: 46.1, transcriptText: '这是已经确定的配音文稿。',
      }],
    });
    expect(registered.document!.assets['tts-estimated']!.metadata.durationSec).toBe(46.1);
    const placed = runAgentTimelineTool(registered.document!, 'add_clips', {
      clips: [{ assetId: 'tts-estimated', role: 'narration', startSec: 0 }],
    });
    const narration = placed.document!.timeline.tracks.find((track) => track.role === 'narration')!;
    expect(narration.clips[0]!.durationFrames).toBe(1_383);
    expect(narration.clips[0]).toMatchObject({ sourceInSec: 0, sourceOutSec: 46.1 });
  });

  it('keeps an overwrite destination track alive when a later clip fully replaces its contents', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [
        { id: 'local:first', kind: 'video', localSig: 'first.mp4:100:1', durationSec: 5 },
        { id: 'local:second', kind: 'video', localSig: 'second.mp4:200:2', durationSec: 5 },
      ],
    }).document!;

    const first = runAgentTimelineTool(document, 'add_clips', {
      clips: [{ id: 'first-clip', role: 'broll', assetId: 'local:first', startSec: 8.7 }],
    });
    const targetTrackId = first.document!.timeline.tracks.find((track) => track.role === 'broll')!.id;
    const placed = runAgentTimelineTool(first.document!, 'add_clips', {
      clips: [{ id: 'second-clip', role: 'broll', assetId: 'local:second', trackId: targetTrackId, startSec: 8.7 }],
    });

    expect(placed.ok).toBe(true);
    const broll = placed.document!.timeline.tracks.find((track) => track.role === 'broll');
    expect(broll).toBeDefined();
    expect(broll!.clips).toHaveLength(1);
    expect(broll!.clips[0]).toMatchObject({ id: 'second-clip', assetId: 'local:second' });
    expect(placed.data).toMatchObject({
      clipIds: ['second-clip'],
      overwrittenClipIds: ['first-clip'],
    });
  });

  it('uses five seconds as an editable default when video duration is unknown', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [{ id: 'unknown-video', kind: 'video', url: 'https://cdn.example/unknown.mp4' }],
    }).document!;

    const placed = runAgentTimelineTool(document, 'add_clips', {
      clips: [{ assetId: 'unknown-video', startSec: 30 }],
    });

    expect(placed.ok).toBe(true);
    expect(placed.document!.timeline.tracks.find((track) => track.role === 'broll')?.clips[0]).toMatchObject({
      durationFrames: 150,
      sourceInSec: 0,
      sourceOutSec: 5,
    });
  });

  it('preserves overlapping visuals on parallel lanes and reports exact placement ranges', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [
        { id: 'background', kind: 'video', url: 'https://cdn.example/background.mp4', durationSec: 30 },
        { id: 'evidence', kind: 'image', url: 'https://cdn.example/evidence.png' },
      ],
    }).document!;
    const background = runAgentTimelineTool(document, 'add_clips', {
      clips: [{ id: 'background-clip', assetId: 'background', startSec: 0 }],
    });
    const evidence = runAgentTimelineTool(background.document!, 'add_clips', {
      clips: [{ id: 'evidence-clip', assetId: 'evidence', startSec: 0.5, durationSec: 9 }],
    });

    expect(evidence.ok).toBe(true);
    const broll = evidence.document!.timeline.tracks.filter((track) => track.role === 'broll');
    expect(broll).toHaveLength(2);
    expect(broll.flatMap((track) => track.clips).find((clip) => clip.id === 'background-clip')).toMatchObject({
      startFrame: 0,
      durationFrames: 900,
    });
    expect(evidence.data).toMatchObject({
      clipIds: ['evidence-clip'],
      placements: [{
        clipId: 'evidence-clip',
        startSec: 0.5,
        endSec: 9.5,
        durationSec: 9,
      }],
    });
    expect(evidence.data).not.toHaveProperty('overwrittenClipIds');
  });

  it('uses the real source duration for contiguous repeated video coverage', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [{ id: 'loop-source', kind: 'video', url: 'https://cdn.example/loop.mp4', durationSec: 30 }],
    }).document!;

    const placed = runAgentTimelineTool(document, 'add_clips', {
      clips: [0, 30, 60, 90, 120].map((startSec) => ({ assetId: 'loop-source', startSec })),
    });

    expect(placed.ok).toBe(true);
    const broll = placed.document!.timeline.tracks.filter((track) => track.role === 'broll');
    expect(broll).toHaveLength(1);
    expect(broll[0]!.clips.map((clip) => [clip.startFrame, clip.durationFrames])).toEqual([
      [0, 900], [900, 900], [1_800, 900], [2_700, 900], [3_600, 900],
    ]);
    expect((placed.data as { placements: Array<{ startSec: number; endSec: number }> }).placements
      .map(({ startSec, endSec }) => [startSec, endSec])).toEqual([
        [0, 30], [30, 60], [60, 90], [90, 120], [120, 150],
      ]);
  });

  it('trims and extends visual clips from either edge without changing video speed', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [
        { id: 'video', kind: 'video', url: 'https://cdn.example/video.mp4', durationSec: 30 },
        { id: 'image', kind: 'image', url: 'https://cdn.example/image.png' },
      ],
    }).document!;
    document = runAgentTimelineTool(document, 'add_clips', {
      clips: [
        { id: 'video-clip', assetId: 'video', startSec: 0, durationSec: 5, sourceInSec: 0, sourceOutSec: 5 },
        { id: 'image-clip', assetId: 'image', startSec: 40, durationSec: 5 },
      ],
    }).document!;

    const extended = resizeVisualTimelineClip(document, 'video-clip', 'right', 12);
    expect(extended.ok).toBe(true);
    expect(extended.document!.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'video-clip')).toMatchObject({
      startFrame: 0,
      durationFrames: 360,
      sourceInSec: 0,
      sourceOutSec: 12,
    });
    const trimmed = resizeVisualTimelineClip(extended.document!, 'video-clip', 'left', 2);
    expect(trimmed.document!.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'video-clip')).toMatchObject({
      startFrame: 60,
      durationFrames: 300,
      sourceInSec: 2,
      sourceOutSec: 12,
    });
    const image = resizeVisualTimelineClip(trimmed.document!, 'image-clip', 'right', 52);
    expect(image.document!.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'image-clip')).toMatchObject({
      startFrame: 1_200,
      durationFrames: 360,
      sourceInSec: 0,
      sourceOutSec: 5,
    });
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

  it('retimes video picture and source audio together while keeping source ranges fixed', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.main = { id: 'main', kind: 'video', locator: { remoteUrl: 'https://cdn.example/main.mp4' }, metadata: { durationSec: 6, hasAudio: true } };
    document.semantics.primaryNarrativeAssetId = 'main';
    document.timeline.tracks[0]!.clips = [
      {
        id: 'shot-1', kind: 'narrative', assetId: 'main', startFrame: 0, durationFrames: 120,
        sourceInSec: 0, sourceOutSec: 4, properties: { treatment: 'full' }, enabled: true,
      },
      {
        id: 'shot-2', kind: 'narrative', assetId: 'main', startFrame: 120, durationFrames: 60,
        sourceInSec: 4, sourceOutSec: 6, properties: { treatment: 'full' }, enabled: true,
      },
    ];

    const retimed = runAgentTimelineTool(document, 'set_video_speed', { shotIds: ['shot-1'], speed: 2 });

    expect(retimed.ok).toBe(true);
    expect(retimed.document!.timeline.tracks[0]!.clips).toMatchObject([
      { id: 'shot-1', startFrame: 0, durationFrames: 60, sourceInSec: 0, sourceOutSec: 4 },
      { id: 'shot-2', startFrame: 60, durationFrames: 60, sourceInSec: 4, sourceOutSec: 6 },
    ]);
    expect(retimed.data).toEqual({ clipIds: ['shot-1'], speed: 2 });
    expect(runAgentTimelineTool(document, 'set_video_speed', { all: true, speed: 4.1 }).ok).toBe(false);
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
