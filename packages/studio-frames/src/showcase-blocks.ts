/**
 * Factory for visual-language samples shown on a Frame's detail page, keyed by
 * (frameId, kind). Samples are not fixed production templates. Each Frame has its own layout dialect,
 * not one skeleton reskinned:
 *   Blueprint = engineering drawing: wireframes, dimension lines, grid, title block, stroke-only
 *   Cream     = sticker candy: tilted rounded stickers, pills, dot accents, layering
 *   Biennale  = constructivist poster: giant bleeding type, vertical text, reversed panels
 *   Noir      = fashion editorial: centered, extreme whitespace, hairline gold frame, thin serif
 *   Journal   = newspaper front page: double-rule masthead, faux columns, drop caps, red-pen notes
 *   Neon      = HUD terminal: scan grid, corner brackets, status bar, mono readouts, cursor
 * Design rules: commit to an extreme direction, dominant color + sharp accent, no
 * "rounded card + left border" cliche, text no smaller than 24px-equivalent at 1080p.
 * 1920x1080 canvas, rendered for real via blockPreviewDoc.
 * Open vocabulary: a kind a frame doesn't implement returns null, panel falls back to a label card.
 */


import { framePack, localizeBlock, type SupportedLocale } from './locales';
import { type Block } from './dialects/shared';
import * as kawaiiBubble from './dialects/kawaii-bubble';
import * as megaSale from './dialects/mega-sale';
import * as pixelArcade from './dialects/pixel-arcade';
import * as varsityBold from './dialects/varsity-bold';
import * as scrapbookTape from './dialects/scrapbook-tape';
import * as memphisPop from './dialects/memphis-pop';
import * as y2kChrome from './dialects/y2k-chrome';
import * as mangaPanel from './dialects/manga-panel';
import * as particleDust from './dialects/particle-dust';
import * as glassTech from './dialects/glass-tech';
import * as zenWhite from './dialects/zen-white';
import * as cinemaFrame from './dialects/cinema-frame';
import * as paperCut from './dialects/paper-cut';
import * as boardroom from './dialects/boardroom';
import * as chalkClass from './dialects/chalk-class';
import * as botanicPress from './dialects/botanic-press';
import * as flipBoard from './dialects/flip-board';
import * as circuitBoard from './dialects/circuit-board';
import * as stickerCollage from './dialects/sticker-collage';
import * as knowledgeCards from './dialects/knowledge-cards';
import * as foodieVlog from './dialects/foodie-vlog';
import * as biennalePoster from './dialects/biennale-poster';
import * as noirGold from './dialects/noir-gold';
import * as journalInk from './dialects/journal-ink';
import * as neonRunner from './dialects/neon-runner';

/* ================================================================ */

const DIALECTS: Record<string, Record<string, () => Block>> = {
  'knowledge-cards': knowledgeCards.blocks,
  'foodie-vlog': foodieVlog.blocks,
  'biennale-poster': biennalePoster.blocks,
  'noir-gold': noirGold.blocks,
  'journal-ink': journalInk.blocks,
  'neon-runner': neonRunner.blocks,
  'kawaii-bubble': kawaiiBubble.blocks,
  'mega-sale': megaSale.blocks,
  'pixel-arcade': pixelArcade.blocks,
  'varsity-bold': varsityBold.blocks,
  'scrapbook-tape': scrapbookTape.blocks,
  'memphis-pop': memphisPop.blocks,
  'y2k-chrome': y2kChrome.blocks,
  'manga-panel': mangaPanel.blocks,
  'particle-dust': particleDust.blocks,
  'glass-tech': glassTech.blocks,
  'zen-white': zenWhite.blocks,
  'cinema-frame': cinemaFrame.blocks,
  'paper-cut': paperCut.blocks,
  'boardroom': boardroom.blocks,
  'chalk-class': chalkClass.blocks,
  'botanic-press': botanicPress.blocks,
  'flip-board': flipBoard.blocks,
  'circuit-board': circuitBoard.blocks,
  'sticker-collage': stickerCollage.blocks,
};

/** (frameId, showcase kind) → the real sample block in that theme's dialect; null if not
 *  implemented (panel falls back to a label card). locale applies the adapted copy pack for
 *  non-Chinese languages (dialect source stays single-source Chinese, see lib/frames/locales). */
export function showcaseBlock(frameId: string, kind: string, locale?: SupportedLocale): Block | null {
  const b = DIALECTS[frameId]?.[kind]?.() ?? null;
  return b ? localizeBlock(b, framePack(locale, frameId)) : null;
}

/* ================================================================
   Covers — list thumbnails: theme name is the hero, hint the style without listing details (like a slide-deck theme cover)
   ================================================================ */

const COVERS: Record<string, () => Block> = {
  'kawaii-bubble': kawaiiBubble.cover,
  'mega-sale': megaSale.cover,
  'pixel-arcade': pixelArcade.cover,
  'varsity-bold': varsityBold.cover,
  'scrapbook-tape': scrapbookTape.cover,
  'memphis-pop': memphisPop.cover,
  'y2k-chrome': y2kChrome.cover,
  'manga-panel': mangaPanel.cover,
  'particle-dust': particleDust.cover,
  'glass-tech': glassTech.cover,
  'zen-white': zenWhite.cover,
  'cinema-frame': cinemaFrame.cover,
  'paper-cut': paperCut.cover,
  'boardroom': boardroom.cover,
  'chalk-class': chalkClass.cover,
  'botanic-press': botanicPress.cover,
  'flip-board': flipBoard.cover,
  'circuit-board': circuitBoard.cover,
  'sticker-collage': stickerCollage.cover,
  'knowledge-cards': knowledgeCards.cover,
  'foodie-vlog': foodieVlog.cover,
  'biennale-poster': biennalePoster.cover,
  'noir-gold': noirGold.cover,
  'journal-ink': journalInk.cover,
  'neon-runner': neonRunner.cover,
};

/** frameId → cover block (list thumbnail; null if none, panel falls back to a row). */
export function coverBlock(frameId: string, locale?: SupportedLocale): Block | null {
  const b = COVERS[frameId]?.() ?? null;
  return b ? localizeBlock(b, framePack(locale, frameId)) : null;
}
