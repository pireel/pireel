/**
 * Caption re-lay / narration beats — parameterized pure functions (extracted from
 * the workbench component: the original closed over clipAsrRef/compRef, so using
 * them on both ends means passing the data as params).
 *
 * Consumers: workbench (thin wrapper feeding refs) + server-executor (offline MCP:
 * when the tab is closed, cut_narration/set_captions run server-side, data from
 * studio_projects.context). Pure-module discipline: zero react/browser deps (same
 * tier as build-blocks).
 */

import { wordsFromText } from './caption-fx';
import { getCaptionPreset } from './caption-presets';
import { type CaptionStyle, DEFAULT_CAPTION_WIDTH_PCT } from './composition-core';
import { type Block, type VideoShot, isSentenceCaption } from './composition';
import { spans as clipSpans, srcToEditedLoose } from './trim';
import { type AsrSegment, type CueRef, type CueWord, type DisplayCue, captionBlocksFromAsr } from './build-blocks';
import { joinWords } from './caption-fx';
import { captionLineSegments } from './caption-layout-metrics';

/** Source-domain predicate: the narration/transcript timeline belongs to the narration source (segments without a src field). */
export const inNarrationSource = (c: VideoShot): boolean => !c.src;

/** Intermediate derived shape: an edited-timeline sentence fragment with si-stamped words + source pointer. */
export type MappedSeg = Omit<AsrSegment, 'words'> & { words: CueWord[]; ref: CueRef };

/** Map one transcript source through an arbitrary source-time → edited-time function. */
export function mapTranscriptSegsToEdited(
  segs: AsrSegment[],
  mapSourceSec: (sourceSec: number) => number,
  srcKey: string | null = null,
): MappedSeg[] {
  const out: MappedSeg[] = [];
  for (const [segIdx, s] of segs.entries()) {
    const words: CueWord[] = (s.words?.length ? s.words : wordsFromText(s.text, s.start, s.end))
      .map((w, wi) => {
        const start = mapSourceSec(w.start);
        const end = mapSourceSec(w.end);
        // Word width only shrinks, never grows: when a cut / insert lands mid-word,
        // the loose mapping would swallow the whole inserted duration into the word.
        return { ...w, si: (w as CueWord).si ?? wi, start, end: Math.min(end, start + (w.end - w.start) + 0.05) };
      })
      .filter((w) => w.end - w.start > 0.03);
    if (!words.length) continue;
    const groups: (typeof words)[] = [[words[0]!]];
    for (let i = 1; i < words.length; i++) {
      if (words[i]!.start - words[i - 1]!.end > 0.8) groups.push([words[i]!]);
      else groups[groups.length - 1]!.push(words[i]!);
    }
    groups.forEach((g, gi) =>
      out.push({
        start: g[0]!.start,
        end: g[g.length - 1]!.end,
        text: joinWords(g.map((w) => w.text)),
        words: g,
        ref: { src: srcKey, seg: segIdx, w0: g[0]!.si ?? 0, w1: g[g.length - 1]!.si ?? 0 },
        ...(s.lang ? { lang: s.lang } : {}),
        ...(s.speaker ? { speaker: s.speaker } : {}),
        ...(gi === 0 && s.sub ? { sub: s.sub } : {}),
      }),
    );
  }
  return out;
}

/** Map a source's transcript word times (that source's coords) onto the edited
 *  timeline (final coords) and drop words fully cut away — used when laying/re-
 *  laying captions: caption blocks live on the edited timeline, so after cutting
 *  you can't lay them by source time directly. */
export function mapSegsToEdited(segs: AsrSegment[], shots: VideoShot[], inSrc: (c: VideoShot) => boolean = inNarrationSource, srcKey: string | null = null): MappedSeg[] {
  return mapTranscriptSegsToEdited(segs, (sourceSec) => srcToEditedLoose(shots, sourceSec, inSrc), srcKey);
}

/** All-source transcript → edited-timeline caption data: narration source + each inserted source mapped by its own predicate, sorted by edited time. */
export function mappedCaptionSegs(shots: VideoShot[], narr: AsrSegment[] | null, clipAsr: Record<string, AsrSegment[]>): MappedSeg[] {
  return [
    ...(narr?.length ? mapSegsToEdited(narr, shots) : []),
    ...Object.entries(clipAsr).flatMap(([src, segs]) => (shots.some((c) => c.src === src) ? mapSegsToEdited(segs, shots, (c) => c.src === src, src) : [])),
  ].sort((a, b) => a.start - b.start);
}

/** Split a sentence/fragment translation into per-cue pieces, proportional to each cue's share of
 *  the source words, on the translation's own token boundaries (same tokenizer as captions). The
 *  second line follows the cue rhythm 1:1 — approximate by nature (word order diverges across
 *  languages); translation still happens at sentence level upstream for quality. */
