import { describe, expect, it } from 'vitest';
import { pruneUnknownToolParts } from './history';

describe('pruneUnknownToolParts', () => {
  it('drops tool parts that name a tool outside the surface and keeps everything else in order', () => {
    const messages = [
      { role: 'user', parts: [{ type: 'text', text: 'tighten it' }] },
      {
        role: 'assistant',
        parts: [
          { type: 'tool-get_timeline', toolCallId: 'a', state: 'output-available', input: {}, output: { ok: true } },
          { type: 'tool-remove_words', toolCallId: 'b', state: 'output-available', input: { ranges: [[1, 2]] }, output: { ok: true } },
          { type: 'dynamic-tool', toolName: 'read_script', toolCallId: 'd', state: 'output-available', input: {}, output: { ok: true } },
          { type: 'dynamic-tool', toolName: 'get_transcript', toolCallId: 'e', state: 'output-available', input: {}, output: { ok: true } },
          { type: 'text', text: 'done' },
        ],
      },
    ];
    const out = pruneUnknownToolParts(messages);
    expect(out[0]).toBe(messages[0]);
    expect(out[1]!.parts.map((part) => part.type === 'dynamic-tool' ? `dyn:${part.toolName}` : part.type)).toEqual([
      'tool-remove_words', 'dyn:get_transcript', 'text',
    ]);
    expect((out[1]!.parts[0] as { input: unknown }).input).toEqual({ ranges: [[1, 2]] });
  });

  it('returns messages untouched when history already speaks the current surface', () => {
    const messages = [{ role: 'assistant', parts: [{ type: 'tool-get_state', toolCallId: 'a', state: 'output-available', input: {}, output: {} }] }];
    const out = pruneUnknownToolParts(messages);
    expect(out[0]).toBe(messages[0]);
  });
});
