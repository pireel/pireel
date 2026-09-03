import { describe, expect, it } from 'vitest';
import {
  buildChatMentionElements,
  localAssetMentionContext,
  localAssetMentionId,
  localAssetMentionRef,
} from './chat-local-asset-mention';

describe('Studio local-asset @ mentions', () => {
  it('ignores a sig-only legacy draft entry instead of inventing an id for it', () => {
    const legacy = {
      sig: 'legacy.mov:10:1',
      label: 'legacy.mov',
      kind: 'video' as const,
      createdAt: 1,
    } as unknown as Parameters<typeof localAssetMentionRef>[0];

    expect(buildChatMentionElements([legacy], [])).toEqual([]);
  });

  it('turns a local library entry into a stable picker candidate', () => {
    const entry = {
      assetId: 'asset-product-demo',
      contentSig: '产品 演示.mov:2048:1720000000000',
      sig: '产品 演示.mov:2048:1720000000000',
      label: '产品 演示.mov',
      kind: 'video' as const,
      createdAt: 1,
    };
    const first = localAssetMentionRef(entry);
    const second = localAssetMentionRef(entry);

    expect(first).toEqual(second);
    expect(first.id).toMatch(/^asset_[a-z0-9]+$/);
    expect(first.localAsset).toEqual({
      assetId: entry.assetId,
      contentSig: entry.contentSig,
      kind: 'video',
    });
  });

  it('includes local materials in the same roster consumed by the @ picker', () => {
    const outputElement = {
      id: 'graphic_1',
      label: '标题',
      kind: 'title',
      isShot: false,
    };
    const roster = buildChatMentionElements(
      [{ assetId: 'local-asset', contentSig: 'local.mov:10:1', sig: 'local.mov:10:1', label: 'local.mov', kind: 'video', createdAt: 1 }],
      [outputElement],
    );

    expect(roster).toHaveLength(2);
    expect(roster[0]).toMatchObject({ label: 'local.mov', kind: 'video' });
    expect(roster[1]).toBe(outputElement);
  });

  it('maps only the picked pill back to its stable asset id without exposing storage identity', () => {
    const picked = localAssetMentionRef({
      assetId: 'picked-asset',
      contentSig: 'picked image.png:99:7',
      sig: 'picked image.png:99:7',
      label: 'picked image.png',
      kind: 'image',
      createdAt: 2,
    });
    const ignored = localAssetMentionRef({
      assetId: 'ignored-asset',
      contentSig: 'ignored.mp4:88:6',
      sig: 'ignored.mp4:88:6',
      label: 'ignored.mp4',
      kind: 'video',
      createdAt: 1,
    });

    const context = localAssetMentionContext(
      [`把 @${picked.id} 放在右上角`],
      [picked, ignored],
    );

    expect(context).toContain(`@${localAssetMentionId('picked-asset')}`);
    expect(context).toContain('localAssetId="picked-asset"');
    expect(context).not.toContain('contentSig');
    expect(context).not.toContain('picked image.png:99:7');
    expect(context).toContain('NOT a registered assetId');
    expect(context).not.toContain('ignored.mp4');
  });

  it('gives same-content imports different mention tokens', () => {
    const first = localAssetMentionRef({
      assetId: 'asset-a', contentSig: 'same.mp4:9:1', sig: 'same.mp4:9:1',
      label: 'folder A', kind: 'video', createdAt: 2,
    });
    const second = localAssetMentionRef({
      assetId: 'asset-b', contentSig: 'same.mp4:9:1', sig: 'same.mp4:9:1',
      label: 'folder B', kind: 'video', createdAt: 1,
    });

    expect(first.id).not.toBe(second.id);
  });
});
