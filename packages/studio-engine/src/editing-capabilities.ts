import type { CaptionTaskOptions } from './caption-task';
import { resolveCaptionStyle } from './composition-core';
/** User-facing editing intentions. Internal steps are execution details, never the picker. */
export const EDITING_CAPABILITIES = [
  { id: 'motion-graphics', name: '动态图形', en: 'Motion graphics', description: '把讲述的重点变成同步出现的图形动画', icon: 'Shapes' },
  { id: 'sound-effects', name: '音效', en: 'Sound effects', description: '在重点和转折处加入适量提示音', icon: 'AudioLines' },
  { id: 'captions', name: '字幕', en: 'Captions', description: '为讲话添加同步字幕与重点词', icon: 'Captions' },
  { id: 'voice-cleanup', name: '人声清理', en: 'Voice cleanup', description: '降低背景噪声，让讲话音量更均匀', icon: 'Mic' },
  { id: 'camera-movement', name: '镜头运动', en: 'Camera movement', description: '加入推近、景别变化与切换效果', icon: 'Focus' },
  { id: 'floating-overlay', name: '悬浮叠加', en: 'Floating overlay', description: '为讲述匹配贴纸和悬浮道具', icon: 'Sticker' },
  { id: 'rough-cut', name: '口播粗剪', en: 'Rough cut', description: '剪掉停顿与明确的口头填充词', icon: 'Scissors' },
  { id: 'auto-layout', name: '自动布局', en: 'Auto layout', description: '调整画幅，安排人物与图形的位置', icon: 'PanelsTopLeft' },
  { id: 'broll', name: '自动 B-roll', en: 'Auto B-roll', description: '从你的素材中匹配画面并放入视频', icon: 'Clapperboard' },
  { id: 'background-music', name: '背景音乐', en: 'Background music', description: '添加配乐，讲话时自动降低音乐音量', icon: 'Music' },
  { id: 'translation', name: '翻译', en: 'Translation', description: '生成对应译文，用于字幕或配音', icon: 'Languages' },
  { id: 'voiceover', name: '配音', en: 'Voiceover', description: '选择音色生成配音，自动适配讲话时长', icon: 'Speech' },
] as const;
export type EditingCapabilityId = typeof EDITING_CAPABILITIES[number]['id'];
export interface EditingRecipe {
  version: 1;
  brollAssetIds?: string[];
  enabled: EditingCapabilityId[];
  captions: CaptionTaskOptions;
  language: string; voiceId: string; speakerVoices: Record<string, string>; script: string;
  rewrite: string; reviewTranslation: boolean; reviewPlan?: boolean;
  roughCut: { minimumPauseSec: number; paddingSec: number; fillers: boolean };
  cleanup: { strength: number; normalize: boolean };
  graphics: { instruction: string; maxCount: number };
  camera: { scale: number; intervalSec: number; transition: 'none' | 'fade' };
  overlay: { query: string; maxCount: number };
  layout: { aspect: 'original' | 'portrait' | 'landscape' | 'square'; arrange: boolean };
  effects: { style: 'soft' | 'pop' | 'whoosh'; maxCount: number; volumeDb: number };
  music: { query: string; assetSig: string; name: string; volumeDb: number; duckDb: number };
  render: { res: 720 | 1080 | 2160; fps: 24 | 25 | 30 | 60; format: 'mp4' };
}
export function defaultEditingRecipe(): EditingRecipe {
  return { version: 1, enabled: ['captions'], captions: { caption: {}, aspect: 'original', shortenPauses: false }, language: 'English', voiceId: '', speakerVoices: {}, script: '', rewrite: '', reviewTranslation: false,
    roughCut: { minimumPauseSec: .7, paddingSec: .15, fillers: true }, cleanup: { strength: .6, normalize: true }, graphics: { instruction: '用简洁、清晰的图形解释重点，不遮挡人物和底部字幕。', maxCount: 3 }, camera: { scale: 1.15, intervalSec: 8, transition: 'none' }, overlay: { query: '', maxCount: 3 }, layout: { aspect: 'original', arrange: true }, effects: { style: 'soft', maxCount: 4, volumeDb: -18 }, music: { query: 'calm narration background music', assetSig: '', name: '', volumeDb: -18, duckDb: -12 }, render: { res: 1080, fps: 30, format: 'mp4' } };
}

/** Editing workflows use the workbench canvas-size convention; explicit user sizes always win. */
export function editingCaptionOptions(recipe: EditingRecipe): CaptionTaskOptions {
  const defaults = resolveCaptionStyle({ blocks: [] });
  return {
    ...recipe.captions,
    aspect: recipe.enabled.includes('auto-layout') ? recipe.layout.aspect : 'original',
    caption: { ...recipe.captions.caption, scale: recipe.captions.caption?.scale ?? defaults.scale },
    translationLanguage: recipe.enabled.includes('translation') && !recipe.enabled.includes('voiceover') ? recipe.language as CaptionTaskOptions['translationLanguage'] : undefined,
  };
}
