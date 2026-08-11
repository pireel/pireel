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
      summary: '围绕讲话含义统筹剪辑、节奏、字幕、证据、图形与声音。',
      icon: '🎙️',
    }];
  }
  return [{
    id: talkingHead.id,
    title: 'Talking-head edit',
    summary: 'Shape spoken meaning through editing, pacing, captions, evidence, graphics, and sound.',
    icon: '🎙️',
  }];
}
