/// <reference types="vite/client" />

/**
 * Ready-to-use OSS Skill layer for Vite shells. Other runtimes can feed raw SKILL.md files to
 * createStudioScenarioSkillRegistry directly; third-party packages can merge registries explicitly.
 */
import { createStudioScenarioSkillRegistry } from './registry';

const OSS_SKILL_FILES = import.meta.glob('./content/*/SKILL.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const ossStudioScenarioSkillRegistry = createStudioScenarioSkillRegistry(OSS_SKILL_FILES);
export const OSS_STUDIO_DEFAULT_SKILL_ID = 'talking-head-edit';

export interface OssStudioScenarioSkillCatalogItem {
  id: string;
  title: string;
  summary: string;
  icon?: string;
}

/** Browser-safe picker metadata. Full Markdown remains available through the registry for the chat host.
 *  Only scenario skills are picker entries; craft skills such as audio-and-music are read by the agent
 *  on demand (and served to external agents through the MCP list_skills / read_skill tools). */
export function ossStudioScenarioSkillCatalog(locale: string): readonly OssStudioScenarioSkillCatalogItem[] {
  const zh = locale.toLowerCase().startsWith('zh');
  const entries: Array<[string, OssStudioScenarioSkillCatalogItem]> = [
    [OSS_STUDIO_DEFAULT_SKILL_ID, zh
      ? {
        id: OSS_STUDIO_DEFAULT_SKILL_ID,
        title: '口播剪辑',
        summary: '剪掉无效停顿、口头禅、重复、口误和废弃重录，保留自然语气并整理字幕；需要时再做构图、B-roll、动态图形和声音增强。',
        icon: '🎙️',
      }
      : {
        id: OSS_STUDIO_DEFAULT_SKILL_ID,
        title: 'Talking-head edit',
        summary: 'Remove dead air, filler, repeats, mistakes, and discarded retakes while preserving natural delivery and captions; add reframing, B-roll, Motion Graphics, and sound only when needed.',
        icon: '🎙️',
      }],
    ['montage-edit', zh
      ? {
        id: 'montage-edit',
        title: '混剪',
        summary: '从一批素材里找出主导情绪和视觉母题，把画面、节奏、声音和文字组织成一段完整体验。',
        icon: '🎞️',
      }
      : {
        id: 'montage-edit',
        title: 'Montage edit',
        summary: 'Find the governing emotion and visual motifs in a body of footage, then compose image, rhythm, sound and text into one intentional experience.',
        icon: '🎞️',
      }],
  ];
  return entries
    .filter(([id]) => ossStudioScenarioSkillRegistry.get(id))
    .map(([, item]) => item);
}