function distributeSub(sub: string, weights: number[]): string[] {
  const tokens = wordsFromText(sub, 0, 1).map((w) => w.text);
  const total = weights.reduce((a, b) => a + b, 0);
  if (!tokens.length || !total) return weights.map(() => '');
  const out: string[] = [];
  let used = 0;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]!;
    const upto = i === weights.length - 1 ? tokens.length : Math.round((acc / total) * tokens.length);
    out.push(joinWords(tokens.slice(used, Math.max(used, upto))));
    used = Math.max(used, upto);
  }
  return out;
}

interface LockedCueRange {
  key: string;
  startPos: number;
  endPos: number;
}

function lockedCueRanges(words: readonly CueWord[], keys: readonly string[] | undefined): LockedCueRange[] {
  if (!keys?.length) return [];
  const positionBySourceIndex = new Map(words.map((word, position) => [word.si ?? position, position] as const));
  const ranges: LockedCueRange[] = [];
  for (const key of keys) {
    const [startRaw, endRaw] = key.split(':');
    const sourceStart = Number(startRaw);
    const sourceEnd = Number(endRaw);
    if (!Number.isInteger(sourceStart) || !Number.isInteger(sourceEnd) || sourceStart < 0 || sourceEnd < sourceStart) continue;
    const startPos = positionBySourceIndex.get(sourceStart);
    const endPos = positionBySourceIndex.get(sourceEnd);
    if (startPos == null || endPos == null || endPos < startPos) continue;
    // A cut through the middle of an edited cue invalidates that layout lock for this fragment. Do
    // not stretch the user's copy over non-contiguous surviving words.
    let contiguous = endPos - startPos === sourceEnd - sourceStart;
    for (let position = startPos; contiguous && position <= endPos; position += 1) {
      contiguous = (words[position]!.si ?? position) === sourceStart + position - startPos;
    }
    if (contiguous) ranges.push({ key, startPos, endPos });
  }
  return ranges.sort((left, right) => left.startPos - right.startPos || left.endPos - right.endPos);
}

/** Automatic cueing fills untouched gaps; manually edited cue ranges remain indivisible. */
function cueChunksRespectingLocks(
  words: CueWord[],
  layoutKeys: readonly string[] | undefined,
  split: (words: CueWord[]) => CueWord[][],
): CueWord[][] {
  const locks = lockedCueRanges(words, layoutKeys);
  if (!locks.length) return split(words);
  const chunks: CueWord[][] = [];
  let position = 0;
  for (const lock of locks) {
    if (lock.startPos < position) continue;
    if (lock.startPos > position) chunks.push(...split(words.slice(position, lock.startPos)));
    chunks.push(words.slice(lock.startPos, lock.endPos + 1));
    position = lock.endPos + 1;
  }
  if (position < words.length) chunks.push(...split(words.slice(position)));
  return chunks;
}

export interface DisplayCueOptions {
  subLang?: string;
  canvasW?: number;
  /** Sparse persisted caption style; defaults are applied here to match rendering. */
  style?: Partial<CaptionStyle>;
}

/** DISPLAY CUES — the single derivation both the caption blocks and the panel's line list consume,
 *  so "one row = one on-screen line" holds by construction. Per source sentence: take the words that
 *  survive the edit (mapSegsToEdited), then split by the renderer's real font metrics. cueLayout
 *  ranges are indivisible locks: editing wording never moves that cue's boundary. Each cue carries
 *  ref {src, seg, w0, w1} pointing back into the source sentence for edit/translation write-back.
 *  Cue translation: the group's stored sub (fragment-range key cueSubs["gw0:gw1"], else the
 *  whole-sentence sub) is DISTRIBUTED across the group's cues by word share — the second line
 *  follows the cue segmentation; exact per-cue keys (manual line edits / BYO word-sync) override
 *  their own piece. No cut-staleness checks: whatever is stored gets shown (user-locked).
 *  opts.subLang = the CURRENT bilingual target: translations stamped with a DIFFERENT known language
 *  are stale (left over from a language switch) and are hidden; unstamped ones (legacy/BYO) show. */
