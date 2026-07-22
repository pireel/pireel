/**
 * Theme overlay elements (components layered on the talking-head frame, distinct from
 * the full-page showcase): one file per theme, each exporting
 *   export const overlays: Record<string, () => Block>   // element name (zh) -> builder
 *
 * Design rules (settled after two rounds of user correction — don't regress):
 *  - **Element, not page**: transparent root; each element occupies one region of the
 *    frame (card <=~45% wide, title bar <=~62% x short strip, keyword <=~52% centered).
 *    Always leave room for the speaker — no full-bleed backgrounds.
 *  - **Character lives in the element**: use the dialect's signature vocabulary (hard-shadow
 *    ink blocks / wood-framed chalk / taped Polaroid / gilded hairlines / pixel bevels...),
 *    taken from the showcase CSS. Same skeleton with a recolor = not done.
 *  - Canvas is 1920x1080; styles use tokens only (var(--…), baked from the theme palette by
 *    the library); selectors scoped to #${id}; text nodes get data-edit; GSAP settles in
 *    <=1.2s, no loops.
 *  - Element names are shared across themes (title bar / big number / bullet list / keyword
 *    hit / callout / follow CTA / quote / A-vs-B). Grouping and the dictionary align on them;
 *    layout/decoration/animation are each theme's own choice.
 */

import type { Block } from '../dialects/shared';
import { overlays as biennalePoster } from './biennale-poster';
import { overlays as boardroom } from './boardroom';
import { overlays as botanicPress } from './botanic-press';
import { overlays as chalkClass } from './chalk-class';
import { overlays as cinemaFrame } from './cinema-frame';
import { overlays as circuitBoard } from './circuit-board';
import { overlays as flipBoard } from './flip-board';
import { overlays as foodieVlog } from './foodie-vlog';
import { overlays as glassTech } from './glass-tech';
import { overlays as journalInk } from './journal-ink';
import { overlays as kawaiiBubble } from './kawaii-bubble';
import { overlays as knowledgeCards } from './knowledge-cards';
import { overlays as mangaPanel } from './manga-panel';
import { overlays as megaSale } from './mega-sale';
import { overlays as memphisPop } from './memphis-pop';
import { overlays as neonRunner } from './neon-runner';
import { overlays as noirGold } from './noir-gold';
import { overlays as paperCut } from './paper-cut';
import { overlays as particleDust } from './particle-dust';
import { overlays as pixelArcade } from './pixel-arcade';
import { overlays as scrapbookTape } from './scrapbook-tape';
import { overlays as stickerCollage } from './sticker-collage';
import { overlays as varsityBold } from './varsity-bold';
import { overlays as y2kChrome } from './y2k-chrome';
import { overlays as zenWhite } from './zen-white';

const SETS: Record<string, Record<string, () => Block>> = {
  'biennale-poster': biennalePoster,
  'boardroom': boardroom,
  'botanic-press': botanicPress,
  'chalk-class': chalkClass,
  'cinema-frame': cinemaFrame,
  'circuit-board': circuitBoard,
  'flip-board': flipBoard,
  'foodie-vlog': foodieVlog,
  'glass-tech': glassTech,
  'journal-ink': journalInk,
  'kawaii-bubble': kawaiiBubble,
  'knowledge-cards': knowledgeCards,
  'manga-panel': mangaPanel,
  'mega-sale': megaSale,
  'memphis-pop': memphisPop,
  'neon-runner': neonRunner,
  'noir-gold': noirGold,
  'paper-cut': paperCut,
  'particle-dust': particleDust,
  'pixel-arcade': pixelArcade,
  'scrapbook-tape': scrapbookTape,
  'sticker-collage': stickerCollage,
  'varsity-bold': varsityBold,
  'y2k-chrome': y2kChrome,
  'zen-white': zenWhite,
};

/** Overlay elements for this theme (no dedicated set = null; library falls back to a generic structure). */
export function overlayElements(frameId: string): { kind: string; make: () => Block }[] | null {
  const set = SETS[frameId];
  if (!set) return null;
  return Object.entries(set).map(([kind, make]) => ({ kind, make }));
}

