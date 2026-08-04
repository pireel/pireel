import { describe, expect, it } from 'vitest';
import { CHATGEN_EN } from '../messages/en/chat-gen';
import { CHATGEN_ZH } from '../messages/zh/chat-gen';
import { VIDEO_TEMPLATES } from './video';
import { localizedTemplatePrompt } from './types';

describe('video templates', () => {
  it('ships the curated preview clips from our own R2 namespace', () => {
    const finished = VIDEO_TEMPLATES.filter((template) => template.video);

    expect(VIDEO_TEMPLATES).toHaveLength(24);
    expect(finished).toHaveLength(24);
    expect(new Set(finished.map((template) => template.video)).size).toBe(24);
    expect(finished.every((template) => template.video?.startsWith('studio/gen-templates/video/'))).toBe(true);
    expect(finished.every((template) => !template.video?.startsWith('http'))).toBe(true);
  });

  it('provides localized Remix prompts for every finished preview', () => {
    const finished = VIDEO_TEMPLATES.filter((template) => template.video);

    for (const template of finished) {
      expect(template.title).toBeTruthy();
      expect(CHATGEN_EN[template.title!]).toBeTruthy();
      expect(CHATGEN_ZH[template.title!]).toBeTruthy();
      expect(localizedTemplatePrompt(template, 'en-US')).toBe(template.prompt);
      expect(localizedTemplatePrompt(template, 'zh-CN')).toBe(template.promptI18n?.zh);
      expect(template.promptI18n?.zh.length).toBeGreaterThan(20);
    }
  });
});
