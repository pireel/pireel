/**
 * Caption re-lay / narration beats — parameterized pure functions (extracted from
 * the workbench component: the original closed over clipAsrRef/compRef, so using
 * them on both ends means passing the data as params).
 *
 * Consumers: workbench (thin wrapper feeding refs) + server-executor (offline MCP:
 * when the tab is closed, cut_narration/set_captions run server-side, data from
 * studio_projects.context). Pure-module discipline: zero react/browser deps (same
 * tier as build-draft/build-blocks).
 */

import { cueChunks, detectLang, wordsFromText } from './caption-fx';
import { type Block, type VideoShot, isSentenceCaption } from './composition';
import { spans as clipSpans, srcToEditedLoose } from './trim';
import { type AsrSegment, type CueRef, type CueWord, type DisplayCue, captionBlocksFromAsr } from './build-blocks';
import { joinWords } from './caption-fx';

/** Source-domain predicate: the narration/transcript timeline belongs to the narration source (segments without a src field). */
export const inNarrationSource = (c: VideoShot): boolean => !c.src;

/** Intermediate derived shape: an edited-timeline sentence fragment with si-stamped words + source pointer. */
export type MappedSeg = Omit<AsrSegment, 'words'> & { words: CueWord[]; ref: CueRef };

/** Map a source's transcript word times (that source's coords) onto the edited
 *  timeline (final coords) and drop words fully cut away — used when laying/re-
 *  laying captions: caption blocks live on the edited timeline, so after cutting
 *  you can't lay them by source time directly. */
