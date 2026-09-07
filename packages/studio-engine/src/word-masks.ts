/**
 * Word masks: per-word replacements applied on top of the spoken transcript without cutting it.
 *
 * Two independent replacements, each optional:
 * - audio: the word's sound is replaced in preview and export — 'beep' (a tone) or 'mute' (silence).
 * - text: the caption shows this string instead of the word (e.g. "**").
 *
 * The transcript text and word timing stay the spoken truth (read_script, search and cutting keep
 * working on the real words); masks live beside them on the sentence, keyed by word index, and
 * survive cuts because they never reference timeline positions. Which words deserve a mask is a
 * human or agent decision — there is no built-in word list.
 */

import type { AsrSegment, TranscriptWord } from './build-blocks';
import { wordsFromText } from './caption-fx';

export type WordAudioMask = 'beep' | 'mute';

export interface WordMask {
  audio?: WordAudioMask;
  text?: string;
}

/** Default caption replacement when a text mask is requested without wording. */
export const DEFAULT_MASK_TEXT = '**';

/** Padding for a masked span, applied ONLY into the silence between words: ASR boundaries run a little
 *  early/late, but a neighbouring word that is not masked keeps every millisecond of its own span. */
export const MASK_AUDIO_PAD_SEC = 0.04;

/** When a word's end coincides with the next word's start, the ASR boundary is a shared cut, not the
 *  word's real end: the voice has already decayed into the next onset, so the mask stops this much
 *  earlier (never shorter than the kept minimum share of the word). */
export const MASK_AUDIO_END_TRIM_SEC = 0.06;
const MASK_AUDIO_MIN_KEEP = 0.55;

/** Patch semantics: undefined = leave as is; null = clear that replacement. */
export interface WordMaskPatch {
  audio?: WordAudioMask | null;
  text?: string | null;
}

/** One source-seconds span whose sound is replaced (merged across adjacent masked words). */
export interface MaskedAudioRange {
  start: number;
  end: number;
  audio: WordAudioMask;
}

/** Peak envelope of a source's audio (uniform bins over durationSec), as the timeline waveform keeps it. */
export interface AudioEnergy {
  peaks: Float32Array;
  durationSec: number;
}

/** Onset/offset detection around ASR boundaries: the word is taken to sound while its envelope stays
 *  above this share of its own peak. ASR word times are alignment cuts; the voice starts a little
 *  later and, above all, stops earlier than the cut to the next word. */
const ENERGY_THRESHOLD = 0.3;
const ENERGY_LOOK_BEFORE_SEC = 0.06;
const ENERGY_LOOK_AFTER_SEC = 0.05;
const ENERGY_EDGE_SEC = 0.012;
const ENERGY_MIN_GAP_SEC = 0.03;
/** How far INSIDE the run each edge may move: enough to shave a late cut, never enough to lose a syllable. */
const ENERGY_LOOK_INSIDE_SEC = 0.12;

/** Snap a masked run's OUTER edges to what the audio actually does, searching only near each ASR
 *  boundary (never inside the run: a run of masked words stays one span). Each edge is NaN when no
 *  clear quiet gap sits near it, so the caller keeps its heuristic for that edge; null = no data. */
