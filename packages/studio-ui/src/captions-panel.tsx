'use client';

/**
 * Captions panel (a tool panel docked in the material bar, entered via the "Captions" button).
 * Layout (per user, no tabs): a collapsible STYLES section on top (~1/2 height; the original preset
 * wall + bilingual setup, full height when no transcript), and the editable caption LINE LIST below
 * as the main body (no auto-collapse — the user folds it manually).
 * Line editing: click a line = seek the video to its spot + edit IN PLACE on the same node
 * (contentEditable; background-only editing state — no border, no size change, zero jitter). Edits
 * write back to the TRANSCRIPT (single source of truth: captions re-lay, agents' read_script and the
 * script panel all see the fix; timing untouched, word timing redistributed proportionally). With
 * bilingual on, each row shows the translation line + a per-line retranslate button; translations
 * only change when the user asks (the retranslate button / a full re-translate) — never automatically.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Bold, Check, ChevronDown, Languages, Loader2 } from 'lucide-react';
import { Switch } from '@pireel/ui/switch';
import { t } from './i18n';
import {
  type CaptionPreset,
  type CaptionStyle,
  type Composition,
  BASE_CAPTION_FONT_PX,
  CAPTION_PRESETS,
  getCaptionPreset,
  isCaptionsOn,
  resolveCaptionStyle,
} from '@pireel/studio-engine/composition';

/** One editable caption line = one DISPLAY CUE (derived by displayCues in edited-timeline order across
 *  all sources — exactly what renders on the video, one row per on-screen line). */
export interface CaptionLineRow {
  /** `main:<seg>:<w0>` or `<src>:<seg>:<w0>` — stable identity for editing/busy state. */
  key: string;
  /** null = main narration; otherwise the inserted clip's src. */
  src: string | null;
  /** Sentence index within its source's transcript. */
  index: number;
  /** Word range within the source sentence this cue covers (edit/translation write-back key). */
  w0: number;
  w1: number;
  text: string;
  /** Bilingual second line (this cue's translation), when present. */
  sub?: string;
  /** Edited-timeline seconds (for the timecode + seek). */
  editedStart: number;
  /** Cue duration (seek nudges inside by min(0.3, dur/2)). */
  dur?: number;
}

const SECTIONS: { mode: CaptionPreset['mode']; title: string; desc: string }[] = [
  { mode: 'line', title: 'captions.lineByLine', desc: 'captions.linesAppearOneTime' },
  { mode: 'emphasis', title: 'captions.wordEmphasis', desc: 'captions.fullLineStaysEach' },
];

/** Injection surface for the bilingual translation area (only the hosted shell has translation; the OSS shell passes nothing = whole area hidden, BYO agent translates itself). */
export interface CaptionTranslationControl {
  /** Sentences already translated / total transcribed sentences (across all sources). */
  done: number;
  total: number;
  busy: boolean;
  /** Currently selected target language (chip active state; also used to auto-translate newly inserted segments). */
  lang?: string;
  onTranslate: (targetLanguage: string) => void;
  onClear: () => void;
}

const TRANSLATION_LANGS = ['中文', 'English', '日本語', '한국어'];
/** Compact button label for the translate dropdown (full names stay in the menu + the translate prompt). */
const LANG_ABBR: Record<string, string> = { 中文: 'zh', English: 'en', 日本語: 'ja', 한국어: 'ko' };

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Per-line style controls (main / translation line): resolved current style + patch callbacks.
 *  Patches with an explicit `undefined` clear that override (backward compatible — overrides are additive optional fields). */
export interface CaptionStyleCtl {
  main: CaptionStyle;
  sub: CaptionStyle;
  /** A translation target language is active — only then does the translation-line row show (per user). */
  bilingualOn: boolean;
  onMainPatch: (patch: { scale?: number; color?: string | undefined; bg?: string | null | undefined; bold?: boolean | undefined }) => void;
  onSubPatch: (patch: { preset?: string | undefined; scale?: number; color?: string | undefined; bg?: string | null | undefined; bold?: boolean | undefined; lang?: string | undefined }) => void;
}

