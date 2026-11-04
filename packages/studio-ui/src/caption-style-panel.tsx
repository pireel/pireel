'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Bold, Check, ChevronDown } from 'lucide-react';
import { BASE_CAPTION_FONT_PX,  getCaptionPreset, isDisplayTextFontId, type CaptionStyle, type DisplayTextFontId } from '@pireel/studio-engine/composition';
import { FontPicker } from './display-text-panel';
import { cachedLocalFontFamilies, loadLocalFontFamilies, supportsLocalFontAccess, type LocalFontFamilyOption } from './local-font-access';
import { CaptionPresetCard, type CaptionStyleCtl } from './captions-panel';
import { t } from './i18n';
import { CaptionMotionSample } from './caption-stage-sample';
import { CAPTION_ART_PRESETS, CAPTION_STYLE_PRESETS, SUB_CAPTION_PRESET_IDS, type CaptionPreset } from '@pireel/studio-engine/caption-presets';
import { CAPTION_ANIMATIONS, captionAnimationId, animatedCaptionPreset } from '@pireel/studio-engine/caption-animations';

/** Global subtitle look: main-line appearance, main-line animation, and the translation line as three
 *  first-level tabs. The translation line only gets simple looks — no stacking, no motion. */
export function CaptionStylePanel({ styleCtl, active, generating, onPickPreset, translationControls, showTranslation = true }: {
  styleCtl: CaptionStyleCtl;
  active: boolean;
  generating: boolean;
  onPickPreset: (preset: string, patch?: Partial<CaptionStyle>) => void;
  /** Language choice shown at the top of the translation tab, for hosts that pick it here. */
  translationControls?: ReactNode;
  /** Hosts whose captions never carry a second line (e.g. dubbing, which already speaks the target language) hide the tab. */
  showTranslation?: boolean;
}) {
  const [section, setSection] = useState<'appearance' | 'animation' | 'sub'>('appearance');
  const main = styleCtl.main;
  const animation = captionAnimationId(main);
  const motionSampleText = [t('captions.samplePre'), t('captions.sampleWord'), t('captions.samplePost')].join('|');
  const reset = { color: undefined, bg: undefined, font: undefined, bold: undefined };
  const pickMain = (preset: string) => onPickPreset(preset, { animation, ...reset });
  const pickSub = (preset: string) => styleCtl.onSubPatch({ preset, ...reset });
  const tabs = ([
    ['appearance', 'captions.appearanceTab'],
    ['animation', 'captions.animationTab'],
    ['sub', 'captions.subLine'],
  ] as const).filter(([part]) => showTranslation || part !== 'sub');
  return <div data-cap-keep className="min-h-0 flex-1 overflow-auto p-3">
    <fieldset disabled={generating} className="min-w-0 space-y-3 disabled:opacity-60">
      <div className="border-line flex gap-5 border-b">
        {tabs.map(([part, label]) => <button key={part} type="button" aria-pressed={section === part} onClick={() => setSection(part)}
          className={`-mb-px border-b-2 pb-2 text-[12px] ${section === part ? 'border-ink text-ink font-medium' : 'text-ink-4 border-transparent hover:text-ink'}`}>
          {t(label)}
        </button>)}
      </div>
      {section === 'appearance' && <div data-caption-appearance className="space-y-3">
        <StyleControls key="main" style={main} onPatch={styleCtl.onMainPatch} highlight={animatedCaptionPreset(getCaptionPreset(main.preset), main.animation)} />
        <PresetGroup title={t('captions.artGroup')} presets={CAPTION_ART_PRESETS} tall current={active ? main.preset : undefined} onPick={pickMain} />
        <PresetGroup title={t('captions.basicGroup')} presets={CAPTION_STYLE_PRESETS} current={active ? main.preset : undefined} onPick={pickMain} />
      </div>}
      {section === 'animation' && <div data-caption-animation>
        <div className="grid grid-cols-2 gap-2">
          {CAPTION_ANIMATIONS.map(effect => <button
            key={effect.id} type="button" title={t(effect.name)} aria-pressed={animation === effect.id}
            onClick={() => styleCtl.onMainPatch({ animation: effect.id })}
            className={`relative overflow-hidden rounded-lg text-left transition ${animation === effect.id ? 'ring-accent ring-2' : 'hover:ring-ink-4 hover:ring-1'}`}>
            {/* Drawn and animated by the engine itself, so the card shows exactly what picking it does. */}
            <div className="flex h-[64px] items-center overflow-hidden bg-[#2b2b2e]" data-motion={effect.id}>
              <CaptionMotionSample id={effect.id} style={{ ...main, animation: effect.id }} text={motionSampleText} />
            </div>
            <div className="text-ink-3 flex items-center justify-between gap-1 px-2 py-1.5 text-[10.5px]">{t(effect.name)}{animation === effect.id && <Check size={11} className="text-accent-ink" />}</div>
          </button>)}
        </div>
      </div>}
      {section === 'sub' && <div data-caption-sub className="space-y-3">
        {translationControls}
        {styleCtl.bilingualOn ? <>
          <StyleControls key="sub" style={styleCtl.sub} onPatch={styleCtl.onSubPatch} />
          <PresetGroup title={t('captions.subPresets')} presets={SUB_PRESETS} current={styleCtl.sub.preset} onPick={pickSub} />
        </> : !translationControls && <p className="text-ink-4 py-6 text-center text-[12px] leading-relaxed">{t('captions.subEmpty')}</p>}
      </div>}
    </fieldset>
    {generating && <p role="status" className="text-ink-4 mt-3 text-[12px]">{t('captions.generatingCaptions')}</p>}
  </div>;
}

