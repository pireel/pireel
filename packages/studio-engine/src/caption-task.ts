import { applyCaptionDocumentEdit, compositionToEditorDocument, emptyComposition, projectDocumentToComposition, type CaptionStyle, type EditorDocumentV2 } from './composition';
import type { AsrSegment } from './build-blocks';
import { removeSrcRanges } from './trim';
import { BASE_CAPTION_FONT_PX, getCaptionPreset } from './caption-presets';
import { captionLineSegments } from './caption-layout-metrics';
import { wordsFromText } from './caption-fx';

export interface CaptionTaskPreset { id: string; name: { zh: string; en: string }; style: Partial<CaptionStyle> }
export const CAPTION_TASK_PRESETS: readonly CaptionTaskPreset[] = [
  { id: 'clean', name: { zh: '清爽白字', en: 'Clean' }, style: { preset: 'ln-clean', font: 'sans', bold: true } },
  { id: 'keywords', name: { zh: '重点突出', en: 'Key phrases' }, style: { preset: 'kw-yellow', font: 'web:smiley-sans', bold: true } },
  { id: 'karaoke', name: { zh: '逐词跟读', en: 'Follow along' }, style: { preset: 'em-yellow', font: 'sans', bold: true } },
  { id: 'neon', name: { zh: '荧光绿', en: 'Neon' }, style: { preset: 'em-green', font: 'web:douyin-sans', bold: true } },
  { id: 'cinema', name: { zh: '经典黑底', en: 'Cinema' }, style: { preset: 'ln-black', font: 'sans' } },
  { id: 'paper', name: { zh: '纸上字幕', en: 'Paper' }, style: { preset: 'ln-white', font: 'web:zcool-xiaowei' } },
  { id: 'handwritten', name: { zh: '手写温度', en: 'Handwritten' }, style: { preset: 'ln-clean', font: 'web:lxgw-wenkai', bold: true } },
  { id: 'smiley', name: { zh: '得意黑', en: 'Smiley' }, style: { preset: 'ln-clean', font: 'web:smiley-sans', bold: true } },
  { id: 'playful', name: { zh: '快乐花字', en: 'Playful' }, style: { preset: 'ln-yellow', font: 'web:zcool-kuaile' } },
  { id: 'editorial', name: { zh: '书卷气', en: 'Editorial' }, style: { preset: 'em-gold-serif', font: 'serif', bold: true } },
  { id: 'underline', name: { zh: '下划重点', en: 'Underline' }, style: { preset: 'em-underline', font: 'web:zcool-qingke-huangyou' } },
  { id: 'mint', name: { zh: '薄荷白字', en: 'Mint' }, style: { preset: 'ln-mint', font: 'web:smiley-sans', bold: true } },
];
export const CAPTION_TRANSLATION_LANGUAGES = [
  { id: '中文', name: { zh: '中文', en: 'Chinese' }, sample: '字幕预览' },
  { id: 'English', name: { zh: '英语', en: 'English' }, sample: 'Caption preview' },
  { id: '日本語', name: { zh: '日语', en: 'Japanese' }, sample: '字幕プレビュー' },
  { id: '한국어', name: { zh: '韩语', en: 'Korean' }, sample: '자막 미리보기' },
] as const;
export type CaptionTranslationLanguage = typeof CAPTION_TRANSLATION_LANGUAGES[number]['id'];
export interface CaptionTaskOptions { broll?: import('./broll-task').BrollOptions; dubbing?: import('./dubbing-task').DubbingOptions; layoutVersion?: 2; presetId: string; aspect: 'original' | 'portrait' | 'landscape' | 'square'; shortenPauses: boolean; translationLanguage?: CaptionTranslationLanguage; custom?: Pick<Partial<CaptionStyle>, 'font' | 'scale' | 'bold' | 'color' | 'accentColor' | 'bg' | 'strokeColor' | 'strokeWidth' | 'xPct' | 'yPct' | 'wPct'> }
export function captionTaskPreset(id: string): CaptionTaskPreset {
  const preset = CAPTION_TASK_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error('Unknown caption preset');
  return preset;
}
export interface CaptionTaskDimensions { width: number; height: number }
/** Product reference zones, not a guarantee for every platform/ad placement. */
export function captionTaskSafeArea(source: CaptionTaskDimensions) {
  if (source.height > source.width) return { left: 13, right: 87, top: 12, bottom: 75 };
  if (source.height === source.width) return { left: 10, right: 90, top: 10, bottom: 85 };
  return { left: 12.5, right: 87.5, top: 5, bottom: 90 };
}
export function captionTaskGroupBottom(options: CaptionTaskOptions, source: CaptionTaskDimensions) {
  return options.custom?.yPct ?? (options.layoutVersion === 2 ? captionTaskSafeArea(source).bottom - 1 : 86);
}
export function captionTaskStyle(options: CaptionTaskOptions, source: CaptionTaskDimensions = { width: 1080, height: 1920 }): Partial<CaptionStyle> {
  if (options.layoutVersion !== 2) return { ...captionTaskPreset(options.presetId).style, wPct: 84, yPct: 86, ...options.custom, sub: options.translationLanguage ? { lang: options.translationLanguage, font: 'sans' } : undefined };
  const canvas = captionTaskCanvas(options.aspect, source);
  const safe = captionTaskSafeArea(canvas);
  const { yPct: _groupBottom, ...custom } = options.custom ?? {};
  const scale = custom.scale ?? (64 * Math.min(canvas.width, canvas.height) / 1080 / BASE_CAPTION_FONT_PX);
  const bottom = captionTaskGroupBottom(options, canvas);
  const style: Partial<CaptionStyle> = {
    ...captionTaskPreset(options.presetId).style, scale, xPct: (safe.left + safe.right) / 2,
    wPct: canvas.height > canvas.width ? 70 : canvas.height === canvas.width ? 76 : 75,
    ...custom, yPct: bottom,
    sub: options.translationLanguage ? { lang: options.translationLanguage, font: 'sans', scale: scale * .75, yPct: bottom } : undefined,
  };
  const sample = CAPTION_TRANSLATION_LANGUAGES.find((language) => language.id === options.translationLanguage)?.sample;
  return fitCaptionTaskBilingualStyle(style, canvas, sample ? [sample] : []);
}

