'use client';

import { useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Highlighter, Loader2, Scissors, ScrollText, X } from 'lucide-react';
import { managedCaptionLineRows, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { joinWords, latinJoin } from '@pireel/studio-engine/caption-fx';
import { isFillerWord } from '@pireel/studio-engine/speech-fillers';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { phraseWordIndexes, rowWords } from '@pireel/studio-engine/caption-highlights';
import { toast } from '@pireel/ui/toast';
import { captionHighlightColor } from '@pireel/studio-engine/caption-animations';
import { CLEANUP_PAUSE_KEEP_SEC, CLEANUP_PAUSE_OVER_SEC, transcriptPauses, transcriptPauseCuts, type TranscriptPause } from '@pireel/studio-engine/transcript-pauses';
import type { CaptionCueEdit } from '@pireel/studio-engine/caption-document-edit';
import type { WordDecorationPatch } from '@pireel/studio-engine/word-decorations';
import { DEFAULT_MASK_TEXT, type WordMaskPatch } from '@pireel/studio-engine/word-masks';
import { TranscriptSelectionBar, type TimelineMaskTarget, type TimelineScriptCut, type TranscriptAddKind } from './script-panel';
import { activeTranscriptTokenIndex, transcriptParagraphs, transcriptPauseContext, transcriptSelectionEdits, transcriptTokens, type TranscriptToken } from './transcript-editor-model';
import { t } from './i18n';
import { CaptionsToolbarContext, TRANSCRIPT_TOOL_CLASS, TRANSCRIPT_TOOL_LABEL_CLASS, TRANSCRIPT_TOOLBAR_CLASS } from './captions-toolbar-slot';
import { playhead } from './playhead';
const noPlaybackSubscription = () => () => {};
/** Per side: whole scripts under ~6000 characters go to the drafting model in full. */
const CONTEXT_CHARS = 6000;

type TranscriptSelection = { left: number; top: number } & (
  | { kind: 'words'; tokens: TranscriptToken[] }
  | { kind: 'pause'; pause: TranscriptPause }
);

function selectionPosition(rect: DOMRect, desiredWidth = 480) {
  const width = Math.min(desiredWidth, window.innerWidth - 24);
  return { left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)), top: Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - 240)) };
}

/** One caption line's share of a translation; `mine` = it plays in this section. */
interface TranslationPiece { text: string; mine: boolean }

