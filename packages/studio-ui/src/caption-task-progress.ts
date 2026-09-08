import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import type { CaptionProcessingStage } from './caption-task-store';

export function captionProcessingStages(options: CaptionTaskOptions): CaptionProcessingStage[] {
  if (options.dubbing) return ['preparing', 'transcribing', 'translating', 'voicing', 'aligning', ...(options.dubbing.lipSync ? ['lipsync' as const] : []), 'rendering'];
  return ['preparing', 'transcribing', ...(options.shortenPauses ? ['cleaning' as const] : []), ...(options.translationLanguage ? ['translating' as const] : []), 'styling', ...(options.presetId === 'keywords' ? ['emphasizing' as const] : []), 'rendering'];
}
export const CAPTION_STAGE_NAMES: Record<CaptionProcessingStage, [string, string]> = {
  voicing: ['生成配音', 'Generate voice'], aligning: ['适配原片时长', 'Fit speech timing'], lipsync: ['同步口型', 'Sync lips'],
  preparing: ['准备视频', 'Prepare video'], transcribing: ['识别讲话', 'Transcribe speech'], cleaning: ['整理停顿', 'Shorten pauses'], translating: ['翻译字幕', 'Translate captions'],
  styling: ['配置字幕', 'Style captions'], emphasizing: ['选择重点词', 'Select key phrases'], rendering: ['生成视频', 'Render video'],
};
export const CAPTION_PROGRESS_DETAILS: Record<string, [string, string]> = {
  checking: ['读取音轨', 'Reading audio'], extracting: ['提取音频', 'Extracting audio'], uploading: ['上传音频', 'Uploading audio'], recognizing: ['识别中', 'Recognizing speech'], aligning: ['对齐时间', 'Aligning timestamps'],
  fonts: ['加载字体', 'Loading fonts'], finishing: ['封装视频', 'Finishing video'],
};
