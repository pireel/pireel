import { applyCaptionDocumentEdit, compositionToEditorDocument, emptyComposition, type CaptionStyle, type EditorDocumentV2 } from './composition';
import type { AsrSegment } from './build-blocks';
import { removeSrcRanges } from './trim';

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
export interface CaptionTaskOptions { presetId: string; aspect: 'original' | 'portrait' | 'landscape' | 'square'; shortenPauses: boolean; custom?: Pick<Partial<CaptionStyle>, 'font' | 'scale' | 'bold' | 'color' | 'accentColor' | 'bg' | 'strokeColor' | 'strokeWidth' | 'xPct' | 'yPct' | 'wPct'> }
export function captionTaskPreset(id: string): CaptionTaskPreset {
  const preset = CAPTION_TASK_PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error('Unknown caption preset');
  return preset;
}
export function captionTaskStyle(options: CaptionTaskOptions): Partial<CaptionStyle> {
  return { ...captionTaskPreset(options.presetId).style, wPct: 84, yPct: 86, ...options.custom };
}
export function captionTaskCanvas(aspect: CaptionTaskOptions['aspect'], source: { width: number; height: number }) {
  if (!(source.width > 0 && source.height > 0 && Number.isFinite(source.width) && Number.isFinite(source.height))) throw new Error('Invalid video dimensions');
  const ratio = aspect === 'portrait' ? 9 / 16 : aspect === 'landscape' ? 16 / 9 : aspect === 'square' ? 1 : source.width / source.height;
  return { width: 1080, height: Math.max(2, Math.round(1080 / ratio / 2) * 2) };
}
export function buildCaptionTaskDocument(input: {
  projectId: string; sourceName?: string; sourceUrl: string; sourceSig: string; width: number; height: number; durationSec: number;
  options: CaptionTaskOptions; transcript: AsrSegment[]; cuts?: { fromSec: number; toSec: number }[];
}): EditorDocumentV2 {
  if (!Number.isFinite(input.durationSec) || input.durationSec <= 0) throw new Error('Invalid video duration');
  const style = captionTaskStyle(input.options);
  const canvas = captionTaskCanvas(input.options.aspect, input);
  let index = 0;
  const shots = removeSrcRanges([{ id: 'caption-source', srcStart: 0, srcEnd: input.durationSec, treatment: 'full' as const }],
    (input.cuts ?? []).map((cut) => [cut.fromSec, cut.toSec]), (base, srcStart, srcEnd) => ({ ...base, id: `caption-cut-${++index}`, srcStart, srcEnd })).clips;
  if (!shots.length) throw new Error('No speech remains after trimming');
  const comp = { ...emptyComposition(), ...canvas, video: { url: input.sourceUrl, durationSec: input.durationSec }, shots };
  const document = compositionToEditorDocument({ projectId: input.projectId, composition: comp, videoSig: input.sourceSig }).document;
  if (input.sourceName) for (const asset of Object.values(document.assets)) if (asset.kind === 'video') asset.label = input.sourceName;
  const result = applyCaptionDocumentEdit({ document, patch: { ...style, on: true }, mainTranscript: input.transcript, clipTranscripts: {} });
  if (!result.ok) throw new Error(result.error.message);
  return result.document;
}
