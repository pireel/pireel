import type { AsrSegment } from './build-blocks';
import { emptyComposition } from './composition-core';
import { compositionToEditorDocument } from './project-document';

export const DUBBING_MAX_DURATION_SEC = 30 * 60;
export const DUBBING_MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
export const DUBBING_MAX_SCRIPT_CHARS = 60_000;
export const DUBBING_SPEECH_CHUNK_CHARS = 4_000;

/** Prefer sentence boundaries, then whitespace; never split a surrogate pair or drop text. */
export function splitDubbingScript(text: string): string[] {
  if (!text.trim() || text.length > DUBBING_MAX_SCRIPT_CHARS) throw new Error('配音文案需为 1–60000 字符。');
  const parts: string[] = [];
  let rest = text;
  while (rest.length > DUBBING_SPEECH_CHUNK_CHARS) {
    let end = DUBBING_SPEECH_CHUNK_CHARS;
    const prefix = rest.slice(0, end);
    const boundaries = [...prefix.matchAll(/[.!?。！？；;\n]\s*|\s+/gu)];
    const last = boundaries.at(-1);
    if (last && last.index! > end / 2) end = last.index! + last[0].length;
    if (/[\uD800-\uDBFF]/.test(rest[end - 1])) end--;
    parts.push(rest.slice(0, end)); rest = rest.slice(end);
  }
  if (rest) parts.push(rest);
  return parts;
}

export { DUBBING_LANGUAGES } from './scene-languages';
export interface DubbingOptions { language: string; voiceId: string; lipSync: boolean; captions?: boolean; script?: string; speakerVoices?: Record<string, string>; turnScripts?: Record<string, string> }
export interface DubbingSpeech { url: string; key: string; durationSec: number; signature: string }
export interface DubbingState {
  alignedPlanKey?: string; captionAudioSig?: string;
  captionTranscript?: AsrSegment[]; captionSignature?: string;
  language?: string; sourceText?: string; translatedText?: string; translatedTurns?: string[]; turnsKey?: string;
  /** The dub written phrase by phrase (see dubbingPhrases), reused while the phrases and language stay the same. */
  translatedPhrases?: string[]; phrasesKey?: string;
  /** Lines the timing could only fit by speaking faster than usual or cutting the end, for the user to see. */
  fitNotes?: { at: number; kind: 'faster' | 'trimmed' }[]; speech?: DubbingSpeech; speechParts?: DubbingSpeech[]; speechSignature?: string;
  alignedAudioUrl?: string; alignedAudioKey?: string; alignedAudioSig?: string; sourceVideoUrl?: string; sourceVideoKey?: string; lipJobId?: string; lipResultUrl?: string;
  /** The lip-synced picture a server run kept in the media vault. */
  lipVideoSig?: string;
  outputSig?: string; outputCached?: boolean; outputWidth?: number; outputHeight?: number;
}
export const DEFAULT_DUBBING_OPTIONS: DubbingOptions = { language: 'English', voiceId: '', lipSync: false };

