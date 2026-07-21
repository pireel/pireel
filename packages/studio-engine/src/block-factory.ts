/**
 * 块构造器:代码侧「加块」的便捷入口(agent 工具/分镜落块/面板插入共用)。
 * 全部经模板注册表取默认槽位/默认轨 —— 加模板即自动可构造。
 */

import {
  type Block,
  type FxWord,
  type NormBox,
  type Slots,
  blockId,
  getTemplate,
  span2,
} from './composition-core';
import { t } from './i18n';

/* ============================ 块构造器 ============================ */

/** 注册表驱动的新块:按模板 slot schema 填占位数据,放模板默认轨。供"加块"用 —— 加模板即自动可加。 */
export function newBlock(templateId: string, opts: { startSec: number; durationSec?: number }): Block {
  const tpl = getTemplate(templateId);
  const slots: Slots = {};
  for (const [key, spec] of Object.entries(tpl.slots)) {
    if (spec.type === 'text') slots[key] = spec.label;
    else if (spec.type === 'text[]') slots[key] = ['要点一', '要点二', '要点三'];
    else if (spec.type === 'enum') slots[key] = spec.options?.[0] ?? '';
    else if (spec.type === 'words') slots[key] = [{ text: '示例文字', start: opts.startSec, end: opts.startSec + 1.2 }];
    // image / 其它:留空
  }
  return {
    id: blockId(templateId),
    templateId,
    slots,
    startSec: opts.startSec,
    durationSec: opts.durationSec ?? 2.5,
    trackIndex: tpl.defaultTrackIndex,
    label: t(tpl.name),
  };
}

/** 素材位块(空区占位)。空 slots = 占位;填 `slots.media={type,url}` 后铺图/视频。box 一般用 treatmentVacancyBox。 */
export function mediaBlock(opts: {
  startSec: number;
  durationSec: number;
  box?: NormBox;
  trackIndex?: number;
  label?: string;
}): Block {
  return {
    id: blockId('media'),
    templateId: 'media',
    slots: {},
    startSec: opts.startSec,
    durationSec: opts.durationSec,
    trackIndex: opts.trackIndex ?? 2,
    ...(opts.box ? { box: opts.box } : {}),
    label: opts.label ?? t('素材位'),
  };
}

export function customBlock(opts: {
  innerHtml: string;
  timelineBody: string;
  startSec: number;
  durationSec: number;
  trackIndex?: number;
  label?: string;
}): Block {
  return {
    id: blockId('cst'),
    templateId: 'custom',
    slots: { innerHtml: opts.innerHtml, timelineBody: opts.timelineBody },
    startSec: opts.startSec,
    durationSec: opts.durationSec,
    trackIndex: opts.trackIndex ?? 2,
    ...(opts.label ? { label: opts.label } : {}),
  };
}

export function titleBlock(opts: { text: string; startSec: number; durationSec: number; trackIndex?: number; sub?: string }): Block {
  return {
    id: blockId('title'),
    templateId: 'title',
    slots: { text: opts.text, ...(opts.sub ? { sub: opts.sub } : {}) },
    startSec: opts.startSec,
    durationSec: opts.durationSec,
    trackIndex: opts.trackIndex ?? 2,
    label: opts.text,
  };
}

export function statBlock(opts: { value: string; label: string; startSec: number; durationSec: number; trackIndex?: number }): Block {
  return {
    id: blockId('stat'),
    templateId: 'stat',
    slots: { value: opts.value, label: opts.label },
    startSec: opts.startSec,
    durationSec: opts.durationSec,
    trackIndex: opts.trackIndex ?? 2,
    label: `${opts.value} ${opts.label}`,
  };
}

export function bulletListBlock(opts: { title?: string; items: string[]; startSec: number; durationSec: number; trackIndex?: number }): Block {
  return {
    id: blockId('list'),
    templateId: 'list',
    slots: { ...(opts.title ? { title: opts.title } : {}), items: opts.items },
    startSec: opts.startSec,
    durationSec: opts.durationSec,
    trackIndex: opts.trackIndex ?? 2,
    label: opts.title ?? opts.items.join(' / '),
  };
}

/** 花字块(词时间驱动时长)。字幕归字幕、组件归组件:
 *  - 句级字幕:只带 words(+可选 preset/yPct 作 captionStyle 未设时的初始形态),视觉由全局预设定;
 *  - effect='kinetic-slam' = 关键词重击 **组件**(带 box 独立定位,不吃全局字幕样式)。 */
export function captionBlock(opts: {
  words: FxWord[];
  /** 仅组件用:关键词重击。句级字幕不传。 */
  effect?: 'kinetic-slam';
  /** 双语字幕副行(整句译文,渲染在主行正下方,视觉随预设)。 */
  sub?: string;
  /** 视觉预设 id(caption-presets;captionStyle 未设时的初始形态)。 */
  preset?: string;
  yPct?: number;
  label?: string;
  trackIndex?: number;
}): Block {
  const { start, dur } = span2(opts.words);
  return {
    id: blockId('cap'),
    templateId: 'caption',
    slots: {
      words: opts.words,
      ...(opts.effect ? { effect: opts.effect } : {}),
      ...(opts.sub ? { sub: opts.sub } : {}),
      ...(opts.preset ? { preset: opts.preset } : {}),
      ...(opts.yPct != null ? { yPct: opts.yPct } : {}),
    },
    startSec: start,
    durationSec: dur,
    trackIndex: opts.trackIndex ?? 1,
    label: opts.label ?? opts.words.map((w) => w.text).join(''),
  };
}

/** 转场**遮罩块**(旧形态,仅存量渲染兼容):真转场是切点上的内容交接,走
 *  VideoShot.transIn(cutTransitions)——UI/工具已不再产出这种块。 */
export function transitionBlock(opts: { startSec: number; durationSec?: number; effect?: 'wipe' | 'flash' | 'fade' | 'slide'; trackIndex?: number }): Block {
  return {
    id: blockId('tr'),
    templateId: 'transition',
    slots: { effect: opts.effect ?? 'wipe' },
    startSec: opts.startSec,
    durationSec: opts.durationSec ?? 0.5,
    trackIndex: opts.trackIndex ?? 3,
    label: t('转场'),
  };
}
