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
  type Composition,
  CAPTION_PRESETS,
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

export function CaptionsPanel({
  comp,
  onPickPreset,
  onRemove,
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
      {/* Styles section: collapsible; ~1/2 height while the line list exists, full height without a transcript */}
      <div className={`border-line flex min-h-0 flex-col border-b ${stylesOpen ? (lines.length ? 'max-h-[50%]' : 'flex-1') : ''}`}>
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
          <div className="min-h-0 flex-1 overflow-auto px-2.5 pb-2.5">
            {/* "None": no captions / remove the whole layer */}
            <div className="mb-3">
              <button
                type="button"
                title={t('captions.none')}
                onClick={() => hasCaptions && onRemove()}
                className={`group relative w-full overflow-hidden rounded-lg border transition ${
                  !hasCaptions ? 'border-accent ring-accent/40 ring-1' : 'border-line hover:border-accent'
                }`}
              >
                <div className="flex h-[58px] items-center justify-center gap-2 bg-[#2b2b2e] px-3 text-[13px] text-white/55">
                  <Ban size={14} /> {t('captions.noCaptions')}
                </div>
                {!hasCaptions ? (
                  <span className="bg-accent absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-white">
                    <Check size={10} /> {t('captions.inUse')}
                  </span>
                ) : (
                  <span className="bg-accent absolute right-1.5 top-1.5 hidden rounded px-1.5 py-0.5 text-[10px] font-medium text-white group-hover:block">
                    {t('captions.use')}
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
                    <PresetCard key={p.id} preset={p} active={hasCaptions && p.id === current} onPick={onPickPreset} />
                  ))}
                </div>
              </div>
            ))}
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
