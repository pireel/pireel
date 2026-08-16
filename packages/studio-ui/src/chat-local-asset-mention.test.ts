import { describe, expect, it } from 'vitest';
import {
  buildChatMentionElements,
  localAssetMentionContext,
  localAssetMentionId,
  localAssetMentionRef,
} from './chat-local-asset-mention';

describe('Studio local-asset @ mentions', () => {
  it('turns a local library entry into a stable picker candidate', () => {
    const entry = {
      sig: '产品 演示.mov:2048:1720000000000',
      label: '产品 演示.mov',
      kind: 'video' as const,
      createdAt: 1,
    };
    const first = localAssetMentionRef(entry);
    const second = localAssetMentionRef(entry);

    expect(first).toEqual(second);
    expect(first.id).toMatch(/^asset_[a-z0-9]+$/);
    expect(first.localAsset).toEqual({ sig: entry.sig, kind: 'video' });
  });

  it('includes local materials in the same roster consumed by the @ picker', () => {
    const outputElement = {
      id: 'graphic_1',
      label: '标题',
      kind: 'title',
      isShot: false,
    };
    const roster = buildChatMentionElements(
      [{ sig: 'local.mov:10:1', label: 'local.mov', kind: 'video', createdAt: 1 }],
      [outputElement],
    );

    expect(roster).toHaveLength(2);
    expect(roster[0]).toMatchObject({ label: 'local.mov', kind: 'video' });
    expect(roster[1]).toBe(outputElement);
  });

  it('maps only the picked pill back to its exact local signature', () => {
    const picked = localAssetMentionRef({
      sig: 'picked image.png:99:7',
      label: 'picked image.png',
      kind: 'image',
      createdAt: 2,
    });
    const ignored = localAssetMentionRef({
      sig: 'ignored.mp4:88:6',
      label: 'ignored.mp4',
      kind: 'video',
      createdAt: 1,
    });

    const context = localAssetMentionContext(
      [`把 @${picked.id} 放在右上角`],
      [picked, ignored],
    );

    expect(context).toContain(`@${localAssetMentionId('picked image.png:99:7')}`);
    expect(context).toContain('localSig="picked image.png:99:7"');
    expect(context).toContain('NOT a registered assetId');
    expect(context).not.toContain('ignored.mp4');
  });
});
