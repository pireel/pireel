import { useEffect, useRef, useState } from 'react';
import {
  DISPLAY_TEXT_ANIMATION_IDS,
  DISPLAY_TEXT_FONT_IDS,
  DISPLAY_TEXT_PRESETS,
  displayTextLocalFontFamily,
  displayTextPreset,
  isDisplayTextFontId,
  localDisplayTextFontId,
  type Block,
  type DisplayTextAnimationId,
  type DisplayTextFontId,
  type DisplayTextPresetId,
} from '@pireel/studio-engine/composition';
import { AlignCenter, AlignLeft, AlignRight, Check, ChevronDown, Plus, Search, Type } from 'lucide-react';
import { t } from './i18n';
import {
  cachedLocalFontFamilies,
  loadLocalFontFamilies,
  supportsLocalFontAccess,
  type LocalFontFamilyOption,
} from './local-font-access';

export type DisplayTextPatch = Partial<{
  text: string;
  preset: DisplayTextPresetId;
  animation: DisplayTextAnimationId;
  color: string;
  accentColor: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: DisplayTextFontId;
  align: 'left' | 'center' | 'right';
}>;

interface DisplayTextPanelProps {
  block: Block | null;
  onAdd: (preset: DisplayTextPresetId) => void;
  onPatch: (patch: DisplayTextPatch) => void;
  onPreset: (preset: DisplayTextPresetId, animation: DisplayTextAnimationId) => void;
}

const PREVIEW_STYLE: Record<DisplayTextPresetId, string> = {
  clean: 'font-sans font-extrabold tracking-[-0.04em] text-white',
  editorial: 'font-serif font-semibold italic tracking-[-0.03em] text-white',
  headline: 'font-sans font-black uppercase tracking-[-0.07em] text-white',
  outline: 'font-sans font-black tracking-[-0.05em] text-transparent [-webkit-text-stroke:1px_white]',
  marker: 'bg-[#FFD24D] px-1 font-sans font-black tracking-[-0.04em] text-[#101114]',
  label: 'bg-[#FF6B5F] px-1.5 py-0.5 font-sans font-extrabold uppercase tracking-[0.04em] text-white shadow-[3px_3px_0_rgba(0,0,0,0.3)]',
};

const TEXT_COLORS = ['#FFFFFF', '#F7F1E8', '#FFE27A', '#FF9C91', '#91C8FF', '#A7F3D0'];
const ACCENT_COLORS = ['#FFFFFF', '#FFD24D', '#FF6B5F', '#4D7CFE', '#37D6B0', '#B89CFF'];
const COMMON_FONT_FAMILIES = [
  'PingFang SC',
  'Microsoft YaHei',
  'Noto Sans SC',
  'Source Han Sans SC',
  'Songti SC',
  'SimSun',
  'Noto Serif SC',
  'Source Han Serif SC',
  'Kaiti SC',
  'KaiTi',
  'Avenir Next',
  'Helvetica Neue',
  'Futura',
  'DIN Alternate',
  'Georgia',
  'Impact',
] as const;

