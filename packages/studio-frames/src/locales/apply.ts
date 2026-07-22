/**
 * Locale copy substitution for frame previews: literal-replace the Chinese in a built
 * block's innerHtml/label using the pack's copy table. Longest key first, so a prefix
 * like "金句" doesn't eat "金句花字". timelineBody is untouched (GSAP selectors/numbers, no copy).
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
