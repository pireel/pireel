/**
 * frame 预览的 locale 文案替换:构好的块(innerHtml/label 中文)按包里的 copy 表
 * 做字面量替换。最长键优先,避免"金句"吃掉"金句花字"这类前缀重叠。
 * timelineBody 不动(GSAP 选择器/数值,无文案)。
 */

import type { Block } from '@pireel/studio-engine/composition';
import type { FrameLocalePack } from './types';

export function localizeBlock(block: Block, pack: FrameLocalePack | undefined): Block {
  if (!pack || !Object.keys(pack.copy).length) return block;
  const keys = Object.keys(pack.copy).sort((a, b) => b.length - a.length);
  const swap = (s: string): string => {
    let out = s;
    for (const k of keys) out = out.split(k).join(pack.copy[k]!);
    return out;
  };
  const innerHtml = typeof block.slots.innerHtml === 'string' ? swap(block.slots.innerHtml) : block.slots.innerHtml;
  return {
    ...block,
    slots: { ...block.slots, innerHtml },
    ...(block.label ? { label: swap(block.label) } : {}),
  };
}
