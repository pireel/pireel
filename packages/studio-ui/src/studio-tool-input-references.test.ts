import { describe, expect, it } from 'vitest';
import { localAssetMentionId } from './chat-local-asset-mention';
import { normalizeStudioToolInputReferences } from './studio-tool-input-references';

describe('Studio tool input reference normalization', () => {
  const sig = '爆款视频.mp4:240:12';
  const token = localAssetMentionId(sig);
  const assets = [{ sig, label: '爆款视频', kind: 'video' as const, createdAt: 1 }];

  it('resolves a local @ token once at the tool boundary, including nested locators', () => {
    expect(normalizeStudioToolInputReferences('extract_asr', {
      assetId: `@${token}`,
      refs: [`@${token}`, '@registered-image'],
      assets: [{ id: '@media-1', localSig: `@${token}` }],
      updates: [{ clipId: '@clip-1' }],
    }, assets)).toEqual({
      localSig: sig,
      refs: [sig, '@registered-image'],
      assets: [{ id: 'media-1', localSig: sig }],
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
});
