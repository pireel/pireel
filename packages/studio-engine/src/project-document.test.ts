import { describe, expect, it } from 'vitest';
import { emptyComposition } from './composition-core';
import {
  normalizeProjectDocument,
  prepareEditorDocumentForPersistence,
  projectDocumentStats,
  projectDocumentHasTimelineContent,
  projectDocumentToLegacyComposition,
} from './project-document';

describe('stored project document boundary', () => {
  it('dual-reads V1 and returns a valid V2 document plus compatibility projection', () => {
    const legacy = {
      ...emptyComposition(),
      video: { url: 'blob:main', durationSec: 4, sourceWidth: 1920, sourceHeight: 1080 },
      shots: [{ id: 'talk', srcStart: 0, srcEnd: 4, treatment: 'full' as const }],
    };
    const normalized = normalizeProjectDocument({ projectId: 'project-1', value: legacy, videoSig: 'video-sig' });
    expect(normalized.migrated).toBe(true);
    expect(normalized.issues).toEqual([]);
    expect(normalized.document.version).toBe(2);
    expect(Object.values(normalized.document.assets)[0]!.locator).toEqual({ localSig: 'video-sig' });
    expect(projectDocumentToLegacyComposition({ projectId: 'project-1', value: normalized.document })).toMatchObject({
      shots: [{ id: 'talk', srcStart: 0, srcEnd: 4 }],
    });
  });

  it('reads V2 without remigration and strips runtime-only URLs before persistence', () => {
    const normalized = normalizeProjectDocument({
      projectId: 'project-1',
      value: {
        ...normalizeProjectDocument({ projectId: 'project-1', value: emptyComposition() }).document,
        assets: {
          local: { id: 'local', kind: 'video', locator: { localSig: 'sig', remoteUrl: 'blob:runtime' }, metadata: {} },
          remote: { id: 'remote', kind: 'image', locator: { remoteUrl: 'https://cdn.test/image.png' }, metadata: {} },
        },
      },
    });
    expect(normalized.migrated).toBe(false);
    expect(normalized.document.assets.local!.locator).toEqual({ localSig: 'sig' });
    expect(normalized.document.assets.remote!.locator.remoteUrl).toBe('https://cdn.test/image.png');
  });

  it('does not trust a version marker without the V2 structure', () => {
    const normalized = normalizeProjectDocument({ projectId: 'project-1', value: { version: 2 } });
    expect(normalized.migrated).toBe(true);
    expect(normalized.document.version).toBe(2);
    expect(normalized.issues).toEqual([]);
  });

  it('canonicalizes known top-level fields and drops patched legacy/runtime keys', () => {
    const document = {
      ...normalizeProjectDocument({ projectId: 'project-1', value: emptyComposition() }).document,
      video: { runtime: true },
      arbitrary: 'not part of V2',
    };
    const prepared = prepareEditorDocumentForPersistence(document);
    expect(prepared).not.toHaveProperty('video');
    expect(prepared).not.toHaveProperty('arbitrary');
  });

  it('counts V2 visual and graphic content without projecting the document', () => {
    const document = normalizeProjectDocument({
      projectId: 'project-1',
      value: {
        ...emptyComposition(),
        video: { url: 'https://cdn.test/video.mp4', durationSec: 2, sourceWidth: 100, sourceHeight: 100 },
        shots: [{ id: 'talk', srcStart: 0, srcEnd: 2, treatment: 'full' as const }],
        blocks: [{ id: 'title', templateId: 'custom', slots: {}, startSec: 0, durationSec: 1, trackIndex: 2 }],
      },
    }).document;
    expect(projectDocumentStats(prepareEditorDocumentForPersistence(document))).toEqual({ blocks: 1, shots: 1 });
  });

  it('treats audio-only timelines as content even without primary video or graphics', () => {
    const document = normalizeProjectDocument({
      projectId: 'audio-only',
      value: {
        ...emptyComposition(),
        audioTracks: [{ id: 'music', src: 'https://cdn.example/music.mp3', durationSec: 3, startSec: 0 }],
      },
    }).document;
    expect(projectDocumentStats(document)).toEqual({ blocks: 0, shots: 0 });
    expect(projectDocumentHasTimelineContent(document)).toBe(true);
  });

  it('rejoins a legacy local image block with its durable asset signature', () => {
    const document = normalizeProjectDocument({
      projectId: 'project-1',
      value: {
        ...emptyComposition(),
        blocks: [{
          id: 'local-image',
          templateId: 'media',
          slots: { media: { type: 'image', url: 'data:image/webp;base64,runtime' } },
          startSec: 0,
          durationSec: 2,
          trackIndex: 1,
          label: 'photo.webp',
        }],
      },
      context: {
        localAssets: [{ sig: 'photo.webp:42:7', label: 'photo.webp', kind: 'image', createdAt: 7 }],
      },
    }).document;
    const placed = Object.values(document.assets).find((asset) => asset.label === 'photo.webp');
    expect(placed?.locator).toEqual({ localSig: 'photo.webp:42:7' });
  });

  it('preserves asset locators when a compatibility projection is edited and remigrated', () => {
    const first = normalizeProjectDocument({
      projectId: 'project-1',
      value: {
        ...emptyComposition(),
        blocks: [{
          id: 'local-image',
          templateId: 'media',
          slots: { media: { type: 'image', url: 'https://runtime.test/preview.webp' } },
          startSec: 0,
          durationSec: 2,
          trackIndex: 1,
          label: 'photo.webp',
        }],
      },
    }).document;
    const assetId = Object.keys(first.assets)[0]!;
    first.assets[assetId] = {
      ...first.assets[assetId]!,
      locator: { localSig: 'photo.webp:42:7', cloudKey: 'studio/media/photo' },
    };
    const projection = projectDocumentToLegacyComposition({ projectId: 'project-1', value: first });
    const remigrated = normalizeProjectDocument({
      projectId: 'project-1',
      value: { ...projection, width: 1920 },
      previousDocument: first,
    }).document;
    const placed = Object.values(remigrated.assets).find((asset) => asset.label === 'photo.webp');
    expect(placed?.locator).toEqual({ localSig: 'photo.webp:42:7', cloudKey: 'studio/media/photo' });
    expect(remigrated.canvas.width).toBe(1920);
  });
});
