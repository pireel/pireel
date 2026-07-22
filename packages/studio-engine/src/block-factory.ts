/**
 * Block factory: the code-side convenience entry for "add block" (shared by
 * agent tools / shot placement / panel insertion). All go through the template
 * registry for default slots/track — adding a template automatically makes it constructible.
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

/* ============================ Block factory ============================ */

/** Registry-driven new block: fills placeholder data per the template slot schema, on the template's default track. For "add block" — adding a template makes it addable automatically. */
export function newBlock(templateId: string, opts: { startSec: number; durationSec?: number }): Block {
  const tpl = getTemplate(templateId);
  const slots: Slots = {};
  for (const [key, spec] of Object.entries(tpl.slots)) {
    if (spec.type === 'text') slots[key] = spec.label;
    else if (spec.type === 'text[]') slots[key] = ['要点一', '要点二', '要点三'];
    else if (spec.type === 'enum') slots[key] = spec.options?.[0] ?? '';
    else if (spec.type === 'words') slots[key] = [{ text: '示例文字', start: opts.startSec, end: opts.startSec + 1.2 }];
    // image / others: leave empty
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

/** Media-slot block (empty-area placeholder). Empty slots = placeholder; fill `slots.media={type,url}` to lay in image/video. box usually uses treatmentVacancyBox. */
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

/** Caption block (duration driven by word timing). Captions are captions, components are components:
 *  - sentence-level caption: carries only words (+ optional preset/yPct as the initial form when captionStyle is unset); visuals come from the global preset;
 *  - effect='kinetic-slam' = keyword-slam component (has its own box, independently positioned, ignores the global caption style). */
export function captionBlock(opts: {
  words: FxWord[];
  /** Component-only: keyword slam. Not passed for sentence-level captions. */
  effect?: 'kinetic-slam';
  /** Bilingual caption sub-line (full-sentence translation, rendered directly below the main line, visuals follow the preset). */
  sub?: string;
  /** Visual preset id (caption-presets; initial form when captionStyle is unset). */
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

/** Transition mask block (legacy form, kept only for rendering existing data): a real
 *  transition is a content handoff at the cut point, via VideoShot.transIn (cutTransitions) — UI/tools no longer produce this block. */
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