/** Retain the original picture clock and its leading/trailing silence. No speech is truncated. */
export function dubbingSpeechWindow(transcript: readonly AsrSegment[], durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > DUBBING_MAX_DURATION_SEC) throw new Error('支持 30 分钟以内的视频。');
  const spoken = transcript.filter((segment) => segment.text.trim());
  if (!spoken.length) throw new Error('没有识别到讲话内容。');
  const start = Math.max(0, Math.min(...spoken.map((segment) => segment.start)));
  const end = Math.min(durationSec, Math.max(...spoken.map((segment) => segment.end)));
  if (!(end > start)) throw new Error('讲话时间无效，请重新识别。');
  return { start, end, duration: end - start };
}
export const dubbingSpeakerKey = (segment: AsrSegment) => segment.speaker != null && String(segment.speaker).trim() ? `speaker:${segment.speaker}` : 'unidentified';
export function dubbingSpeakers(transcript: readonly AsrSegment[]) {
  const speakers = new Map<string, { id: string; sample: string }>();
  for (const segment of transcript) if (segment.text.trim()) {
    const id = dubbingSpeakerKey(segment);
    if (!speakers.has(id)) speakers.set(id, { id, sample: segment.text.trim() });
  }
  return [...speakers.values()];
}
export function dubbingVoiceFor(speakerId: string, speakers: ReturnType<typeof dubbingSpeakers>, options: DubbingOptions) {
  return options.speakerVoices?.[speakerId] || (speakerId === speakers[0]?.id ? options.voiceId : '') || '';
}
export function dubbingVoicesReady(transcript: readonly AsrSegment[], options: DubbingOptions) {
  const speakers = dubbingSpeakers(transcript);
  return speakers.length > 1 ? speakers.every((speaker) => !!dubbingVoiceFor(speaker.id, speakers, options)) : !!options.voiceId;
}
export interface DubbingTurn { id: string; speaker: string; text: string; start: number; end: number }
export function dubbingTurns(transcript: readonly AsrSegment[], durationSec: number): DubbingTurn[] {
  const turns: DubbingTurn[] = [];
  for (const segment of [...transcript].sort((a, b) => a.start - b.start)) {
    if (!segment.text.trim()) continue;
    const start = Math.max(0, segment.start); const end = Math.min(durationSec, segment.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('发言时间无效，请重新识别。');
    const speaker = dubbingSpeakerKey(segment); const previous = turns.at(-1);
    if (previous && previous.speaker === speaker && start >= previous.end && start - previous.end <= 1 && previous.text.length + segment.text.length < 3000) {
      previous.text += `\n${segment.text.trim()}`; previous.end = end;
    } else turns.push({ id: `turn-${turns.length}`, speaker, text: segment.text.trim(), start, end });
  }
  return turns;
}

/** One short spoken phrase of a turn: the unit a dub is timed to, so it follows the speaker's rhythm. */
export interface DubbingPhrase { turn: number; speaker: string; text: string; start: number; end: number }
/** A clause ends at punctuation or at a pause this long between words. */
const PHRASE_PAUSE_SEC = .35;
/** Shorter pieces join a neighbour: a line this brief is too little to time a translation to. */
const PHRASE_MIN_SEC = .8;
const CLAUSE_END = /[，。！？；：、,.!?;:…]["'”’)）]*$/u;
const latinEdge = (left: string, right: string) => /[A-Za-z0-9]$/.test(left) && /^[A-Za-z0-9]/.test(right);

/**
 * Split each turn into short phrases at clause punctuation and pauses, using word timing. Lines
 * without word timing stay whole. Phrases keep their spoken time; a phrase never spans two turns.
 */
export function dubbingPhrases(transcript: readonly AsrSegment[], durationSec: number): DubbingPhrase[] {
  const turns = dubbingTurns(transcript, durationSec);
  const segments = [...transcript].filter(segment => segment.text.trim()).sort((a, b) => a.start - b.start);
  return turns.flatMap((turn, index) => {
    const pieces: Omit<DubbingPhrase, 'turn' | 'speaker'>[] = [];
    for (const segment of segments.filter(segment => dubbingSpeakerKey(segment) === turn.speaker && segment.start >= turn.start - 1e-6 && segment.start < turn.end)) {
      const words = (segment.words ?? []).filter(word => word.text.trim() && Number.isFinite(word.start) && Number.isFinite(word.end));
      if (!words.length) { pieces.push({ text: segment.text.trim(), start: Math.max(turn.start, segment.start), end: Math.min(turn.end, segment.end) }); continue; }
      let current: { text: string; start: number; end: number } | undefined;
      words.forEach((word, at) => {
        const text = word.text.trim();
        current = current ? { ...current, text: current.text + (latinEdge(current.text, text) ? ' ' : '') + text, end: word.end } : { text, start: word.start, end: word.end };
        const next = words[at + 1];
        if (!next || CLAUSE_END.test(text) || next.start - word.end >= PHRASE_PAUSE_SEC) { pieces.push(current); current = undefined; }
      });
    }
    // Too-short pieces join the previous piece (or the next one at the start of a turn).
    const merged: typeof pieces = [];
    for (const piece of pieces) {
      const last = merged.at(-1);
      if (last && (piece.end - piece.start < PHRASE_MIN_SEC || last.end - last.start < PHRASE_MIN_SEC)) merged[merged.length - 1] = { text: last.text + (latinEdge(last.text, piece.text) ? ' ' : '') + piece.text, start: last.start, end: piece.end };
      else merged.push(piece);
    }
    return merged.map(piece => ({ turn: index, speaker: turn.speaker, text: piece.text, start: Math.max(0, piece.start), end: Math.min(durationSec, Math.max(piece.end, piece.start + .05)) }));
  });
}

/** Lines of a dub joined into running text: a space between them except after CJK/Hangul script. */
export const joinSpoken = (lines: string[]) => lines.filter(Boolean).reduce((all, line) => all + (all && !/[\u3000-\u9fff\uac00-\ud7af]$/u.test(all) ? ' ' : '') + line, '');

/** A rewritten phrase that repeats the word its sentence's previous phrase ends with ("there's a" | "a card")
 *  drops the repeat, so the joined line reads once. Only an exact word match at the join is dropped. */
export function stripRepeatedLead(previous: string, text: string): string {
  const last = /([\p{L}\p{N}']+)[^\p{L}\p{N}']*$/u.exec(previous)?.[1]; const first = /^[^\p{L}\p{N}']*([\p{L}\p{N}']+)/u.exec(text);
  if (!last || !first || last.toLowerCase() !== first[1]!.toLowerCase()) return text;
  const rest = text.slice(first[0].length).replace(/^\s+/, '');
  return rest || text;
}

/** What the script writer is asked for: each turn's phrases with the seconds each holds (its spoken
 *  time plus a short breath of the pause after it), and keys that tell when a written script still applies. */
export function dubbingScriptRequest(transcript: readonly AsrSegment[], durationSec: number, language: string) {
  const turns = dubbingTurns(transcript, durationSec); const phrases = dubbingPhrases(transcript, durationSec);
  const seconds = phrases.map((phrase, index) => Math.min(phrases[index + 1]?.start ?? durationSec, phrase.end + .5) - phrase.start);
  const request = turns.map((_, turn) => phrases.flatMap((phrase, index) => phrase.turn === turn ? [{ index, text: phrase.text, seconds: seconds[index]! }] : []));
  return { turns, phrases, request, turnsKey: JSON.stringify(turns), phrasesKey: JSON.stringify([language, phrases]) };
}

export interface DubbingSpeechPart { text: string; voiceId: string; group: number; start: number; end: number; source?: string; turn?: number }
/**
 * The voiced lines of a dub from its written script: one per phrase, placed where it was said (an
 * empty phrase is a pause). A turn the user rewrote by hand keeps whole-turn timing.
 */
export function dubbingSpeechParts(transcript: readonly AsrSegment[], durationSec: number, config: DubbingOptions, translatedPhrases: readonly string[]) {
  const turns = dubbingTurns(transcript, durationSec); const phrases = dubbingPhrases(transcript, durationSec); const speakers = dubbingSpeakers(transcript);
  const translatedTurns = turns.map((_, turn) => joinSpoken(phrases.flatMap((phrase, index) => phrase.turn === turn ? [translatedPhrases[index] ?? ''] : [])));
  const edited = turns.map((turn, i) => (config.turnScripts?.[turn.id] ?? translatedTurns[i]!).trim());
  if (edited.some(part => !part)) throw new Error('发言文案不能为空。');
  const text = edited.join('\n'); splitDubbingScript(text);
  let group = 0;
  const parts: DubbingSpeechPart[] = turns.flatMap((turn, index) => {
    const voiceId = dubbingVoiceFor(turn.speaker, speakers, config);
    if (config.turnScripts?.[turn.id]?.trim()) { const at = group++; return splitDubbingScript(edited[index]!).map(text => ({ text, voiceId, group: at, start: turn.start, end: turn.end, source: turn.text, turn: index })); }
    return phrases.flatMap((phrase, at) => phrase.turn === index && translatedPhrases[at] ? [{ text: translatedPhrases[at]!, voiceId, group: group++, start: phrase.start, end: phrase.end, source: phrase.text, turn: index }] : []);
  });
  return { text, parts, translatedTurns };
}

export function dubbingRate(audioDuration: number, windowDuration: number) {
  const rate = audioDuration / windowDuration;
  if (!Number.isFinite(rate) || rate < .5 || rate > 2) throw new Error('新配音与原片长度差距较大，请调整配音文案后重新生成。');
  return rate;
}
export function dubbingVideoDocument(id: string, sig: string, url: string, name: string, width: number, height: number, durationSec: number) {
  const document = compositionToEditorDocument({ projectId: id, videoSig: sig, composition: { ...emptyComposition(), width, height, video: { url, durationSec }, shots: [{ id: 'dubbing-video', srcStart: 0, srcEnd: durationSec, treatment: 'full' }] } }).document;
  for (const asset of Object.values(document.assets)) if (asset.kind === 'video') asset.label = name;
  return document;
}

/** Scene defaults: captions on unless turned off; lip sync only when chosen. */
export function dubbingSceneOptions(options: DubbingOptions): DubbingOptions {
  return { ...options, lipSync: options.lipSync === true, captions: options.captions ?? true };
}