/** Both lines are bottom anchored; reserve actual translated line height before placing the original. */
export function fitCaptionTaskBilingualStyle(style: Partial<CaptionStyle>, canvas: CaptionTaskDimensions, translations: readonly string[]): Partial<CaptionStyle> {
  if (!style.sub?.lang || style.sub.yPct == null) return style;
  const sub = style.sub;
  const scale = sub.scale ?? (style.scale ?? 1) * .7;
  const base = getCaptionPreset(sub.preset ?? 'ln-clean');
  const preset = sub.bg === undefined ? base : { ...base, bg: sub.bg ?? undefined };
  const fs = Math.max(9, Math.round(BASE_CAPTION_FONT_PX * scale));
  const heights = translations.filter(Boolean).map((text) => {
    const lines = captionLineSegments(wordsFromText(text, 0, 1), preset, sub.wPct ?? style.wPct ?? 70, scale, canvas.width, { font: sub.font, bold: sub.bold });
    return lines.length * fs * 1.35 + Math.max(0, lines.length - 1) * Math.round(fs * .15) + (preset.bg ? 2 * Math.round(fs * .18) : 0);
  });
  const gap = Math.round(Math.max(10, BASE_CAPTION_FONT_PX * (style.scale ?? 1)) * .2);
  const reserve = (Math.max(fs * 1.35, ...heights) + gap) / canvas.height * 100;
  return { ...style, yPct: sub.yPct! - reserve };
}

/** Freeze the measured layout into the document shared by export and Agent Remix. */
export function fitCaptionTaskDocumentLayout(document: EditorDocumentV2, options: CaptionTaskOptions): EditorDocumentV2 {
  if (options.layoutVersion !== 2 || !options.translationLanguage) return document;
  const composition = projectDocumentToComposition(document);
  const translations = composition.blocks.filter((block) => block.templateId === 'caption').map((block) => typeof block.slots.sub === 'string' ? block.slots.sub : '');
  const style = fitCaptionTaskBilingualStyle(document.appearance.captionStyle ?? captionTaskStyle(options, document.canvas), document.canvas, translations);
  const result = applyCaptionDocumentEdit({ document, patch: style, mainTranscript: null, clipTranscripts: {} });
  if (!result.ok) throw new Error(result.error.message);
  return result.document;
}
export function captionTaskCanvas(aspect: CaptionTaskOptions['aspect'], source: { width: number; height: number }) {
  if (!(source.width > 0 && source.height > 0 && Number.isFinite(source.width) && Number.isFinite(source.height))) throw new Error('Invalid video dimensions');
  const ratio = aspect === 'portrait' ? 9 / 16 : aspect === 'landscape' ? 16 / 9 : aspect === 'square' ? 1 : source.width / source.height;
  return { width: 1080, height: Math.max(2, Math.round(1080 / ratio / 2) * 2) };
}
export function buildCaptionBaseDocument(input: {
  projectId: string; sourceName?: string; sourceUrl: string; sourceSig: string; width: number; height: number; durationSec: number;
  options: CaptionTaskOptions; transcript: AsrSegment[]; cuts?: { fromSec: number; toSec: number }[];
}): EditorDocumentV2 {
  if (!Number.isFinite(input.durationSec) || input.durationSec <= 0) throw new Error('Invalid video duration');
  const canvas = captionTaskCanvas(input.options.aspect, input);
  let index = 0;
  const shots = removeSrcRanges([{ id: 'caption-source', srcStart: 0, srcEnd: input.durationSec, treatment: 'full' as const }],
    (input.cuts ?? []).map((cut) => [cut.fromSec, cut.toSec]), (base, srcStart, srcEnd) => ({ ...base, id: `caption-cut-${++index}`, srcStart, srcEnd })).clips;
  if (!shots.length) throw new Error('No speech remains after trimming');
  const comp = { ...emptyComposition(), ...canvas, video: { url: input.sourceUrl, durationSec: input.durationSec }, shots };
  const document = compositionToEditorDocument({ projectId: input.projectId, composition: comp, videoSig: input.sourceSig }).document;
  if (input.sourceName) for (const asset of Object.values(document.assets)) if (asset.kind === 'video') asset.label = input.sourceName;
  return document;
}

export function buildCaptionTaskDocument(input: Parameters<typeof buildCaptionBaseDocument>[0]): EditorDocumentV2 {
  const document = buildCaptionBaseDocument(input);
  const style = captionTaskStyle(input.options, document.canvas);
  const result = applyCaptionDocumentEdit({ document, patch: { ...style, on: true }, mainTranscript: input.transcript, clipTranscripts: {} });
  if (!result.ok) throw new Error(result.error.message);
  return fitCaptionTaskDocumentLayout(result.document, input.options);
}
