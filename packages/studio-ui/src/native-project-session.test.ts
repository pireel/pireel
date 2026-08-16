import { describe, expect, it } from 'vitest';
import { emptyProjectDocument } from '@pireel/studio-engine/project-document';
import type { StudioProjectContext } from '@pireel/studio-engine/project-dto';
import { nativeProjectSharedLocalAssets } from './native-project-session';

const sharedAsset = {
  id: 'shared-video',
  kind: 'video' as const,
  label: 'shared.mp4',
  locator: { localSig: 'shared.mp4:9:1', cloudKey: 'studio/media/shared' },
  metadata: { width: 1080, height: 1920 },
};

describe('project-level local asset directory', () => {
  it('adopts assets from inactive output snapshots when upgrading a pre-v3 project', () => {
    const active = emptyProjectDocument();
    const inactive = emptyProjectDocument();
    inactive.assets[sharedAsset.id] = sharedAsset;
    inactive.timeline.tracks[0]!.clips.push({
      id: 'shared-video-clip', kind: 'narrative', assetId: sharedAsset.id,
      startFrame: 0, durationFrames: 30, enabled: true,
      sourceInSec: 0, sourceOutSec: 1, properties: { treatment: 'full' },
    });
    const context = {
      schemaVersion: 3,
      outputs: {
        active: { id: 'v2', title: '', order: 1, createdAt: 2, updatedAt: 2 },
        inactive: [{
          id: 'v1', title: '', order: 0, createdAt: 1, updatedAt: 1,
          document: inactive, videoSig: null, videoDurationSec: null, coverThumb: null,
        }],
      },
    } as StudioProjectContext;

    expect(nativeProjectSharedLocalAssets(active, context)).toEqual([{
      sig: 'shared.mp4:9:1', label: 'shared.mp4', kind: 'video', w: 1080, h: 1920, createdAt: 0,
    }]);
  });

  it('does not resurrect an unreferenced deleted asset from an output', () => {
    const active = emptyProjectDocument();
    active.assets[sharedAsset.id] = sharedAsset;
    expect(nativeProjectSharedLocalAssets(active, { schemaVersion: 3, localAssets: [] })).toEqual([]);
  });

  it('keeps the shared semantic name when an inactive output still has the old filename', () => {
    const active = emptyProjectDocument();
    const inactive = emptyProjectDocument();
    const staleAsset = { ...sharedAsset, library: { createdAt: 5 } };
    active.assets[staleAsset.id] = staleAsset;
    inactive.assets[staleAsset.id] = staleAsset;
    active.timeline.tracks[0]!.clips.push({
      id: 'active-clip', kind: 'narrative', assetId: staleAsset.id,
      startFrame: 0, durationFrames: 30, enabled: true,
      sourceInSec: 0, sourceOutSec: 1, properties: { treatment: 'full' },
    });
    inactive.timeline.tracks[0]!.clips.push({
      id: 'inactive-clip', kind: 'narrative', assetId: staleAsset.id,
      startFrame: 0, durationFrames: 30, enabled: true,
      sourceInSec: 0, sourceOutSec: 1, properties: { treatment: 'full' },
    });
    const renamed = {
      sig: staleAsset.locator.localSig,
      label: 'Customer showing the mobile checkout flow',
      kind: 'video' as const,
      createdAt: staleAsset.library.createdAt,
    };

    expect(nativeProjectSharedLocalAssets(active, {
      schemaVersion: 3,
      localAssets: [renamed],
      outputs: {
        active: { id: 'active', title: '', order: 0, createdAt: 1, updatedAt: 1 },
        inactive: [{
          id: 'inactive', title: '', order: 1, createdAt: 1, updatedAt: 1,
          document: inactive, videoSig: null, videoDurationSec: null, coverThumb: null,
        }],
      },
    })[0]?.label).toBe(renamed.label);
  });
});
