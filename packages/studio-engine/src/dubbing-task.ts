import type { AsrSegment } from './build-blocks';
import { compositionToEditorDocument, emptyComposition } from './composition';

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
export interface DubbingOptions { language: string; voiceId: string; lipSync: boolean; script?: string; speakerVoices?: Record<string, string>; turnScripts?: Record<string, string> }
export interface DubbingSpeech { url: string; key: string; durationSec: number; signature: string }
export interface DubbingState {
  language?: string; sourceText?: string; translatedText?: string; translatedTurns?: string[]; turnsKey?: string; speech?: DubbingSpeech; speechParts?: DubbingSpeech[]; speechSignature?: string;
  alignedAudioUrl?: string; alignedAudioKey?: string; alignedAudioSig?: string; sourceVideoUrl?: string; sourceVideoKey?: string; lipJobId?: string; lipResultUrl?: string;
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
