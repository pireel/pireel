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
 * bilingual on, each row shows the translation line + a per-line retranslate button; editing the
 * source auto-retranslates that line.
 */

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Ban, Check, ChevronDown, ChevronRight, Languages, Loader2, Type } from 'lucide-react';
import { t } from './i18n';
import {
  type CaptionPreset,
  type CaptionStyle,
  type Composition,
  CAPTION_PRESETS,
  getCaptionPreset,
  isSentenceCaption,
  resolveCaptionStyle,
} from '@pireel/studio-engine/composition';

/** One editable caption line (assembled by the workbench in edited-timeline order across all sources). */
export interface CaptionLineRow {
  /** `main:<i>` or `<src>:<i>` — stable identity for editing/busy state. */
  key: string;
  /** null = main narration; otherwise the inserted clip's src. */
  src: string | null;
  /** Sentence index within its source's transcript. */
  index: number;
  text: string;
  /** Bilingual second line (translation), when present. */
  sub?: string;
  /** Edited-timeline seconds (for the timecode + seek). */
  editedStart: number;
  /** Visible duration of this sentence within its shot (seek nudges inside by min(0.3, dur/2)). */
  dur?: number;
}

const SECTIONS: { mode: CaptionPreset['mode']; title: string; desc: string }[] = [
  { mode: 'emphasis', title: 'captions.wordEmphasis', desc: 'captions.fullLineStaysEach' },
  { mode: 'line', title: 'captions.lineByLine', desc: 'captions.linesAppearOneTime' },
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

function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Per-line style controls (main / translation line): resolved current style + patch callbacks.
 *  Patches with an explicit `undefined` clear that override (backward compatible — overrides are additive optional fields). */
export interface CaptionStyleCtl {
  main: CaptionStyle;
  sub: CaptionStyle;
  /** Translation line has no preset of its own → its look follows the (overridden) main line. */
  subFollows: boolean;
  /** A translation target language is active — only then does the translation-line row show (per user). */
  bilingualOn: boolean;
  onMainPatch: (patch: { scale?: number; color?: string | undefined; bg?: string | null | undefined }) => void;
  onSubPatch: (patch: { preset?: string | undefined; scale?: number; color?: string | undefined; bg?: string | null | undefined }) => void;
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
  onEditLine?: (src: string | null, index: number, text: string, phase?: 'live' | 'commit' | 'revert') => void;
  /** Manually edit a line's translation (bilingual second row); null clears it. Same phases as onEditLine. */
  onEditSubLine?: (src: string | null, index: number, text: string | null, phase?: 'live' | 'commit' | 'revert') => void;
  /** Click a line: move the playhead to it. */
  onSeekTo?: (sec: number) => void;
  /** Retranslate ONE line (bilingual on). */
  onRetranslateLine?: (src: string | null, index: number) => void;
  /** Row key currently retranslating (spinner on that row's button). */
  lineBusyKey?: string | null;
  /** No transcript yet: the empty state offers a direct "extract captions" button (runs ASR in place). */
  onExtract?: () => void;
}) {
  const current = resolveCaptionStyle(comp).preset;
  const hasCaptions = comp.blocks.some(isSentenceCaption);
  const lines = rows ?? [];
  // No tabs (per user): styles sit on top as a collapsible section (~1/2 when lines exist, full height
  // when there is no transcript yet); the line list below is the main body. Collapse is manual only.
  const [stylesOpen, setStylesOpen] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingPart, setEditingPart] = useState<'text' | 'sub'>('text');
  const editCancelRef = useRef(false);
  const caretPointRef = useRef<{ x: number; y: number } | null>(null);
  /** Text at edit start: rendered as the React children while editing (constant vdom = React never
   *  rewrites the contentEditable DOM mid-typing, caret survives live re-renders), and the Esc target. */
  const frozenTextRef = useRef('');
  const liveTimerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => () => {
    if (liveTimerRef.current != null) window.clearTimeout(liveTimerRef.current);
  }, []);
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
  /** Live path: debounce keystrokes into the real pipeline (transcript → caption re-lay → preview),
   *  so the canvas caption follows the typing in near real time. */
  const scheduleLive = (row: CaptionLineRow, el: HTMLElement, part: 'text' | 'sub') => {
    if (liveTimerRef.current != null) window.clearTimeout(liveTimerRef.current);
    liveTimerRef.current = window.setTimeout(() => {
      liveTimerRef.current = null;
      const next = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (part === 'sub') onEditSubLine?.(row.src, row.index, next || null, 'live');
      else if (next) onEditLine?.(row.src, row.index, next, 'live');
    }, 350);
  };
  const commit = (row: CaptionLineRow, el: HTMLElement, part: 'text' | 'sub') => {
    setEditingKey(null);
    if (liveTimerRef.current != null) {
      window.clearTimeout(liveTimerRef.current);
      liveTimerRef.current = null;
    }
    const frozen = frozenTextRef.current;
    if (editCancelRef.current) {
      editCancelRef.current = false;
      el.textContent = frozen;
      if (part === 'sub') onEditSubLine?.(row.src, row.index, frozen || null, 'revert');
      else onEditLine?.(row.src, row.index, frozen, 'revert');
      return;
    }
    const next = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (part === 'sub') {
      onEditSubLine?.(row.src, row.index, next || null, 'commit'); // cleared = remove this line's translation
      return;
    }
    if (!next) {
      el.textContent = frozen; // empty source: restore
      onEditLine?.(row.src, row.index, frozen, 'revert');
      return;
    }
    onEditLine?.(row.src, row.index, next, 'commit');
  };
  return (
    <div className="relative flex h-full min-h-0 w-full flex-col">
      {generating && (
        <div className="bg-bg/70 absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]">
          <Loader2 size={18} className="text-accent animate-spin" />
          <span className="text-ink-2 text-[12px]">{t('captions.generatingCaptions')}</span>
        </div>
      )}
      {/* Styles section: collapsible, auto-height (two compact rows) — the line list below is the panel body */}
      <div className="border-line flex shrink-0 flex-col border-b">
        <div
          onClick={() => setStylesOpen((v) => !v)}
          className="text-ink hover:bg-panel-2/60 flex shrink-0 cursor-pointer items-center gap-1.5 px-3 py-2 text-[11.5px] font-medium"
        >
          {stylesOpen ? <ChevronDown size={12} className="text-ink-4" /> : <ChevronRight size={12} className="text-ink-4" />}
          <Type size={11} className="text-accent" />
          {t('captions.styles')}
          <span className="text-ink-4 truncate text-[10.5px] font-normal">
            {hasCaptions ? (CAPTION_PRESETS.find((p) => p.id === current)?.name ?? current) : t('captions.noCaptionsYetPick')}
          </span>
          {hasCaptions && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              title={t('captions.removeAllCaptionsUndoable')}
              className="text-ink-3 hover:text-destructive ml-auto shrink-0 text-[11px] font-normal"
            >
              {t('captions.remove')}
            </button>
          )}
        </div>
        {stylesOpen && (
          <div className="px-2.5 pb-2 pt-0.5">
            {/* Compact per-line style rows (preset picker + size + text color + backdrop as on-demand popovers)
                — the 18 preset cards no longer live inline, the line list below gets the panel back. */}
            <StyleRow
              label={t('captions.mainLine')}
              style={styleCtl.main}
              active={hasCaptions}
              onPreset={(id) => id && onPickPreset(id)}
              onPatch={styleCtl.onMainPatch}
            />
            {styleCtl.bilingualOn && (
              <StyleRow
                label={t('captions.subLine')}
                style={styleCtl.sub}
                active={hasCaptions}
                followsMain={styleCtl.subFollows}
                onPreset={(id) => styleCtl.onSubPatch({ preset: id ?? undefined, color: undefined, bg: undefined })}
                onPatch={styleCtl.onSubPatch}
              />
            )}
          </div>
        )}
        {stylesOpen && translation && (
          <div className="border-line bg-panel-2/40 shrink-0 border-t px-3 py-2">
            <div className="flex items-center gap-1.5">
              <Languages size={12} className="text-accent shrink-0" />
              <span className="text-ink text-[11.5px] font-medium">{t('captions.bilingualSubtitles')}</span>
              <span className="text-ink-4 ml-auto text-[10.5px]">
                {translation.busy ? t('captions.translating') : translation.total === 0 ? t('captions.transcribeFirst') : translation.done > 0 ? t('captions.linesDone', { done: translation.done, total: translation.total }) : t('captions.notAdded')}
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
                    title={t('captions.translateTranscriptIntoLang', { lang })}
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
                <button type="button" onClick={translation.onClear} title={t('captions.clearAllTranslationsUndoable')} className="text-ink-4 hover:text-destructive ml-auto text-[10.5px]">
                  {t('captions.clear')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {/* Caption lines: the main body. Click a line = seek the video there + edit in place (background-only
          editing state on the SAME node — no border, no size change, zero jitter) + collapse the styles section. */}
      <div ref={listRef} className="min-h-0 flex-1 overflow-auto py-1">
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
                    onRetranslateLine(row.src, row.index);
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
function StyleRow({ label, style, active, followsMain, onPreset, onPatch }: {
  label: string;
  /** Resolved current style for this line. */
  style: CaptionStyle;
  /** Captions laid on the canvas (main row shows "pick a style" until then). */
  active: boolean;
  /** Translation-line row only: true = no own preset, follows the main line; undefined = this IS the main row. */
  followsMain?: boolean;
  /** Preset picked (null = follow main; only offered on the translation row). */
  onPreset: (id: string | null) => void;
  onPatch: (patch: { scale?: number; color?: string | undefined; bg?: string | null | undefined }) => void;
}) {
  const [pop, setPop] = useState<null | 'preset' | 'color' | 'bg'>(null);
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
  const fs = Math.max(9, Math.round(preset.size * style.scale));
  const effColor = style.color ?? preset.text;
  const effBg = style.bg === null ? null : (style.bg ?? preset.bg ?? null);
  const isSub = followsMain !== undefined;
  const step = (d: number) => onPatch({ scale: Math.round(Math.max(0.4, Math.min(4, style.scale + d)) * 100) / 100 });
  return (
    <div ref={rootRef} className="relative mb-1.5 flex items-center gap-1.5">
      <span className="text-ink-3 w-14 shrink-0 truncate text-[11px]">{label}</span>
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
          {isSub && followsMain ? t('captions.followMain') : active || isSub ? t(preset.name) : t('captions.pickStyle')}
        </span>
        <ChevronDown size={11} className="text-ink-4 shrink-0" />
      </button>
      <span className="border-line flex h-7 shrink-0 items-center gap-0.5 rounded-md border px-1">
        <button type="button" aria-label={t('workbench.smallerText')} onClick={() => step(-0.1)} className="text-ink-3 hover:text-ink px-0.5 text-[11px] leading-none">A−</button>
        <span className="text-ink-4 min-w-6 text-center font-mono text-[10px] tabular-nums">{fs}</span>
        <button type="button" aria-label={t('workbench.largerText')} onClick={() => step(0.1)} className="text-ink-3 hover:text-ink px-0.5 text-[11px] leading-none">A＋</button>
      </span>
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
        {effBg ? (
          <span className="block h-full w-full rounded-sm border border-white/15" style={{ background: effBg }} />
        ) : (
          <span className="text-ink-4 flex h-full w-full items-center justify-center"><Ban size={11} /></span>
        )}
      </button>
      {pop === 'preset' && (
        <PresetPop current={style.preset} withFollow={isSub} activeIsFollow={!!followsMain} onPick={(id) => { setPop(null); onPreset(id); }} />
      )}
      {pop === 'color' && (
        <SwatchPop
          title={t('captions.textColor')}
          swatches={TEXT_SWATCHES}
          value={style.color}
          onPick={(c) => { setPop(null); onPatch({ color: c }); }}
          onDefault={() => { setPop(null); onPatch({ color: undefined }); }}
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
          onDefault={() => { setPop(null); onPatch({ bg: undefined }); }}
        />
      )}
    </div>
  );
}

/** Preset picker popover: the 18 cards live here on demand (2-column grid), plus "follow main" on the translation row. */
function PresetPop({ current, withFollow, activeIsFollow, onPick }: { current: string; withFollow: boolean; activeIsFollow: boolean; onPick: (id: string | null) => void }) {
  return (
    <div className="border-line bg-panel absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-lg border p-2 shadow-xl">
      {withFollow && (
        <button
          type="button"
          onClick={() => onPick(null)}
          className={`mb-2 flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11.5px] ${activeIsFollow ? 'border-accent text-ink bg-accent/10' : 'border-line text-ink-3 hover:border-accent'}`}
        >
          {activeIsFollow && <Check size={11} className="text-accent" />} {t('captions.followMain')}
        </button>
      )}
      {SECTIONS.map((sec) => (
        <div key={sec.mode} className="mb-2">
          <div className="text-ink-4 mb-1 text-[10px]">{t(sec.title)}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {CAPTION_PRESETS.filter((p) => p.mode === sec.mode).map((p) => (
              <PresetCard key={p.id} preset={p} active={!activeIsFollow && p.id === current} onPick={(id) => onPick(id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Color picker popover: preset-default chip, optional "no plate", fixed swatches, free custom color. */
function SwatchPop({ title, swatches, value, allowNone, noneActive, onNone, onPick, onDefault }: {
  title: string;
  swatches: string[];
  /** Current override value (undefined = following the preset). */
  value?: string | undefined;
  allowNone?: boolean;
  noneActive?: boolean;
  onNone?: () => void;
  onPick: (color: string) => void;
  onDefault: () => void;
}) {
  return (
    <div className="border-line bg-panel absolute right-0 top-full z-30 mt-1 w-60 rounded-lg border p-2 shadow-xl">
      <div className="text-ink-4 mb-1.5 text-[10px]">{title}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onDefault}
          className={`rounded-md border px-1.5 py-1 text-[10px] ${value === undefined && !noneActive ? 'border-accent text-ink bg-accent/10' : 'border-line text-ink-3 hover:border-accent'}`}
        >
          {t('captions.presetDefault')}
        </button>
        {allowNone && (
          <button
            type="button"
            onClick={onNone}
            className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-[10px] ${noneActive ? 'border-accent text-ink bg-accent/10' : 'border-line text-ink-3 hover:border-accent'}`}
          >
            <Ban size={10} /> {t('captions.noPlate')}
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
        <span className="bg-accent absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-white">
          <Check size={10} /> {t('captions.inUse')}
        </span>
      ) : (
        <span className="bg-accent absolute right-1.5 top-1.5 hidden rounded px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:block">
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
