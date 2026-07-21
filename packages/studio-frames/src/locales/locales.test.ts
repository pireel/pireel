import { describe, expect, it } from 'vitest';
import { frameRegistry } from '../vite';
import { coverBlock, showcaseBlock } from '../showcase-blocks';
import { framePack } from './index';

/** 一个 frame 的全部预览产物(封面 + 各 showcase 块)拼成一串源文本。 */
function frameHtml(frameId: string, locale?: 'en'): string {
  const f = frameRegistry.get(frameId)!;
  const parts: string[] = [];
  const cover = coverBlock(frameId, locale);
  if (cover) parts.push(String(cover.slots.innerHtml), cover.label ?? '');
  for (const kind of f.showcase) {
    const b = showcaseBlock(frameId, kind, locale);
    if (b) parts.push(String(b.slots.innerHtml), b.label ?? '');
  }
  return parts.join('\n');
}

describe('frame locale 适配包(en)', () => {
  it('每个 frame 都有 en 包,title/summary 非空且不含中文', () => {
    for (const f of frameRegistry.list()) {
      const pack = framePack('en', f.id);
      expect(pack, `${f.id} 缺 en 包`).toBeTruthy();
      expect(pack!.title.trim()).toBeTruthy();
      expect(pack!.summary.trim()).toBeTruthy();
      expect(/[一-鿿]/.test(pack!.title), `${f.id} en title 不该含中文`).toBe(false);
      expect(/[一-鿿]/.test(pack!.summary), `${f.id} en summary 不该含中文`).toBe(false);
    }
  });

  it('copy 键必须逐字存在于该 frame 的中文预览源里(防方言改动后替换表漂移)', () => {
    for (const f of frameRegistry.list()) {
      const pack = framePack('en', f.id)!;
      const zh = frameHtml(f.id);
      for (const key of Object.keys(pack.copy)) {
        expect(zh.includes(key), `${f.id}: copy 键「${key}」在方言源里找不到`).toBe(true);
      }
    }
  });

  it('en 预览里不残留任何 copy 键(替换真的发生了)', () => {
    for (const f of frameRegistry.list()) {
      const pack = framePack('en', f.id)!;
      const en = frameHtml(f.id, 'en');
      for (const key of Object.keys(pack.copy)) {
        expect(en.includes(key), `${f.id}: en 预览仍残留「${key}」`).toBe(false);
      }
    }
  });
});