const SUB_PRESETS = SUB_CAPTION_PRESET_IDS.map((id) => getCaptionPreset(id));

function PresetGroup({ title, presets, current, tall, onPick }: {
  title: string;
  presets: readonly CaptionPreset[];
  current: string | undefined;
  tall?: boolean;
  onPick: (id: string) => void;
}) {
  return <section>
    <h3 className="text-ink-3 mb-2 text-[11px] font-medium">{title}</h3>
    <div className="grid grid-cols-2 gap-2" data-caption-preset-gallery>
      {presets.map(preset => <CaptionPresetCard key={preset.id} preset={preset} tall={tall} active={current === preset.id} onPick={onPick} />)}
    </div>
  </section>;
}

const TEXT_SWATCHES = ['#FFFFFF', '#101114', '#FFD24D', '#FF4D4D', '#3F6DF6', '#7CF29C'];
const HIGHLIGHT_SWATCHES = ['#FFE34F', '#5AFFB6', '#FF4D6D', '#72D7FF', '#C9A6FF'];
const BG_SWATCHES = ['#101114', '#FFFFFF', '#FF2E4D', '#FFD24D', '#3F6DF6'];

type StylePatch = { scale?: number; emphasis?: string | undefined; color?: string | undefined; bg?: string | null | undefined; bold?: boolean | undefined; font?: string | undefined };

