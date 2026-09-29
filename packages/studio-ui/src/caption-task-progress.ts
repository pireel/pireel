import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import type { CaptionProcessingStage } from './caption-task-store';

export function captionProcessingStages(options: CaptionTaskOptions): CaptionProcessingStage[] {
  if (options.subtitleRemoval) return ['preparing', 'rendering'];
  if (options.sfx) return ['preparing', 'transcribing', ...('density' in options.sfx ? ['matching' as const] : []), 'styling', ...(('captions' in options.sfx && options.sfx.captions) && !!options.highlights ? ['emphasizing' as const] : []), 'rendering'];
  if (options.broll) return ['preparing', 'transcribing', 'analyzing', 'matching', 'styling', ...(options.broll.captions && !!options.highlights ? ['emphasizing' as const] : []), 'rendering'];
  if (options.dubbing) return ['preparing', 'transcribing', 'translating', 'voicing', 'aligning', ...(options.dubbing.lipSync ? ['lipsync' as const] : []), ...(options.dubbing.captions ? ['styling' as const, ...(!!options.highlights ? ['emphasizing' as const] : [])] : [])];
  // Captions stop at the edited document; the video is rendered on download.
  return ['preparing', 'transcribing', ...(options.shortenPauses ? ['cleaning' as const] : []), ...(options.translationLanguage ? ['translating' as const] : []), 'styling', ...(!!options.highlights ? ['emphasizing' as const] : [])];
}
export const CAPTION_STAGE_NAMES: Record<CaptionProcessingStage, [string, string]> = {
  analyzing: ['分析素材', 'Analyze footage'], matching: ['匹配画面', 'Match footage'],
  voicing: ['生成配音', 'Generate voice'], aligning: ['适配原片时长', 'Fit speech timing'], lipsync: ['同步口型', 'Sync lips'],
  preparing: ['准备视频', 'Prepare video'], transcribing: ['识别讲话', 'Transcribe speech'], cleaning: ['整理停顿', 'Shorten pauses'], translating: ['翻译字幕', 'Translate captions'],
  styling: ['配置字幕', 'Style captions'], emphasizing: ['选择重点词', 'Select key phrases'], rendering: ['生成视频', 'Render video'],
};
export const CAPTION_PROGRESS_DETAILS: Record<string, [string, string]> = {
  'subtitle-erasing': ['修复擦除区域', 'Repairing selected areas'], 'saving-video': ['保存处理结果', 'Saving clean video'],
  checking: ['读取音轨', 'Reading audio'], extracting: ['提取音频', 'Extracting audio'], uploading: ['上传音频', 'Uploading audio'], recognizing: ['识别中', 'Recognizing speech'], aligning: ['对齐时间', 'Aligning timestamps'],
  fonts: ['加载字体', 'Loading fonts'], finishing: ['封装视频', 'Finishing video'],
};
