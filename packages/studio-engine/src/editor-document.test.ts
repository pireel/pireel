import { describe, expect, it } from 'vitest';
import type { AudioClip } from './audio-tracks';
import { emptyComposition, type Block, type Composition, type VideoShot } from './composition-core';
import {
  EDITOR_DOCUMENT_VERSION,
  editorTimelineTotalFrames,
  emptyEditorDocumentV2,
  firstNarrativeAssetId,
  primaryNarrativeTrack,
  projectV2ToLegacyComposition,
  validateEditorDocumentV2,
  type EditorDocumentV2,
} from './editor-document';
import { migrateLegacyProjectToV2 } from './editor-document/migration';

const migrate = (
  composition: Composition,
  extra: Partial<Parameters<typeof migrateLegacyProjectToV2>[0]> = {},
) => migrateLegacyProjectToV2({ projectId: 'project-1', composition, ...extra });

const mainVideo = { url: 'blob:main', durationSec: 10, sourceWidth: 1920, sourceHeight: 1080 };

describe('EditorDocument V2 migration', () => {
  it('creates native V2 projects without passing through the legacy model', () => {
    const document = emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 24 });
    expect(document.canvas).toEqual({ width: 1920, height: 1080, fps: 24, configured: false });
    expect(primaryNarrativeTrack(document)).toMatchObject({ role: 'primaryNarrative', clips: [] });
    expect(validateEditorDocumentV2(document)).toEqual([]);
  });

  it('creates a valid, deliberately empty primary narrative track for a blank project', () => {
    const { document, issues } = migrate(emptyComposition());
    expect(document.version).toBe(EDITOR_DOCUMENT_VERSION);
    expect(document.canvas).toEqual({ width: 1920, height: 1080, fps: 30, configured: false });
    expect(document.timeline.tracks).toHaveLength(1);
    expect(document.timeline.tracks[0]).toMatchObject({ id: 'track_primary_narrative', role: 'primaryNarrative', clips: [] });
    expect(document.assets).toEqual({});
    expect(issues).toEqual([]);
  });

  it('materializes a legacy uncut main source into one explicitly placed narrative clip', () => {
    const legacy = { ...emptyComposition(), video: mainVideo, shots: undefined };
    const { document, issues } = migrate(legacy, { videoSig: 'main-sig', fps: 24 });
    const track = document.timeline.tracks[0]!;
    expect(track.clips).toHaveLength(1);
    expect(track.clips[0]).toMatchObject({
      id: 'main',
      kind: 'narrative',
      startFrame: 0,
      durationFrames: 240,
      sourceInSec: 0,
      sourceOutSec: 10,
    });
    const asset = document.assets[firstNarrativeAssetId(document)!]!;
    expect(asset).toMatchObject({
      kind: 'video',
      locator: { localSig: 'main-sig', remoteUrl: 'blob:main' },
      metadata: { durationSec: 10, width: 1920, height: 1080 },
    });
    expect(issues).toEqual([]);

    const projected = projectV2ToLegacyComposition(document);
    expect(projected.video).toBeNull();
    expect(projected.shots).toEqual([{ id: 'main', src: 'blob:main', srcSig: 'main-sig', srcStart: 0, srcEnd: 10, treatment: 'full' }]);
  });

  it('recovers an uncut persisted source from DTO metadata after the runtime video object was stripped', () => {
    const legacy = { ...emptyComposition(), shots: undefined };
    const { document } = migrate(legacy, {
      videoSig: 'persisted-main',
      videoDurationSec: 8,
      context: { media: { video: { sig: 'persisted-main', key: 'r2/main' } } },
    });
    const asset = Object.values(document.assets)[0]!;
    expect(asset.locator).toEqual({ localSig: 'persisted-main', cloudKey: 'r2/main' });
    expect(document.timeline.tracks[0]!.clips[0]).toMatchObject({ durationFrames: 240, sourceOutSec: 8 });
  });

  it('keeps the source in the manifest but does not resurrect it when shots is explicitly empty', () => {
    const { document } = migrate(emptyComposition(), { videoSig: 'deleted-main', videoDurationSec: 10 });
    expect(document.semantics).not.toHaveProperty('primaryNarrativeAssetId');
    expect(Object.values(document.assets)).toHaveLength(1);
    expect(document.timeline.tracks[0]!.clips).toEqual([]);
  });

  it('gives every narrative source an asset and explicit cumulative placement', () => {
    const shots: VideoShot[] = [
      { id: 's1', srcStart: 1, srcEnd: 3, treatment: 'full' },
      { id: 's2', src: 'blob:insert', srcSig: 'insert-sig', srcStart: 0, srcEnd: 1.5, treatment: 'punch-in' },
      { id: 's3', srcStart: 5, srcEnd: 6, treatment: 'corner-br' },
    ];
    const { document, issues } = migrate(
      { ...emptyComposition(), video: mainVideo, shots },
      {
        videoSig: 'main-sig',
        context: {
          asr: [{ start: 1, end: 2, text: 'main' }],
          clipAsr: { 'blob:insert': [{ start: 0, end: 1, text: 'insert' }] },
          media: { clips: { 'insert-sig': { key: 'r2/insert' } } },
        },
      },
    );
    const clips = document.timeline.tracks[0]!.clips;
    expect(clips.map((clip) => [clip.id, clip.startFrame, clip.durationFrames])).toEqual([
      ['s1', 0, 60],
      ['s2', 60, 45],
      ['s3', 105, 30],
    ]);
    expect(Object.values(document.assets)).toHaveLength(2);
    const inserted = Object.values(document.assets).find((asset) => asset.locator.localSig === 'insert-sig')!;
    expect(inserted.locator.cloudKey).toBe('r2/insert');
    expect(document.semantics.transcripts[inserted.id]?.[0]?.text).toBe('insert');
    expect(issues).toEqual([]);
  });

  it('turns block lanes and managed captions into stable tracks and manifests media blocks', () => {
    const blocks: Block[] = [
      {
        id: 'card',
        templateId: 'custom',
        slots: { innerHtml: '<b>hello</b>', timelineBody: '' },
        startSec: 2,
        durationSec: 3,
        trackIndex: 3,
      },
      {
        id: 'picture',
        templateId: 'media',
        slots: { media: { type: 'image', url: 'https://cdn.test/p.png' } },
        startSec: 1,
        durationSec: 2,
        trackIndex: 2,
      },
      {
        id: 'cap',
        templateId: 'caption',
        slots: { words: [{ text: 'hello', start: 0, end: 1 }] },
        startSec: 0,
        durationSec: 1,
        trackIndex: 1,
      },
    ];
    const { document, issues } = migrate({ ...emptyComposition(), blocks });
    expect(document.timeline.tracks.map((track) => [track.id, track.type, track.stackOrder])).toEqual([
      ['track_primary_narrative', 'visual', 0],
      ['track_graphics_2', 'graphics', 2],
      ['track_graphics_3', 'graphics', 3],
      ['track_managed_captions', 'caption', 4],
    ]);
    expect(document.semantics.managedCaptionTrackId).toBe('track_managed_captions');
    const picture = document.timeline.tracks[1]!.clips[0]!;
    expect(picture).toMatchObject({ kind: 'graphic', startFrame: 30, durationFrames: 60 });
    if (picture.kind !== 'graphic') throw new Error('expected graphic clip');
    expect(picture.block.slots.media).toEqual({ type: 'image' });
    expect(Object.values(document.assets)).toContainEqual(expect.objectContaining({ kind: 'image', locator: { remoteUrl: 'https://cdn.test/p.png' } }));
    expect(issues).toEqual([]);

    const projected = projectV2ToLegacyComposition(document);
    expect(projected.blocks).toEqual(expect.arrayContaining(blocks.map((block) => (
      block.id === 'cap' ? { ...block, trackIndex: 4 } : block
    ))));
  });

  it('migrates audio-only documents without manufacturing video content', () => {
    const audio: AudioClip = {
      id: 'music',
      src: 'blob:music',
      sig: 'music-sig',
      durationSec: 12,
      startSec: 3,
      inSec: 2,
      outSec: 10,
      speed: 2,
      volumeDb: -12,
    };
    const { document, issues } = migrate({ ...emptyComposition(), audioTracks: [audio] }, {
      context: { media: { clips: { 'music-sig': { key: 'r2/music' } } } },
    });
    expect(document.timeline.tracks[0]!.clips).toEqual([]);
    const audioTrack = document.timeline.tracks.find((track) => track.type === 'audio')!;
    expect(audioTrack).toMatchObject({ role: 'music', syncLocked: true });
    expect(audioTrack.clips[0]).toMatchObject({
      kind: 'audio',
      startFrame: 90,
      durationFrames: 120,
      sourceInSec: 2,
      sourceOutSec: 10,
      properties: { speed: 2, volumeDb: -12 },
    });
    expect(editorTimelineTotalFrames(document)).toBe(210);
    expect(issues).toEqual([]);
    expect(projectV2ToLegacyComposition(document).audioTracks?.[0]).toMatchObject(audio);
  });

  it('keeps hidden and disabled ranges in document duration geometry', () => {
    const { document } = migrate({
      ...emptyComposition(),
      blocks: [{ id: 'tail', templateId: 'custom', slots: {}, startSec: 9, durationSec: 1, trackIndex: 2 }],
    });
    const track = document.timeline.tracks.find((candidate) => candidate.type === 'graphics')!;
    track.hidden = true;
    track.clips[0]!.enabled = false;
    expect(editorTimelineTotalFrames(document)).toBe(300);
  });

  it('keeps unresolved audio as an offline one-frame placeholder with a migration warning', () => {
    const { document, issues } = migrate({
      ...emptyComposition(),
      audioTracks: [{ id: 'unknown', src: 'blob:unknown' }],
    });
    const clip = document.timeline.tracks.find((track) => track.type === 'audio')!.clips[0]!;
    expect(clip.durationFrames).toBe(1);
    expect(issues).toContainEqual(expect.objectContaining({ severity: 'warning', code: 'unresolved-audio-duration' }));
    expect(issues.some((issue) => issue.severity === 'error')).toBe(false);
  });

  it('folds local-library and cloud rendezvous metadata into one asset manifest', () => {
    const { document } = migrate(emptyComposition(), {
      context: {
        localAssets: [{ assetId: 'cover-asset', contentSig: 'image-sig', sig: 'image-sig', label: 'cover.png', kind: 'image', w: 1200, h: 800, createdAt: 1 }],
        media: { clips: { 'image-sig': { key: 'r2/image' }, orphan: { key: 'r2/orphan' } } },
      },
    });
    const image = Object.values(document.assets).find((asset) => asset.locator.localSig === 'image-sig')!;
    expect(image).toMatchObject({ kind: 'image', label: 'cover.png', locator: { localSig: 'image-sig', cloudKey: 'r2/image' }, metadata: { width: 1200, height: 800 } });
    expect(Object.values(document.assets)).toContainEqual(expect.objectContaining({ kind: 'video', locator: { localSig: 'orphan', cloudKey: 'r2/orphan' } }));
    expect(Object.values(document.assets).filter((asset) => asset.locator.localSig === 'image-sig')).toHaveLength(1);
  });

  it('is deterministic and JSON round-trippable', () => {
    const input = {
      ...emptyComposition(),
      video: mainVideo,
      shots: [{ id: 's1', srcStart: 0, srcEnd: 4, treatment: 'full' as const }],
      blocks: [{ id: 'b1', templateId: 'custom', slots: {}, startSec: 1, durationSec: 2, trackIndex: 2 }],
    };
    const a = migrate(input, { videoSig: 'sig' }).document;
    const b = migrate(input, { videoSig: 'sig' }).document;
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});

describe('EditorDocument V2 validation', () => {
  it('reports duplicate ids, dangling assets and invalid semantic references', () => {
    const base = migrate({ ...emptyComposition(), video: mainVideo, shots: undefined }).document;
    const broken = structuredClone(base) as EditorDocumentV2;
    const first = broken.timeline.tracks[0]!.clips[0]!;
    if (first.kind !== 'narrative') throw new Error('expected narrative clip');
    broken.timeline.tracks.push({
      id: broken.timeline.tracks[0]!.id,
      type: 'visual',
      role: 'primaryNarrative',
      muted: false,
      hidden: false,
      locked: false,
      syncLocked: true,
      stackOrder: 1,
      clips: [{ ...first, assetId: 'missing' }],
    });
    broken.semantics.scenes = [{ id: 'broken-scene', clipIds: ['missing-clip'] }];
    const codes = validateEditorDocumentV2(broken).map((issue) => issue.code);
    expect(codes).toEqual(expect.arrayContaining(['duplicate-track-id', 'duplicate-clip-id', 'dangling-asset', 'duplicate-semantic-role', 'dangling-scene-clip']));
  });
});