export function snapRunToEnergy(
  energy: AudioEnergy,
  runStart: number,
  runEnd: number,
): { start: number; end: number } | null {
  const { peaks, durationSec } = energy;
  if (!peaks.length || durationSec <= 0 || runEnd <= runStart) return null;
  const rate = peaks.length / durationSec;
  const bin = (t: number) => Math.min(peaks.length - 1, Math.max(0, Math.round(t * rate)));
  const b0 = bin(runStart);
  const b1 = bin(runEnd);
  let runMax = 0;
  for (let i = b0; i <= b1; i++) runMax = Math.max(runMax, peaks[i]!);
  if (runMax < 0.02) return null;
  const threshold = runMax * ENERGY_THRESHOLD;
  const minGapBins = Math.max(2, Math.round(ENERGY_MIN_GAP_SEC * rate));
  const quiet = (i: number) => peaks[i]! < threshold;
  // Start: the last quiet gap (≥ minGap) that ENDS inside [runStart − lookBefore, runStart + lookInside].
  let start = Number.NaN;
  {
    const lo = bin(runStart - ENERGY_LOOK_BEFORE_SEC);
    const hi = Math.min(b1, bin(runStart + ENERGY_LOOK_INSIDE_SEC));
    let runQ = -1;
    for (let i = lo; i <= hi + 1; i++) {
      const q = i <= hi && quiet(i);
      if (q && runQ < 0) runQ = i;
      if (!q && runQ >= 0) {
        if (i - runQ >= minGapBins || runQ === lo) start = i / rate - ENERGY_EDGE_SEC;
        runQ = -1;
      }
    }
  }
  // End: the first quiet gap (≥ minGap, or running past the window) that STARTS inside
  // [runEnd − lookInside, runEnd + lookAfter].
  let end = Number.NaN;
  {
    const lo = Math.max(b0, bin(runEnd - ENERGY_LOOK_INSIDE_SEC));
    const hi = bin(runEnd + ENERGY_LOOK_AFTER_SEC);
    let runQ = -1;
    for (let i = lo; i <= hi + 1; i++) {
      const q = i <= hi && quiet(i);
      if (q && runQ < 0) runQ = i;
      if ((!q || i === hi) && runQ >= 0) {
        const runLen = (q ? i + 1 : i) - runQ;
        if (runLen >= minGapBins || (q && i === hi)) {
          end = runQ / rate + ENERGY_EDGE_SEC;
          break;
        }
        runQ = -1;
      }
    }
  }
  return { start, end };
}

export const wordsOfSegment = (segment: AsrSegment): TranscriptWord[] => (
  segment.words?.length ? segment.words : wordsFromText(segment.text, segment.start, segment.end)
);

export function wordMaskAt(segment: AsrSegment, wordIndex: number): WordMask | undefined {
  return segment.masks?.[String(wordIndex)];
}

export function hasWordMasks(segments: readonly AsrSegment[] | null | undefined): boolean {
  return !!segments?.some((segment) => segment.masks && Object.keys(segment.masks).length > 0);
}

/** Apply a patch to one word of one sentence. Returns the same segment when nothing changes. */
export function patchWordMask(segment: AsrSegment, wordIndex: number, patch: WordMaskPatch): AsrSegment {
  const key = String(wordIndex);
  const current = segment.masks?.[key] ?? {};
  const next: WordMask = { ...current };
  if (patch.audio === null) delete next.audio;
  else if (patch.audio !== undefined) next.audio = patch.audio;
  if (patch.text === null) delete next.text;
  else if (patch.text !== undefined) next.text = patch.text.trim() || DEFAULT_MASK_TEXT;
  const same = current.audio === next.audio && current.text === next.text;
  if (same) return segment;
  const masks = { ...(segment.masks ?? {}) };
  if (next.audio || next.text !== undefined) masks[key] = next;
  else delete masks[key];
  const out: AsrSegment = { ...segment };
  if (Object.keys(masks).length) out.masks = masks;
  else delete out.masks;
  return out;
}

/** Apply one patch to many (sentenceIndex, wordIndex) targets of one transcript. */
export function applyWordMasks(
  segments: readonly AsrSegment[],
  targets: readonly { sentenceIndex: number; wordIndex: number }[],
  patch: WordMaskPatch,
): AsrSegment[] {
  const out = [...segments];
  let changed = false;
  for (const target of targets) {
    const segment = out[target.sentenceIndex];
    if (!segment) continue;
    const words = wordsOfSegment(segment);
    if (target.wordIndex < 0 || target.wordIndex >= words.length) continue;
    const next = patchWordMask(segment, target.wordIndex, patch);
    if (next !== segment) {
      out[target.sentenceIndex] = next;
      changed = true;
    }
  }
  return changed ? out : (segments as AsrSegment[]);
}

/** Source-seconds spans whose sound is replaced, padded and merged (a run of masked words is one span;
 *  a beep next to a mute keeps its own kind). Sorted by start. */
