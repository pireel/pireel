'use client';

/**
 * Captions panel (a tool panel docked in the material bar, entered via the "Captions" button).
 * The panel is a subtitle transcript: a compact on/off and translation header above editable cues.
 * Selecting text opens the same contextual edit/highlight/animation/MG bar as the speech transcript.
 * Line editing: click a line = seek the video to its spot + edit IN PLACE on the same node
 * (contentEditable; background-only editing state — no border, no size change, zero jitter). Edits
 * write back to the TRANSCRIPT (single source of truth: captions re-lay, agents' get_transcript and the
 * script panel all see the fix; timing untouched). The editable DOM stays local for the entire input
 * session and publishes once on blur/Enter, so IME/native undo never triggers transcript re-tokenizing
 * while the user is still typing. With
 * bilingual on, each row shows the translation line + a per-line retranslate button; translations
 * only change when the user asks (the retranslate button / a full re-translate) — never automatically.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, ChevronDown, Languages, Loader2, RefreshCw } from 'lucide-react';
import { confirm } from '@pireel/ui/confirm';
import { t } from './i18n';
import { wordsFromText } from '@pireel/studio-engine/caption-fx';
import type { WordDecorationPatch } from '@pireel/studio-engine/word-decorations';
import { TranscriptSelectionBar } from './script-panel';
import { CaptionsToolbarContext, TRANSCRIPT_TOOL_CLASS, TRANSCRIPT_TOOL_LABEL_CLASS, TRANSCRIPT_TOOLBAR_CLASS } from './captions-toolbar-slot';
import {
  type CaptionPreset,
  type CaptionStyle,
  type Composition,
  BASE_CAPTION_FONT_PX,
  captionStackScale,
  isCaptionsOn,
} from '@pireel/studio-engine/composition';

/** One editable caption line = one DISPLAY CUE (derived by displayCues in edited-timeline order across
 *  all sources — exactly what renders on the video, one row per on-screen line). */
export interface CaptionLineRow {
  /** `main:<seg>:<w0>` or `<src>:<seg>:<w0>` — stable identity for editing/busy state. */
  key: string;
  /** null = main narration; otherwise the inserted clip's src. */
  src: string | null;
  /** Transcript owner for document-derived rows (audio-lane narration): edit write-back target
   *  when the runtime asr refs do not hold this row's segments. */
  assetId?: string;
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
  onMainPatch: (patch: { animation?: CaptionStyle['animation']; scale?: number; emphasis?: string | undefined; color?: string | undefined; bg?: string | null | undefined; bold?: boolean | undefined; font?: string | undefined }) => void;
  onSubPatch: (patch: { animation?: CaptionStyle['animation']; preset?: string | undefined; scale?: number; color?: string | undefined; bg?: string | null | undefined; bold?: boolean | undefined; font?: string | undefined; lang?: string | undefined }) => void;
}

