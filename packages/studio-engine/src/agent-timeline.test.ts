import { describe, expect, it } from 'vitest';
import { applyCaptionDocumentEdit } from './caption-document-edit';
import { audioClipDefaults } from './audio-tracks';
import { emptyEditorDocumentV2, parseEditorDocumentV2, projectV2ToLegacyComposition } from './editor-document';
import { resizeNarrativeTimelineClip, resizeVisualTimelineClip, runAgentTimelineTool } from './agent-timeline';
import { withDirectorPlanInSemantics } from './director-plan-artifact';
import { withSceneDesignsInSemantics } from './scene-design';

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
    document.semantics = withSceneDesignsInSemantics(document.semantics, { scenes: [{
      sceneId: 'claim', designIntent: 'Keep the claim human.', composition: 'Speaker remains the anchor.',
      choreography: 'Establish, emphasize, hold, clear.', continuity: 'Carry cadence into proof.', successCriteria: 'Speaker remains readable.',
    }, {
      sceneId: 'proof', designIntent: 'Make proof inspectable.', composition: 'Evidence remains dominant.',
      choreography: 'Reveal, inspect, hold, clear.', continuity: 'Resolve the claim into evidence.', successCriteria: 'Evidence remains readable.',
    }] });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [{ id: 'evidence', kind: 'image', url: 'https://cdn.example/evidence.png' }],
    }).document!;
    const placed = runAgentTimelineTool(document, 'add_clips', {
      clips: [{ id: 'evidence-clip', assetId: 'evidence', startSec: 1, durationSec: 2, sceneId: 'claim' }],
    });
    expect(placed.ok).toBe(true);
    expect(placed.document!.semantics.scenes.find((scene) => scene.id === 'claim')?.clipIds).toContain('evidence-clip');
    expect((placed.data as { clipIds: string[] }).clipIds).toEqual(['evidence-clip']);
    const timeline = runAgentTimelineTool(placed.document!, 'get_timeline', {}).data as { semantics: { directorPlan?: unknown; sceneDesigns?: { sceneIds: string[] } } };
    expect(timeline.semantics.directorPlan).toBeDefined();
    expect(timeline.semantics.sceneDesigns?.sceneIds).toEqual(['claim', 'proof']);
    const planFile = runAgentTimelineTool(placed.document!, 'read_director_plan', { sceneIds: ['proof'] });
    expect(planFile.ok).toBe(true);
    expect((planFile.data as { path: string; content: string }).path).toBe('director-plan.md');
    expect((planFile.data as { content: string }).content).toContain('# Director Plan');
    expect((planFile.data as { content: string }).content).toContain('#### Label\n\nProof');
    expect((planFile.data as { content: string }).content).not.toContain('State the idea.');
    const sceneFile = runAgentTimelineTool(placed.document!, 'read_scene_designs', { sceneIds: ['claim'] });
    expect(sceneFile.ok).toBe(true);
    expect(sceneFile.data).toMatchObject({ path: 'scene-designs.md', mediaType: 'text/markdown' });
    expect((sceneFile.data as { content: string }).content).toContain('Keep the claim human.');
    expect((sceneFile.data as { content: string }).content).not.toContain('Make proof inspectable.');

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
    expect(narration).toMatchObject({ type: 'audio', clips: [{ kind: 'audio', assetId: 'tts-1', properties: { volumeDb: 4 } }] });
    const projectedNarration = projectV2ToLegacyComposition(placed.document!).audioTracks?.[0];
    expect(projectedNarration).toMatchObject({ role: 'narration' });
    expect(audioClipDefaults(projectedNarration!).fadeInSec).toBe(0);
    expect(audioClipDefaults(projectedNarration!).fadeOutSec).toBe(0);
    const captions = applyCaptionDocumentEdit({
      document: placed.document!, patch: { on: true, preset: 'ln-clean' }, source: { mode: 'track', trackId: narration.id }, mainTranscript: null, clipTranscripts: {},
    });
    expect(captions.ok).toBe(true);
    if (!captions.ok) return;
    expect(captions.document.semantics.managedCaptionSource).toEqual({ mode: 'track', trackId: narration.id });
    expect(captions.document.timeline.tracks.find((track) => track.role === 'managedCaptions')!.clips.length).toBeGreaterThan(0);
  });

  it('starts narration above source level and caps a new music bed below it', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', { assets: [
      { id: 'voice', kind: 'audio', url: 'https://cdn.example/voice.mp3', durationSec: 5 },
      { id: 'music', kind: 'audio', url: 'https://cdn.example/music.mp3', durationSec: 5 },
    ] }).document!;
    const placed = runAgentTimelineTool(document, 'add_clips', { clips: [
      { id: 'voice-clip', assetId: 'voice', role: 'narration', startSec: 0 },
      { id: 'music-clip', assetId: 'music', role: 'music', startSec: 0, volumeDb: -14 },
    ] });
    expect(placed.ok).toBe(true);
    expect(placed.document!.timeline.tracks.find((track) => track.role === 'narration')?.clips[0]).toMatchObject({ properties: { volumeDb: 4 } });
    expect(placed.document!.timeline.tracks.find((track) => track.role === 'music')?.clips[0]).toMatchObject({ properties: { volumeDb: -24 } });
  });

  it('rejects overlapping audible narration on parallel tracks while allowing music underneath', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', { assets: [
      { id: 'voice-a', kind: 'audio', url: 'https://cdn.example/voice-a.mp3', durationSec: 5 },
      { id: 'voice-b', kind: 'audio', url: 'https://cdn.example/voice-b.mp3', durationSec: 5 },
      { id: 'music', kind: 'audio', url: 'https://cdn.example/music.mp3', durationSec: 5 },
    ] }).document!;
    const first = runAgentTimelineTool(document, 'add_clips', { clips: [
      { id: 'voice-a-clip', assetId: 'voice-a', role: 'narration', startSec: 0 },
      { id: 'music-clip', assetId: 'music', role: 'music', startSec: 0 },
    ] });
    expect(first.ok).toBe(true);
    const createdTrack = runAgentTimelineTool(first.document!, 'manage_tracks', {
      action: 'create', type: 'audio', role: 'narration', trackId: 'alternate-narration', name: 'Alternate narration',
    });
    const conflicted = runAgentTimelineTool(createdTrack.document!, 'add_clips', { clips: [
      { id: 'voice-b-clip', assetId: 'voice-b', role: 'narration', trackId: 'alternate-narration', startSec: 1 },
    ] });
    expect(conflicted.ok).toBe(false);
    expect(conflicted.error).toContain('Narration clips cannot overlap in one output');
    expect(conflicted.document).toBeUndefined();
    expect(createdTrack.document!.timeline.tracks.find((track) => track.id === 'alternate-narration')?.clips).toHaveLength(0);
  });

  it('keeps overlapping SFX on separate free audio lanes and reuses a lane after the collision ends', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', { assets: [
      { id: 'sfx-open', kind: 'audio', url: 'https://cdn.example/open.m4a', durationSec: 3 },
      { id: 'sfx-pour', kind: 'audio', url: 'https://cdn.example/pour.m4a', durationSec: 3 },
      { id: 'sfx-settle', kind: 'audio', url: 'https://cdn.example/settle.m4a', durationSec: 1 },
    ] }).document!;

    const placed = runAgentTimelineTool(document, 'add_clips', { clips: [
      { id: 'open', assetId: 'sfx-open', role: 'sfx', startSec: 0 },
      { id: 'pour', assetId: 'sfx-pour', role: 'sfx', startSec: 1 },
      { id: 'settle', assetId: 'sfx-settle', role: 'sfx', startSec: 3 },
    ] });

    expect(placed.ok, JSON.stringify(placed)).toBe(true);
    const tracks = placed.document!.timeline.tracks.filter((track) => track.role === 'sfx');
    expect(tracks).toHaveLength(2);
    expect(tracks.find((track) => track.clips.some((clip) => clip.id === 'open'))?.clips.map((clip) => clip.id)).toEqual(['open', 'settle']);
    expect(tracks.find((track) => track.clips.some((clip) => clip.id === 'pour'))?.clips.map((clip) => clip.id)).toEqual(['pour']);
    expect((placed.data as { overwrittenClipIds?: string[] }).overwrittenClipIds).toBeUndefined();
  });

  it('skips a duplicate title with the same text in an overlapping time window', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    const first = runAgentTimelineTool(document, 'add_texts', { items: [{
      id: 'line-1', text: '普通的人生，依然值得被爱', startSec: 50, durationSec: 4,
      placement: { xPct: 10, yPct: 40, widthPct: 80, heightPct: 16 },
    }] });
    expect(first.ok).toBe(true);
    const second = runAgentTimelineTool(first.document!, 'add_texts', { items: [{
      id: 'line-copy', text: '普通的人生，依然值得被爱', startSec: 50.2, durationSec: 3.9,
      placement: { xPct: 8, yPct: 26, widthPct: 84, heightPct: 14 },
    }] });
    expect(second.ok).toBe(true);
    expect((second.data as { skippedDuplicates?: string[] }).skippedDuplicates).toHaveLength(1);
    const titles = second.document!.timeline.tracks.flatMap((track) => track.clips)
      .filter((clip) => clip.kind === 'graphic');
    expect(titles).toHaveLength(1);
    // Same text at a NON-overlapping time (a deliberate structural echo) still lands.
    const echo = runAgentTimelineTool(second.document!, 'add_texts', { items: [{
      id: 'line-echo', text: '普通的人生，依然值得被爱', startSec: 90, durationSec: 3,
    }] });
    expect(echo.ok).toBe(true);
    expect((echo.data as { clipIds: string[] }).clipIds).toEqual(['line-echo']);
  });

  it('keeps overlay text out of the caption band and off concurrent titles', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = { ...document, appearance: { ...document.appearance, captionStyle: { on: true, preset: 'ln-clean', yPct: 84 } } };
    const first = runAgentTimelineTool(document, 'add_texts', { items: [{
      id: 'title-low', text: 'bottom line', startSec: 10, durationSec: 5,
      placement: { xPct: 10, yPct: 66, widthPct: 70, heightPct: 20 },
    }] });
    expect(first.ok).toBe(true);
    const lowBox = first.document!.timeline.tracks.flatMap((track) => track.clips)
      .find((clip) => clip.id === 'title-low')!;
    const lowRect = (lowBox as { block: { box: { y: number; h: number } } }).block.box;
    // Requested bottom edge 86% sat inside the caption band (bottom 84%); lifted above it.
    expect(lowRect.y + lowRect.h).toBeLessThanOrEqual(0.84 - 0.14);

    const second = runAgentTimelineTool(first.document!, 'add_texts', { items: [{
      id: 'title-peer', text: 'concurrent', startSec: 12, durationSec: 5,
      placement: { xPct: 10, yPct: Math.round(lowRect.y * 100), widthPct: 70, heightPct: 16 },
    }] });
    expect(second.ok).toBe(true);
    const peerRect = (second.document!.timeline.tracks.flatMap((track) => track.clips)
      .find((clip) => clip.id === 'title-peer') as { block: { box: { y: number; h: number } } }).block.box;
    // Same time window + intersecting box: the later title stacks above the earlier one.
    expect(peerRect.y + peerRect.h).toBeLessThanOrEqual(lowRect.y);

    const later = runAgentTimelineTool(second.document!, 'add_texts', { items: [{
      id: 'title-later', text: 'different moment', startSec: 30, durationSec: 4,
      placement: { xPct: 10, yPct: Math.round(lowRect.y * 100), widthPct: 70, heightPct: 16 },
    }] });
    expect(later.ok).toBe(true);
    const laterRect = (later.document!.timeline.tracks.flatMap((track) => track.clips)
      .find((clip) => clip.id === 'title-later') as { block: { box: { y: number } } }).block.box;
    // No temporal overlap: the requested placement stands.
    expect(Math.round(laterRect.y * 100)).toBe(Math.round(lowRect.y * 100));
  });

  it('appends unanchored batch clips sequentially instead of stacking them at the track head', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', { assets: [
      { id: 'voice', kind: 'audio', url: 'https://cdn.example/voice.mp3', durationSec: 12 },
      { id: 'vid-a', kind: 'video', url: 'https://cdn.example/a.mp4', durationSec: 20 },
      { id: 'vid-b', kind: 'video', url: 'https://cdn.example/b.mp4', durationSec: 20 },
      { id: 'vid-c', kind: 'video', url: 'https://cdn.example/c.mp4', durationSec: 20 },
    ] }).document!;
    const placed = runAgentTimelineTool(document, 'add_clips', { clips: [
      { assetId: 'voice', role: 'narration', startSec: 0, durationSec: 12 },
      { id: 'shot-a', assetId: 'vid-a', role: 'primary', muted: true, sourceInSec: 1, sourceOutSec: 4 },
      { id: 'shot-b', assetId: 'vid-b', role: 'primary', muted: true, sourceInSec: 0, sourceOutSec: 5 },
      { id: 'shot-c', assetId: 'vid-c', role: 'primary', muted: true, sourceInSec: 2, sourceOutSec: 6 },
    ] });
    expect(placed.ok, JSON.stringify(placed)).toBe(true);
    const primary = placed.document!.timeline.tracks.find((track) => track.role === 'primaryNarrative')!;
    expect(primary.clips.map((clip) => clip.id)).toEqual(['shot-a', 'shot-b', 'shot-c']);
    expect(primary.clips.map((clip) => clip.startFrame)).toEqual([0, 90, 240]);
    expect(primary.clips.reduce((sum, clip) => sum + clip.durationFrames, 0)).toBe(360);
  });

  it('inherits probed dimensions when an alias registers the same local source', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', { assets: [{
      id: 'library-video', kind: 'video', localSig: 'same.mp4:1:1', durationSec: 8, width: 960, height: 1280,
    }] }).document!;
    const alias = runAgentTimelineTool(document, 'register_media', { assets: [{
      id: 'v1', kind: 'video', localSig: 'same.mp4:1:1', durationSec: 4,
    }] });
    expect(alias.document!.assets.v1.metadata).toMatchObject({ durationSec: 4, width: 960, height: 1280 });
  });

  it('gives agent-created title text an editable safe-area box', () => {
    const added = runAgentTimelineTool(emptyEditorDocumentV2({ fps: 30 }), 'add_texts', {
      items: [{ id: 'title-1', text: '重点信息', startSec: 0, durationSec: 2 }],
    });
    expect(added.ok).toBe(true);
    expect(added.document!.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'title-1')).toMatchObject({
      kind: 'graphic',
      block: { box: { x: 0.1, y: 0.34, w: 0.8, h: 0.32 }, slots: { preset: 'clean' } },
    });
  });

  it('persists native display-text preset, animation, style and planned placement', () => {
    const added = runAgentTimelineTool(emptyEditorDocumentV2({ fps: 30, width: 1080, height: 1920 }), 'add_texts', {
      items: [{
        id: 'hook', text: '仍然相信理想', startSec: 1, durationSec: 2.5,
        preset: 'editorial', animation: 'wordReveal', color: '#F7F1E8', accentColor: '#D8A84E',
        fontSize: 84, fontWeight: 650, fontFamily: 'serif', align: 'left',
        placement: { xPct: 10, yPct: 18, widthPct: 76, heightPct: 22 },
      }],
    });
    expect(added.ok).toBe(true);
    const clip = added.document!.timeline.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === 'hook');
    expect(clip).toMatchObject({
      kind: 'graphic',
      block: {
        box: { x: 0.1, y: 0.18, w: 0.76, h: 0.22 },
        slots: {
          preset: 'editorial', animation: 'wordReveal', color: '#F7F1E8', accentColor: '#D8A84E',
          fontSize: 84, fontWeight: 650, fontFamily: 'serif', align: 'left',
        },
      },
    });
  });

  it('reuses one graphics lane for sequential display text and allocates another only for overlap', () => {
    const added = runAgentTimelineTool(emptyEditorDocumentV2({ fps: 30 }), 'add_texts', {
      items: [
        { id: 'a', text: 'A', startSec: 0, durationSec: 1 },
        { id: 'b', text: 'B', startSec: 1, durationSec: 1 },
        { id: 'overlap', text: 'C', startSec: 1.5, durationSec: 1 },
      ],
    });
    expect(added.ok).toBe(true);
    const graphics = added.document!.timeline.tracks.filter((track) => track.type === 'graphics');
    expect(graphics).toHaveLength(2);
    expect(graphics.find((track) => track.stackOrder === 2)?.clips.map((clip) => clip.id)).toEqual(['a', 'b']);
    expect(graphics.find((track) => track.stackOrder === 3)?.clips.map((clip) => clip.id)).toEqual(['overlap']);
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

  it('places an assembled video sequence as peer sources on the ordered narrative lane', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [
        { id: 'hook', kind: 'video', url: 'https://cdn.example/hook.mp4', durationSec: 3 },
        { id: 'proof', kind: 'video', url: 'https://cdn.example/proof.mp4', durationSec: 5 },
      ],
    }).document!;

    const placed = runAgentTimelineTool(document, 'add_clips', {
      clips: [
        { id: 'hook-clip', role: 'primary', assetId: 'hook', startSec: 0, durationSec: 3 },
        { id: 'proof-clip', role: 'primary', assetId: 'proof', startSec: 3, durationSec: 5 },
      ],
    });

    expect(placed.ok).toBe(true);
    const primary = placed.document!.timeline.tracks.find((track) => track.role === 'primaryNarrative')!;
    expect(primary.clips).toMatchObject([
      { id: 'hook-clip', kind: 'narrative', assetId: 'hook', startFrame: 0, durationFrames: 90 },
      { id: 'proof-clip', kind: 'narrative', assetId: 'proof', startFrame: 90, durationFrames: 150 },
    ]);
    expect(placed.document!.semantics).not.toHaveProperty('primaryNarrativeAssetId');
    expect(placed.document!.timeline.tracks.filter((track) => track.role === 'broll')).toHaveLength(0);
    const projected = projectV2ToLegacyComposition(placed.document!);
    expect(projected.video).toBeNull();
    expect(projected.shots).toMatchObject([
      { id: 'hook-clip', src: 'https://cdn.example/hook.mp4' },
      { id: 'proof-clip', src: 'https://cdn.example/proof.mp4' },
    ]);
    const oldHierarchicalRow = {
      ...placed.document!,
      semantics: { ...placed.document!.semantics, primaryNarrativeAssetId: 'hook' },
    };
    expect(parseEditorDocumentV2(oldHierarchicalRow)!.semantics).not.toHaveProperty('primaryNarrativeAssetId');
    expect(projectV2ToLegacyComposition(oldHierarchicalRow)).toMatchObject({
      video: null,
      shots: [
        { id: 'hook-clip', src: 'https://cdn.example/hook.mp4' },
        { id: 'proof-clip', src: 'https://cdn.example/proof.mp4' },
      ],
    });

    const continued = runAgentTimelineTool(placed.document!, 'add_clips', {
      clips: [{ id: 'hook-return', role: 'primary', assetId: 'hook', startSec: 8, durationSec: 2 }],
    });
    expect(continued.ok).toBe(true);
    expect(continued.document!.semantics).not.toHaveProperty('primaryNarrativeAssetId');
  });

  it('rejects a non-video asset on the primary narrative lane', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [{ id: 'still', kind: 'image', url: 'https://cdn.example/still.png' }],
    }).document!;
    const placed = runAgentTimelineTool(document, 'add_clips', {
      clips: [{ role: 'primary', assetId: 'still', startSec: 0, durationSec: 3 }],
    });
    expect(placed).toMatchObject({ ok: false, error: expect.stringContaining('primary narrative lane accepts video') });
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

  it('extends a primary clip by rippling later clips and clears the changed cut transition', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [
        { id: 'first-video', kind: 'video', url: 'https://cdn.example/first.mp4', durationSec: 20 },
        { id: 'second-video', kind: 'video', url: 'https://cdn.example/second.mp4', durationSec: 20 },
      ],
    }).document!;
    document = runAgentTimelineTool(document, 'add_clips', {
      clips: [
        { id: 'first', role: 'primary', assetId: 'first-video', startSec: 0, durationSec: 5 },
        { id: 'second', role: 'primary', assetId: 'second-video', startSec: 5, durationSec: 5 },
      ],
    }).document!;
    const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId)!;
    primary.clips = primary.clips.map((clip) => clip.id === 'second' && clip.kind === 'narrative'
      ? { ...clip, properties: { ...clip.properties, transIn: { prevId: 'first', effect: 'fade', durationSec: 1 } } }
      : clip);

    const extendedTail = resizeNarrativeTimelineClip(document, 'first', 'right', 6);
    expect(extendedTail.ok).toBe(true);
    expect(extendedTail.document!.timeline.tracks.find((track) => track.id === primary.id)?.clips).toMatchObject([
      { id: 'first', startFrame: 0, durationFrames: 180, sourceInSec: 0, sourceOutSec: 6 },
      { id: 'second', startFrame: 180, durationFrames: 150, properties: { treatment: 'full' } },
    ]);
    expect((extendedTail.document!.timeline.tracks.find((track) => track.id === primary.id)?.clips[1] as { properties: object }).properties)
      .not.toHaveProperty('transIn');

    const trimmedHead = resizeNarrativeTimelineClip(extendedTail.document!, 'second', 'left', 7);
    expect(trimmedHead.document!.timeline.tracks.find((track) => track.id === primary.id)?.clips[1]).toMatchObject({
      id: 'second', startFrame: 210, durationFrames: 120, sourceInSec: 1, sourceOutSec: 5,
    });
  });

  it('restores a packed primary clip from its trimmed source head and ripples later clips', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [
        { id: 'first-video', kind: 'video', url: 'https://cdn.example/first.mp4', durationSec: 20 },
        { id: 'middle-video', kind: 'video', url: 'https://cdn.example/middle.mp4', durationSec: 20 },
        { id: 'last-video', kind: 'video', url: 'https://cdn.example/last.mp4', durationSec: 20 },
      ],
    }).document!;
    document = runAgentTimelineTool(document, 'add_clips', {
      clips: [
        { id: 'first', role: 'primary', assetId: 'first-video', startSec: 0, durationSec: 5, sourceInSec: 5, sourceOutSec: 10 },
        { id: 'middle', role: 'primary', assetId: 'middle-video', startSec: 5, durationSec: 5, sourceInSec: 5, sourceOutSec: 10 },
        { id: 'last', role: 'primary', assetId: 'last-video', startSec: 10, durationSec: 5 },
      ],
    }).document!;

    const extendedHead = resizeNarrativeTimelineClip(document, 'middle', 'left', 4);

    expect(extendedHead.ok).toBe(true);
    expect(extendedHead.document!.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId)?.clips).toMatchObject([
      { id: 'first', startFrame: 0, durationFrames: 150 },
      { id: 'middle', startFrame: 150, durationFrames: 180, sourceInSec: 4, sourceOutSec: 10 },
      { id: 'last', startFrame: 330, durationFrames: 150 },
    ]);

    const firstAtZero = resizeNarrativeTimelineClip(document, 'first', 'left', -1);
    expect(firstAtZero.ok).toBe(true);
    expect(firstAtZero.document!.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId)?.clips).toMatchObject([
      { id: 'first', startFrame: 0, durationFrames: 180, sourceInSec: 4, sourceOutSec: 10 },
      { id: 'middle', startFrame: 180, durationFrames: 150 },
      { id: 'last', startFrame: 330, durationFrames: 150 },
    ]);
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

  it('retrims placed video by source clock, preserves playback speed, and ripples later primary clips', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.main = { id: 'main', kind: 'video', locator: { remoteUrl: 'https://cdn.example/main.mp4' }, metadata: { durationSec: 10 } };
    document.timeline.tracks[0]!.clips = [
      { id: 'shot-1', kind: 'narrative', assetId: 'main', startFrame: 0, durationFrames: 150, sourceInSec: 0, sourceOutSec: 5, properties: { treatment: 'full' }, enabled: true },
      { id: 'shot-2', kind: 'narrative', assetId: 'main', startFrame: 150, durationFrames: 150, sourceInSec: 5, sourceOutSec: 10, properties: { treatment: 'full' }, enabled: true },
    ];

    const retrimmed = runAgentTimelineTool(document, 'set_clip_properties', {
      items: [{ clipId: 'shot-1', sourceInSec: 1, sourceOutSec: 4 }],
    });
    expect(retrimmed.ok).toBe(true);
    expect(retrimmed.document!.timeline.tracks[0]!.clips).toMatchObject([
      { id: 'shot-1', startFrame: 0, durationFrames: 90, sourceInSec: 1, sourceOutSec: 4 },
      { id: 'shot-2', startFrame: 90, durationFrames: 150, sourceInSec: 5, sourceOutSec: 10 },
    ]);
    expect(runAgentTimelineTool(retrimmed.document!, 'set_clip_properties', {
      items: [{ clipId: 'shot-1', sourceOutSec: 12 }],
    })).toMatchObject({ ok: false, error: expect.stringContaining('inside the asset duration') });
  });

  it('retimes video picture and source audio together while keeping source ranges fixed', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.main = { id: 'main', kind: 'video', locator: { remoteUrl: 'https://cdn.example/main.mp4' }, metadata: { durationSec: 6, hasAudio: true } };
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

  it('places primary footage at natural speed with a full-frame cover anchor', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [{ id: 'portrait', kind: 'video', url: 'https://cdn.example/portrait.mp4', durationSec: 12 }],
    }).document!;

    const placed = runAgentTimelineTool(document, 'add_clips', { clips: [{
      id: 'hero', role: 'primary', assetId: 'portrait', startSec: 0,
      durationSec: 3.2, sourceInSec: 2, sourceOutSec: 5.2, anchorY: 0.62,
    }] });

    expect(placed.ok).toBe(true);
    expect(placed.document!.timeline.tracks[0]!.clips[0]).toMatchObject({
      id: 'hero', durationFrames: 96, sourceInSec: 2, sourceOutSec: 5.2,
      properties: {
        treatment: 'full',
        preciseFraming: {
          scale: 1, anchorX: 0.5, anchorY: 0.62, coordinateSpace: 'source-normalized',
        },
      },
    });
    expect((runAgentTimelineTool(placed.document!, 'get_timeline', {}).data as {
      tracks: Array<{ clips: Array<{ playbackSpeed?: number }> }>;
    }).tracks[0]!.clips[0]!.playbackSpeed).toBeCloseTo(1, 8);
  });

  it('rejects primary duration fill disguised as an initial speed or mismatched source range', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', {
      assets: [{ id: 'portrait', kind: 'video', url: 'https://cdn.example/portrait.mp4', durationSec: 12 }],
    }).document!;

    expect(runAgentTimelineTool(document, 'add_clips', { clips: [{
      role: 'primary', assetId: 'portrait', durationSec: 4, sourceInSec: 2, sourceOutSec: 5, speed: 0.75,
    }] })).toMatchObject({ ok: false, error: expect.stringContaining('natural speed') });
    expect(runAgentTimelineTool(document, 'add_clips', { clips: [{
      role: 'primary', assetId: 'portrait', durationSec: 7, sourceInSec: 2, sourceOutSec: 5,
    }] })).toMatchObject({ ok: false, error: expect.stringContaining('must match') });
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

  it('removes the entire primary picture when asked — remove is an honest primitive', () => {
    let document = emptyEditorDocumentV2({ fps: 30 });
    document = runAgentTimelineTool(document, 'register_media', { assets: [
      { id: 'picture', kind: 'video', url: 'https://cdn.example/picture.mp4', durationSec: 5 },
      { id: 'voice', kind: 'audio', url: 'https://cdn.example/voice.mp3', durationSec: 5 },
    ] }).document!;
    document = runAgentTimelineTool(document, 'add_clips', { clips: [
      { id: 'picture-clip', assetId: 'picture', role: 'primary', durationSec: 5 },
      { id: 'voice-clip', assetId: 'voice', role: 'narration', durationSec: 5 },
    ] }).document!;

    // Protecting an assembled cut from agent self-demolition is the harness picture lock's job;
    // the engine executes the removal (recoverable via undo) instead of vetoing editing intent.
    const removed = runAgentTimelineTool(document, 'remove_clips', {
      clipIds: ['picture-clip'],
      includeLinked: false,
    });
    expect(removed.ok).toBe(true);
    expect(removed.document!.timeline.tracks.find((track) => track.role === 'primaryNarrative')?.clips).toEqual([]);
    expect(removed.document!.timeline.tracks.find((track) => track.role === 'narration')?.clips).toHaveLength(1);
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

describe('asset-id typo suggestion', () => {
  it('names the nearest registered id when a retyped asset id misses', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets['local_7be336cc-bbaf-485c-b32a-f2929b2903c9'] = {
      id: 'local_7be336cc-bbaf-485c-b32a-f2929b2903c9', kind: 'video',
      locator: { localSig: 'sig-1' }, metadata: { durationSec: 90 },
    };
    const outcome = runAgentTimelineTool(document, 'add_clips', {
      clips: [{ role: 'primary', assetId: 'local:local_76be336cc-bbaf-485c-b32a-f2929b2903c9', sourceInSec: 0, sourceOutSec: 2 }],
    });
    expect(outcome.ok).toBe(false);
    expect((outcome as { error?: string }).error).toContain('Closest registered id: local_7be336cc-bbaf-485c-b32a-f2929b2903c9');
  });

  it('suggests via unique long prefix when the uuid tail was dropped beyond edit distance', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets['local_ef703761-8603-4562-af25-9973fdaae590'] = {
      id: 'local_ef703761-8603-4562-af25-9973fdaae590', kind: 'video',
      locator: { localSig: 'sig-a' }, metadata: { durationSec: 90 },
    };
    document.assets['local_efe8f32e-27b2-4f14-af6a-c4a430df240e'] = {
      id: 'local_efe8f32e-27b2-4f14-af6a-c4a430df240e', kind: 'video',
      locator: { localSig: 'sig-b' }, metadata: { durationSec: 90 },
    };
    const outcome = runAgentTimelineTool(document, 'add_clips', {
      clips: [{ role: 'primary', assetId: 'local:local_ef703761-8603-4562-25', sourceInSec: 0, sourceOutSec: 2 }],
    });
    expect(outcome.ok).toBe(false);
    expect((outcome as { error?: string }).error).toContain('Closest registered id: local_ef703761-8603-4562-af25-9973fdaae590');
  });
});