export function maskedAudioRanges(segments: readonly AsrSegment[] | null | undefined, energy?: AudioEnergy | null): MaskedAudioRange[] {
  if (!segments) return [];
  const raw: MaskedAudioRange[] = [];
  for (const segment of segments) {
    if (!segment.masks) continue;
    const words = wordsOfSegment(segment);
    const audioAt = (wi: number): WordAudioMask | undefined => segment.masks?.[String(wi)]?.audio;
    // Runs of consecutively masked words (same kind) are one span: the audio inside never comes back.
    let wi = 0;
    while (wi < words.length) {
      const audio = audioAt(wi);
      if (!audio) {
        wi += 1;
        continue;
      }
      let last = wi;
      while (last + 1 < words.length && audioAt(last + 1) === audio) last += 1;
      const first = words[wi]!;
      const runStart = first.start;
      const runEnd = Math.max(runStart, words[last]!.end);
      const prev = words[wi - 1];
      const next = words[last + 1];
      const prevMasked = !!audioAt(wi - 1);
      const nextMasked = !!audioAt(last + 1);
      // Heuristic boundaries: pad into the gaps only (an unmasked neighbour bounds the span at its own
      // edge), and stop early at a shared ASR cut because the voice has decayed before it.
      let start = runStart - MASK_AUDIO_PAD_SEC;
      if (prev && !prevMasked) start = Math.max(start, Math.min(runStart, prev.end));
      let end = runEnd + MASK_AUDIO_PAD_SEC;
      if (next && !nextMasked) {
        const contiguous = next.start <= runEnd + 0.02;
        end = contiguous
          ? Math.max(runStart + (runEnd - runStart) * MASK_AUDIO_MIN_KEEP, runEnd - MASK_AUDIO_END_TRIM_SEC)
          : Math.min(end, next.start);
      }
      // With the source's envelope at hand, the real onset and decay near each edge win over the cuts.
      const snapped = energy ? snapRunToEnergy(energy, runStart, runEnd) : null;
      if (snapped) {
        if (Number.isFinite(snapped.start)) {
          start = snapped.start;
          if (prev && !prevMasked) start = Math.max(start, Math.min(runStart, prev.end) - 0.03);
        }
        if (Number.isFinite(snapped.end)) {
          end = snapped.end;
          if (next && !nextMasked) end = Math.min(end, Math.max(runEnd, next.start) + 0.03);
        }
        end = Math.max(end, start + 0.04);
      }
      raw.push({ start: Math.max(0, start), end, audio });
      wi = last + 1;
    }
  }
  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MaskedAudioRange[] = [];
  for (const range of raw) {
    const last = merged[merged.length - 1];
    if (last && last.audio === range.audio && range.start <= last.end + 0.02) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

/** Which replacement (if any) applies at a source time. Ranges come from maskedAudioRanges (sorted, disjoint). */
export function maskedAudioAt(ranges: readonly MaskedAudioRange[], sourceSec: number): WordAudioMask | null {
  for (const range of ranges) {
    if (sourceSec < range.start) return null;
    if (sourceSec < range.end) return range.audio;
  }
  return null;
}

/** Caption copy for a word under its mask (the spoken word when no text mask is set). */
export function maskedWordText(segment: AsrSegment, wordIndex: number, spoken: string): string {
  const mask = wordMaskAt(segment, wordIndex);
  return mask?.text !== undefined ? mask.text : spoken;
}

/** Apply the text masks of a word range onto an already-overridden cue line (cueTexts): the edited
 *  line keeps its wording, only the masked spoken words inside it are swapped for their mask text. */
export function maskCueText(segment: AsrSegment, text: string, w0: number, w1: number): string {
  if (!segment.masks) return text;
  const words = wordsOfSegment(segment);
  let out = text;
  for (let wi = w0; wi <= w1; wi++) {
    const mask = segment.masks[String(wi)];
    const spoken = words[wi]?.text?.trim();
    if (mask?.text === undefined || !spoken) continue;
    const at = out.indexOf(spoken);
    if (at >= 0) out = out.slice(0, at) + mask.text + out.slice(at + spoken.length);
  }
  return out;
}
