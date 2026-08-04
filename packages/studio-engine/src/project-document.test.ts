import { describe, expect, it } from 'vitest';
import { emptyComposition } from './composition-core';
import type { EditorDocumentV2 } from './editor-document';
import {
  applyEditorDocumentPersistenceMetadata,
  compositionToEditorDocument,
  prepareEditorDocumentForPersistence,
  projectDocumentHasTimelineContent,
  projectDocumentStats,
  projectDocumentToComposition,
} from './project-document';

describe('native project document boundary', () => {
  it('imports an explicit in-memory Composition and exposes a render projection', () => {
    const composition = {
      ...emptyComposition(),
      video: { url: 'blob:main', durationSec: 4, sourceWidth: 1920, sourceHeight: 1080 },
      shots: [{ id: 'talk', srcStart: 0, srcEnd: 4, treatment: 'full' as const }],
    };
    const converted = compositionToEditorDocument({ projectId: 'project-1', composition, videoSig: 'video-sig' });
    expect(converted.issues).toEqual([]);
    expect(converted.document.version).toBe(2);
    expect(Object.values(converted.document.assets)[0]!.locator).toEqual({ localSig: 'video-sig' });
    expect(projectDocumentToComposition(converted.document)).toMatchObject({
      shots: [{ id: 'talk', srcStart: 0, srcEnd: 4 }],
    });
  });

  it('strips runtime URLs and unknown top-level fields before persistence', () => {
    const base = compositionToEditorDocument({ projectId: 'project-1', composition: emptyComposition() }).document;
    const untrusted = {
      ...base,
      assets: {
        local: { id: 'local', kind: 'video', locator: { localSig: 'sig', remoteUrl: 'blob:runtime' }, metadata: {} },
        remote: { id: 'remote', kind: 'image', locator: { remoteUrl: 'https://cdn.test/image.png' }, metadata: {} },
      },
      video: { runtime: true },
      arbitrary: 'not part of V2',
    } as EditorDocumentV2 & { video: unknown; arbitrary: string };
    const prepared = prepareEditorDocumentForPersistence(untrusted);
    expect(prepared.assets.local!.locator).toEqual({ localSig: 'sig' });
    expect(prepared.assets.remote!.locator.remoteUrl).toBe('https://cdn.test/image.png');
    expect(prepared).not.toHaveProperty('video');
    expect(prepared).not.toHaveProperty('arbitrary');
  });

  it('counts native visual/graphic content and treats audio-only timelines as content', () => {
    const visual = compositionToEditorDocument({
      projectId: 'project-1',
      composition: {
        ...emptyComposition(),
        video: { url: 'https://cdn.test/video.mp4', durationSec: 2, sourceWidth: 100, sourceHeight: 100 },
        shots: [{ id: 'talk', srcStart: 0, srcEnd: 2, treatment: 'full' as const }],
        blocks: [{ id: 'title', templateId: 'custom', slots: {}, startSec: 0, durationSec: 1, trackIndex: 2 }],
      },
    }).document;
    expect(projectDocumentStats(visual)).toEqual({ blocks: 1, shots: 1 });

    const audio = compositionToEditorDocument({
      projectId: 'audio-only',
      composition: {
        ...emptyComposition(),
        audioTracks: [{ id: 'music', src: 'https://cdn.example/music.mp3', durationSec: 3, startSec: 0 }],
      },
    }).document;
    expect(projectDocumentStats(audio)).toEqual({ blocks: 0, shots: 0 });
    expect(projectDocumentHasTimelineContent(audio)).toBe(true);
  });

  it('folds native persistence metadata without rebuilding timeline lanes', () => {
    const document = compositionToEditorDocument({ projectId: 'project-1', composition: emptyComposition() }).document;
    const customTrack = {
      id: 'custom-empty', type: 'visual' as const, role: 'broll' as const, muted: false, hidden: false,
      locked: true, syncLocked: false, stackOrder: 3, clips: [],
    };
    const native = { ...document, timeline: { tracks: [...document.timeline.tracks, customTrack] } };
    const merged = applyEditorDocumentPersistenceMetadata({
      projectId: 'project-1',
      document: native,
      plan: { version: 1 },
      localAssets: [{ sig: 'clip.mp4:9:1', label: 'clip.mp4', kind: 'video', createdAt: 1 }],
      cloudMedia: { clips: { 'clip.mp4:9:1': { key: 'studio/media/clip' } } },
    });
    expect(merged.timeline.tracks.find((track) => track.id === customTrack.id)).toEqual(customTrack);
    expect(merged.semantics.plan).toEqual({ version: 1 });
    expect(Object.values(merged.assets)).toContainEqual(expect.objectContaining({
      label: 'clip.mp4',
      locator: { localSig: 'clip.mp4:9:1', cloudKey: 'studio/media/clip' },
      library: { createdAt: 1 },
    }));
  });
});
