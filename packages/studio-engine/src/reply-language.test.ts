import { describe, expect, it } from 'vitest';
import { CHAT_RESPONSE_LANGUAGE, replyLanguageDirective, replyLanguageReminder } from './reply-language';
import { v3Instructions } from './agent-surface-v3/instructions';
import { CHAT_IDENTITY } from './prompts/chat';
import { buildBlockPrompt, buildKitPrompt } from './compose';

describe('one stable conversation-language rule', () => {
  it('is identical in legacy and v3, without a detector or dynamic policy injection', () => {
    expect(CHAT_IDENTITY).toContain(CHAT_RESPONSE_LANGUAGE);
    expect(v3Instructions({ surface: 'chat' })).toContain(CHAT_RESPONSE_LANGUAGE);
    expect(CHAT_RESPONSE_LANGUAGE).toBe('IMPORTANT: Your response must ALWAYS strictly follow the same major language as the user.');
    expect(CHAT_IDENTITY).not.toContain('<reply_language>');
  });
  it('does not let internal English design instructions select the chat note language', () => {
    const args = { block: { id: 'b1', kind: 'custom', innerHtml: '', timelineBody: '' }, instruction: 'Create a tally card' };
    for (const prompt of [buildBlockPrompt(args), buildKitPrompt(args)]) {
      expect(prompt).toContain("the user's conversation language");
      expect(prompt).not.toContain('same language as the instruction above');
    }
  });
  it('preserves an explicit note language for the separate hosted designer', () => {
    const prompt = buildBlockPrompt({ block: { id: 'b1', kind: 'custom', innerHtml: '', timelineBody: '' }, instruction: 'Create a tally card', lang: 'zh' });
    expect(prompt).toContain('UI language "zh"');
  });

  it('lets a surface that knows the locale replace the generic rule with a concrete language', () => {
    const zh = replyLanguageDirective('zh');
    expect(zh).toContain('interface language is Chinese');
    expect(zh).toContain('including the short lines you say while working');
    const prompt = v3Instructions({ surface: 'chat', replyLanguage: zh });
    expect(prompt.trimEnd().endsWith(zh)).toBe(true); // last thing the model reads before answering
    expect(prompt).not.toContain(CHAT_RESPONSE_LANGUAGE);
    expect(replyLanguageReminder('zh')).toBe('（请始终用中文回复。）');
    expect(replyLanguageDirective('en')).toContain('interface language is English');
  });
});
