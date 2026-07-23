/**
 * Shared block builders for frame dialects. One file per frame, exporting:
 *   export const cover: () => Block                 // list cover (theme name as the hero)
 *   export const blocks: Record<string, () => Block> // showcase word → real example block
 * Conventions: 1920×1080 canvas; style only via theme tokens (var(--paper/--panel/--panel-2/--fg/
 * --muted/--accent/--accent-2/--line/--grid/--radius/--shadow/--glow/--font-head/--font-num));
 * scope every selector with #\${id}; GSAP animations settle within 1.2s (preview freezes at ~2.55s);
 * GSAP cannot target pseudo-elements; custom blocks share the agent-generation contract (innerHtml + timelineBody).
 */

import { type Block, blockId } from '@pireel/studio-engine/composition';
import { studioLocale } from '@pireel/studio-engine/i18n';

export type { Block };

type Html = (id: string) => string;

export function mk(prefix: string, label: string, html: Html, tl: Html): Block {
  const id = blockId(prefix);
  return {
    id,
    templateId: 'custom',
    slots: { innerHtml: html(id), timelineBody: tl(id) },
    startSec: 0,
    durationSec: 3,
    trackIndex: 2,
    label,
  };
}

/** Placeholder copy for overlays: pick one by UI language at build time (NOT via t()/dictionary —
 *  once inserted it's block data and won't follow later language switches; zh/en are each written
 *  natively as generic placeholders, not required to be translations of each other). */
export function txt(zh: string, en: string): string {
  return studioLocale() === 'zh' ? zh : en; // any non-zh locale reads the en placeholder
}
