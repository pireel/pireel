/**
 * frame locale 包索引:目前只有 en(zh 是 canonical,不设包)。
 * 每个 frame 一个包文件(./en/<frameId>.ts),这里聚合;加语言 = 新目录 + 新映射。
 */


import { KIND_LABELS_EN, type FrameLocalePack, type SupportedLocale } from './types';
import { pack as biennalePoster } from './en/biennale-poster';
import { pack as boardroom } from './en/boardroom';
import { pack as botanicPress } from './en/botanic-press';
import { pack as chalkClass } from './en/chalk-class';
import { pack as cinemaFrame } from './en/cinema-frame';
import { pack as foodieVlog } from './en/foodie-vlog';
import { pack as glassTech } from './en/glass-tech';
import { pack as journalInk } from './en/journal-ink';
import { pack as kawaiiBubble } from './en/kawaii-bubble';
import { pack as knowledgeCards } from './en/knowledge-cards';
import { pack as mangaPanel } from './en/manga-panel';
import { pack as megaSale } from './en/mega-sale';
import { pack as memphisPop } from './en/memphis-pop';
import { pack as neonRunner } from './en/neon-runner';
import { pack as noirGold } from './en/noir-gold';
import { pack as paperCut } from './en/paper-cut';
import { pack as particleDust } from './en/particle-dust';
import { pack as pixelArcade } from './en/pixel-arcade';
import { pack as scrapbookTape } from './en/scrapbook-tape';
import { pack as varsityBold } from './en/varsity-bold';
import { pack as y2kChrome } from './en/y2k-chrome';
import { pack as zenWhite } from './en/zen-white';
import { pack as flipBoard } from './en/flip-board';
import { pack as circuitBoard } from './en/circuit-board';
import { pack as stickerCollage } from './en/sticker-collage';

export { KIND_LABELS_EN } from './types';
export type { FrameLocalePack, SupportedLocale } from './types';
export { localizeBlock } from './apply';

const EN: Record<string, FrameLocalePack> = {
  'biennale-poster': biennalePoster,
  'boardroom': boardroom,
  'botanic-press': botanicPress,
  'chalk-class': chalkClass,
  'cinema-frame': cinemaFrame,
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
  'varsity-bold': varsityBold,
  'y2k-chrome': y2kChrome,
  'zen-white': zenWhite,
  'flip-board': flipBoard,
  'circuit-board': circuitBoard,
  'sticker-collage': stickerCollage,
};

/** 取某语言下某 frame 的适配包;zh/未收录 → undefined(用 canonical 中文)。 */
export function framePack(locale: SupportedLocale | undefined, frameId: string): FrameLocalePack | undefined {
  if (locale !== 'en') return undefined;
  return EN[frameId];
}

/** showcase 词标签(canonical 中文键)按语言取显示名。 */
export function kindLabel(locale: SupportedLocale | undefined, kind: string): string {
  if (locale !== 'en') return kind;
  return KIND_LABELS_EN[kind] ?? kind;
}
