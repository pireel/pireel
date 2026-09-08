import type { AsrSegment } from './build-blocks';
import { compositionToEditorDocument, emptyComposition } from './composition';

export const DUBBING_LANGUAGES = [
  { id: 'English', code: 'en', zh: '英语', en: 'English' },
  { id: '中文', code: 'zh', zh: '中文', en: 'Chinese' },
  { id: '日本語', code: 'ja', zh: '日语', en: 'Japanese' },
  { id: '한국어', code: 'ko', zh: '韩语', en: 'Korean' },
] as const;
export interface DubbingOptions { language: string; voiceId: string; lipSync: boolean; script?: string }
export interface DubbingSpeech { url: string; key: string; durationSec: number; signature: string }
export interface DubbingState {
  language?: string; sourceText?: string; translatedText?: string; speech?: DubbingSpeech;
  alignedAudioUrl?: string; alignedAudioKey?: string; alignedAudioSig?: string; sourceVideoUrl?: string; sourceVideoKey?: string; lipJobId?: string; lipResultUrl?: string;
  outputSig?: string; outputCached?: boolean; outputWidth?: number; outputHeight?: number;
}
export const DEFAULT_DUBBING_OPTIONS: DubbingOptions = { language: 'English', voiceId: '', lipSync: false };

/** Retain the original picture clock and its leading/trailing silence. No speech is truncated. */
export function dubbingSpeechWindow(transcript: readonly AsrSegment[], durationSec: number) {
  if (!Number.isFinite(durationSec) || durationSec <= 0 || durationSec > 120) throw new Error('首版支持 2 分钟以内的单人口播视频。');
  const spoken = transcript.filter((segment) => segment.text.trim());
  if (!spoken.length) throw new Error('没有识别到讲话内容。');
  if (new Set(spoken.map((segment) => segment.speaker).filter(Boolean)).size > 1) throw new Error('首版支持单人配音，请选择单人讲话的视频。');
  const start = Math.max(0, Math.min(...spoken.map((segment) => segment.start)));
  const end = Math.min(durationSec, Math.max(...spoken.map((segment) => segment.end)));
  if (!(end > start)) throw new Error('讲话时间无效，请重新识别。');
  return { start, end, duration: end - start };
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
