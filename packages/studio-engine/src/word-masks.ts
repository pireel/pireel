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

/** A censor mask must COVER the word; it never has to fit it. Like a broadcast bleep it starts a
 *  little before the measured word and ends a little after it: a neighbour losing a few tens of
 *  milliseconds is barely noticeable, a masked word leaking a syllable defeats the mask. Tune here. */
export const MASK_LEAD_SEC = 0.06;
export const MASK_TAIL_SEC = 0.08;

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

/** Source-seconds spans whose sound is replaced: a run of consecutively masked words is one span
 *  (its audio never comes back inside), each span extended by the lead/tail margins; overlapping
 *  spans of the same kind merge. Sorted by start. */
export function maskedAudioRanges(segments: readonly AsrSegment[] | null | undefined): MaskedAudioRange[] {
  if (!segments) return [];
  const raw: MaskedAudioRange[] = [];
  for (const segment of segments) {
    if (!segment.masks) continue;
    const words = wordsOfSegment(segment);
    const audioAt = (wi: number): WordAudioMask | undefined => segment.masks?.[String(wi)]?.audio;
    let wi = 0;
    while (wi < words.length) {
      const audio = audioAt(wi);
      if (!audio) {
        wi += 1;
        continue;
      }
      let last = wi;
      while (last + 1 < words.length && audioAt(last + 1) === audio) last += 1;
      const runStart = words[wi]!.start;
      const runEnd = Math.max(runStart, words[last]!.end);
      raw.push({ start: Math.max(0, runStart - MASK_LEAD_SEC), end: runEnd + MASK_TAIL_SEC, audio });
      wi = last + 1;
    }
  }
  raw.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MaskedAudioRange[] = [];
  for (const range of raw) {
    const last = merged[merged.length - 1];
    if (last && last.audio === range.audio && range.start <= last.end) last.end = Math.max(last.end, range.end);
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
