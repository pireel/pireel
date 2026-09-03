/**
 * Script-anchored transcript timing.
 *
 * A narration synthesised from an exact script has a known text; ASR only exists to MEASURE it.
 * Left alone, the ASR pass replaces the script with its own hearing ("食用说明" → "使用说明", a
 * brand name → a homophone), and every caption downstream inherits the error. Here the script
 * stays the immutable text and the ASR words lend their timestamps: matched units take the
 * measured time, substituted or unheard units share the time span the recogniser spent on the
 * corresponding stretch, and sentences follow the script's own punctuation.
 */
import type { TranscriptSegment } from './project-dto';
import { splitSpeechSentences } from './agent-timeline';

interface Unit {
  text: string;
  key: string;
  sentence: number;
}

interface TimedUnit {
  key: string;
  start: number;
  end: number;
}

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const TOKEN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu;
/** Above this DP size the alignment falls back to proportional timing rather than freezing the tab. */
const MAX_DP_CELLS = 6_000_000;

const keyOf = (text: string) => text.normalize('NFKC').toLowerCase();

/** Tokenise text into alignment units: one per CJK character, one per Latin/digit word; punctuation dropped. */
export function alignmentUnits(text: string): string[] {
  return (text.match(TOKEN) ?? []).filter((token) => token.length > 0 && (CJK.test(token) || /[\p{L}\p{N}]/u.test(token)));
}

function scriptUnits(sentences: readonly string[]): Unit[] {
  const out: Unit[] = [];
  sentences.forEach((sentence, index) => {
    for (const text of alignmentUnits(sentence)) out.push({ text, key: keyOf(text), sentence: index });
  });
  return out;
}

/** Flatten ASR segments into timed units. Multi-unit words share their span evenly; segments
 *  without word timing spread their span evenly over their own units. */
function asrUnits(segments: readonly TranscriptSegment[]): TimedUnit[] {
  const out: TimedUnit[] = [];
  const spread = (text: string, start: number, end: number) => {
    const units = alignmentUnits(text);
    if (!units.length) return;
    const width = Math.max(0, end - start) / units.length;
    units.forEach((unit, index) => out.push({ key: keyOf(unit), start: start + width * index, end: start + width * (index + 1) }));
  };
  for (const segment of segments) {
    const words = (segment.words ?? []).filter((word) => word.text.trim() && Number.isFinite(word.start) && Number.isFinite(word.end));
    if (words.length) for (const word of words) spread(word.text, word.start, word.end);
    else spread(segment.text, segment.start, segment.end);
  }
  out.sort((left, right) => left.start - right.start);
  return out;
}

/** Longest common subsequence over unit keys → script index → asr index for matched units. */
function matchUnits(script: readonly Unit[], asr: readonly TimedUnit[]): Map<number, number> {
  const n = script.length;
  const m = asr.length;
  const matches = new Map<number, number>();
  if (!n || !m || n * m > MAX_DP_CELLS) return matches;
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    const key = script[i]!.key;
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] = key === asr[j]!.key
        ? table[(i + 1) * width + j + 1]! + 1
        : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (script[i]!.key === asr[j]!.key) {
      matches.set(i, j);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) i += 1;
    else j += 1;
  }
  return matches;
}

