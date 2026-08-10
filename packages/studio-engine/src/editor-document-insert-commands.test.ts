import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  emptyEditorDocumentV2,
  validateEditorDocumentV2,
  type AudioTimelineClip,
  type EditorDocumentV2,
  type EditorTrack,
  type NarrativeTimelineClip,
  type TimelineClipPlacement,
} from './editor-document';
import type { DirectorPlanV1 } from './director-plan';

function testDocument(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.video = {
    id: 'video',
    kind: 'video',
    locator: { localSig: 'video' },
    metadata: { durationSec: 20 },
  };
  document.assets.audio = {
    id: 'audio',
    kind: 'audio',
    locator: { localSig: 'audio' },
    metadata: { durationSec: 20 },
  };
  return document;
}

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

function audio(id: string, startFrame: number, durationFrames: number): AudioTimelineClip {
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

function placement(clip: NarrativeTimelineClip, offsetFrames = 0): TimelineClipPlacement {
  const { startFrame: _removed, ...relative } = clip;
  return { ...relative, offsetFrames };
}

function audioTrack(id: string, clip: AudioTimelineClip, patch: Partial<EditorTrack> = {}): EditorTrack {
  return {
    id,
    type: 'audio',
    muted: false,
    hidden: false,
    locked: false,
    syncLocked: true,
    stackOrder: 1,
    clips: [clip],
    ...patch,
  };
}

describe('EditorDocument V2 clip insertion commands', () => {
  it('keeps Director intervals and scene membership aligned during a ripple insert', () => {
    const document = testDocument();
    document.timeline.tracks[0]!.clips = [narrative('talk', 0, 300, 0, 10)];
    const plan: DirectorPlanV1 = {
      version: 1,
      goal: 'Explain, then prove.',
      creativeThesis: 'Let evidence follow the claim.',
      scenes: [
        { id: 'claim', label: 'Claim', startFrame: 0, durationFrames: 120, viewerTask: 'understand', narrativeRole: 'explain', sceneFamily: 'speaker-clean', purpose: 'State the claim.' },
        { id: 'proof', label: 'Proof', startFrame: 120, durationFrames: 180, viewerTask: 'believe', narrativeRole: 'prove', sceneFamily: 'media-evidence', purpose: 'Show the evidence.' },
      ],
    };
    document.semantics.directorPlan = plan;
    document.semantics.scenes = [
      { id: 'claim', clipIds: ['talk'] },
      { id: 'proof', clipIds: ['talk'] },
    ];

    const result = applyEditorCommand(document, {
      type: 'clips.insert',
      trackId: document.semantics.primaryNarrativeTrackId,
      atFrame: 60,
      mode: 'ripple',
      sceneId: 'claim',
      clips: [placement(narrative('evidence', 0, 30, 12, 13))],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.semantics.directorPlan?.scenes.map((scene) => [scene.id, scene.startFrame, scene.durationFrames])).toEqual([
      ['claim', 0, 150],
      ['proof', 150, 180],
    ]);
    expect(result.document.semantics.scenes.find((scene) => scene.id === 'claim')?.clipIds).toContain('evidence');
    expect(validateEditorDocumentV2(result.document)).toEqual([]);
  });

  it('ripple-inserts into an empty primary lane and opens the same gap on sync-locked tracks', () => {
    const document = testDocument();
    document.timeline.tracks.push(
      audioTrack('dialogue', audio('dialogue-audio', 0, 120)),
      audioTrack('music', audio('music-audio', 0, 120), { syncLocked: false }),
    );
    const before = structuredClone(document);

    const result = applyEditorCommand(document, {
      type: 'clips.insert',
      trackId: document.semantics.primaryNarrativeTrackId,
      atFrame: 30,
      mode: 'ripple',
      clips: [placement(narrative('inserted', 0, 60, 5, 7))],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(document).toEqual(before);
    expect(result.document.timeline.tracks[0]!.clips).toMatchObject([
      { id: 'inserted', startFrame: 30, durationFrames: 60, sourceInSec: 5, sourceOutSec: 7 },
    ]);
    expect(result.document.timeline.tracks.find((track) => track.id === 'dialogue')!.clips).toMatchObject([
      { id: 'dialogue-audio', startFrame: 0, durationFrames: 30, sourceInSec: 0, sourceOutSec: 1 },
      { id: 'dialogue-audio~split-30', startFrame: 90, durationFrames: 90, sourceInSec: 1, sourceOutSec: 4 },
    ]);
    expect(result.document.timeline.tracks.find((track) => track.id === 'music')!.clips).toEqual([audio('music-audio', 0, 120)]);
    expect(result.receipt.createdClipIds).toEqual(expect.arrayContaining(['inserted', 'dialogue-audio~split-30']));
    expect(validateEditorDocumentV2(result.document)).toEqual([]);
  });

  it('overwrite replaces only the target interval and preserves source trims on both sides', () => {
    const document = testDocument();
    document.timeline.tracks[0]!.clips = [narrative('talk', 0, 300, 0, 10)];
    document.semantics.scenes = [{ id: 'scene', clipIds: ['talk'] }];

    const result = applyEditorCommand(document, {
      type: 'clips.insert',
      trackId: document.semantics.primaryNarrativeTrackId,
      atFrame: 90,
      mode: 'overwrite',
      clips: [placement(narrative('replacement', 0, 60, 12, 14))],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips).toMatchObject([
      { id: 'talk', startFrame: 0, durationFrames: 90, sourceInSec: 0, sourceOutSec: 3 },
      { id: 'replacement', startFrame: 90, durationFrames: 60, sourceInSec: 12, sourceOutSec: 14 },
      { id: 'talk~split-150', startFrame: 150, durationFrames: 150, sourceInSec: 5, sourceOutSec: 10 },
    ]);
    expect(result.document.semantics.scenes[0]!.clipIds).toEqual(['talk', 'talk~split-150']);
    expect(result.receipt.commandType).toBe('clips.insert');
    expect(validateEditorDocumentV2(result.document)).toEqual([]);
  });

  it('fails a ripple insert atomically when a linked or sync-locked lane is locked', () => {
    const document = testDocument();
    document.timeline.tracks.push(audioTrack('locked-audio', audio('locked', 30, 30), { locked: true }));
    const before = structuredClone(document);
    const result = applyEditorCommand(document, {
      type: 'clips.insert',
      trackId: document.semantics.primaryNarrativeTrackId,
      atFrame: 0,
      mode: 'ripple',
      clips: [placement(narrative('inserted', 0, 30, 0, 1))],
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'track-locked', trackIds: ['locked-audio'] } });
    expect(result.document).toBe(document);
    expect(document).toEqual(before);
  });

  it('rejects duplicate ids before clearing an overwrite range', () => {
    const document = testDocument();
    document.timeline.tracks[0]!.clips = [narrative('talk', 0, 300, 0, 10)];
    const before = structuredClone(document);
    const result = applyEditorCommand(document, {
      type: 'clips.insert',
      trackId: document.semantics.primaryNarrativeTrackId,
      atFrame: 90,
      mode: 'overwrite',
      clips: [placement(narrative('talk', 0, 60, 12, 14))],
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'duplicate-clip-id' } });
    expect(document).toEqual(before);
  });
});
