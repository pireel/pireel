/**
 * 口播 ASR → 花字块。这是"2(喂口播)"的落点:每句口播 = 一个分镜块(花字),
 * 词级时间驱动逐词高亮。真·词级时间应来自 DashScope filetrans(enable_words);
 * 当前从句子文本 + 句级时间用 wordsFromText 近似切词,够先跑通。
 */

import { wordsFromText } from './caption-fx';
import { type Block, captionBlock } from './composition';

export interface AsrSegment {
  start: number;
  end: number;
  text: string;
  /** 若 ASR 给了词级(future),优先用 */
  words?: { text: string; start: number; end: number }[];
  /** 双语字幕副行(整句译文;set_caption_translations 写入,铺字幕时进块)。 */
  sub?: string;
}

/** 句级 ASR → 字幕块,一句一块(只带词数据;视觉由全局花字样式/预设定,字幕不携带样式)。
 *  长句**不在这里拆**——拆段是渲染期实时计算(caption 模板内 chunkWordsByWidth 按段轮播),
 *  不落数据:旧块/草稿/缓存自动生效,块级数据保持与口播稿一一对应。 */
export function captionBlocksFromAsr(segments: AsrSegment[], opts?: { preset?: string; yPct?: number }): Block[] {
  return segments
    .filter((s) => s.text && s.text.trim())
    .map((s) => {
      const words = s.words?.length ? s.words : wordsFromText(s.text, s.start, s.end);
      return captionBlock({
        words,
        ...(s.sub?.trim() ? { sub: s.sub.trim() } : {}),
        ...(opts?.preset ? { preset: opts.preset } : {}),
        ...(opts?.yPct != null ? { yPct: opts.yPct } : {}),
        label: s.text.trim(),
      });
    });
}
