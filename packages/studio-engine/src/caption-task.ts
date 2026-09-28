import { DUBBING_LANGUAGES } from './scene-languages';
import { applyCaptionDocumentEdit, compositionToEditorDocument, emptyComposition, projectDocumentToComposition, type CaptionStyle, type EditorDocumentV2 } from './composition';
import type { AsrSegment } from './build-blocks';
import { removeSrcRanges } from './trim';
import { BASE_CAPTION_FONT_PX, getCaptionPreset } from './caption-presets';
import { captionLineSegments } from './caption-layout-metrics';
import { wordsFromText } from './caption-fx';
import { brandAppearance, type BrandSnapshot } from './brand-kit';
import { DEFAULT_CAPTION_WIDTH_PCT } from './composition-core';

/** A sample line per script, used to reserve the translation line's height before real text exists. */
const TRANSLATION_SAMPLES: Record<string, string> = {
  zh: '字幕预览', yue: '字幕預覽', ja: '字幕プレビュー', ko: '자막 미리보기', ar: 'معاينة الترجمة', fa: 'پیش‌نمایش زیرنویس', he: 'תצוגה מקדימה',
  th: 'ตัวอย่างคำบรรยาย', hi: 'कैप्शन पूर्वावलोकन', ta: 'முன்னோட்டம்', ru: 'Предпросмотр', uk: 'Попередній перегляд', bg: 'Преглед', el: 'Προεπισκόπηση',
};
/** Every language the translation service targets (the same catalog dubbing uses); ids are stable. */
export const CAPTION_TRANSLATION_LANGUAGES = DUBBING_LANGUAGES.map(language => ({
  id: language.id, name: { zh: language.zh, en: language.en }, sample: TRANSLATION_SAMPLES[language.code] ?? 'Caption preview',
}));
export type CaptionTranslationLanguage = typeof DUBBING_LANGUAGES[number]['id'];
export interface CaptionTaskOptions {
  /** Brand picked for this scene, copied at pick time; its captions seed `caption`. */
  brand?: BrandSnapshot;
  ugcAd?: import('./ugc-ad').UgcAdOptions; subtitleRemoval?: import('./subtitle-removal').SubtitleRemovalOptions; sfx?: import('./sfx-task').SfxOptions; broll?: import('./broll-task').BrollOptions; dubbing?: import('./dubbing-task').DubbingOptions;
  /** The main caption line in the Studio caption model (look, animation, font, colours, position, size).
   *  Omitted fields take the Studio defaults; the scene only adds safe-area placement. */
  caption: Partial<CaptionStyle>;
  /** Highlight key words with the Studio auto-highlight (word decorations on the transcript). */
  highlights?: boolean;
  aspect: 'original' | 'portrait' | 'landscape' | 'square'; shortenPauses: boolean; translationLanguage?: CaptionTranslationLanguage;
}
export interface CaptionTaskDimensions { width: number; height: number }
/** Product reference zones, not a guarantee for every platform/ad placement. */
export function captionTaskSafeArea(source: CaptionTaskDimensions) {
  if (source.height > source.width) return { left: 13, right: 87, top: 12, bottom: 75 };
  if (source.height === source.width) return { left: 10, right: 90, top: 10, bottom: 85 };
  return { left: 12.5, right: 87.5, top: 5, bottom: 90 };
}
/** Where the caption group's bottom sits: the user's position, else just inside the platform safe area. */
/**
 * Options saved before scenes used the workbench style model carried a scene preset id and a
 * `custom` override bag. Their overrides are ordinary caption style fields; the preset id has no
 * counterpart and falls back to the workbench default.
 */
export function storedCaptionTaskOptions(value: CaptionTaskOptions): CaptionTaskOptions {
  if (value.caption && typeof value.caption === 'object') return value;
  const { presetId, layoutVersion: _layoutVersion, custom, ...rest } = value as CaptionTaskOptions & { presetId?: string; layoutVersion?: number; custom?: Partial<CaptionStyle> };
  return { ...rest, caption: { ...custom }, ...(presetId === 'keywords' ? { highlights: true } : {}) };
}

export function captionTaskGroupBottom(options: CaptionTaskOptions, source: CaptionTaskDimensions) {
  return options.caption.yPct ?? captionTaskSafeArea(source).bottom - 1;
}
/** The Studio caption style for this scene: the user's choices over the Studio defaults, placed inside
 *  the platform safe area, with the translation line reserved under the main line when bilingual. */
export function captionTaskStyle(options: CaptionTaskOptions, source: CaptionTaskDimensions = { width: 1080, height: 1920 }): Partial<CaptionStyle> {
  const canvas = captionTaskCanvas(options.aspect, source);
  const safe = captionTaskSafeArea(canvas);
  const { yPct: _groupBottom, sub, on: _on, ...caption } = options.caption;
  // The translation line's look comes from the same panel; its language and placement stay scene-owned.
  const { lang: _lang, yPct: _subBottom, xPct: _subX, ...subLook } = sub ?? {};
  const bottom = captionTaskGroupBottom(options, canvas);
  const scale = caption.scale ?? 1;
  const style: Partial<CaptionStyle> = {
    xPct: (safe.left + safe.right) / 2, wPct: DEFAULT_CAPTION_WIDTH_PCT, scale,
    ...caption, yPct: bottom,
    sub: options.translationLanguage ? { font: 'sans', scale: scale * .75, ...subLook, lang: options.translationLanguage, yPct: bottom } : undefined,
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
  if (!options.translationLanguage) return document;
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
  if (input.options.brand) document.appearance = { ...document.appearance, ...brandAppearance(input.options.brand) };
  return document;
}

export function buildCaptionTaskDocument(input: Parameters<typeof buildCaptionBaseDocument>[0]): EditorDocumentV2 {
  const document = buildCaptionBaseDocument(input);
  const style = captionTaskStyle(input.options, document.canvas);
  const result = applyCaptionDocumentEdit({ document, patch: { ...style, on: true }, mainTranscript: input.transcript, clipTranscripts: {} });
  if (!result.ok) throw new Error(result.error.message);
  return fitCaptionTaskDocumentLayout(result.document, input.options);
}
