import { describe, expect, it } from 'vitest';
import { remapLegacyToolParts } from './history';

describe('remapLegacyToolParts', () => {
  it('renames legacy tool parts to the absorbing v3 tool and drops retired planning parts', () => {
    const messages = [
      { role: 'user', parts: [{ type: 'text', text: 'tighten it' }] },
      {
        role: 'assistant',
        parts: [
          { type: 'tool-get_timeline', toolCallId: 'a', state: 'output-available', input: {}, output: { ok: true } },
          { type: 'tool-cut_narration', toolCallId: 'b', state: 'output-available', input: { ranges: [[1, 2]] }, output: { ok: true } },
          { type: 'tool-set_director_plan', toolCallId: 'c', state: 'output-available', input: {}, output: { ok: true } },
          { type: 'dynamic-tool', toolName: 'read_script', toolCallId: 'd', state: 'output-available', input: {}, output: { ok: true } },
          { type: 'tool-remove_words', toolCallId: 'e', state: 'output-available', input: {}, output: { ok: true } },
          { type: 'text', text: 'done' },
        ],
      },
    ];
    const out = remapLegacyToolParts(messages);
    expect(out[0]).toBe(messages[0]);
    expect(out[1]!.parts.map((part) => part.type === 'dynamic-tool' ? `dyn:${part.toolName}` : part.type)).toEqual([
      'tool-get_state', 'tool-remove_words', 'dyn:get_transcript', 'tool-remove_words', 'text',
    ]);
    // inputs and outputs travel unchanged
    expect((out[1]!.parts[1] as { input: unknown }).input).toEqual({ ranges: [[1, 2]] });
  });

  it('returns messages untouched when history already speaks v3', () => {
    const messages = [{ role: 'assistant', parts: [{ type: 'tool-get_state', toolCallId: 'a', state: 'output-available', input: {}, output: {} }] }];
    const out = remapLegacyToolParts(messages);
    expect(out[0]).toBe(messages[0]);
  });
});
