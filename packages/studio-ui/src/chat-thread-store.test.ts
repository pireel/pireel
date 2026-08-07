import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { assistantMessageHasRenderableOutput, sanitizeRestored } from './chat-thread-store';

const assistant = (parts: UIMessage['parts']): UIMessage => ({
  id: 'assistant-1',
  role: 'assistant',
  parts,
});

describe('sanitizeRestored', () => {
  it('removes leaked provider tool markup from persisted assistant text', () => {
    const [message] = sanitizeRestored([assistant([
      { type: 'text', text: '先处理。<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="resize_block">x</｜｜DSML｜｜tool_calls>完成。' },
    ])]);
    expect((message!.parts[0] as { text: string }).text).toBe('先处理。完成。');
  });
});

describe('assistantMessageHasRenderableOutput', () => {
  it('treats a reasoning-only completion as an empty response', () => {
    expect(assistantMessageHasRenderableOutput(assistant([
      { type: 'step-start' },
      { type: 'reasoning', text: 'internal planning' },
    ]))).toBe(false);
  });

  it('accepts visible text or a tool receipt', () => {
    expect(assistantMessageHasRenderableOutput(assistant([{ type: 'text', text: '完成' }]))).toBe(true);
    expect(assistantMessageHasRenderableOutput(assistant([
      { type: 'tool-seek', toolCallId: 'tool-1', state: 'output-available', input: {}, output: {} },
    ] as UIMessage['parts']))).toBe(true);
  });
});