export function displayCuesFromMappedSegs(
  mapped: MappedSeg[],
  sourceSegment: (ref: CueRef) => AsrSegment | undefined,
  opts?: DisplayCueOptions,
): DisplayCue[] {
  const style = opts?.style;
  let preset = getCaptionPreset(style?.preset);
  if (style?.bg !== undefined) preset = { ...preset, bg: style.bg ?? undefined };
  const split = (words: CueWord[]) => captionLineSegments(
    words,
    preset,
    style?.wPct ?? DEFAULT_CAPTION_WIDTH_PCT,
    style?.scale ?? 1,
    opts?.canvasW ?? 1080,
    { bold: style?.bold, font: style?.font },
  );
  const out: DisplayCue[] = [];
  for (const g of mapped) {
    const words = g.words;
    if (!words.length) continue;
    const gRef = g.ref;
    const srcSeg = gRef ? sourceSegment(gRef) : undefined;
    const subFresh = !srcSeg?.subLang || !opts?.subLang || srcSeg.subLang === opts.subLang;
    // An explicit empty cueLayout means "temporarily unlocked" during a controlled re-layout.
    // Missing cueLayout falls back to cueTexts for drafts written by the short-lived combined
    // copy/layout format; every new write persists the two concerns separately.
    const layoutKeys = srcSeg?.cueLayout ?? (srcSeg?.cueTexts ? Object.keys(srcSeg.cueTexts) : undefined);
    const chunks = cueChunksRespectingLocks(words, layoutKeys, split);
    const groupSub = subFresh ? (srcSeg?.cueSubs?.[`${gRef?.w0}:${gRef?.w1}`] ?? srcSeg?.sub) : undefined;
    const pieces = groupSub ? distributeSub(groupSub, chunks.map((c) => c.length)) : undefined;
    for (const [ci, c] of chunks.entries()) {
      const w0 = c[0]!.si ?? 0;
      const w1 = c[c.length - 1]!.si ?? 0;
      const text = srcSeg?.cueTexts?.[`${w0}:${w1}`] ?? joinWords(c.map((w) => w.text));
      const sub = subFresh ? (srcSeg?.cueSubs?.[`${w0}:${w1}`] ?? pieces?.[ci]) : undefined;
      out.push({
        start: c[0]!.start,
        end: Math.max(c[c.length - 1]!.end, c[0]!.start + 0.3),
        text,
        words: c,
        cue: true,
        ...(g.lang ? { lang: g.lang } : {}),
        ...(g.speaker ? { speaker: g.speaker } : {}),
        ...(gRef ? { ref: { ...gRef, w0, w1 } } : {}),
        ...(sub ? { sub } : {}),
      });
    }
  }
  return out;
}

export function displayCues(
  shots: VideoShot[],
  narr: AsrSegment[] | null,
  clipAsr: Record<string, AsrSegment[]>,
  opts?: DisplayCueOptions,
): DisplayCue[] {
  return displayCuesFromMappedSegs(
    mappedCaptionSegs(shots, narr, clipAsr),
    (ref) => (ref.src ? clipAsr[ref.src] : narr)?.[ref.seg],
    opts,
  );
}

/** Captions = a pure computation from the transcript: whenever the transcript
 *  changes (delete sentence/word, restore, edit word, inserted-clip transcript
 *  arrives), recompute the whole layer. No captions laid → return as-is (don't add
 *  a layer); no transcript from any source → keep the existing layer, don't clear. */
export function relayCaptionLayer(
  blocks: Block[],
  shots: VideoShot[],
  narr: AsrSegment[] | null,
  clipAsr: Record<string, AsrSegment[]>,
  opts?: DisplayCueOptions,
): Block[] {
  if (!blocks.some(isSentenceCaption)) return blocks;
  const cues = displayCues(shots, narr, clipAsr, opts);
  if (!cues.length) return blocks;
  return [...blocks.filter((b) => !isSentenceCaption(b)), ...captionBlocksFromAsr(cues)];
}

/** Narration sentences within a time window → local-time beats (0 = window start),
 *  giving compose precise timing. Mapped per-shot: the window is EDITED time,
 *  sentences are each source's SOURCE time — for whatever shots the window covers,
 *  take that shot's source sentences within the corresponding source-domain window
 *  and convert back to edited. Filtering source seconds against the edited window
 *  directly would drift. */
export function beatsForWindow(
  shots: VideoShot[],
  narr: AsrSegment[] | null,
  clipAsr: Record<string, AsrSegment[]>,
  startSec: number,
  durationSec: number,
): { text: string; start: number; end: number }[] {
  const winEnd = startSec + durationSec;
  const spansAll = clipSpans(shots);
  const beats: { text: string; start: number; end: number }[] = [];
  if (spansAll.length) {
    for (const sp of spansAll) {
      const ovS = Math.max(sp.editedStart, startSec);
      const ovE = Math.min(sp.editedEnd, winEnd);
      if (ovE - ovS < 0.05) continue;
      const segs = sp.clip.src ? (clipAsr[sp.clip.src] ?? []) : (narr ?? []);
      const srcFrom = sp.clip.srcStart + (ovS - sp.editedStart);
      const srcTo = sp.clip.srcStart + (ovE - sp.editedStart);
      for (const s of segs) {
        if (!s.text?.trim() || s.end <= srcFrom + 0.05 || s.start >= srcTo - 0.05) continue;
        beats.push({
          text: s.text.trim(),
          start: Math.max(0, sp.editedStart + (s.start - sp.clip.srcStart) - startSec),
          end: Math.max(0, Math.min(sp.editedStart + (s.end - sp.clip.srcStart), winEnd) - startSec),
        });
      }
    }
    beats.sort((a, b) => a.start - b.start);
  } else {
    // No shots (defensive; in theory a placeholder always comes with shots): fall back to the old convention, edited = source
    for (const s of narr ?? []) {
      if (!s.text?.trim() || s.end <= startSec + 0.05 || s.start >= winEnd - 0.05) continue;
      beats.push({ text: s.text.trim(), start: Math.max(0, s.start - startSec), end: Math.max(0, Math.min(s.end, winEnd) - startSec) });
    }
  }
  return beats;
}
