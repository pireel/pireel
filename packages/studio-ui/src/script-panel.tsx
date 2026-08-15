'use client';

/**
 * Right-rail script panel (Descript-style transcript-driven editing): the whole script is a word-level plain-text stream —
 * click a word to pop up "delete / replace"; drag-select multiple words = batch delete; a pause (between sentences or
 * inside one) is inlined as a (…9.4s) marker you can click to shorten. Clicking either a word or a marker also moves the
 * playhead there and brings that moment into view on the timeline. Deleting words/pauses = deleting the corresponding
 * video range (source time -> current-edit mapping lives in workbench cutSrcRanges).
 * Top batch actions: one-click pause trim, delete filler words (uh/um…, requires true word-level timestamps).
 * The panel only computes, it doesn't cut — cut/replace go through callbacks (workbench centralizes undo snapshot / block compaction / caption sync).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Scissors, ScrollText } from 'lucide-react';
import { wordsFromText } from '@pireel/studio-engine/caption-fx';
import type { VideoShot } from '@pireel/studio-engine/composition';
import { narrationGaps, srcToEditedLoose, tightenCutRanges } from '@pireel/studio-engine/trim';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { t } from './i18n';

/** A pause counts as dead air from this length up (sec); shorter than this is breathing, leave it alone. */
const MIN_PAUSE_SEC = 0.8;
/** Air LEFT IN PLACE when a pause is compressed (sec) — pauses are shortened, never removed outright.
 *  The residue is the recording's own room tone at that exact moment, and keeping it is what holds the noise
 *  floor continuous: cut a pause to nothing and the background hiss vanishes and snaps back, which the ear
 *  reads as a glitch even though every word survived. Split evenly across the two sides of the cut. */
const KEEP_AIR_SEC = 0.3;
/** Head and tail have no seam to protect (nothing precedes/follows), so they're cleared outright — this is
 *  just the guard on the speech side, so cutting flush doesn't clip the first attack / last tail. */
const EDGE_PAD_SEC = 0.12;
/** Filler words (whole-word match, conservative list — words like "那个/就是" often carry real meaning, leave them). */
const FILLER_RE = /^(嗯+|呃+|唔+|诶+|额+|um+|uh+|emm+|hmm+)[,。,.!?!?…]?$/i;

export type SrcRange = [number, number];
/** One compressible pause. after = the sentence it follows (-1 = before the first); wi set = it sits INSIDE that
 *  sentence, right after word wi. range = the slice actually removed (the kept room tone is outside it). */
type Gap = { after: number; wi?: number; range: SrcRange; alive: boolean; rawDur: number; aliveDur: number };
/** Source-tagged cut/restore unit: src=null is the talking-head source, otherwise the inserted source's src key — each source's timeline is independent. */
export type ScriptCut = { src: string | null; range: SrcRange };
type Word = { text: string; start: number; end: number };

/** The script is multi-source: each sentence belongs to one source (talking-head src=null / inserted src = that segment's src key).
 *  Source-time operations (presence check / delete / restore / seek) intersect only with same-source shots — seconds from different files would collide numerically. */
const inSrcOf = (src: string | null) => (c: VideoShot) => (c.src ?? null) === src;

/** Whether a source's src range still has any remnant under the current edit (a fully-cut word/sentence = deleted). */
function srcRangeAlive(shots: VideoShot[], src: string | null, s: number, e: number): boolean {
  return shots.some((c) => (c.src ?? null) === src && Math.min(c.srcEnd, e) - Math.max(c.srcStart, s) > 0.04);
}

/** WORD presence = does its MIDPOINT survive — never the >0.04s-overlap test ranges use: ASR word
 *  timestamps can be shorter than that tolerance (particles often get near-zero spans), and such a
 *  word can NEVER pass an overlap threshold — it rendered struck through fresh off extraction,
 *  before any cut existed, reading like a (wrong) automatic filler pre-delete. Strict containment,
 *  no tolerance: a word-delete cuts [start−0.02, end+0.02], so the midpoint lands dead precisely. */
