'use client';

/**
 * 字幕样式面板(停靠素材栏的工具面板,入口=走带栏「字幕」按钮;对照 Google Vids Captions):两类字幕 —— 逐词强调(Word emphasis)/
 * 整句字幕(Line by line),每类一墙视觉预设;点一款 = **全局应用**,全片句级花字统一换,
 * 位置/缩放在画布上选中任意花字拖拽调,同样全局生效。
 * 卡片是 Vids 式静态样式卡(深色底 + 一句示范文字),形态直接从预设表生成,不跑 iframe。
 */

import type { CSSProperties } from 'react';
import { Ban, Check, Languages, Loader2, Type } from 'lucide-react';
import { studioLocale, t } from './i18n';
import {
  type CaptionPreset,
  type Composition,
  CAPTION_PRESETS,
  isSentenceCaption,
  resolveCaptionStyle,
} from '@pireel/studio-engine/composition';

const SECTIONS: { mode: CaptionPreset['mode']; title: string; desc: string }[] = [
  { mode: 'emphasis', title: '逐词强调', desc: '整句常显，读到哪个词强调哪个词' },
  { mode: 'line', title: '整句字幕', desc: '整句浮现，干净不抢戏' },
];

/** 双语翻译区的注入面(托管壳才有翻译能力;OSS 壳不传=整区隐藏,BYO agent 自己翻)。 */
export interface CaptionTranslationControl {
  /** 已有译文句数 / 转写总句数(全源合计)。 */
  done: number;
  total: number;
  busy: boolean;
  /** 当前选过的目标语言(chip 选中态;新插入片段自动补翻也用它)。 */
  lang?: string;
  onTranslate: (targetLanguage: string) => void;
  onClear: () => void;
}

const TRANSLATION_LANGS = ['中文', 'English', '日本語', '한국어'];