/** Size, weight, colors and font — always open; the preset gallery below sets the rest. */
/** highlight = the main line's effective preset (appearance + animation); absent on the translation line. */
function StyleControls({ style, onPatch, highlight }: { style: CaptionStyle; onPatch: (patch: StylePatch) => void; highlight?: CaptionPreset }) {
  const [pop, setPop] = useState<null | 'size'>(null);
  // Font picker shares the display-text picker (built-ins + common + system fonts via Local Font Access).
  const [localFonts, setLocalFonts] = useState<LocalFontFamilyOption[]>(cachedLocalFontFamilies);
  const [fontAccess, setFontAccess] = useState<'idle' | 'loading' | 'loaded' | 'denied' | 'unsupported'>('idle');
  const requestLocalFonts = async () => {
    if (!supportsLocalFontAccess()) {
      setFontAccess('unsupported');
      return;
    }
    setFontAccess('loading');
    try {
      setLocalFonts(await loadLocalFontFamilies());
      setFontAccess('loaded');
    } catch {
      setFontAccess('denied');
    }
  };
  const fontId: DisplayTextFontId = isDisplayTextFontId(style.font) ? style.font : 'preset';
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!pop) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPop(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pop]);
  const preset = getCaptionPreset(style.preset);
  const fs = Math.max(9, Math.round(BASE_CAPTION_FONT_PX * style.scale));
  const effColor = style.color ?? preset.text;
  const effBg = style.bg === null ? null : (style.bg ?? preset.bg ?? null);
  const effBold = style.bold === true;
  // Size options in real px, mapped back to the preset-relative scale on pick.
  const sizeOpts = [16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96].filter((px) => {
    const k = px / BASE_CAPTION_FONT_PX;
    return k >= 0.4 && k <= 4;
  });
  const label = 'text-ink-3 w-12 shrink-0 text-[11px]';
  return (
    <div ref={rootRef} className="bg-panel-2/40 relative space-y-2.5 rounded-lg p-2.5">
      <div className="flex items-center gap-2">
        <span className={label}>{t('captions.fontFamily')}</span>
        <div className="min-w-0 flex-1">
          <FontPicker
            value={fontId}
            localFonts={localFonts}
            accessState={fontAccess}
            onLoadMore={() => void requestLocalFonts()}
            onChoose={(font) => onPatch({ font: font === 'preset' ? undefined : font })}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={label}>{t('captions.fontSize')}</span>
        <div className="relative">
          <button
            type="button"
            title={t('captions.fontSize')}
            onClick={() => setPop(pop === 'size' ? null : 'size')}
            className={`hover:border-accent flex h-7 w-16 items-center justify-between rounded-md border px-2 ${pop === 'size' ? 'border-accent' : 'border-line'}`}
          >
            <span className="text-ink-2 font-mono text-[11px] tabular-nums">{fs}</span>
            <ChevronDown size={11} className="text-ink-4" />
          </button>
          {pop === 'size' && (
            <div className="border-line bg-panel absolute left-0 top-full z-30 mt-1 max-h-56 w-20 overflow-auto rounded-lg border p-1 shadow-xl">
              {sizeOpts.map((px) => (
                <button
                  key={px}
                  type="button"
                  onClick={() => { setPop(null); onPatch({ scale: Math.round((px / BASE_CAPTION_FONT_PX) * 100) / 100 }); }}
                  className={`flex w-full items-center justify-center gap-1 rounded px-2 py-1 font-mono text-[11px] tabular-nums ${px === fs ? 'text-ink bg-panel-2/35' : 'text-ink-3 hover:bg-panel-2/20'}`}
                >
                  {px} {px === fs && <Check size={10} className="text-accent-ink" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          title={t('captions.bold')}
          aria-pressed={effBold}
          onClick={() => onPatch({ bold: !effBold })}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${effBold ? 'border-accent text-ink bg-panel-2/60' : 'border-line text-ink-3 hover:border-accent'}`}
        >
          <Bold size={12} strokeWidth={2.6} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className={label}>{t('captions.textColor')}</span>
        <SwatchRow swatches={TEXT_SWATCHES} value={style.color} current={effColor} onPick={(c) => onPatch({ color: c })} />
      </div>
      {highlight && (() => {
        const own = highlight.emphasis ?? highlight.decoColor ?? '#ffe34f';
        return <div className="flex items-center gap-2">
          <span className={label}>{t('captions.highlightRow')}</span>
          <SwatchRow swatches={HIGHLIGHT_SWATCHES} value={style.emphasis} current={style.emphasis ?? own}
            auto={{ color: own, active: style.emphasis == null, onPick: () => onPatch({ emphasis: undefined }) }}
            onPick={(c) => onPatch({ emphasis: c })} />
        </div>;
      })()}
      <div className="flex items-center gap-2">
        <span className={label}>{t('captions.plate')}</span>
        <SwatchRow swatches={BG_SWATCHES} value={style.bg === null ? undefined : style.bg} current={effBg ?? '#000000'}
          none={{ active: style.bg === null, onPick: () => onPatch({ bg: null }) }} onPick={(c) => onPatch({ bg: c })} />
      </div>
    </div>
  );
}

/** "No color" swatch face: transparency checkerboard (same visual language as block previews'
 *  honest ground, scaled to swatch size — screen pixels, block-preview-card convention). */
const NO_COLOR_CHECKER: CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage:
    'linear-gradient(45deg,#d7dbe0 25%,transparent 25%,transparent 75%,#d7dbe0 75%),linear-gradient(45deg,#d7dbe0 25%,transparent 25%,transparent 75%,#d7dbe0 75%)',
  backgroundSize: '8px 8px',
  backgroundPosition: '0 0,4px 4px',
};

/** Inline color row: fixed swatches, optional "no plate", and a free custom color. */
function SwatchRow({ swatches, value, current, none, auto, onPick }: {
  swatches: string[];
  /** Current override value (undefined = following the preset). */
  value?: string | undefined;
  /** Effective color, seeds the custom picker. */
  current: string;
  none?: { active: boolean; onPick: () => void };
  /** "Follow the animation" cell showing the animation's own color. */
  auto?: { color: string; active: boolean; onPick: () => void };
  onPick: (color: string) => void;
}) {
  // 20px cells, 4px gaps: 7 cells fit the default 280px dock without wrapping.
  const cell = 'h-5 w-5 shrink-0 rounded border';
  return (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-1">
      {auto && (
        <button type="button" title={t('captions.highlightFollow')} aria-pressed={auto.active} onClick={auto.onPick}
          className={`${cell} text-[9px] font-bold leading-none ${auto.active ? 'border-accent ring-accent/40 ring-1' : 'border-line hover:border-accent'}`}
          style={{ background: auto.color, color: '#111' }}>A</button>
      )}
      {none && (
        <button type="button" title={t('captions.noPlate')} aria-pressed={none.active} onClick={none.onPick}
          className={`${cell} ${none.active ? 'border-accent ring-accent/40 ring-1' : 'border-line hover:border-accent'}`} style={NO_COLOR_CHECKER} />
      )}
      {swatches.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-pressed={value?.toLowerCase() === c.toLowerCase()}
          onClick={() => onPick(c)}
          className={`${cell} ${value?.toLowerCase() === c.toLowerCase() ? 'border-accent ring-accent/40 ring-1' : 'border-line hover:border-accent'}`}
          style={{ background: c }}
        />
      ))}
      <label title={t('captions.customColor')} className={`${cell} border-line hover:border-accent relative cursor-pointer overflow-hidden`}>
        <span className="absolute inset-0" style={{ background: 'conic-gradient(#f66,#fd4,#6f6,#4df,#66f,#f6f,#f66)' }} />
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value ?? current) ? (value ?? current) : '#ffffff'}
          onChange={(e) => onPick(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