function wordAlive(shots: VideoShot[], src: string | null, w: { start: number; end: number }): boolean {
  const mid = (w.start + w.end) / 2;
  return shots.some((c) => (c.src ?? null) === src && mid >= c.srcStart && mid <= c.srcEnd);
}

/** The src range a word delete/restore operates on. Normal words pad ±0.02s; ultra-short words widen
 *  to ≥0.07s total — the cut pipeline drops segments ≤0.04s as numerical slivers, so a zero-span
 *  word's ±0.02 range (exactly 0.04s) would be silently ignored: click-delete became a no-op. */
function wordCutRange(w: { start: number; end: number }): SrcRange {
  const half = Math.max(0.035, (w.end - w.start) / 2 + 0.02);
  const mid = (w.start + w.end) / 2;
  return [Math.max(0, mid - half), mid + half];
}

/** How many seconds of a source range survive the current edit (sum of shot overlaps). */
function srcAliveDur(shots: VideoShot[], src: string | null, s: number, e: number): number {
  let d = 0;
  for (const c of shots) if ((c.src ?? null) === src) d += Math.max(0, Math.min(c.srcEnd, e) - Math.max(c.srcStart, s));
  return d;
}

/** One sentence in the script: which source seg belongs to + in-source sentence index + final-cut landing point (sort key; sentences interleave in final-cut order). */
type SentItem = { src: string | null; si: number; seg: AsrSegment; words: Word[]; at: number };

type Popover =
  | { kind: 'word'; src: string | null; si: number; word: Word; x: number; y: number }
  | { kind: 'deadword'; src: string | null; word: Word; x: number; y: number }
  | { kind: 'gap'; range: SrcRange; x: number; y: number }
  | { kind: 'deadgap'; range: SrcRange; x: number; y: number }
  | { kind: 'sel'; cut: { items: ScriptCut[]; count: number } | null; restore: { items: ScriptCut[]; count: number } | null; x: number; y: number };

