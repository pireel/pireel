import { describe, expect, it } from 'vitest';
import { localAssetMentionId } from './chat-local-asset-mention';
import {
  normalizeStudioToolInputReferences,
  resolveLocalAssetReference,
} from './studio-tool-input-references';

describe('Studio tool input reference normalization', () => {
  const sig = '爆款视频.mp4:240:12';
  const assetId = 'asset-hit-video';
  const token = localAssetMentionId(assetId);
  const assets = [{ assetId, contentSig: sig, sig, label: '爆款视频', kind: 'video' as const, createdAt: 1 }];

  it('resolves a local @ token once at the tool boundary, including nested locators', () => {
    expect(normalizeStudioToolInputReferences('read_script', {
      assetId: `@${token}`,
      refs: [`@${token}`, '@registered-image'],
      assets: [{ id: '@media-1', localSig: `@${token}` }],
      updates: [{ clipId: '@clip-1' }],
    }, assets)).toEqual({
      localAssetId: assetId,
      refs: [`local:${assetId}`, '@registered-image'],
      assets: [{ id: 'media-1', localSig: `local:${assetId}` }],
      updates: [{ clipId: 'clip-1' }],
    });
  });

  it('keeps registered ids distinct and preserves a real sig whose filename begins with @', () => {
    const atFilename = '@camera-a.mp4:20:2';
    expect(normalizeStudioToolInputReferences('inspect_media', {
      assetId: '@registered-asset',
      sig: atFilename,
    }, assets)).toEqual({
      assetId: 'registered-asset',
      sig: atFilename,
    });
  });

  it('resolves old sig tokens only while the content match is unambiguous', () => {
    const legacyToken = localAssetMentionId(sig);
    expect(resolveLocalAssetReference(`@${legacyToken}`, assets)?.assetId).toBe(assetId);
    expect(resolveLocalAssetReference(sig, [
      ...assets,
      { ...assets[0]!, assetId: 'asset-same-content' },
    ])).toBeNull();
  });

  it('turns list_assets local references back into the project asset id for placement', () => {
    expect(normalizeStudioToolInputReferences('add_clips', {
      clips: [{ assetId: `local:${assetId}`, sceneId: 'scene-1' }],
    }, assets)).toEqual({
      clips: [{ assetId, sceneId: 'scene-1' }],
    });
  });
});