export function CaptionsPanel({
  comp,
  onPickPreset,
  onRemove,
  translation,
  generating,
}: {
  comp: Composition;
  /** 点样式卡:全局换所有句级花字的预设(还没有花字时会按口播稿现铺一层)。 */
  onPickPreset: (presetId: string) => void;
  /** 移除整层句级花字 + 清全局样式。 */
  onRemove: () => void;
  /** 双语翻译控制面(缺省隐藏该区)。 */
  translation?: CaptionTranslationControl;
  /** 字幕生成中(ASR/重铺):整面板遮罩,防重复点样式卡。 */
  generating?: boolean;
}) {
  const current = resolveCaptionStyle(comp).preset;
  const hasCaptions = comp.blocks.some(isSentenceCaption);
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      {generating && (
        <div className="bg-bg/70 absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]">
          <Loader2 size={18} className="text-accent animate-spin" />
          <span className="text-ink-2 text-[12px]">{t('字幕生成中…')}</span>
        </div>
      )}
      {/* 标题单层:「字幕」归停靠面板头部(工具面板体系惯例),这里只留说明行 */}
      <div className="border-line border-b px-3 py-2">
        <div className="text-ink-4 text-[10.5px]">
          {hasCaptions ? t('样式对整条视频生效；在画布选中字幕可拖动位置、调整大小') : t('还没有字幕——点任意样式，按口播稿自动生成')}
        </div>
      </div>
      {/* 当前应用样式 + 移除:有花字层才显示 */}
      {hasCaptions && (
        <div className="border-line bg-panel-2/60 flex items-center gap-2 border-b px-3 py-2">
          <Type size={12} className="text-accent shrink-0" />
          <span className="text-ink-4 shrink-0 text-[10.5px]">{t('当前样式')}</span>
          <span className="text-ink truncate text-[11.5px] font-medium">{CAPTION_PRESETS.find((p) => p.id === current)?.name ?? current}</span>
          <button type="button" onClick={onRemove} title={t('移除全部字幕(可撤销)')} className="text-ink-3 hover:text-destructive ml-auto shrink-0 text-[11px]">
            {t('移除')}
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto p-2.5">
        {/* 「无」:不加字幕/移除整层(与样式卡同款形态,选中态=当前没有字幕) */}
        <div className="mb-3">
          <button
            type="button"
            title={t('不加字幕')}
            onClick={() => hasCaptions && onRemove()}
            className={`group relative w-full overflow-hidden rounded-lg border transition ${
              !hasCaptions ? 'border-accent ring-accent/40 ring-1' : 'border-line hover:border-accent'
            }`}
          >
            <div className="flex h-[58px] items-center justify-center gap-2 bg-[#2b2b2e] px-3 text-[13px] text-white/55">
              <Ban size={14} /> {t('无字幕')}
            </div>
            {!hasCaptions ? (
              <span className="bg-accent absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-white">
                <Check size={10} /> {t('使用中')}
              </span>
            ) : (
              <span className="bg-accent absolute right-1.5 top-1.5 hidden rounded px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:block">
                {t('使用')}
              </span>
            )}
          </button>
        </div>
        {SECTIONS.map((sec) => (
          <div key={sec.mode} className="mb-3">
            <div className="text-ink text-[11.5px] font-medium">{t(sec.title)}</div>
            <div className="text-ink-4 mb-1.5 text-[10px]">{t(sec.desc)}</div>
            <div className="flex flex-col gap-2">
              {CAPTION_PRESETS.filter((p) => p.mode === sec.mode).map((p) => (
                // 选中态以「有字幕」为前提:resolveCaptionStyle 无字幕时也回缺省 preset,
                // 不加前提会和顶部「无字幕」同时亮「使用中」
                <PresetCard key={p.id} preset={p} active={hasCaptions && p.id === current} onPick={onPickPreset} />
              ))}
            </div>
          </div>
        ))}
      </div>
      {/* 双语翻译:sticky 底部常驻——与字幕开关互不依赖(译文写在转写句上,独立配置;
          位置/大小在画布上选中字幕后拖「译文」框调,同样全局生效) */}
      {translation && (
        <div className="border-line bg-panel-2/40 border-t px-3 py-2">
          <div className="flex items-center gap-1.5">
            <Languages size={12} className="text-accent shrink-0" />
            <span className="text-ink text-[11.5px] font-medium">{t('双语翻译')}</span>
            <span className="text-ink-4 ml-auto text-[10.5px]">
              {translation.busy ? t('翻译中…') : translation.total === 0 ? t('先提取口播稿') : translation.done > 0 ? t('已有 {done}/{total} 句', { done: translation.done, total: translation.total }) : t('未添加')}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {TRANSLATION_LANGS.map((lang) => {
              const active = translation.lang === lang && translation.done > 0;
              return (
                <button
                  key={lang}
                  type="button"
                  disabled={translation.busy || translation.total === 0}
                  onClick={() => translation.onTranslate(lang)}
                  title={t('把口播稿翻成{lang},作为第二行字幕', { lang })}
                  className={`rounded-md border px-2 py-0.5 text-[10.5px] transition disabled:opacity-50 ${
                    active ? 'border-accent bg-accent/10 text-ink font-medium' : 'border-line text-ink-3 hover:border-accent/50 hover:text-ink'
                  }`}
                >
                  {active && <Check size={10} className="text-accent mr-0.5 inline-block align-[-1px]" />}
                  {lang}
                </button>
              );
            })}
            {translation.busy && <Loader2 size={12} className="text-accent animate-spin" />}
            {!translation.busy && translation.done > 0 && (
              <button type="button" onClick={translation.onClear} title={t('清除全部译文(可撤销)')} className="text-ink-4 hover:text-destructive ml-auto text-[10.5px]">
                {t('清除')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PresetCard({ preset, active, onPick }: { preset: CaptionPreset; active: boolean; onPick: (id: string) => void }) {
  return (
    <button
      type="button"
      title={t(preset.name)}
      onClick={() => onPick(preset.id)}
      className={`group relative overflow-hidden rounded-lg border transition ${
        active ? 'border-accent ring-accent/40 ring-1' : 'border-line hover:border-accent'
      }`}
    >
      <div className="flex h-[58px] items-center justify-center bg-[#2b2b2e] px-3">
        <PresetSample p={preset} />
      </div>
      {active ? (
        <span className="bg-accent absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-white">
          <Check size={10} /> {t('使用中')}
        </span>
      ) : (
        <span className="bg-accent absolute right-1.5 top-1.5 hidden rounded px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:block">
          {t('使用')}
        </span>
      )}
    </button>
  );
}

/** 示范文字按预设的定格形态摆出来(纯 CSS):强调款亮中间词(变色/划线/色块),整句款平铺。 */
function PresetSample({ p }: { p: CaptionPreset }) {
  // 示范词不进词典:「字幕」这类超短词做 key 会和别处译法撞车,按 locale 直接给
  const sample = studioLocale() === 'en' ? ['Cool ', 'captions', ' here'] : ['这是', '字幕', '示范'];
  const fontFamily = p.font === 'serif' ? "'Noto Serif SC','Songti SC',serif" : p.font === 'mono' ? "'IBM Plex Mono',ui-monospace,monospace" : undefined;
  const base: CSSProperties = {
    color: p.text,
    fontWeight: p.weight,
    fontFamily,
    fontStyle: p.italic ? 'italic' : undefined,
    fontSize: Math.round(p.size * 0.24),
    lineHeight: 1.2,
    textShadow: p.shadow && !p.bg ? '0 1px 6px rgba(0,0,0,0.85)' : undefined,
    whiteSpace: 'nowrap',
  };
  const pill: CSSProperties | undefined = p.bg
    ? { background: p.bg, padding: '4px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'baseline' }
    : { display: 'inline-flex', alignItems: 'baseline' };
  // 强调词(中间的「花字」)的定格形态
  const emph: CSSProperties = { position: 'relative', margin: '0 0.18em' };
  if (p.emphasis) emph.color = p.emphasis;
  if (p.deco === 'underline') emph.boxShadow = `inset 0 -3px 0 ${p.decoColor}`;
  const decoBox: CSSProperties | undefined =
    p.deco === 'highlight' ? { position: 'absolute', inset: '-2px -4px', background: p.decoColor, borderRadius: 4 } : undefined;
  return (
    <span style={pill}>
      <span style={base}>
        {sample[0]}
        <span style={{ ...base, ...emph }}>
          {decoBox && <span style={decoBox} />}
          <span style={{ position: 'relative' }}>{sample[1]}</span>
        </span>
        {sample[2]}
      </span>
    </span>
  );
}