export function ScriptPanel({
  sentences,
  clipSentences,
  shots,
  videoDurationSec,
  extracting,
  onExtract,
  onSeek,
  onCut,
  onRestore,
  onReplaceWord,
}: {
  sentences: AsrSegment[] | null;
  /** Inserted-source transcripts (keyed by shot.src): sentence times are on that source file's own timeline. */
  clipSentences: Record<string, AsrSegment[]>;
  shots: VideoShot[];
  videoDurationSec: number;
  /** ASR extraction in progress (button spins to prevent double-clicks). */
  extracting: boolean;
  onExtract: () => void;
  /** Seek somewhere (final-cut time). */
  onSeek: (editedSec: number) => void;
  /** Cut a batch (source, source time range); msg = success toast text. */
  onCut: (cuts: ScriptCut[], msg: string) => void;
  /** Restore a batch of deleted ones (source, source time range) (clicking a deleted word). */
  onRestore: (cuts: ScriptCut[], msg: string) => void;
  /** Replace one word in a given source's sentence (located by word timestamp; syncs already-laid captions). */
  onReplaceWord: (src: string | null, si: number, word: Word, text: string) => void;
}) {
  const sents = useMemo(() => sentences ?? [], [sentences]);
  // All-source sentence stream: talking-head sentences + each inserted source's sentences (prefer true word-level word streams,
  // else estimate by character proportion), interleaved by each one's source->final-cut landing point — an inserted clip's
  // script appears at its position in the film
  const items = useMemo(() => {
    const out: SentItem[] = [];
    sents.forEach((seg, si) =>
      out.push({ src: null, si, seg, words: seg.words?.length ? seg.words : wordsFromText(seg.text, seg.start, seg.end), at: srcToEditedLoose(shots, seg.start, inSrcOf(null)) }),
    );
    for (const [src, list] of Object.entries(clipSentences)) {
      if (!shots.some((c) => c.src === src)) continue; // this source is entirely out of the film
      list.forEach((seg, si) =>
        out.push({ src, si, seg, words: seg.words?.length ? seg.words : wordsFromText(seg.text, seg.start, seg.end), at: srcToEditedLoose(shots, seg.start, inSrcOf(src)) }),
      );
    }
    return out.sort((a, b) => a.at - b.at || a.si - b.si);
  }, [sents, clipSentences, shots]);
  const hasTrueWords = items.some((it) => it.seg.words?.length);

  // Dead air = a no-speech region ≥ MIN_PAUSE_SEC, either between sentences or between two words inside one
  // (a long mid-sentence pause is dead air too — ASR just happened not to break the sentence there; that one
  // needs true word timestamps, estimated ones interpolate and would invent gaps). Head/tail are cleared
  // outright, everything in between keeps KEEP_AIR_SEC of room tone. Compressed ones stay in the stream struck
  // through (same convention as deleted words). Only the talking-head source counts — an inserted source's
  // silent stretches are the footage itself, not dead air to batch-cut.
  const gaps = useMemo(() => {
    if (!sents.length || videoDurationSec <= 0) return [] as Gap[];
    const out: Gap[] = [];
    // Enumeration is the SHARED inventory (narrationGaps — same one the agent's transcript notes read
    // from; two lists of "where is the dead air" is how chat and this panel end up disagreeing).
    // This panel only adds its CUT POLICY on top: interior pauses go through the same margin math the
    // agent's cut_narration uses; head/tail are asymmetric — cleared up to the speech guard.
    for (const g of narrationGaps(sents, videoDurationSec, MIN_PAUSE_SEC)) {
      const [from, to] = g.edge
        ? [g.edge === 'head' ? g.a : g.a + EDGE_PAD_SEC, g.edge === 'tail' ? g.b : g.b - EDGE_PAD_SEC]
        : (() => {
            const r = tightenCutRanges([{ from: g.a, to: g.b }], KEEP_AIR_SEC, 0.05)[0];
            return r ? [r.from, r.to] : [0, 0];
          })();
      if (to - from < 0.05) continue;
      // "Deleted" is a verdict on surviving AIR, not on whether OUR margin range is dead: the agent's
      // cut_narration keeps its own keepGapSec (0.15–0.6) and a calmer margin than ours used to leave
      // slivers alive inside our range — the pause was genuinely tightened but never got its strike.
      // If what survives the raw gap is less than dead-air threshold, it's breathing room now → struck.
      const aliveDur = srcAliveDur(shots, null, g.a, g.b);
      out.push({ after: g.after, wi: g.wi, range: [from, to], alive: aliveDur >= MIN_PAUSE_SEC, rawDur: g.b - g.a, aliveDur });
    }
    return out;
  }, [sents, videoDurationSec, shots]);
  const silences = useMemo(() => gaps.filter((g) => g.alive), [gaps]);
  // Honest cuttable total: what actually leaves the timeline (surviving air minus kept room tone),
  // not the margin range's nominal width — the two differ once a gap has been partially cut.
  const silenceTotal = silences.reduce((a, g) => a + Math.max(0, g.aliveDur - KEEP_AIR_SEC), 0);
  const gapAfter = useMemo(() => new Map(gaps.filter((g) => g.wi == null).map((g) => [g.after, g])), [gaps]);
  /** Mid-sentence gaps, keyed "sentenceIndex:wordIndex" (the token renders right after that word). */
  const gapInWord = useMemo(() => new Map(gaps.filter((g) => g.wi != null).map((g) => [`${g.after}:${g.wi}`, g])), [gaps]);

  // Filler words: require true word-level timestamps (won't auto-batch-cut on estimated times; manual click-delete is the user's own call). All sources participate
  const fillers = useMemo(() => {
    if (!hasTrueWords) return [] as { src: string | null; range: SrcRange; text: string }[];
    const out: { src: string | null; range: SrcRange; text: string }[] = [];
    for (const it of items) {
      for (const w of it.seg.words ?? []) {
        if (FILLER_RE.test(w.text.trim()) && wordAlive(shots, it.src, w)) {
          out.push({ src: it.src, range: wordCutRange(w), text: w.text.trim() });
        }
      }
    }
    return out;
  }, [items, hasTrueWords, shots]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const [pop, setPop] = useState<Popover | null>(null);
  const [replacing, setReplacing] = useState(''); // replacement input (when pop.kind==='word')
  const [replaceMode, setReplaceMode] = useState(false);
  useEffect(() => {
    if (!pop) return;
    const close = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-script-pop]')) return;
      setPop(null);
      setReplaceMode(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [pop]);

  /** Panel-local coordinates (for the popover's absolute positioning). */
  const localXY = (clientX: number, clientY: number) => {
    const r = rootRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  };

  const openWordPop = (e: React.MouseEvent, it: SentItem, word: Word) => {
    e.stopPropagation();
    const { x, y } = localXY(e.clientX, e.clientY);
    setPop({ kind: 'word', src: it.src, si: it.si, word, x, y: y + 14 });
    setReplaceMode(false);
    setReplacing(word.text);
    onSeek(srcToEditedLoose(shots, word.start, inSrcOf(it.src)));
  };

  /** Pause marker click: pop delete/restore AND move the playhead there, same as clicking a word — a marker
   *  is a position in the video too. A compressed-away pause has no edited time of its own; the loose
   *  mapping lands on the seam it left behind, which is the moment worth looking at. */
  const openGapPop = (e: React.MouseEvent, g: Gap) => {
    setPop({ kind: g.alive ? 'gap' : 'deadgap', range: g.range, ...localXY(e.clientX, e.clientY + 14) });
    onSeek(srcToEditedLoose(shots, g.range[0], inSrcOf(null)));
  };

  /** Drag multi-select: on mouseup, gather the words the selection covers — present ones can be batch-deleted, deleted ones
   *  batch-restored (a mixed selection offers both actions). Grouped by source: each source's timeline is independent, so delete ranges can't merge across sources. */
  const onMouseUp = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !rootRef.current) return;
    const nodes = [...rootRef.current.querySelectorAll<HTMLElement>('[data-w]')].filter((el) => sel.containsNode(el, true));
    if (nodes.length < 2) return; // a single word goes through the click popover
    const aliveBySrc = new Map<string | null, { lo: number; hi: number; n: number }>();
    const deadBySrc = new Map<string | null, SrcRange[]>();
    let deadN = 0;
    for (const el of nodes) {
      const ws = Number(el.dataset.ws);
      const we = Number(el.dataset.we);
      const src = el.dataset.src || null;
      if (!Number.isFinite(ws) || we < ws) continue;
      if (wordAlive(shots, src, { start: ws, end: we })) {
        const g = aliveBySrc.get(src) ?? { lo: Infinity, hi: -Infinity, n: 0 };
        g.lo = Math.min(g.lo, ws);
        g.hi = Math.max(g.hi, we);
        g.n++;
        aliveBySrc.set(src, g);
      } else {
        // Adjacent deleted words' pads overlap -> merge into one continuous range (restoreSrcRange is already idempotent to repeated restores)
        const a = Math.max(0, ws - 0.02);
        const b = we + 0.02;
        const rs = deadBySrc.get(src) ?? [];
        const last = rs[rs.length - 1];
        if (last && a <= last[1] + 0.05) last[1] = Math.max(last[1], b);
        else rs.push([a, b]);
        deadBySrc.set(src, rs);
        deadN++;
      }
    }
    const aliveN = [...aliveBySrc.values()].reduce((a, g) => a + g.n, 0);
    const cut = aliveN > 0 ? { items: [...aliveBySrc.entries()].map(([src, g]) => ({ src, range: [Math.max(0, g.lo - 0.02), g.hi + 0.02] as SrcRange })), count: aliveN } : null;
    const restore = deadN > 0 ? { items: [...deadBySrc.entries()].flatMap(([src, rs]) => rs.map((range) => ({ src, range }))), count: deadN } : null;
    if (!cut && !restore) return;
    const { x, y } = localXY(e.clientX, e.clientY);
    setPop({ kind: 'sel', cut, restore, x, y: y + 14 });
  };

  if (!items.length) {
    return (
      <div className="bg-canvas flex h-full min-h-0 w-full flex-col">
        <PanelHeader hint={t('panels.deleteWordDeleteFootage')} />
        <div className="text-ink-4 flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[11.5px]">
          <ScrollText size={22} />
          {t('panels.noTranscriptYetTranscribe')}
          <button
            type="button"
            onClick={onExtract}
            disabled={extracting}
            className="bg-ink text-bg inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-50"
          >
            {extracting ? <Loader2 size={12} className="animate-spin" /> : <ScrollText size={12} />}
            {extracting ? t('panels.transcribing') : t('tools.extract_asr.label')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-canvas relative flex h-full min-h-0 w-full flex-col" ref={rootRef}>
      <PanelHeader hint={hasTrueWords ? t('panels.clickWordHint') : t('panels.clickWordHintEstimated')} />
      {/* Batch actions */}
      <div className="flex min-h-9 shrink-0 flex-wrap items-center gap-1.5 px-3 py-1.5">
        <button
          type="button"
          disabled={!silences.length}
          onClick={() => onCut(silences.map((g) => ({ src: null, range: g.range })), t('panels.deletedNSilencesSec', { n: silences.length, sec: silenceTotal.toFixed(1) }))}
          className="border-line text-ink-2 hover:text-ink inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-40"
        >
          <Scissors size={11} /> {silences.length ? t('panels.cutSilencesNSec', { n: silences.length, sec: silenceTotal.toFixed(1) }) : t('panels.cutSilences')}
        </button>
        <button
          type="button"
          disabled={!fillers.length}
          onClick={() => onCut(fillers.map((f) => ({ src: f.src, range: f.range })), t('panels.deletedNFillerWords', { n: fillers.length }))}
          title={hasTrueWords ? (fillers.length ? fillers.map((f) => f.text).join(' ') : t('panels.noFillerWordsDetected')) : t('panels.transcriptLacksWordLevel')}
          className="border-line text-ink-2 hover:text-ink inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] disabled:opacity-40"
        >
          <Scissors size={11} /> {fillers.length ? t('panels.cutFillersN', { n: fillers.length }) : t('panels.cutFillers')}
        </button>
      </div>
      {/* Word-level plain-text stream: click a word to pop delete/replace, drag to multi-select, silence inlined as (…9.4s);
          deleted words/silence stay in the stream struck through.
          Never scrolls horizontally: add spaces between Latin words for line-break opportunities, break-words as a fallback for over-long tokens (URLs/long numbers) */}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden break-words px-3 py-2.5 text-[13px] leading-[1.9]" onMouseUp={onMouseUp}>
        {gapAfter.has(-1) && (
          <GapToken gap={gapAfter.get(-1)!} onClick={(e) => openGapPop(e, gapAfter.get(-1)!)} />
        )}
        {items.map((it) => (
          <span key={`${it.src ?? 'n'}:${it.si}`}>
            {it.words.map((w, wi) => {
              const alive = wordAlive(shots, it.src, w);
              const picked = pop?.kind === 'word' && pop.src === it.src && pop.si === it.si && Math.abs(pop.word.start - w.start) < 1e-3 && Math.abs(pop.word.end - w.end) < 1e-3;
              const pickedDead = pop?.kind === 'deadword' && pop.src === it.src && Math.abs(pop.word.start - w.start) < 1e-3 && Math.abs(pop.word.end - w.end) < 1e-3;
              return (
                <span
                  key={wi}
                  data-w
                  data-ws={w.start}
                  data-we={w.end}
                  data-src={it.src ?? ''}
                  onClick={(e) => {
                    if (alive) {
                      openWordPop(e, it, w);
                    } else {
                      e.stopPropagation();
                      setPop({ kind: 'deadword', src: it.src, word: w, ...localXY(e.clientX, e.clientY + 14) });
                    }
                  }}
                  title={alive ? undefined : t('panels.deletedClickRestore')}
                  className={
                    alive
                      ? `text-ink cursor-pointer rounded-sm px-[1px] ${picked ? 'bg-accent/25 ring-accent/60 ring-1' : 'hover:bg-accent/15'}`
                      : `text-ink-4 cursor-pointer rounded-sm px-[1px] line-through opacity-60 ${pickedDead ? 'bg-accent/20 ring-accent/50 ring-1' : 'hover:opacity-90'}`
                  }
                >
                  {w.text}
                </span>
              );
            })
              // A mid-sentence pause marker takes the boundary's place; otherwise add spaces at Latin word boundaries
              // (no whitespace between adjacent spans = an English sentence becomes one unbreakable long string,
              // ugly, and forces horizontal scroll)
              .flatMap((node, wi, arr) => {
                const g = it.src === null ? gapInWord.get(`${it.si}:${wi}`) : undefined;
                if (g)
                  return [
                    node,
                    <GapToken key={`g${wi}`} gap={g} onClick={(e) => openGapPop(e, g)} />,
                  ];
                return wi < arr.length - 1 && needsSpace(it.words[wi]!.text, it.words[wi + 1]!.text) ? [node, ' '] : [node];
              })}
            {it.src === null && gapAfter.has(it.si) && (
              <GapToken gap={gapAfter.get(it.si)!} onClick={(e) => openGapPop(e, gapAfter.get(it.si)!)} />
            )}{' '}
          </span>
        ))}
      </div>

      {/* Popover: word (delete/replace) · silence (delete) · multi-select (batch delete) */}
      {pop && (
        <div
          data-script-pop
          className="border-line bg-panel absolute z-50 flex items-center gap-1 rounded-lg border px-1.5 py-1 shadow-xl"
          style={{ left: Math.max(8, Math.min(pop.x - 40, 240)), top: pop.y }}
        >
          {pop.kind === 'word' && !replaceMode && (
            <>
              <button
                type="button"
                onClick={() => {
                  onCut([{ src: pop.src, range: wordCutRange(pop.word) }], t('panels.deletedWord', { word: pop.word.text }));
                  setPop(null);
                }}
                className="text-ink-2 hover:text-destructive px-1.5 py-0.5 text-[11.5px]"
              >
                {t('tools.delete_block.label')}
              </button>
              <div className="bg-line h-3.5 w-px" />
              <button type="button" onClick={() => setReplaceMode(true)} className="text-ink-2 hover:text-ink px-1.5 py-0.5 text-[11.5px]">
                {t('panels.replace')}
              </button>
            </>
          )}
          {pop.kind === 'word' && replaceMode && (
            <>
              <input
                autoFocus
                value={replacing}
                onChange={(e) => setReplacing(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && replacing.trim()) {
                    onReplaceWord(pop.src, pop.si, pop.word, replacing.trim());
                    setPop(null);
                    setReplaceMode(false);
                  }
                  if (e.key === 'Escape') {
                    setPop(null);
                    setReplaceMode(false);
                  }
                }}
                className="border-line bg-panel-2 text-ink w-24 rounded border px-1.5 py-0.5 text-[11.5px] outline-none"
                aria-label={t('panels.replacementWord')}
              />
              <button
                type="button"
                disabled={!replacing.trim()}
                onClick={() => {
                  onReplaceWord(pop.src, pop.si, pop.word, replacing.trim());
                  setPop(null);
                  setReplaceMode(false);
                }}
                className="text-accent px-1 py-0.5 text-[11.5px] font-medium disabled:opacity-40"
              >
                {t('panels.ok')}
              </button>
            </>
          )}
          {pop.kind === 'deadword' && (
            <button
              type="button"
              onClick={() => {
                onRestore([{ src: pop.src, range: wordCutRange(pop.word) }], t('panels.restoredWord', { word: pop.word.text }));
                setPop(null);
              }}
              className="text-ink-2 hover:text-ink px-1.5 py-0.5 text-[11.5px]"
            >
              {t('panels.restoreWord', { word: pop.word.text })}
            </button>
          )}
          {pop.kind === 'gap' && (
            <button
              type="button"
              onClick={() => {
                onCut([{ src: null, range: pop.range }], t('panels.deletedSecSSilence', { sec: (pop.range[1] - pop.range[0]).toFixed(1) }));
                setPop(null);
              }}
              className="text-ink-2 hover:text-destructive px-1.5 py-0.5 text-[11.5px]"
            >
              {t('panels.deleteSilenceSecS', { sec: (pop.range[1] - pop.range[0]).toFixed(1) })}
            </button>
          )}
          {pop.kind === 'deadgap' && (
            <button
              type="button"
              onClick={() => {
                onRestore([{ src: null, range: pop.range }], t('panels.restoredSecSSilence', { sec: (pop.range[1] - pop.range[0]).toFixed(1) }));
                setPop(null);
              }}
              className="text-ink-2 hover:text-ink px-1.5 py-0.5 text-[11.5px]"
            >
              {t('panels.restoreSilenceSecS', { sec: (pop.range[1] - pop.range[0]).toFixed(1) })}
            </button>
          )}
          {pop.kind === 'sel' && (
            <>
              {pop.cut && (
                <button
                  type="button"
                  onClick={() => {
                    onCut(pop.cut!.items, t('panels.deletedNSelectedWords', { n: pop.cut!.count }));
                    setPop(null);
                    window.getSelection()?.removeAllRanges();
                  }}
                  className="text-ink-2 hover:text-destructive px-1.5 py-0.5 text-[11.5px]"
                >
                  {t('panels.deleteSelectedNWords', { n: pop.cut.count })}
                </button>
              )}
              {pop.cut && pop.restore && <div className="bg-line h-3.5 w-px" />}
              {pop.restore && (
                <button
                  type="button"
                  onClick={() => {
                    onRestore(pop.restore!.items, t('panels.restoredNSelectedWords', { n: pop.restore!.count }));
                    setPop(null);
                    window.getSelection()?.removeAllRanges();
                  }}
                  className="text-ink-2 hover:text-ink px-1.5 py-0.5 text-[11.5px]"
                >
                  {t('panels.restoreSelectedNWords', { n: pop.restore.count })}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Whether to add a space at a Latin word boundary: prev word ends with an ASCII word char / punctuation and next word starts with an ASCII word char.
 *  Don't add between Chinese words (chars already break freely; adding would spread them out visually); ASR's English words usually don't carry their own spaces. */
function needsSpace(cur: string, next: string): boolean {
  return /[A-Za-z0-9.,!?;:'")\]%]$/.test(cur) && /^[A-Za-z0-9('"[$]/.test(next);
}

/** Silence marker: (…9.4s). Present = click to delete (label = cuttable seconds); deleted = struck through
 *  in the stream showing the seconds actually removed (matches the agent receipt), click to restore. */
function GapToken({ gap, onClick }: { gap: { range: SrcRange; alive: boolean; rawDur: number; aliveDur: number }; onClick: (e: React.MouseEvent) => void }) {
  const label = `(…${(gap.alive ? Math.max(0, gap.aliveDur - KEEP_AIR_SEC) : gap.rawDur - gap.aliveDur).toFixed(1)}s)`;
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      title={gap.alive ? t('panels.silenceClickDelete') : t('panels.deletedSilenceClickRestore')}
      className={
        gap.alive
          ? 'text-ink-4 hover:text-ink hover:bg-panel-2 mx-0.5 cursor-pointer rounded px-1 font-mono text-[11px]'
          : 'text-ink-4 hover:bg-panel-2 mx-0.5 cursor-pointer rounded px-1 font-mono text-[11px] line-through opacity-60 hover:opacity-90'
      }
    >
      {label}
    </span>
  );
}

/** The title belongs to the floating-window header; only a one-line hint remains here. */
function PanelHeader({ hint }: { hint: string }) {
  return <div className="bg-panel text-ink-4 flex h-8 shrink-0 items-center px-3 text-[10.5px]">{hint}</div>;
}
