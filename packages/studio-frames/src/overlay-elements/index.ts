/**
 * 主题叠加件(口播画面上的组件,与整页 showcase 分工):每主题一个文件,导出
 *   export const overlays: Record<string, () => Block>   // 件名(zh)→ 构造器
 *
 * 设计铁律(用户两轮纠偏后定,别再犯):
 *  - **件,不是页**:根透明,件占画面一个区域(卡 ≤~45% 宽、标题条 ≤~62%×矮条、
 *    关键词 ≤~52% 居中),永远给说话的人留出画面——禁满幅底。
 *  - **特色长在件上**:必须用该方言的签名语汇(硬影墨块/木框粉笔/胶带拍立得/
 *    镀金细线/像素斜面…),从 showcase 的 CSS 语汇里取——同骨架换配色=没做。
 *  - 画布 1920×1080 标定;样式只用 token(var(--…),库侧按主题 palette 烘焙);
 *    选择器 #${id} 作用域;文本节点打 data-edit;GSAP ≤1.2s 落定,无循环。
 *  - 件名跨主题统一(标题条/大数字/要点列表/关键词重击/标注/关注引导/金句/左右对比),
 *    分组与词典靠它对齐;布局/装饰/动效各主题自便。
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

/** 该主题的叠加件清单(无专属集=null,库侧回落通用结构)。 */
export function overlayElements(frameId: string): { kind: string; make: () => Block }[] | null {
  const set = SETS[frameId];
  if (!set) return null;
  return Object.entries(set).map(([kind, make]) => ({ kind, make }));
}