function proportional(sentences: readonly string[], start: number, end: number): TranscriptSegment[] {
  const weights = sentences.map((sentence) => Math.max(1, alignmentUnits(sentence).length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const span = Math.max(0, end - start);
  let cursor = start;
  return sentences.map((sentence, index) => {
    const segEnd = index === sentences.length - 1 ? end : cursor + (span * weights[index]!) / total;
    const units = alignmentUnits(sentence);
    const width = Math.max(0, segEnd - cursor) / Math.max(1, units.length);
    const segment: TranscriptSegment = {
      start: cursor,
      end: segEnd,
      text: sentence,
      words: units.map((unit, k) => ({ text: unit, start: cursor + width * k, end: cursor + width * (k + 1) })),
    };
    cursor = segEnd;
    return segment;
  });
}

/**
 * Align an exact script to ASR timing. Returns script sentences with measured word timing; the
 * text is the script's, never the recogniser's. Empty ASR → empty (no speech measured).
 */
export function alignTranscriptToScript(script: string, asr: readonly TranscriptSegment[]): TranscriptSegment[] {
  const sentences = splitSpeechSentences(script);
  if (!sentences.length) return [];
  const timed = asrUnits(asr);
  if (!timed.length) return [];
  const first = timed[0]!.start;
  const last = timed[timed.length - 1]!.end;
  const units = scriptUnits(sentences);
  if (!units.length) return proportional(sentences, first, last);
  const matches = matchUnits(units, timed);
  if (!matches.size) return proportional(sentences, first, last);

  // Assign times: matched units take theirs; each unmatched run shares the gap between its
  // neighbouring anchors (the stretch the recogniser spent on the substituted/unheard words).
  const starts = new Float64Array(units.length);
  const ends = new Float64Array(units.length);
  let index = 0;
  while (index < units.length) {
    const hit = matches.get(index);
    if (hit != null) {
      starts[index] = timed[hit]!.start;
      ends[index] = timed[hit]!.end;
      index += 1;
      continue;
    }
    let runEnd = index;
    while (runEnd < units.length && !matches.has(runEnd)) runEnd += 1;
    const prevAnchor = index > 0 ? matches.get(index - 1)! : -1;
    const nextAnchor = runEnd < units.length ? matches.get(runEnd)! : -1;
    const gapStart = prevAnchor >= 0 ? timed[prevAnchor]!.end : first;
    const gapEnd = nextAnchor >= 0 ? timed[nextAnchor]!.start : last;
    const count = runEnd - index;
    const width = Math.max(0, gapEnd - gapStart) / count;
    for (let k = 0; k < count; k += 1) {
      starts[index + k] = gapStart + width * k;
      ends[index + k] = gapStart + width * (k + 1);
    }
    index = runEnd;
  }
  // Monotonic guard: ASR word order is trusted, but LCS can pair across a recogniser hiccup.
  for (let k = 1; k < units.length; k += 1) {
    if (starts[k]! < ends[k - 1]!) starts[k] = ends[k - 1]!;
    if (ends[k]! < starts[k]!) ends[k] = starts[k]!;
  }

  const lang = asr.find((segment) => segment.lang)?.lang;
  const out: TranscriptSegment[] = [];
  let cursor = 0;
  sentences.forEach((sentence, sentenceIndex) => {
    const words: { text: string; start: number; end: number }[] = [];
    while (cursor < units.length && units[cursor]!.sentence === sentenceIndex) {
      words.push({ text: units[cursor]!.text, start: starts[cursor]!, end: ends[cursor]! });
      cursor += 1;
    }
    if (!words.length) return; // punctuation-only sentence: nothing spoken to time
    const previousEnd = out.length ? out[out.length - 1]!.end : -Infinity;
    const start = Math.max(words[0]!.start, previousEnd);
    const end = Math.max(words[words.length - 1]!.end, start);
    out.push({ start, end, text: sentence, words, ...(lang ? { lang } : {}) });
  });
  return out;
}

/**
 * Transcript to store for a speech asset once ASR has measured it. A script-backed asset (exact
 * TTS text in its metadata, or a provisional scripted transcript generated from that text)
 * keeps its text and takes ASR timing; anything else stores the ASR result as heard.
 */
export function measuredSpeechTranscript(
  asset: { metadata?: { transcriptText?: string } } | undefined,
  stored: readonly TranscriptSegment[] | undefined,
  measured: readonly TranscriptSegment[],
): TranscriptSegment[] {
  const exact = asset?.metadata?.transcriptText?.trim();
  const provisional = stored?.length && stored.every((segment) => segment.scripted)
    ? stored.map((segment) => segment.text.trim()).filter(Boolean).join('\n')
    : '';
  const script = exact || provisional;
  if (!script) return [...measured];
  return alignTranscriptToScript(script, measured);
}