export function mapSegsToEdited(segs: AsrSegment[], shots: VideoShot[], inSrc: (c: VideoShot) => boolean = inNarrationSource, srcKey: string | null = null): MappedSeg[] {
  const out: MappedSeg[] = [];
  for (const [segIdx, s] of segs.entries()) {
    const words: CueWord[] = (s.words?.length ? s.words : wordsFromText(s.text, s.start, s.end))
      .map((w, wi) => {
        const start = srcToEditedLoose(shots, w.start, inSrc);
        const end = srcToEditedLoose(shots, w.end, inSrc);
        // Word width only shrinks, never grows: when a cut / insert lands mid-word,
        // the loose mapping would swallow the whole inserted duration into the word
        // (making word gaps seamless, so splitting can't detect it) — cap at the
        // source-domain word width so the jump falls between words instead.
        // si = the word's index within the source sentence (edit/translation write-back key).
        return { ...w, si: (w as CueWord).si ?? wi, start, end: Math.min(end, start + (w.end - w.start) + 0.05) };
      })
      .filter((w) => w.end - w.start > 0.03);
    if (!words.length) continue;
    // Sentence broken up by editing (a segment from another source inserted
    // between words): a big jump appears in edited time — split into multiple
    // captions by the jump, each window hugging its own words. Without splitting,
    // one caption spans the whole insert and stacks on the insert's own caption at
    // the same anchor (observed: two lines of subtitles piled up). Word-delete
    // edits produce no jump (time is compressed), so they're unaffected
    const groups: (typeof words)[] = [[words[0]!]];
    for (let i = 1; i < words.length; i++) {
      if (words[i]!.start - words[i - 1]!.end > 0.8) groups.push([words[i]!]);
      else groups[groups.length - 1]!.push(words[i]!);
    }
    // Translation (sub) follows only the first group: when a sentence is split into several, re-laying the whole-sentence translation would stack two copies
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

/** All-source transcript → edited-timeline caption data: narration source + each inserted source mapped by its own predicate, sorted by edited time. */
export function mappedCaptionSegs(shots: VideoShot[], narr: AsrSegment[] | null, clipAsr: Record<string, AsrSegment[]>): MappedSeg[] {
  return [
    ...(narr?.length ? mapSegsToEdited(narr, shots) : []),
    ...Object.entries(clipAsr).flatMap(([src, segs]) => (shots.some((c) => c.src === src) ? mapSegsToEdited(segs, shots, (c) => c.src === src, src) : [])),
  ].sort((a, b) => a.start - b.start);
}

/** DISPLAY CUES — the single derivation both the caption blocks and the panel's line list consume,
 *  so "one row = one on-screen line" holds by construction. Per source sentence: take the words that
 *  survive the edit (mapSegsToEdited), then split by visual width (cueChunks). Each cue carries
 *  ref {src, seg, w0, w1} pointing back into the source sentence for edit/translation write-back.
 *  Cue translation: the sentence's cueSubs["w0:w1"] wins; a whole-sentence sub shows only when the
 *  sentence maps to exactly this full-range single cue (agent BYO translations keep working 1:1).
 *  opts.subLang = the CURRENT bilingual target: translations stamped with a DIFFERENT known language
 *  are stale (left over from a language switch) and are hidden; unstamped ones (legacy/BYO) show. */
export function displayCues(
  shots: VideoShot[],
  narr: AsrSegment[] | null,
  clipAsr: Record<string, AsrSegment[]>,
  opts?: { subLang?: string },
): DisplayCue[] {
  const out: DisplayCue[] = [];
  for (const g of mappedCaptionSegs(shots, narr, clipAsr)) {
    const words = g.words;
    if (!words.length) continue;
    const gRef = g.ref;
    const srcSeg = gRef ? (gRef.src ? clipAsr[gRef.src] : narr)?.[gRef.seg] : undefined;
    const srcWordCount = srcSeg ? (srcSeg.words?.length ?? wordsFromText(srcSeg.text, srcSeg.start, srcSeg.end).length) : 0;
    const subFresh = !srcSeg?.subLang || !opts?.subLang || srcSeg.subLang === opts.subLang;
    // Language-aware cue size (international product, zh/en are both first-class): CJK convention is
    // ONE line per subtitle event (~11 full-width chars); Latin-script convention is up to TWO lines
    // (Netflix ~42 chars/line — a cue holds a clause, not 3-4 words). 22em ≈ two display lines; the
    // stack renders them together, so an EN cue reads as one block instead of rapid tiny flips.
    const latin = (srcSeg?.lang ?? g.lang ?? detectLang(g.text)) === 'en';
    const chunks = cueChunks(words, { maxEm: latin ? 22 : 11 });
    for (const c of chunks) {
      const w0 = c[0]!.si ?? 0;
      const w1 = c[c.length - 1]!.si ?? 0;
      const sub = subFresh
        ? (srcSeg?.cueSubs?.[`${w0}:${w1}`] ?? (srcSeg && w0 === 0 && w1 === srcWordCount - 1 && words.length === srcWordCount ? srcSeg.sub : undefined))
        : undefined;
      out.push({
        start: c[0]!.start,
        end: Math.max(c[c.length - 1]!.end, c[0]!.start + 0.3),
        text: joinWords(c.map((w) => w.text)),
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

/** Captions = a pure computation from the transcript: whenever the transcript
 *  changes (delete sentence/word, restore, edit word, inserted-clip transcript
 *  arrives), recompute the whole layer. No captions laid → return as-is (don't add
 *  a layer); no transcript from any source → keep the existing layer, don't clear. */
export function relayCaptionLayer(
  blocks: Block[],
  shots: VideoShot[],
  narr: AsrSegment[] | null,
  clipAsr: Record<string, AsrSegment[]>,
  opts?: { subLang?: string },
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

/** Inserted clips → planning context (pure, shared by both ends: workbench builds
 *  the planning input / server-executor validates sentence count in offline
 *  submit_plan). Anchor = the srcEnd of the nearest preceding main-source segment
 *  (main-source time domain, the plan's convention); sentences = the transcript
 *  sentences within that insert window (the clip's OWN source clock, index
 *  re-numbered from 0 within the window) — the input surface for equal-footing
 *  storyboarding, order = the clip index in the plan contract (1-based). */
export function insertPlanContexts(
  shots: VideoShot[],
  clipAsr: Record<string, AsrSegment[]>,
): { atSec: number; durationSec: number; text: string; sentences?: { index: number; start: number; end: number; text: string }[] }[] {
  const out: { atSec: number; durationSec: number; text: string; sentences?: { index: number; start: number; end: number; text: string }[] }[] = [];
  let prevMainEnd = 0;
  for (const s of shots) {
    if (!s.src) {
      prevMainEnd = s.srcEnd;
      continue;
    }
    const rows = (clipAsr[s.src] ?? [])
      .filter((x) => x.text?.trim() && x.end > s.srcStart + 0.05 && x.start < s.srcEnd - 0.05)
      .slice(0, 60)
      .map((x, i) => ({ index: i, start: Math.round(x.start * 10) / 10, end: Math.round(x.end * 10) / 10, text: x.text.trim().slice(0, 160) }));
    out.push({
      atSec: Math.round(prevMainEnd * 10) / 10,
      durationSec: Math.round((s.srcEnd - s.srcStart) * 10) / 10,
      text: joinWords(rows.map((r) => r.text)).slice(0, 300),
      ...(rows.length ? { sentences: rows } : {}),
    });
  }
  return out;
}