function PresetGrid({
  active,
  onChoose,
}: {
  active?: DisplayTextPresetId;
  onChoose: (preset: DisplayTextPresetId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {DISPLAY_TEXT_PRESETS.map((preset) => {
        const selected = preset.id === active;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onChoose(preset.id)}
            aria-pressed={selected}
            className={`group relative min-h-[72px] overflow-hidden rounded-md px-2.5 py-2 text-left transition-all ${
              selected
                ? 'bg-panel-2 ring-accent/60 shadow-sm ring-1'
                : 'bg-canvas/65 hover:bg-panel-2 hover:shadow-sm'
            }`}
          >
            <div className="flex h-8 items-center justify-center overflow-hidden rounded-sm bg-[#202126]">
              <span className={`text-[17px] leading-none ${PREVIEW_STYLE[preset.id]}`}>
                {t(`displayText.preview.${preset.id}`)}
              </span>
            </div>
            <div className={`mt-2 text-[11px] leading-none ${selected ? 'text-ink' : 'text-ink-3'}`}>
              {t(`displayText.preset.${preset.id}`)}
            </div>
            {selected && <span className="bg-accent absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full" />}
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-ink-4 mb-2 text-[10px] font-medium tracking-[0.12em] uppercase">{children}</div>;
}

function ColorSwatches({
  label,
  colors,
  value,
  onPick,
  onCustomChange,
  onCustomCommit,
}: {
  label: string;
  colors: string[];
  value: string;
  onPick: (color: string) => void;
  onCustomChange: (color: string) => void;
  onCustomCommit: () => void;
}) {
  return (
    <div>
      <div className="text-ink-3 mb-2 text-[11px]">{label}</div>
      <div className="flex flex-wrap gap-2">
        {colors.map((color) => {
          const selected = value.toLowerCase() === color.toLowerCase();
          return (
            <button
              key={color}
              type="button"
              title={color}
              aria-label={`${label} ${color}`}
              aria-pressed={selected}
              onClick={() => onPick(color)}
              className={`h-7 w-7 rounded-md shadow-[inset_0_0_0_1px_rgba(127,127,127,0.2)] transition-transform hover:scale-110 ${selected ? 'ring-accent ring-2 ring-offset-2 ring-offset-panel' : ''}`}
              style={{ backgroundColor: color }}
            />
          );
        })}
        <label
          title={t('displayText.customColor')}
          className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-md bg-[conic-gradient(#ff6b5f,#ffd24d,#37d6b0,#4d7cfe,#b89cff,#ff6b5f)] shadow-[inset_0_0_0_1px_rgba(127,127,127,0.2)] transition-transform hover:scale-110"
        >
          <input
            type="color"
            value={value}
            onChange={(event) => onCustomChange(event.target.value)}
            onBlur={onCustomCommit}
            aria-label={t('displayText.customColor')}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </div>
  );
}

function FontPicker({
  value,
  localFonts,
  accessState,
  onChoose,
  onLoadMore,
}: {
  value: DisplayTextFontId;
  localFonts: LocalFontFamilyOption[];
  accessState: 'idle' | 'loading' | 'loaded' | 'denied' | 'unsupported';
  onChoose: (font: DisplayTextFontId) => void;
  onLoadMore: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedFamily = displayTextLocalFontFamily(value);
  const builtin = (DISPLAY_TEXT_FONT_IDS as readonly string[]).includes(value) ? value : null;
  const selectedLabel = builtin ? t(`displayText.font.${builtin}`) : selectedFamily ?? t('displayText.font.preset');
  const commonSet = new Set(COMMON_FONT_FAMILIES.map((family) => family.toLocaleLowerCase()));
  const systemFonts = localFonts.filter((font) => !commonSet.has(font.family.toLocaleLowerCase()));
  const selectedMissing = selectedFamily
    && !COMMON_FONT_FAMILIES.some((family) => family === selectedFamily)
    && !systemFonts.some((font) => font.family === selectedFamily)
    ? [{ family: selectedFamily, faceCount: 0 }, ...systemFonts]
    : systemFonts;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (label: string) => !normalizedQuery || label.toLocaleLowerCase().includes(normalizedQuery);
  const builtins = DISPLAY_TEXT_FONT_IDS.filter((id) => matches(t(`displayText.font.${id}`)));
  const common = COMMON_FONT_FAMILIES.filter(matches);
  const system = selectedMissing.filter((font) => matches(font.family));

  useEffect(() => {
    if (!open) return;
    const scrollFrame = window.requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      window.cancelAnimationFrame(scrollFrame);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const choose = (font: DisplayTextFontId) => {
    onChoose(font);
    setOpen(false);
    setQuery('');
  };

  const fontRow = (id: DisplayTextFontId, label: string, family?: string) => {
    const selected = id === value;
    return (
      <button
        key={id}
        type="button"
        role="option"
        aria-selected={selected}
        onClick={() => choose(id)}
        className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] ${selected ? 'bg-panel-2 text-ink' : 'text-ink-3 hover:bg-panel-2/70 hover:text-ink'}`}
      >
        <span className="min-w-0 flex-1 truncate" style={family ? { fontFamily: `"${family}", sans-serif` } : undefined}>
          {label}
        </span>
        {selected && <Check size={12} className="text-accent shrink-0" />}
      </button>
    );
  };

  return (
    <div ref={rootRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="bg-canvas/70 text-ink hover:bg-panel-2 flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[12px]"
      >
        <span className="text-ink-4 text-[10px]">Aa</span>
        <span className="min-w-0 flex-1 truncate" style={selectedFamily ? { fontFamily: `"${selectedFamily}", sans-serif` } : undefined}>
          {selectedLabel}
        </span>
        <ChevronDown size={12} className={`text-ink-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <div className={open ? 'bg-canvas/55 mt-2 overflow-hidden rounded-lg shadow-md' : 'hidden'}>
        <div className="p-2 pb-1">
          <label className="bg-panel/70 flex h-8 items-center gap-2 rounded-md px-2">
            <Search size={12} className="text-ink-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('displayText.searchFonts')}
              className="text-ink placeholder:text-ink-5 min-w-0 flex-1 bg-transparent text-[11px] outline-none"
            />
          </label>
        </div>

        <div role="listbox" aria-label={t('displayText.fontFamily')} className="max-h-56 overflow-y-auto px-2 pb-2">
          {builtins.length > 0 && (
            <div>
              <div className="text-ink-4 px-2 pb-1 pt-2 text-[9px] tracking-[0.1em] uppercase">{t('displayText.builtInFonts')}</div>
              {builtins.map((id) => fontRow(id, t(`displayText.font.${id}`)))}
            </div>
          )}
          {common.length > 0 && (
            <div>
              <div className="text-ink-4 px-2 pb-1 pt-3 text-[9px] tracking-[0.1em] uppercase">{t('displayText.commonFonts')}</div>
              {common.map((family) => {
                const id = localDisplayTextFontId(family);
                return id ? fontRow(id, family, family) : null;
              })}
            </div>
          )}
          {system.length > 0 && (
            <div>
              <div className="text-ink-4 px-2 pb-1 pt-3 text-[9px] tracking-[0.1em] uppercase">{t('displayText.systemFonts')}</div>
              {system.map((font) => {
                const id = localDisplayTextFontId(font.family);
                return id ? fontRow(id, font.family, font.family) : null;
              })}
            </div>
          )}
          {builtins.length === 0 && common.length === 0 && system.length === 0 && (
            <div className="text-ink-4 px-2 py-6 text-center text-[11px]">{t('displayText.noMatchingFonts')}</div>
          )}
        </div>

        <div className="bg-panel/75 p-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={accessState === 'loading' || accessState === 'unsupported'}
            className="bg-panel-2 text-ink-2 hover:bg-panel hover:text-ink disabled:text-ink-5 flex h-8 w-full items-center justify-center rounded-md px-2 text-[11px] disabled:cursor-not-allowed"
          >
            {accessState === 'loading'
              ? t('displayText.loadingSystemFonts')
              : localFonts.length > 0
                ? t('displayText.reloadSystemFonts')
                : t('displayText.loadMoreFonts')}
          </button>
          {accessState === 'denied' && (
            <p className="text-ink-4 mt-1.5 px-1 text-[10px] leading-4">{t('displayText.fontPermissionDenied')}</p>
          )}
          {accessState === 'unsupported' && (
            <p className="text-ink-4 mt-1.5 px-1 text-[10px] leading-4">{t('displayText.systemFontsUnsupported')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DisplayTextPanel({ block, onAdd, onPatch, onPreset }: DisplayTextPanelProps) {
  const slots = block?.slots ?? {};
  const preset = (typeof slots.preset === 'string' ? slots.preset : 'clean') as DisplayTextPresetId;
  const animation = (typeof slots.animation === 'string'
    ? slots.animation
    : displayTextPreset(preset).defaultAnimation) as DisplayTextAnimationId;
  const usesAccentColor = preset === 'editorial' || preset === 'marker' || preset === 'label'
    || animation === 'highlightPop' || animation === 'highlightBlock';
  const [textDraft, setTextDraft] = useState(String(slots.text ?? ''));
  const [colorDraft, setColorDraft] = useState(typeof slots.color === 'string' ? slots.color : '#FFFFFF');
  const [accentDraft, setAccentDraft] = useState(typeof slots.accentColor === 'string' ? slots.accentColor : '#FFD24D');
  const [fontSizeDraft, setFontSizeDraft] = useState(typeof slots.fontSize === 'number' ? slots.fontSize : 92);
  const [localFonts, setLocalFonts] = useState<LocalFontFamilyOption[]>(cachedLocalFontFamilies);
  const [fontAccessState, setFontAccessState] = useState<'idle' | 'loading' | 'loaded' | 'denied' | 'unsupported'>('idle');

  const selectedFontId = isDisplayTextFontId(slots.fontFamily) ? slots.fontFamily : 'preset';

  const requestLocalFonts = async () => {
    if (!supportsLocalFontAccess()) {
      setFontAccessState('unsupported');
      return;
    }
    setFontAccessState('loading');
    try {
      const fonts = await loadLocalFontFamilies();
      setLocalFonts(fonts);
      setFontAccessState('loaded');
    } catch {
      setFontAccessState('denied');
    }
  };

  useEffect(() => {
    setTextDraft(String(slots.text ?? ''));
    setColorDraft(typeof slots.color === 'string' ? slots.color : '#FFFFFF');
    setAccentDraft(typeof slots.accentColor === 'string' ? slots.accentColor : '#FFD24D');
    setFontSizeDraft(typeof slots.fontSize === 'number' ? slots.fontSize : 92);
  }, [block?.id, slots.text, slots.color, slots.accentColor, slots.fontSize]);

  return (
    <div data-block-selection-keep className="bg-panel flex min-h-0 flex-1 flex-col">
      <div className="border-line flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <Type size={15} className="text-ink-2" />
        <div className="text-ink text-[13px] font-medium">{t('displayText.title')}</div>
        <button
          type="button"
          onClick={() => onAdd('clean')}
          className="text-ink-3 hover:bg-panel-2 hover:text-ink ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
        >
          <Plus size={12} />
          {t('displayText.add')}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!block ? (
          <div>
            <div className="bg-canvas/65 mb-4 rounded-lg p-3">
              <div className="text-ink-2 text-[13px] font-medium">{t('displayText.emptyTitle')}</div>
              <p className="text-ink-4 mt-1 text-[11px] leading-4">{t('displayText.emptyDescription')}</p>
            </div>
            <SectionLabel>{t('displayText.choosePreset')}</SectionLabel>
            <PresetGrid active={undefined} onChoose={onAdd} />
          </div>
        ) : (
          <div className="space-y-5">
            <section>
              <SectionLabel>{t('displayText.content')}</SectionLabel>
              <textarea
                value={textDraft}
                onChange={(event) => setTextDraft(event.target.value)}
                onBlur={() => textDraft !== slots.text && onPatch({ text: textDraft })}
                rows={3}
                className="bg-canvas/70 text-ink placeholder:text-ink-5 focus:ring-ink-4/40 w-full resize-none rounded-md px-2.5 py-2 text-[13px] leading-5 outline-none focus:ring-1"
                placeholder={t('displayText.textPlaceholder')}
              />
            </section>

            <section>
              <SectionLabel>{t('displayText.style')}</SectionLabel>
              <PresetGrid
                active={preset}
                onChoose={(next) => onPreset(next, displayTextPreset(next).defaultAnimation)}
              />
            </section>

            <section>
              <SectionLabel>{t('displayText.animation')}</SectionLabel>
              <select
                value={animation}
                onChange={(event) => onPatch({ animation: event.target.value as DisplayTextAnimationId })}
                className="bg-canvas/70 text-ink focus:ring-ink-4/40 h-8 w-full rounded-md px-2 text-[12px] outline-none focus:ring-1"
              >
                {DISPLAY_TEXT_ANIMATION_IDS.map((id) => (
                  <option key={id} value={id}>{t(`displayText.animation.${id}`)}</option>
                ))}
              </select>
            </section>

            <section>
              <SectionLabel>{t('displayText.typography')}</SectionLabel>
              <div className="bg-canvas/45 grid gap-4 rounded-lg p-3">
                <ColorSwatches
                  label={t('displayText.textColor')}
                  colors={TEXT_COLORS}
                  value={colorDraft}
                  onPick={(color) => { setColorDraft(color); onPatch({ color }); }}
                  onCustomChange={setColorDraft}
                  onCustomCommit={() => colorDraft !== slots.color && onPatch({ color: colorDraft })}
                />
                {usesAccentColor && (
                  <ColorSwatches
                    label={t('displayText.accentColor')}
                    colors={ACCENT_COLORS}
                    value={accentDraft}
                    onPick={(accentColor) => { setAccentDraft(accentColor); onPatch({ accentColor }); }}
                    onCustomChange={setAccentDraft}
                    onCustomCommit={() => accentDraft !== slots.accentColor && onPatch({ accentColor: accentDraft })}
                  />
                )}
              </div>

              <div className="mt-3">
                <span className="text-ink-3 mb-1.5 block text-[11px]">{t('displayText.fontFamily')}</span>
                <FontPicker
                  value={selectedFontId}
                  localFonts={localFonts}
                  accessState={fontAccessState}
                  onChoose={(fontFamily) => onPatch({ fontFamily })}
                  onLoadMore={() => void requestLocalFonts()}
                />
              </div>

              <div className="bg-canvas/55 mt-3 rounded-lg px-2.5 py-2">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-ink-3 text-[11px]">{t('displayText.fontSize')}</span>
                  <span className="text-ink font-mono text-[11px]">{fontSizeDraft}px</span>
                </div>
                <input
                  type="range"
                  min={24}
                  max={180}
                  step={2}
                  value={fontSizeDraft}
                  onChange={(event) => setFontSizeDraft(Number(event.target.value))}
                  onPointerUp={() => fontSizeDraft !== slots.fontSize && onPatch({ fontSize: fontSizeDraft })}
                  onKeyUp={() => fontSizeDraft !== slots.fontSize && onPatch({ fontSize: fontSizeDraft })}
                  className="zoom-range w-full"
                />
              </div>

              <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                <select
                  value={typeof slots.fontWeight === 'number' ? slots.fontWeight : 800}
                  onChange={(event) => onPatch({ fontWeight: Number(event.target.value) })}
                  className="bg-canvas/70 text-ink focus:ring-ink-4/40 h-8 rounded-md px-2 text-[12px] outline-none focus:ring-1"
                  aria-label={t('displayText.fontWeight')}
                >
                  <option value={400}>{t('displayText.weightRegular')}</option>
                  <option value={600}>{t('displayText.weightSemibold')}</option>
                  <option value={800}>{t('displayText.weightBold')}</option>
                  <option value={900}>{t('displayText.weightBlack')}</option>
                </select>
                <div className="bg-canvas/70 flex rounded-md p-0.5">
                  {([
                    ['left', AlignLeft],
                    ['center', AlignCenter],
                    ['right', AlignRight],
                  ] as const).map(([value, Icon]) => {
                    const active = (slots.align ?? 'center') === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => onPatch({ align: value })}
                        aria-label={t(`displayText.align.${value}`)}
                        aria-pressed={active}
                        className={`rounded p-1.5 ${active ? 'bg-panel-2 text-ink' : 'text-ink-4 hover:text-ink'}`}
                      >
                        <Icon size={13} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
