import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  assistantHasOpenOrInterruptedInteraction,
  assistantMessageHasRenderableOutput,
  isRecoverableStudioChatError,
  sanitizeRestored,
} from './chat-thread-store';

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

  it('recognizes an interaction boundary that must not be auto-retried', () => {
    expect(assistantHasOpenOrInterruptedInteraction(assistant([
      { type: 'tool-ask_user', toolCallId: 'ask-1', state: 'output-error', input: {}, errorText: 'interrupted' },
    ] as UIMessage['parts']))).toBe(true);
    expect(assistantHasOpenOrInterruptedInteraction(assistant([
      { type: 'tool-request_approval', toolCallId: 'approval-1', state: 'input-available', input: {} },
    ] as UIMessage['parts']))).toBe(true);
    expect(assistantHasOpenOrInterruptedInteraction(assistant([
      { type: 'tool-ask_user', toolCallId: 'ask-2', state: 'output-available', input: {}, output: { ok: true } },
    ] as UIMessage['parts']))).toBe(false);
  });
});

describe('isRecoverableStudioChatError', () => {
  it('allows one safe continuation for transport and stream interruption errors', () => {
    for (const message of ['studio_stream_interrupted', 'Failed to fetch', 'NetworkError', 'connection reset', 'stream terminated']) {
      expect(isRecoverableStudioChatError(new Error(message)), message).toBe(true);
    }
  });

  it('does not retry billing, auth, validation or unknown application errors', () => {
    for (const message of ['insufficient_tokens', '401 Unauthorized', 'invalid_messages', 'request_too_large', 'tool execution failed']) {
      expect(isRecoverableStudioChatError(new Error(message)), message).toBe(false);
    }
  });
});