export function CaptionsPanel({
  comp,
  onReextract,
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
  onDecorateWords,
  onEditWords,
  children,
}: {
  comp: Composition;
  /** Transcribe the speech again and rebuild every caption: a fresh set, edits and removals cleared. */
  onReextract?: () => void;
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
  /** Write an edited line back to the transcript (timing untouched). The panel publishes only
   *  `commit`; `revert` is retained for callers that want to observe Esc. */
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
  /** A selected source-word range in the subtitle transcript. */
  onDecorateWords?: (row: CaptionLineRow, wordIndexes: number[], patch: WordDecorationPatch) => void;
  onEditWords?: (row: CaptionLineRow, wordIndexes: number[], text: string) => void;
  children?: ReactNode;
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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [selectionBar, setSelectionBar] = useState<{ row: CaptionLineRow; indexes: number[]; text: string; startSec: number; endSec: number; y: number } | null>(null);
  useEffect(() => {
    if (!selectionBar) return;
    const close = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('[data-caption-selection-bar]')) return;
      setSelectionBar(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [selectionBar]);
  const selectCaptionText = (row: CaptionLineRow, element: HTMLElement, event: React.MouseEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) return;
    if (!element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) return;
    const text = selection.toString().trim();
    if (!text) return;
    const startRange = document.createRange();
    startRange.selectNodeContents(element);
    startRange.setEnd(selection.anchorNode, selection.anchorOffset);
    const endRange = document.createRange();
    endRange.selectNodeContents(element);
    endRange.setEnd(selection.focusNode, selection.focusOffset);
    const start = Math.min(startRange.toString().length, endRange.toString().length);
    const end = Math.max(startRange.toString().length, endRange.toString().length);
    const tokens = wordsFromText(row.text, 0, 1);
    let cursor = 0;
    const indexes = tokens.flatMap((word, index) => {
      const at = row.text.indexOf(word.text, cursor);
      if (at < 0) return [];
      cursor = at + word.text.length;
      if (cursor <= start || at >= end) return [];
      const sourceCount = row.w1 - row.w0 + 1;
      return [row.w0 + Math.min(sourceCount - 1, Math.floor(index * sourceCount / Math.max(1, tokens.length)))];
    });
    if (!indexes.length) return;
    const uniqueIndexes = [...new Set(indexes)];
    const panel = panelRef.current?.getBoundingClientRect();
    const duration = row.dur ?? 0.6;
    setSelectionBar({ row, indexes: uniqueIndexes, text,
      startSec: row.editedStart + duration * (uniqueIndexes[0]! - row.w0) / Math.max(1, row.w1 - row.w0 + 1),
      endSec: row.editedStart + duration * (uniqueIndexes[uniqueIndexes.length - 1]! - row.w0 + 1) / Math.max(1, row.w1 - row.w0 + 1),
      y: event.clientY - (panel?.top ?? 0) + 12 });
  };
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
  }, [editingKey, editingPart]);
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
  const toolbarTools = translation && <LangPick translation={translation} onOff={() => styleCtl.onSubPatch({ lang: undefined })} />;
  const toolbarEnd = <>
    {hasCaptions && onReextract && (
      <button type="button" onClick={async () => {
        if (await confirm({ title: t('captions.reextractConfirmTitle'), description: t('captions.reextractConfirmBody'), confirmLabel: t('captions.reextract'), tone: 'danger' })) onReextract();
      }} title={t('captions.reextractHint')} aria-label={t('captions.reextract')} className="text-ink-3 hover:bg-panel-2/20 hover:text-ink flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
        <RefreshCw size={13} />
      </button>
    )}
  </>;
  return (
    <div ref={panelRef} className="bg-canvas relative flex h-full min-h-0 w-full flex-col">
      {generating && (
        <div className="bg-bg/70 absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 backdrop-blur-[2px]">
          <Loader2 size={18} className="text-accent animate-spin" />
          <span className="text-ink-2 text-[12px]">{t('captions.generatingCaptions')}</span>
        </div>
      )}
      {!children && <div className={TRANSCRIPT_TOOLBAR_CLASS}>
        {toolbarTools}
        <div className="ml-auto flex items-center gap-1">{toolbarEnd}</div>
      </div>}
      {/* Caption transcript: click a line to edit the whole cue, or select text for contextual edits. */}
      {children ? <CaptionsToolbarContext.Provider value={{ tools: toolbarTools, end: toolbarEnd }}>{children}</CaptionsToolbarContext.Provider> : <div ref={listRef} className="min-h-0 flex-1 overflow-auto">
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
                    if (editing || !onEditLine || window.getSelection()?.toString().trim()) return;
                    // Seek INTO the sentence (not its exact boundary): at startSec the enter animation is at
                    // frame 0 (opacity 0), so a paused preview looked caption-less after editing (user hit this)
                    onSeekTo?.(row.editedStart + Math.min(0.3, (row.dur ?? 0.6) / 2));
                    frozenTextRef.current = row.text;
                    setEditingPart('text');
                    setEditingKey(row.key);
                  }}
                  onBlur={(e) => editing && commit(row, e.currentTarget, 'text')}
                  onMouseUp={(event) => !children && !editing && selectCaptionText(row, event.currentTarget, event)}
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
                    editing ? 'bg-accent/12' : onEditLine ? 'hover:bg-panel-2/20 cursor-text' : ''
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
                          ? `text-ink-3 ${onEditSubLine ? 'hover:bg-panel-2/20 cursor-text' : ''}`
                          : `text-ink-4 italic ${onEditSubLine ? 'hover:bg-panel-2/20 cursor-text' : ''}`
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
      </div>}
      {!children && selectionBar && <div data-caption-selection-bar className="border-line bg-panel absolute z-50 rounded-lg border p-1 shadow-xl" style={{ left: 8, width: 'calc(100% - 16px)', top: Math.max(8, Math.min(selectionBar.y, (panelRef.current?.clientHeight ?? 500) - 165)) }}>
        <TranscriptSelectionBar
          text={selectionBar.text}
          canEdit={!!onEditWords}
          onEdit={(text) => { onEditWords?.(selectionBar.row, selectionBar.indexes, text); setSelectionBar(null); window.getSelection()?.removeAllRanges(); }}
          onDecorate={(patch) => { onDecorateWords?.(selectionBar.row, selectionBar.indexes, patch); setSelectionBar(null); window.getSelection()?.removeAllRanges(); }}
        />
      </div>}
    </div>
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
        aria-label={t('captions.translate')}
        onClick={() => setOpen((o) => !o)}
        className={`${TRANSCRIPT_TOOL_CLASS} ${open ? 'bg-panel-2/35 text-ink' : ''}`}
      >
        {translation.busy ? <Loader2 size={13} className="text-accent animate-spin" /> : <Languages size={13} />}
        <span className={TRANSCRIPT_TOOL_LABEL_CLASS}>{t('captions.translate')}</span>
        {active && <span className="text-ink-3 font-mono text-[10.5px]">{LANG_ABBR[active] ?? active}</span>}
        <ChevronDown size={11} className="text-ink-4" />
      </button>
      {open && (
        <div className="border-line bg-panel absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border p-1 shadow-xl">
          {active && <>
            <button
              type="button"
              onClick={() => { setOpen(false); translation.onTranslate(active); }}
              className="text-ink-2 hover:bg-panel-2/20 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11.5px]"
            >
              {t('captions.retranslateAll')}
            </button>
            <div className="bg-line my-1 h-px" />
          </>}
          <button
            type="button"
            onClick={() => { setOpen(false); if (active) onOff(); }}
            className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11.5px] ${!active ? 'text-ink bg-panel-2/35' : 'text-ink-3 hover:bg-panel-2/20'}`}
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
              className={`flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11.5px] ${active === lang ? 'text-ink bg-panel-2/35' : 'text-ink-3 hover:bg-panel-2/20'}`}
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

export function CaptionPresetCard({ preset, active, tall, onPick }: { preset: CaptionPreset; active: boolean; tall?: boolean; onPick: (id: string) => void }) {
  return (
    <button
      type="button"
      title={t(preset.name)}
      onClick={() => onPick(preset.id)}
      className={`group relative overflow-hidden rounded-lg border transition ${
        active ? 'border-accent ring-accent/40 ring-1' : 'border-line hover:border-accent'
      }`}
    >
      <div className={`flex ${tall ? 'h-[84px]' : 'h-[58px]'} items-center justify-center overflow-hidden bg-[#2b2b2e] px-3`}>
        <CaptionPresetSample p={preset} />
      </div>
      <div className="text-ink-3 truncate px-2 py-1.5 text-left text-[10.5px]">{t(preset.name)}</div>
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
export function CaptionPresetSample({ p, segments }: { p: CaptionPreset; segments?: [string, string, string] }) {
  // Demo sample: three segments (the middle one gets the emphasis treatment); localized via the catalogs like everything else
  const sample = segments ?? [t('captions.samplePre'), t('captions.sampleWord'), t('captions.samplePost')];
  const fontFamily = p.font === 'serif' ? "'Noto Serif SC','Songti SC',serif" : p.font === 'mono' ? "'IBM Plex Mono',ui-monospace,monospace" : undefined;
  const base: CSSProperties = {
    color: p.text,
    fontWeight: p.weight ?? 600,
    fontFamily,
    fontStyle: p.italic ? 'italic' : undefined,
    fontSize: Math.round(BASE_CAPTION_FONT_PX * 0.24),
    lineHeight: 1.2,
    textShadow: p.shadow ?? (!p.bg ? '0 1px 6px rgba(0,0,0,0.85)' : undefined),
    WebkitTextStroke: p.stroke ? `${p.stroke.widthEm}em ${p.stroke.color}` : undefined,
    paintOrder: 'stroke fill',
    whiteSpace: 'nowrap',
  };
  const pill: CSSProperties | undefined = p.bg
    ? { background: p.bg, fontSize: Math.round(BASE_CAPTION_FONT_PX * 0.24), padding: '4px 10px', borderRadius: p.plateRadiusEm == null ? 8 : `${p.plateRadiusEm}em`, border: p.plateBorder, display: 'inline-flex', alignItems: 'baseline' }
    : { display: 'inline-flex', alignItems: 'baseline' };
  // Frozen form of the emphasized word (the middle caption)
  const emph: CSSProperties = { position: 'relative', margin: '0 0.18em' };
  if (p.emphasis) emph.color = p.emphasis;
  if (p.deco === 'underline') emph.boxShadow = `inset 0 -3px 0 ${p.decoColor}`;
  const decoBox: CSSProperties | undefined =
    p.deco === 'highlight' ? { position: 'absolute', inset: '-2px -4px', background: p.decoColor, borderRadius: 4 } : undefined;
  if (p.upper) base.textTransform = 'uppercase';
  if (p.trackingEm) base.letterSpacing = `${p.trackingEm}em`;
  const stack = p.stack;
  if (stack) {
    // Stacked art preset: same row plan shape as the renderer (per-row size / color / plate / stagger, whole tilt).
    const rows = stack.maxRows === 1 ? [sample.join('')] : [sample[0], `${sample[1]}${sample[2]}`];
    const fontSize = Math.round(BASE_CAPTION_FONT_PX * 0.22);
    return (
      <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: stack.align === 'start' ? 'flex-start' : 'center', rowGap: stack.plates?.length ? 3 : 0, transform: p.tiltDeg ? `rotate(${p.tiltDeg}deg)` : undefined }}>
        {rows.map((text, k) => {
          const size = Math.round(fontSize * captionStackScale(stack, k));
          const plate = stack.plates?.length ? stack.plates[k % stack.plates.length] : undefined;
          return (
            <span key={k} style={{
              ...base,
              fontSize: size,
              color: stack.colors?.length ? stack.colors[k % stack.colors.length] : p.text,
              ...(plate ? { background: plate, padding: '1px 6px', borderRadius: `${p.plateRadiusEm ?? 0.18}em` } : {}),
              ...(stack.staggerEm ? { transform: `translateX(${(k % 2 ? 1 : -1) * stack.staggerEm}em)` } : {}),
            }}>{text}</span>
          );
        })}
      </span>
    );
  }
  return (
    <span style={pill}>
      <span style={base}>
        {sample[0]}
        <span data-caption-sample-word style={{ ...base, ...emph, display: 'inline-block' }}>
          {decoBox && <span style={decoBox} />}
          <span style={{ position: 'relative' }}>{sample[1]}</span>
        </span>
        {sample[2]}
      </span>
    </span>
  );
}
