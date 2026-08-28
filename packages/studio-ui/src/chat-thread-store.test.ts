import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  assistantHasOpenOrInterruptedInteraction,
  assistantMessageHasRenderableOutput,
  canRunVisualReview,
  compactStudioChatMessages,
  isRecoverableStudioChatError,
  sanitizeRestored,
} from './chat-thread-store';
import { analyzeVisualSourceLabel } from './chat-tool-parts';

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

describe('compactStudioChatMessages', () => {
  it('keeps every visible text fragment when later tool calls stream in', () => {
    const [message] = compactStudioChatMessages([assistant([
      { type: 'text', text: '让我先检查素材。' },
      { type: 'step-start' },
      { type: 'tool-list_assets', toolCallId: 'list-1', state: 'output-available', input: {}, output: {} },
      { type: 'text', text: '我需要再分析画面和参数。' },
      { type: 'tool-analyze_visual', toolCallId: 'vision-1', state: 'output-available', input: {}, output: {} },
      { type: 'reasoning', text: 'private chain' },
      { type: 'text', text: '已按旅行画面完成剪辑。' },
    ] as UIMessage['parts'])]);

    expect(message!.parts.map((part) => (part as { type: string }).type)).toEqual([
      'text',
      'tool-list_assets',
      'text',
      'tool-analyze_visual',
      'text',
    ]);
    expect(message!.parts
      .filter((part) => (part as { type: string }).type === 'text')
      .map((part) => (part as { text: string }).text)).toEqual([
      '让我先检查素材。',
      '我需要再分析画面和参数。',
      '已按旅行画面完成剪辑。',
    ]);
    expect((message!.parts.at(-1) as { text: string }).text).toBe('已按旅行画面完成剪辑。');
  });

  it('preserves a direct assistant answer when no tool was used', () => {
    const [message] = compactStudioChatMessages([assistant([{ type: 'text', text: '直接回答。' }])]);
    expect(message!.parts).toEqual([{ type: 'text', text: '直接回答。' }]);
  });
});

describe('analyze visual card context', () => {
  it('surfaces the resolved source label without showing an implementation id', () => {
    expect(analyzeVisualSourceLabel({
      type: 'tool-analyze_visual',
      state: 'output-available',
      input: { assetId: 'asset-internal-123' },
      output: { ok: true, data: { label: '海边回眸.mov' } },
    })).toBe('海边回眸.mov');
  });
});

describe('visual review budget', () => {
  it('allows one broad review and one targeted recheck per user turn', () => {
    expect(canRunVisualReview(0)).toBe(true);
    expect(canRunVisualReview(1)).toBe(true);
    expect(canRunVisualReview(2)).toBe(false);
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
