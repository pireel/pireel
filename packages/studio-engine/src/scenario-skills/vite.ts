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

/** Browser-safe picker metadata. Full Markdown remains available through the registry for the chat host. */
export function ossStudioScenarioSkillCatalog(locale: string): readonly OssStudioScenarioSkillCatalogItem[] {
  const talkingHead = ossStudioScenarioSkillRegistry.get(OSS_STUDIO_DEFAULT_SKILL_ID);
  if (!talkingHead) return [];
  if (locale.toLowerCase().startsWith('zh')) {
    return [{
      id: talkingHead.id,
      title: '口播剪辑',
      summary: '剪掉无效停顿、口头禅、重复、口误和废弃重录，保留自然语气并整理字幕；需要时再做构图、B-roll、动态图形和声音增强。',
      icon: '🎙️',
    }];
  }
  return [{
    id: talkingHead.id,
    title: 'Talking-head edit',
    summary: 'Remove dead air, filler, repeats, mistakes, and discarded retakes while preserving natural delivery and captions; add reframing, B-roll, Motion Graphics, and sound only when needed.',
    icon: '🎙️',
  }];
}
