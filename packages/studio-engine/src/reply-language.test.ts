import { describe, expect, it } from 'vitest';
import { CHAT_RESPONSE_LANGUAGE } from './reply-language';
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
});