export function CaptionsPanel({
  comp,
  onPickPreset,
  onRemove,
  styleCtl,
  translation,
  generating,
  rows,
  activeKey,
  onEditLine,
  onEditSubLine,
  onSeekTo,
  onRetranslateLine,
  lineBusyKey,
  onExtract,
}: {
  comp: Composition;
  /** Click a style card: globally swap the preset for all sentence-level captions (if none exist yet, lays a layer from the voiceover script). */
  onPickPreset: (presetId: string) => void;
  /** Remove the whole sentence-level caption layer + clear global style. */
  onRemove: () => void;
  /** Per-line (main / translation) style state + patch callbacks. */
  styleCtl: CaptionStyleCtl;
  /** Bilingual translation control (hidden when omitted). */
  translation?: CaptionTranslationControl;
  /** Captions generating (ASR/re-lay): mask the whole panel to prevent double-clicking style cards. */
  generating?: boolean;
  /** Editable caption lines in edited-timeline order (empty = no transcript yet). */
  rows?: CaptionLineRow[];
  /** Row under the playhead (highlight + auto-scroll target). */
  activeKey?: string | null;
  /** Write an edited line back to the transcript (timing untouched). phase: 'live' = debounced
   *  keystroke (canvas updates in real time, no retranslate yet) · 'commit' = blur/Enter ·
   *  'revert' = Esc restored the original text. */
  onEditLine?: (row: CaptionLineRow, text: string, phase?: 'live' | 'commit' | 'revert') => void;
  /** Manually edit a cue's translation (bilingual second row); null clears it. Same phases as onEditLine. */
  onEditSubLine?: (row: CaptionLineRow, text: string | null, phase?: 'live' | 'commit' | 'revert') => void;
  /** Click a line: move the playhead to it. */
  onSeekTo?: (sec: number) => void;
  /** Retranslate ONE line (bilingual on). */
  onRetranslateLine?: (row: CaptionLineRow) => void;
  /** Row key currently retranslating (spinner on that row's button). */
  lineBusyKey?: string | null;
  /** No transcript yet: the empty state offers a direct "extract captions" button (runs ASR in place). */
  onExtract?: () => void;
}) {
  const hasCaptions = isCaptionsOn(comp);
  const lines = rows ?? [];
  // No tabs (per user): styles sit on top as a collapsible section (~1/2 when lines exist, full height
  // when there is no transcript yet); the line list below is the main body. Collapse is manual only.
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingPart, setEditingPart] = useState<'text' | 'sub'>('text');
  const editCancelRef = useRef(false);
  const caretPointRef = useRef<{ x: number; y: number } | null>(null);
  /** Text at edit start: rendered as the React children while editing (constant vdom = React never
   *  rewrites the contentEditable DOM mid-typing, caret survives live re-renders), and the Esc target. */
  const frozenTextRef = useRef('');
  const listRef = useRef<HTMLDivElement | null>(null);
  // Follow the playhead: keep the active row in view (unless the user is editing)
  useEffect(() => {
    if (!activeKey || editingKey) return;
    listRef.current?.querySelector(`[data-line="${CSS.escape(activeKey)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeKey, editingKey]);
  // Entering edit: focus the (now contentEditable) same node and put the caret where the user clicked —
  // the node doesn't swap and the box doesn't change, so there is zero jitter.
  useEffect(() => {
    if (!editingKey) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-line="${CSS.escape(editingKey)}"] [data-edit-${editingPart === 'sub' ? 'sub' : 'text'}]`,
    );
    if (!el) return;
    el.focus();
    const pt = caretPointRef.current;
    caretPointRef.current = null;
    const doc = document as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null };
    const range = pt && doc.caretRangeFromPoint ? doc.caretRangeFromPoint(pt.x, pt.y) : null;
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      if (range) sel.addRange(range);
      else {
        const r = document.createRange();
        r.selectNodeContents(el);
        r.collapse(false);
        sel.addRange(r);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingKey, editingPart]);
  /** Live path: every keystroke goes straight into the real pipeline (transcript → caption re-lay →
   *  preview) — the canvas caption follows the typing with no debounce (user-locked; the frozen-vdom
   *  editing node keeps the caret safe under per-keystroke re-renders). */
  const scheduleLive = (row: CaptionLineRow, el: HTMLElement, part: 'text' | 'sub') => {
    const next = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (part === 'sub') onEditSubLine?.(row, next || null, 'live');
    else if (next) onEditLine?.(row, next, 'live');
  };
  const commit = (row: CaptionLineRow, el: HTMLElement, part: 'text' | 'sub') => {
    setEditingKey(null);
    const frozen = frozenTextRef.current;
    if (editCancelRef.current) {
      editCancelRef.current = false;
      el.textContent = frozen;
      if (part === 'sub') onEditSubLine?.(row, frozen || null, 'revert');
      else onEditLine?.(row, frozen, 'revert');
      return;
    }
    const next = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (part === 'sub') {
      onEditSubLine?.(row, next || null, 'commit'); // cleared = remove this cue's translation
      return;
    }
    if (!next) {
      el.textContent = frozen; // empty source: restore
      onEditLine?.(row, frozen, 'revert');
      return;
    }
    onEditLine?.(row, next, 'commit');
  };
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      {generating && (
        <div className="bg-bg/70 absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]">
          <Loader2 size={18} className="text-accent animate-spin" />
          <span className="text-ink-2 text-[12px]">{t('captions.generatingCaptions')}</span>
        </div>
      )}
      {/* Style rows laid flat at the top (no section header) — the line list below is the panel body */}
      <div className="border-line flex shrink-0 flex-col border-b">
        <div className="px-2.5 pb-2 pt-2.5">
            {/* Compact per-line style rows (preset picker + size + text color + backdrop as on-demand popovers)
                — the 18 preset cards no longer live inline, the line list below gets the panel back. */}
            <StyleRow
              label={t('captions.mainLine')}
              style={styleCtl.main}
              active={hasCaptions}
              onPreset={(id) => id && onPickPreset(id)}
              onPatch={styleCtl.onMainPatch}
              leading={
                <MiniSwitch
                  on={hasCaptions}
                  title={hasCaptions ? t('captions.removeAllCaptionsUndoable') : t('captions.enableCaptions')}
                  onChange={(v) => (v ? onPickPreset(styleCtl.main.preset) : onRemove())}
                />
              }
            />
            {/* Translation row (right under the main line): language dropdown first, then the same
                style controls once a language is active. Replaces the old bottom "bilingual" strip. */}
            {(translation || styleCtl.bilingualOn) && (
              <StyleRow
                label={t('captions.translateRow')}
                style={styleCtl.sub}
                active={hasCaptions}
                isSub
                styleHidden={!styleCtl.bilingualOn}
                leading={
                  translation ? (
                    <LangPick translation={translation} onOff={() => styleCtl.onSubPatch({ lang: undefined })} />
                  ) : undefined
                }
                onPreset={(id) => id && styleCtl.onSubPatch({ preset: id, color: undefined, bg: undefined })}
                onPatch={styleCtl.onSubPatch}
              />
            )}
        </div>
      </div>
      {/* Caption lines: the main body. Click a line = seek the video there + edit in place (background-only
          editing state on the SAME node — no border, no size change, zero jitter) + collapse the styles section. */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
        {lines.length === 0 && (
          <div className="flex flex-col items-center gap-2.5 px-3 py-8 text-center">
            <div className="text-ink-4 text-[11.5px]">{t('captions.noCaptionsYetExtract')}</div>
            {onExtract && (
              <button
                type="button"
                onClick={onExtract}
                className="bg-ink text-bg rounded-md px-3 py-1.5 text-[12px] font-medium transition hover:opacity-90"
              >
                {t('captions.extractCaptions')}
              </button>
            )}
          </div>
        )}
        {lines.map((row) => {
          const active = row.key === activeKey;
          const editing = row.key === editingKey && editingPart === 'text';
          const editingSub = row.key === editingKey && editingPart === 'sub';
          return (
            <div
              key={row.key}
              data-line={row.key}
              className={`group flex items-start gap-2 px-3 py-1.5 ${active && !editing ? 'bg-accent/8' : ''}`}
            >
              <button
                type="button"
                onClick={() => onSeekTo?.(row.editedStart + Math.min(0.3, (row.dur ?? 0.6) / 2))}
                title={t('captions.jumpLine')}
                className={`mt-[5px] shrink-0 font-mono text-[10px] tabular-nums ${active ? 'text-accent font-semibold' : 'text-ink-4 hover:text-ink'}`}
              >
                {fmtTime(row.editedStart)}
              </button>
              <div className="min-w-0 flex-1">
                <div
                  data-edit-text
                  contentEditable={editing}
                  suppressContentEditableWarning
                  spellCheck={false}
                  onMouseDown={(e) => {
                    if (!editing) caretPointRef.current = { x: e.clientX, y: e.clientY };
                  }}
                  onClick={() => {
                    if (editing || !onEditLine) return;
                    // Seek INTO the sentence (not its exact boundary): at startSec the enter animation is at
                    // frame 0 (opacity 0), so a paused preview looked caption-less after editing (user hit this)
                    onSeekTo?.(row.editedStart + Math.min(0.3, (row.dur ?? 0.6) / 2));
                    frozenTextRef.current = row.text;
                    setEditingPart('text');
                    setEditingKey(row.key);
                  }}
                  onInput={(e) => editing && scheduleLive(row, e.currentTarget, 'text')}
                  onBlur={(e) => editing && commit(row, e.currentTarget, 'text')}
                  onKeyDown={(e) => {
                    if (!editing) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                    if (e.key === 'Escape') {
                      editCancelRef.current = true;
                      e.currentTarget.blur();
                    }
                  }}
                  className={`text-ink -mx-1 whitespace-pre-wrap rounded px-1 py-0.5 text-[12px] leading-snug outline-none ${
                    editing ? 'bg-accent/12' : onEditLine ? 'hover:bg-panel-2/70 cursor-text' : ''
                  }`}
                >
                  {editing ? frozenTextRef.current : row.text}
                </div>
                {translation?.lang && (
                  <div
                    data-edit-sub
                    contentEditable={editingSub}
                    suppressContentEditableWarning
                    spellCheck={false}
                    title={onEditSubLine && !editingSub ? t('captions.clickEditTranslation') : undefined}
                    onMouseDown={(e) => {
                      if (!editingSub) caretPointRef.current = { x: e.clientX, y: e.clientY };
                    }}
                    onClick={() => {
                      if (editingSub || !onEditSubLine) return;
                      // Same seek-into-the-cue as the main line: clicking the translation locates the video too
                      onSeekTo?.(row.editedStart + Math.min(0.3, (row.dur ?? 0.6) / 2));
                      frozenTextRef.current = row.sub ?? '';
                      setEditingPart('sub');
                      setEditingKey(row.key);
                    }}
                    onInput={(e) => editingSub && scheduleLive(row, e.currentTarget, 'sub')}
                    onBlur={(e) => editingSub && commit(row, e.currentTarget, 'sub')}
                    onKeyDown={(e) => {
                      if (!editingSub) return;
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                      if (e.key === 'Escape') {
                        editCancelRef.current = true;
                        e.currentTarget.blur();
                      }
                    }}
                    className={`-mx-1 mt-0.5 rounded px-1 py-0.5 text-[11px] leading-snug outline-none ${
                      editingSub
                        ? 'bg-accent/12 text-ink-3'
                        : row.sub
                          ? `text-ink-3 ${onEditSubLine ? 'hover:bg-panel-2/70 cursor-text' : ''}`
                          : `text-ink-4 italic ${onEditSubLine ? 'hover:bg-panel-2/70 cursor-text' : ''}`
                    }`}
                  >
                    {editingSub ? frozenTextRef.current : (row.sub ?? t('captions.notTranslated'))}
                  </div>
                )}
              </div>
              {translation?.lang && onRetranslateLine && (
                <button
                  type="button"
                  disabled={lineBusyKey === row.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetranslateLine(row);
                  }}
                  title={t('captions.retranslateLine')}
                  className="text-ink-4 hover:text-accent mt-[4px] shrink-0 opacity-0 transition group-hover:opacity-100 disabled:opacity-100"
                >
                  {lineBusyKey === row.key ? <Loader2 size={12} className="text-accent animate-spin" /> : <Languages size={12} />}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TEXT_SWATCHES = ['#FFFFFF', '#101114', '#FFD24D', '#FF4D4D', '#3F6DF6', '#7CF29C'];
const BG_SWATCHES = ['#101114', '#FFFFFF', '#FF2E4D', '#FFD24D', '#3F6DF6'];

/** One compact style row (main line / translation line): preset picker + font size + text color + backdrop.
 *  All pickers are on-demand popovers — nothing takes permanent panel space. */
function StyleRow({ label, style, active, isSub, leading, styleHidden, onPreset, onPatch }: {
  label: string;
  /** Resolved current style for this line. */
  style: CaptionStyle;
  /** Captions laid on the canvas (main row shows "pick a style" until then). */
  active: boolean;
  /** Translation-line row (its preset name always shows; the picker has no follow-main entry). */
  isSub?: boolean;
  /** Rendered between the label and the style controls (the translation row's language dropdown). */
  leading?: React.ReactNode;
  /** Hide the style controls (translation row before a language is active — only label + leading show). */
  styleHidden?: boolean;
  /** Preset picked (null = follow main; only offered on the translation row). */
  onPreset: (id: string | null) => void;
  onPatch: (patch: { scale?: number; color?: string | undefined; bg?: string | null | undefined; bold?: boolean | undefined }) => void;
}) {
  const [pop, setPop] = useState<null | 'preset' | 'size' | 'color' | 'bg'>(null);
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
  // Bold is purely the user's toggle — everything is regular by default (presets carry no weight)
  const effBold = style.bold === true;
  // Size options in real px (dropdown replaces the A± stepper): mapped back to the preset-relative scale on pick.
  const sizeOpts = [16, 20, 24, 28, 32, 36, 40, 44, 48, 56, 64, 72, 80, 96].filter((px) => {
    const k = px / BASE_CAPTION_FONT_PX;
    return k >= 0.4 && k <= 4;
  });
  return (
    <div ref={rootRef} className="relative mb-1.5 flex items-center gap-1.5">
      <span className="text-ink-3 w-14 shrink-0 truncate text-[11px]">{label}</span>
      {leading}
      {!styleHidden && (
      <>
      <button
        type="button"
        onClick={() => setPop(pop === 'preset' ? null : 'preset')}
        title={t('captions.pickStyle')}
        className={`hover:border-accent flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 text-left ${pop === 'preset' ? 'border-accent' : 'border-line'}`}
      >
        <span className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-white/20 text-center" style={{ background: effBg ?? '#2b2b2e' }}>
          <span className="block text-[9px] font-bold leading-[13px]" style={{ color: effColor }}>A</span>
        </span>
        <span className="text-ink-2 min-w-0 flex-1 truncate text-[11px]">
          {active || isSub ? t(preset.name) : t('captions.pickStyle')}
        </span>
        <ChevronDown size={11} className="text-ink-4 shrink-0" />
      </button>
      {/* 字号按钮在行中段:菜单锚它自己(嵌套 relative),不能挂行容器的 right-0——那会贴到行尾颜色按钮底下 */}
      <div className="relative shrink-0">
        <button
          type="button"
          title={t('captions.fontSize')}
          onClick={() => setPop(pop === 'size' ? null : 'size')}
          className={`hover:border-accent flex h-7 shrink-0 items-center gap-0.5 rounded-md border px-1.5 ${pop === 'size' ? 'border-accent' : 'border-line'}`}
        >
          <span className="text-ink-3 font-mono text-[10.5px] tabular-nums">{fs}</span>
          <ChevronDown size={11} className="text-ink-4" />
        </button>
        {pop === 'size' && (
          <div className="border-line bg-panel absolute left-1/2 top-full z-30 mt-1 max-h-56 w-20 -translate-x-1/2 overflow-auto rounded-lg border p-1 shadow-xl">
            {sizeOpts.map((px) => (
              <button
                key={px}
                type="button"
                onClick={() => { setPop(null); onPatch({ scale: Math.round((px / BASE_CAPTION_FONT_PX) * 100) / 100 }); }}
                className={`flex w-full items-center justify-center gap-1 rounded px-2 py-1 font-mono text-[11px] tabular-nums ${px === fs ? 'text-ink bg-panel-2/60' : 'text-ink-3 hover:bg-panel-2/60'}`}
              >
                {px} {px === fs && <Check size={10} className="text-accent" />}
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
      <button
        type="button"
        title={t('captions.textColor')}
        onClick={() => setPop(pop === 'color' ? null : 'color')}
        className={`hover:border-accent h-7 w-7 shrink-0 rounded-md border p-1 ${pop === 'color' ? 'border-accent' : 'border-line'}`}
      >
        <span className="block h-full w-full rounded-sm border border-white/15" style={{ background: effColor }} />
      </button>
      <button
        type="button"
        title={t('captions.plate')}
        onClick={() => setPop(pop === 'bg' ? null : 'bg')}
        className={`hover:border-accent h-7 w-7 shrink-0 rounded-md border p-1 ${pop === 'bg' ? 'border-accent' : 'border-line'}`}
      >
        <span className="block h-full w-full rounded-sm border border-white/15" style={effBg ? { background: effBg } : NO_COLOR_CHECKER} />
      </button>
      {pop === 'preset' && (
        <PresetPop current={style.preset} onPick={(id) => { setPop(null); onPreset(id); }} />
      )}
      {pop === 'color' && (
        <SwatchPop
          title={t('captions.textColor')}
          swatches={TEXT_SWATCHES}
          value={style.color}
          onPick={(c) => { setPop(null); onPatch({ color: c }); }}
        />
      )}
      {pop === 'bg' && (
        <SwatchPop
          title={t('captions.plate')}
          swatches={BG_SWATCHES}
          value={style.bg === null ? undefined : style.bg}
          allowNone
          noneActive={style.bg === null}
          onNone={() => { setPop(null); onPatch({ bg: null }); }}
          onPick={(c) => { setPop(null); onPatch({ bg: c }); }}
        />
      )}
      </>
      )}
    </div>
  );
}

/** Tiny on/off switch (captions layer toggle at the front of the main row — mirrors the translation row's language dropdown slot, keeping the two rows aligned). */
function MiniSwitch({ on, title, onChange }: { on: boolean; title: string; onChange: (v: boolean) => void }) {
  return (
    <Switch
      checked={on}
      title={title}
      onCheckedChange={onChange}
      className="mx-px"
    />
  );
}

/** Language dropdown for the translation row: pick a target language to translate the transcript
 *  (same executor as before), or "off" to clear translations and hide the second line. */
function LangPick({ translation, onOff }: { translation: CaptionTranslationControl; onOff: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  // State-first: captionStyle.sub.lang is the single authority — off = the translation line is hidden
  // (transcript translations stay dormant), on = shown in that language. No content sniffing.
  const active = translation.lang ?? null;
  return (
    <span ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        disabled={translation.busy || translation.total === 0}
        title={translation.total === 0 ? t('captions.transcribeFirst') : translation.done > 0 ? t('captions.linesDone', { done: translation.done, total: translation.total }) : t('captions.notAdded')}
        onClick={() => setOpen((o) => !o)}
        className={`hover:border-accent flex h-7 w-[30px] items-center justify-center gap-0.5 rounded-md border px-0 text-[11px] disabled:opacity-50 ${open ? 'border-accent' : 'border-line'} ${active ? 'text-ink' : 'text-ink-3'}`}
      >
        {translation.busy ? (
          <Loader2 size={11} className="text-accent animate-spin" />
        ) : (
          <>
            <span className="truncate font-mono text-[10.5px]">{active ? (LANG_ABBR[active] ?? active) : '—'}</span>
            <ChevronDown size={10} className="text-ink-4 shrink-0" />
          </>
        )}
      </button>
      {open && (
        <div className="border-line bg-panel absolute left-0 top-full z-30 mt-1 w-36 rounded-lg border p-1 shadow-xl">
          <button
            type="button"
            onClick={() => { setOpen(false); if (active) onOff(); }}
            className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11.5px] ${!active ? 'text-ink bg-panel-2/60' : 'text-ink-3 hover:bg-panel-2/60'}`}
          >
            {t('captions.off')}
            {!active && <Check size={11} className="text-accent ml-auto" />}
          </button>
          {TRANSLATION_LANGS.map((lang) => (
            <button
              key={lang}
              type="button"
              title={t('captions.translateTranscriptIntoLang', { lang })}
              onClick={() => { setOpen(false); if (lang !== active) translation.onTranslate(lang); }}
              className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11.5px] ${active === lang ? 'text-ink bg-panel-2/60' : 'text-ink-3 hover:bg-panel-2/60'}`}
            >
              <span className="text-ink-4 w-5 font-mono text-[10.5px]">{LANG_ABBR[lang]}</span> {lang}
              {active === lang && <Check size={11} className="text-accent ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/** Preset picker popover: the 18 cards live here on demand (2-column grid), line presets first. */
function PresetPop({ current, onPick }: { current: string; onPick: (id: string | null) => void }) {
  return (
    <div className="border-line bg-panel absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-lg border p-2 shadow-xl">
      {SECTIONS.map((sec) => (
        <div key={sec.mode} className="mb-2">
          <div className="text-ink-4 mb-1 text-[10px]">{t(sec.title)}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {CAPTION_PRESETS.filter((p) => p.mode === sec.mode).map((p) => (
              <PresetCard key={p.id} preset={p} active={p.id === current} onPick={(id) => onPick(id)} />
            ))}
          </div>
        </div>
      ))}
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

/** Color picker popover: preset-default chip, optional "no plate", fixed swatches, free custom color. */
function SwatchPop({ title, swatches, value, allowNone, noneActive, onNone, onPick }: {
  title: string;
  swatches: string[];
  /** Current override value (undefined = following the preset). */
  value?: string | undefined;
  allowNone?: boolean;
  noneActive?: boolean;
  onNone?: () => void;
  onPick: (color: string) => void;
}) {
  return (
    <div className="border-line bg-panel absolute right-0 top-full z-30 mt-1 w-60 rounded-lg border p-2 shadow-xl">
      <div className="text-ink-4 mb-1.5 text-[10px]">{title}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {allowNone && (
          <button
            type="button"
            onClick={onNone}
            className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] ${noneActive ? 'border-accent text-ink bg-accent/10' : 'border-line text-ink-3 hover:border-accent'}`}
          >
            <span className="border-line h-3.5 w-3.5 rounded-sm border" style={NO_COLOR_CHECKER} /> {t('captions.noPlate')}
          </button>
        )}
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            onClick={() => onPick(c)}
            className={`h-6 w-6 rounded-md border ${value?.toLowerCase() === c.toLowerCase() ? 'border-accent ring-accent/40 ring-1' : 'border-line hover:border-accent'}`}
            style={{ background: c }}
          />
        ))}
        <label title={t('captions.customColor')} className="border-line hover:border-accent relative h-6 w-6 cursor-pointer overflow-hidden rounded-md border">
          <span className="absolute inset-0" style={{ background: 'conic-gradient(#f66,#fd4,#6f6,#4df,#66f,#f6f,#f66)' }} />
          <input
            type="color"
            value={value ?? '#ffffff'}
            onChange={(e) => onPick(e.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
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
        <span className="bg-accent text-accent-foreground absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium">
          <Check size={10} /> {t('captions.inUse')}
        </span>
      ) : (
        <span className="bg-accent text-accent-foreground absolute right-1.5 top-1.5 hidden rounded px-1.5 py-0.5 text-[10px] font-medium group-hover:block">
          {t('captions.use')}
        </span>
      )}
    </button>
  );
}

/** Lay out the sample text in the preset's frozen form (pure CSS): emphasis presets highlight the middle word (recolor/underline/highlight box), line presets lay it flat. */
function PresetSample({ p }: { p: CaptionPreset }) {
  // Demo sample: three segments (the middle one gets the emphasis treatment); localized via the catalogs like everything else
  const sample = [t('captions.samplePre'), t('captions.sampleWord'), t('captions.samplePost')];
  const fontFamily = p.font === 'serif' ? "'Noto Serif SC','Songti SC',serif" : p.font === 'mono' ? "'IBM Plex Mono',ui-monospace,monospace" : undefined;
  const base: CSSProperties = {
    color: p.text,
    fontWeight: 600, // card preview: slight bump for legibility at tiny size
    fontFamily,
    fontStyle: p.italic ? 'italic' : undefined,
    fontSize: Math.round(BASE_CAPTION_FONT_PX * 0.24),
    lineHeight: 1.2,
    textShadow: !p.bg ? '0 1px 6px rgba(0,0,0,0.85)' : undefined,
    whiteSpace: 'nowrap',
  };
  const pill: CSSProperties | undefined = p.bg
    ? { background: p.bg, padding: '4px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'baseline' }
    : { display: 'inline-flex', alignItems: 'baseline' };
  // Frozen form of the emphasized word (the middle caption)
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
