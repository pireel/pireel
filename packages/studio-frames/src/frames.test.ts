import { describe, expect, it } from 'vitest';
import { frameRegistry } from './vite';
import { parseFrame } from './registry';

describe('frame 注册表(frame.md 内容包)', () => {
  it('能加载全部 frame,必填字段齐全', () => {
    const frames = frameRegistry.list();
    expect(frames.length).toBeGreaterThanOrEqual(2);
    for (const f of frames) {
      expect(f.id).toBeTruthy();
      expect(f.title).toBeTruthy();
      expect(f.summary).toBeTruthy();
      expect(f.icon).toBeTruthy();
      expect(f.version).toBeTruthy();
      expect(f.body.length).toBeGreaterThan(100);
      expect(Array.isArray(f.showcase)).toBe(true);
    }
  });

  it('种子主题带完整设计 token(palette 至少有 paper/panel/fg/accent)', () => {
    for (const f of frameRegistry.list()) {
      expect(f.palette, `${f.id} 应有 palette`).toBeTruthy();
      for (const k of ['paper', 'panel', 'fg', 'accent']) {
        expect(f.palette![k], `${f.id} palette 缺 ${k}`).toBeTruthy();
      }
    }
  });

  it('get 按 id 取,未知 id 回 null', () => {
    const first = frameRegistry.list()[0]!;
    expect(frameRegistry.get(first.id)?.id).toBe(first.id);
    expect(frameRegistry.get('__nope__')).toBeNull();
  });

  it('可由宿主通过元数据注入横版缩略图,不要求 OSS 内容包携带私有素材', () => {
    const frame = parseFrame(`---
id: private-frame
title: Private Frame
summary: Hosted metadata
icon: ◼️
coverKey: /studio/frame-covers/private-frame.jpg
showcase: []
version: 1.0.0
---
# Private frame

This playbook remains hosted.`, 'private-frame/frame.md');
    expect(frame.coverKey).toBe('/studio/frame-covers/private-frame.jpg');
  });

  it('body 是英文 playbook(注入 system prompt 的硬规则):首行不含中文', () => {
    for (const f of frameRegistry.list()) {
      const firstLine = f.body.split('\n')[0]!;
      expect(/[一-鿿]/.test(firstLine), `${f.id} body 首行应为英文`).toBe(false);
    }
  });
});
