import { describe, expect, it } from 'vitest';
import { convertToModelMessages, type UIMessage } from 'ai';
import { compactStudioChatMessagesForModel } from './chat-thread-store';

describe('language context across tool continuation', () => {
  it('keeps the user message and assistant prose, while English tool contracts stay tool data', async () => {
    const messages: UIMessage[] = [
      { id: 'u', role: 'user', parts: [{ type: 'text', text: '随便生成一个mg组件' }] },
      { id: 'a', role: 'assistant', parts: [
        { type: 'text', text: '我先查看当前画布。' },
        { type: 'dynamic-tool', toolName: 'get_state', toolCallId: 'call_00_state', state: 'output-available', input: {}, output: { ok: true, summary: 'Current canvas', data: { width: 1080, height: 1920 } } },
        { type: 'text', text: '接下来生成图形。' },
      ] },
    ];
    const replay = await convertToModelMessages(compactStudioChatMessagesForModel(messages), { ignoreIncompleteToolCalls: true });
    expect(replay[0]).toMatchObject({ role: 'user', content: [{ type: 'text', text: '随便生成一个mg组件' }] });
    expect(JSON.stringify(replay)).toContain('我先查看当前画布');
    expect(JSON.stringify(replay)).toContain('接下来生成图形');
    expect(replay.some((message) => message.role === 'system')).toBe(false);
    expect(JSON.stringify(replay.find((message) => message.role === 'tool'))).toContain('Current canvas');
  });
});