export function TranscriptEditor({ document, currentTimeSec: pausedTimeSec, playing, active = true, extracting, onExtract, onSeek, onCut, onEdit, onDecorate, onMask, onGenerateMG, onAddAtRange, addKinds, autoHighlight }: {
  document: EditorDocumentV2;
  currentTimeSec: number;
  playing: boolean;
  active?: boolean;
  extracting: boolean;
  onExtract: () => void;
  onSeek: (time: number) => void;
  onCut: (cuts: TimelineScriptCut[], message: string) => void;
  onEdit: (edits: CaptionCueEdit[]) => boolean;
  onDecorate: (targets: TimelineMaskTarget[], patch: WordDecorationPatch) => void;
  onMask: (targets: TimelineMaskTarget[], patch: WordMaskPatch, message: string) => void;
  onGenerateMG: (text: string, startSec: number, endSec: number, pauseContext?: { before: string; after: string }) => void;
  /** Insert text / sticker / media / sound over a selection's time range. */
  onAddAtRange?: (kind: TranscriptAddKind, text: string, startSec: number, endSec: number, at: { left: number; top: number; before: string; after: string }) => void;
  addKinds?: readonly TranscriptAddKind[];
  /** Hosted auto-highlight picker: exact phrases per row (absent = no button). */
  autoHighlight?: (rows: { index: number; text: string }[]) => Promise<{ index: number; text: string }[]>;
}) {
  const tokens = useMemo(() => transcriptTokens(document), [document]);
  // Only pauses the cleanup would shorten are worth a label; shorter ones are natural breaths.
  const pauses = useMemo(() => transcriptPauses(document).filter((pause) => pause.endSec - pause.startSec > CLEANUP_PAUSE_OVER_SEC + 1e-7), [document]);
  const paragraphs = useMemo(() => transcriptParagraphs(document, tokens, pauses), [document, tokens, pauses]);
  const byId = useMemo(() => new Map(tokens.map((token) => [token.id, token])), [tokens]);
  const styleHighlight = captionHighlightColor(document.appearance.captionStyle ?? {});
  // With a translation line on, each section shows its sentences' translations under the source text.
  const translationLang = document.appearance.captionStyle?.sub?.lang;
  // Translations under each section. A sentence (or, when the edit split it apart, each
  // uninterrupted stretch of it) shows its whole translation under every section it spans, with the
  // parts the captions put on other sections' lines dimmed. The parts come from the laid-out
  // caption lines, so the underline matches what plays on screen.
  const sectionTranslations = useMemo(() => {
    const out = new Map<string, (TranslationPiece[] | null)[]>();
    if (!translationLang) return out;
    const add = (paragraphId: string, entry: TranslationPiece[] | null) => out.set(paragraphId, [...(out.get(paragraphId) ?? []), entry]);
    const paragraphOf = new Map<string, string>();
    const assetOfSeg = new Map<number, string>();
    for (const paragraph of paragraphs) {
      for (const token of paragraph.tokens) {
        if (!assetOfSeg.has(token.si)) assetOfSeg.set(token.si, token.assetId);
        for (let w = token.w0; w <= token.w1; w++) paragraphOf.set(`${token.assetId}:${token.si}:${w}`, paragraph.id);
      }
    }
    const rows = managedCaptionLineRows(document);
    if (rows) {
      const stretches: { key: string; cues: { text: string; paragraph?: string }[] }[] = [];
      for (const row of rows) {
        const key = `${row.assetId ?? assetOfSeg.get(row.seg) ?? ''}:${row.seg}`;
        const cue = { text: row.sub?.trim() ?? '', paragraph: paragraphOf.get(`${key}:${row.w0}`) };
        const last = stretches[stretches.length - 1];
        if (last && last.key === key) last.cues.push(cue);
        else stretches.push({ key, cues: [cue] });
      }
      for (const stretch of stretches) {
        const spanned = [...new Set(stretch.cues.map((cue) => cue.paragraph).filter((id): id is string => !!id))];
        if (!spanned.length) continue;
        const translated = stretch.cues.filter((cue) => cue.text);
        if (!translated.length) { add(spanned[0]!, null); continue; }
        for (const paragraphId of spanned) add(paragraphId, translated.map((cue) => ({ text: cue.text, mine: spanned.length > 1 && cue.paragraph === paragraphId })));
      }
      return out;
    }
    // Captions not laid out: the stored translation under the section where its sentence starts.
    const started = new Set<string>();
    for (const paragraph of paragraphs) {
      for (const token of paragraph.tokens) {
        const key = `${token.assetId}:${token.si}`;
        if (started.has(key)) continue;
        started.add(key);
        const segment = document.semantics.transcripts[token.assetId]?.[token.si] as AsrSegment | undefined;
        const text = segment?.sub?.trim() || Object.values(segment?.cueSubs ?? {}).join(' ').trim();
        add(paragraph.id, text ? [{ text, mine: false }] : null);
      }
    }
    return out;
  }, [paragraphs, document, translationLang]);
  const listRef = useRef<HTMLDivElement>(null);
  const selectingRef = useRef(false);
  const suppressClickRef = useRef(false);
  const readSelectionRef = useRef<() => boolean>(() => false);
  const [selection, setSelection] = useState<TranscriptSelection | null>(null);
  const [drafts, setDrafts] = useState<CaptionCueEdit[] | null>(null);
  const [highlighting, setHighlighting] = useState(false);
  const captionsToolbar = useContext(CaptionsToolbarContext);
  // One call for every sentence on screen; the result lands as ordinary word highlights
  // (one decorate commit, one undo). A phrase that is not in its row fails the whole run.
  const runAutoHighlight = async () => {
    if (!autoHighlight || highlighting) return;
    const sentences = [...new Map(tokens.map((token) => [`${token.assetId}:${token.si}`, { assetId: token.assetId, si: token.si }])).values()]
      .flatMap((row) => { const segment = document.semantics.transcripts[row.assetId]?.[row.si] as AsrSegment | undefined; return segment ? [{ ...row, words: rowWords(segment) }] : []; });
    if (!sentences.length) return;
    setHighlighting(true);
    try {
      const keys = await autoHighlight(sentences.map((row, index) => ({ index, text: joinWords(row.words.map((word) => word.text)) })));
      const targets: TimelineMaskTarget[] = [];
      for (const key of keys) {
        const row = sentences[key.index];
        const found = row ? phraseWordIndexes(row.words, key.text) : null;
        if (!row || !found) throw new Error(t('captions.autoHighlightMismatch', { text: key.text }));
        for (const wi of found) targets.push({ assetId: row.assetId, si: row.si, wi });
      }
      if (!targets.length) { toast.info(t('captions.autoHighlightNone')); return; }
      onDecorate(targets, { highlight: 'color', color: null });
      toast.success(t('captions.autoHighlightDone', { n: keys.length }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setHighlighting(false);
    }
  };
  const activeIndex = useSyncExternalStore(
    playing && active ? playhead.subscribe : noPlaybackSubscription,
    () => activeTranscriptTokenIndex(tokens, playing && active ? playhead.get() : pausedTimeSec),
    () => -1,
  );
  const currentTimeSec = playing && active ? playhead.get() : pausedTimeSec;
  const activeToken = tokens[activeIndex];
  useEffect(() => {
    if (!playing) return;
    setSelection(null); setDrafts(null);
    window.getSelection()?.removeAllRanges();
  }, [playing]);
  // Follow only when the playhead reaches a different word. Closing a selection or restyling a
  // word re-runs this effect with the same word; that must not pull the pane back to the playhead.
  const followedRef = useRef<string | null>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!active) followedRef.current = null;
    if (!active || !activeToken || selection || selectingRef.current || !list || !list.clientHeight) return;
    if (followedRef.current === activeToken.id) return;
    followedRef.current = activeToken.id;
    const element = list.querySelector<HTMLElement>(`[data-transcript-token="${CSS.escape(activeToken.id)}"]`);
    if (!element) return;
    const viewport = list.getBoundingClientRect();
    const word = element.getBoundingClientRect();
    const upper = viewport.top + Math.min(60, list.clientHeight * 0.15);
    const lower = viewport.bottom - Math.min(120, list.clientHeight * 0.3);
    if (word.top < upper || word.bottom > lower) {
      list.scrollTo({ top: Math.max(0, list.scrollTop + word.top - viewport.top - list.clientHeight * 0.35),
        behavior: playing && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
    }
  }, [activeToken, playing, selection, active]);
  const selectedTokens = selection?.kind === 'words' ? selection.tokens : [];
  const selectedIds = new Set(selectedTokens.map((token) => token.id));
  const targets = selectedTokens.flatMap((token) => Array.from({ length: token.w1 - token.w0 + 1 }, (_, i) => ({ assetId: token.assetId, si: token.si, wi: token.w0 + i })));
  const close = () => { setSelection(null); setDrafts(null); window.getSelection()?.removeAllRanges(); };
  // Metadata/style commits may replace the document while a user is selecting. Only changes
  // to the displayed words or their timing invalidate that selection.
  const transcriptIdentity = useMemo(() => JSON.stringify({ words: tokens.map(({ id, text, startSec, endSec }) => [id, text, startSec, endSec]), pauses: pauses.map(({ id, startSec, endSec }) => [id, startSec, endSec]) }), [tokens, pauses]);
  useEffect(() => { setSelection(null); setDrafts(null); }, [transcriptIdentity]);
  useEffect(() => {
    if (!selection) return;
    const outside = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('[data-transcript-toolbar]') && !listRef.current?.contains(event.target as Node)) {
        setSelection(null); setDrafts(null);
      }
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setSelection(null); setDrafts(null); window.getSelection()?.removeAllRanges(); } };
    const resized = () => { setSelection(null); setDrafts(null); };
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', escape);
    window.addEventListener('resize', resized);
    return () => { window.removeEventListener('mousedown', outside); window.removeEventListener('keydown', escape); window.removeEventListener('resize', resized); };
  }, [selection]);
  const open = (selected: TranscriptToken[], rect: DOMRect) => {
    if (!selected.length) return;
    const { left, top } = selectionPosition(rect);
    setSelection((previous) => previous?.kind === 'words' && previous.left === left && previous.top === top
      && previous.tokens.length === selected.length && previous.tokens.every((token, index) => token.id === selected[index]!.id)
      ? previous : { kind: 'words', tokens: selected, left, top });
    setDrafts(null);
  };
  const readSelection = () => {
    const range = window.getSelection();
    if (!range || range.isCollapsed || !range.rangeCount || !listRef.current) return false;
    if (!listRef.current.contains(range.anchorNode) || !listRef.current.contains(range.focusNode)) return false;
    const selected = [...listRef.current.querySelectorAll<HTMLElement>('[data-transcript-token]')]
      .filter((element) => range.containsNode(element, true))
      .flatMap((element) => { const token = byId.get(element.dataset.transcriptToken!); return token ? [token] : []; });
    open(selected, range.getRangeAt(0).getBoundingClientRect());
    return selected.length > 0;
  };
  readSelectionRef.current = readSelection;
  useEffect(() => {
    let frame = 0;
    const finish = () => {
      if (!selectingRef.current) return;
      selectingRef.current = false;
      // A drag may end outside the scroll pane. Finish at document level, then ignore
      // the browser's following click so it cannot seek or replace the selected range.
      suppressClickRef.current = readSelectionRef.current();
    };
    const changed = () => {
      if (selectingRef.current || window.document.activeElement?.closest('[data-transcript-toolbar]')) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { readSelectionRef.current(); });
    };
    window.document.addEventListener('mouseup', finish);
    window.document.addEventListener('selectionchange', changed);
    return () => {
      cancelAnimationFrame(frame);
      window.document.removeEventListener('mouseup', finish);
      window.document.removeEventListener('selectionchange', changed);
    };
  }, []);
  /** Narration around a selection for AI drafting: the whole script when it is short enough
   *  (almost always), else the nearest CONTEXT_CHARS on each side. */
  const contextAround = (fromSec: number, toSec: number) => {
    const before = joinWords(tokens.filter((token) => token.endSec <= fromSec + 1e-7).map((token) => token.text));
    const after = joinWords(tokens.filter((token) => token.startSec >= toSec - 1e-7).map((token) => token.text));
    return {
      before: before.length > CONTEXT_CHARS ? before.slice(-CONTEXT_CHARS) : before,
      after: after.length > CONTEXT_CHARS ? after.slice(0, CONTEXT_CHARS) : after,
    };
  };
  const cutsFor = (words: TranscriptToken[]): TimelineScriptCut[] => words.map((word) => ({
    trackId: word.trackId, clipId: word.clipId, assetId: word.assetId,
    range: [Math.max(0, word.sourceStart - 0.02), Math.max(word.sourceStart + 0.05, word.sourceEnd + 0.02)],
  }));
  const longPauses = useMemo(() => pauses.filter((pause) => pause.endSec - pause.startSec > CLEANUP_PAUSE_OVER_SEC + 1e-7), [pauses]);
  const silences = useMemo(() => longPauses.flatMap((pause) => transcriptPauseCuts(pause, CLEANUP_PAUSE_KEEP_SEC)), [longPauses]);
  const fillers = tokens.filter((token) => isFillerWord(token.text)
    && document.semantics.transcripts[token.assetId]?.[token.si]?.words?.length);

  return <div className="relative flex min-h-0 flex-1 flex-col" data-transcript-editor>
    <div className={TRANSCRIPT_TOOLBAR_CLASS}>
      <details className="group relative">
        <summary className={`${TRANSCRIPT_TOOL_CLASS} cursor-pointer list-none group-open:bg-panel-2/35 group-open:text-ink [&::-webkit-details-marker]:hidden`}><Scissors size={13} />{t('captions.speechCleanup')}<ChevronDown size={11} className="text-ink-4" /></summary>
        <div className="border-line bg-panel absolute left-0 top-full z-20 mt-1 w-56 rounded-md border p-1 shadow-lg">
          <button type="button" disabled={!silences.length} className="hover:bg-panel-2/20 w-full rounded px-2 py-2 text-left text-[12px] disabled:opacity-40" onClick={(event) => { onCut(silences, t('panels.deletedNSilencesSec', { n: longPauses.length, sec: longPauses.reduce((total, pause) => total + pause.endSec - pause.startSec - CLEANUP_PAUSE_KEEP_SEC, 0).toFixed(1) })); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{longPauses.length ? t('panels.cutSilencesNSec', { n: longPauses.length, sec: longPauses.reduce((total, pause) => total + pause.endSec - pause.startSec - CLEANUP_PAUSE_KEEP_SEC, 0).toFixed(1) }) : <>{t('panels.cutSilences')}<span className="text-ink-4 block text-[10.5px]">{t('captions.noLongPauses', { sec: CLEANUP_PAUSE_OVER_SEC })}</span></>}</button>
          <button type="button" disabled={!fillers.length} className="hover:bg-panel-2/20 w-full rounded px-2 py-2 text-left text-[12px] disabled:opacity-40" onClick={(event) => { onCut(cutsFor(fillers), t('panels.deletedNFillerWords', { n: fillers.length })); event.currentTarget.closest('details')?.removeAttribute('open'); }}>{fillers.length ? t('panels.cutFillersN', { n: fillers.length }) : <>{t('panels.cutFillers')}<span className="text-ink-4 block text-[10.5px]">{t('panels.noFillerWordsDetected')}</span></>}</button>
        </div>
      </details>
      {autoHighlight && <button type="button" disabled={!tokens.length || highlighting} onClick={() => void runAutoHighlight()} title={t('captions.autoHighlightHint')} aria-label={t('captions.autoHighlight')}
          className={TRANSCRIPT_TOOL_CLASS}>{highlighting ? <Loader2 size={13} className="animate-spin" /> : <Highlighter size={13} />}<span className={TRANSCRIPT_TOOL_LABEL_CLASS}>{t(highlighting ? 'captions.autoHighlighting' : 'captions.autoHighlight')}</span></button>}
      {captionsToolbar?.tools}
      <div className="ml-auto flex items-center gap-1">
        {extracting && <Loader2 size={14} className="text-ink-3 animate-spin" />}
        {captionsToolbar?.end}
      </div>
    </div>
    <div className="text-ink-4 shrink-0 px-4 pb-1 text-[10.5px]">{t('captions.selectTranscriptHint')}</div>
    <div ref={listRef} data-transcript-text tabIndex={0} aria-label={t('captions.transcriptEditor')}
      className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3 outline-none"
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement).closest('[data-transcript-pause]')) return;
        selectingRef.current = true;
        suppressClickRef.current = false;
        setSelection(null); setDrafts(null);
        // Starting inside the previous native selection otherwise starts a text drag.
        // Preserve Shift-extension and the browser's double/triple-click word selection.
        const native = window.getSelection();
        if (!event.shiftKey && event.detail === 1 && native && listRef.current?.contains(native.anchorNode)) native.removeAllRanges();
      }}
      onDragStart={(event) => event.preventDefault()}
      onKeyUp={(event) => { if (event.key === 'Shift' || event.shiftKey) readSelection(); }}
      onScroll={() => {
        if (selectingRef.current || !selection || drafts) return;
        if (selection.kind === 'words') { readSelection(); return; }
        const element = listRef.current?.querySelector<HTMLElement>(`[data-transcript-pause="${CSS.escape(selection.pause.id)}"]`);
        if (element) { const position = selectionPosition(element.getBoundingClientRect(), 220); setSelection((previous) => previous?.kind === 'pause' ? { ...previous, ...position } : previous); }
      }}>
      {!paragraphs.length && <div className="text-ink-3 flex flex-col items-center gap-3 py-10 text-center text-[12px]">
        <ScrollText size={24} />{t('panels.noTranscriptYetTranscribe')}
        <button type="button" disabled={extracting} onClick={onExtract} className="bg-ink text-bg rounded-md px-3 py-1.5 disabled:opacity-40">{t('captions.extractCaptions')}</button>
      </div>}
      {paragraphs.map((paragraph, paragraphIndex) => <section key={paragraph.id} data-transcript-section={paragraph.id} className="border-line/60 mb-5 border-b pb-5 last:mb-0 last:border-b-0">
        <button type="button" data-transcript-section-heading
          onClick={() => onSeek(paragraph.startSec)}
          className={`mb-2 flex items-center gap-2 text-[10.5px] ${currentTimeSec >= paragraph.startSec && currentTimeSec < paragraph.endSec ? 'text-ink font-medium' : 'text-ink-4 hover:text-ink'}`}>
          <span>{t('captions.transcriptParagraph', { n: paragraphIndex + 1 })}</span>
          <span className="font-mono tabular-nums">{Math.floor(paragraph.startSec / 60)}:{String(Math.floor(paragraph.startSec % 60)).padStart(2, '0')}</span>
        </button>
        <p className="text-ink whitespace-pre-wrap break-words text-[16px] font-normal leading-[2.05] tracking-[0.015em]">
        {!paragraph.items.length && <span className="text-ink-4 text-[12px]" data-transcript-section-heading>{t('captions.sectionNoSpeech')}</span>}
        {paragraph.items.map((item, index) => {
          if (item.type === 'pause') {
            const pause = item.pause;
            const sec = (pause.endSec - pause.startSec).toFixed(2);
            const active = currentTimeSec >= pause.startSec && currentTimeSec < pause.endSec;
            const picked = selection?.kind === 'pause' && selection.pause.id === pause.id;
            return <button key={pause.id} type="button" data-transcript-pause={pause.id} data-transcript-selected={picked || undefined}
              aria-label={t('captions.selectPause', { sec })} title={t('captions.selectPause', { sec })} aria-pressed={picked}
              onClick={(event) => { close(); onSeek(pause.startSec); setSelection({ kind: 'pause', pause, ...selectionPosition(event.currentTarget.getBoundingClientRect(), 220) }); }}
              className={`mx-1 inline-flex items-center rounded px-1.5 align-baseline font-mono text-[10.5px] leading-6 tabular-nums hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent ${active ? 'bg-ink/15 text-ink' : 'bg-panel-2/35 text-ink-3'}`}>{sec}s</button>;
          }
          const token = item.token;
          const picked = selectedIds.has(token.id);
          const active = currentTimeSec >= token.startSec && currentTimeSec < token.endSec;
          const nextItem = paragraph.items[index + 1];
          const next = nextItem?.type === 'word' ? nextItem.token : undefined;
          const space = next && /[A-Za-z0-9.,!?;:'")\]%]$/.test(token.text) && /^[A-Za-z0-9('"[$]/.test(next.text);
          return <span key={token.id}>
            <span data-transcript-token={token.id} data-transcript-selected={picked || undefined} data-transcript-active={active || undefined}
              title={token.decoration?.animation ? t(token.decoration.animation === 'pop' ? 'captions.animationPop' : 'captions.animationRise') : undefined}
              onClick={() => {
                if (suppressClickRef.current) { suppressClickRef.current = false; return; }
                if (window.getSelection()?.toString().trim()) return;
                onSeek(token.startSec);
              }}
              style={!picked && token.decoration?.highlight === 'color' ? { color: token.decoration.color ?? styleHighlight } : token.decoration?.highlight === 'underline' ? { textDecorationColor: token.decoration.color ?? styleHighlight } : undefined}
              className={`cursor-text rounded-sm py-[2px] ${token.decoration?.highlight === 'underline' ? 'underline decoration-2 underline-offset-4' : ''} ${token.decoration?.animation || token.masked ? 'decoration-ink-4 border-ink-4/50 border-b border-dotted' : ''}`}
            >{token.text}</span>{space ? ' ' : ''}
          </span>;
        })}
        </p>
        {sectionTranslations.has(paragraph.id) && <p data-transcript-translation lang={translationLang}
          className="border-line/60 text-ink-4 mt-2 border-l-2 pl-3 text-[13px] leading-relaxed">
          {sectionTranslations.get(paragraph.id)!.map((entry, entryIndex) => <span key={entryIndex}>
            {entryIndex > 0 ? ' ' : ''}
            {entry ? entry.map((piece, pieceIndex) => <span key={pieceIndex}>
              {pieceIndex > 0 && latinJoin(entry[pieceIndex - 1]!.text, piece.text) ? ' ' : ''}
              <span className={piece.mine ? 'text-ink-2' : entry.some((other) => other.mine) ? 'text-ink-4/60' : 'text-ink-3'}>{piece.text}</span>
            </span>) : <span className="italic">{t('captions.notTranslated')}</span>}
          </span>)}
        </p>}
      </section>)}
    </div>
    {selection && createPortal(<div data-transcript-toolbar data-script-pop className="border-line bg-panel text-ink fixed z-[100] rounded-lg border p-1.5 shadow-xl" style={{ left: selection.left, top: selection.top, width: 'max-content', maxWidth: 'calc(100vw - 24px)' }}>
      {drafts ? <div className="flex w-[min(360px,calc(100vw-40px))] flex-col gap-2 p-1">
        <div className="flex items-center justify-between text-[12px] font-medium">{t('captions.editSelection')}<button type="button" aria-label={t('workbench.close')} onClick={close} className="text-ink-3 rounded p-1 hover:bg-panel-2"><X size={14} /></button></div>
        <div className="max-h-52 space-y-2 overflow-y-auto">
          {drafts.map((draft, i) => <textarea key={`${draft.assetId}:${draft.index}:${draft.w0}`} autoFocus={i === 0} aria-label={`${t('captions.editSelection')} ${i + 1}`} rows={2} value={draft.text ?? ''} onChange={(event) => setDrafts((items) => items!.map((item, index) => index === i ? { ...item, text: event.target.value } : item))} className="border-line bg-canvas w-full resize-y rounded border px-2 py-1.5 text-[14px] leading-relaxed outline-none focus:border-ink-3" />)}
        </div>
        <div className="text-ink-4 text-[10.5px]">{t('captions.captionCopyHint')}</div>
        <button type="button" disabled={drafts.some((draft) => !draft.text?.trim())} onClick={() => { if (onEdit(drafts)) close(); }} className="bg-ink text-bg self-end rounded px-3 py-1.5 text-[12px] disabled:opacity-40">{t('panels.ok')}</button>
      </div> : selection.kind === 'pause' ? <TranscriptSelectionBar
        key={selection.pause.id}
        kind="pause" text="" canEdit={false}
        addKinds={addKinds}
        {...(onAddAtRange ? { onAdd: (kind: TranscriptAddKind) => { onAddAtRange(kind, '', selection.pause.startSec, selection.pause.endSec, { left: selection.left, top: selection.top, ...contextAround(selection.pause.startSec, selection.pause.endSec) }); close(); } } : {})}
        onGenerateMG={() => {
          const pause = selection.pause;
          onGenerateMG(t('captions.pauseLabel', { sec: (pause.endSec - pause.startSec).toFixed(2) }), pause.startSec, pause.endSec, transcriptPauseContext(pause, tokens));
          close();
        }}
        onDelete={() => { onCut(transcriptPauseCuts(selection.pause), t('captions.pauseDeleted', { sec: (selection.pause.endSec - selection.pause.startSec).toFixed(2) })); close(); }}
        deleteLabel={t('captions.deletePause', { sec: (selection.pause.endSec - selection.pause.startSec).toFixed(2) })}
      /> : <TranscriptSelectionBar
        text={joinWords(selection.tokens.map((token) => token.text))} canEdit onRequestEdit={() => setDrafts(transcriptSelectionEdits(selection.tokens))}
        onDecorate={(patch) => { onDecorate(targets, patch); close(); }} styleHighlight={styleHighlight}
        addKinds={addKinds}
        {...(onAddAtRange ? { onAdd: (kind: TranscriptAddKind) => { onAddAtRange(kind, joinWords(selection.tokens.map((token) => token.text)), Math.min(...selection.tokens.map((token) => token.startSec)), Math.max(...selection.tokens.map((token) => token.endSec)), { left: selection.left, top: selection.top, ...contextAround(Math.min(...selection.tokens.map((token) => token.startSec)), Math.max(...selection.tokens.map((token) => token.endSec))) }); close(); } } : {})}
        onGenerateMG={() => { onGenerateMG(joinWords(selection.tokens.map((token) => token.text)), Math.min(...selection.tokens.map((token) => token.startSec)), Math.max(...selection.tokens.map((token) => token.endSec))); close(); }}
        onDelete={() => { onCut(cutsFor(selection.tokens), t('panels.deletedNSelectedWords', { n: targets.length })); close(); }}
        deleteLabel={t('captions.deleteFootageSelection')}
        onMaskAudio={() => { onMask(targets, { audio: 'beep' }, t('panels.maskedAudioNWords', { n: targets.length })); close(); }}
        onMaskText={() => { onMask(targets, { text: DEFAULT_MASK_TEXT }, t('panels.maskedTextNWords', { n: targets.length })); close(); }}
        onUnmask={selection.tokens.some((token) => token.masked) ? () => { onMask(targets, { audio: null, text: null }, t('panels.unmaskedNWords', { n: targets.length })); close(); } : undefined}
      />}
    </div>, window.document.body)}
  </div>;
}
