import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { alreadyStarted, sceneAgentState, startWithRoughCut } from '@pireel/studio-ui/agent-startup';
const request = (state: string): UIMessage => ({ id: 'u', role: 'user', parts: [{ type: 'text', text: 'make a board' }], metadata: { task: { id: 'task', goal: 'make a board', mode: 'request', state } } });
describe('scene startup and progress', () => {
  it('keeps the whiteboard narration intact without changing the usual one-click edit', () => {
    expect(startWithRoughCut('whiteboard-explainer')).toBe(false);
    expect(startWithRoughCut('talking-head-edit')).toBe(true);
  });
  it('does not repeat a scene request after reload even though it is not a rough-cut task', () => {
    expect(alreadyStarted([request('running')], 'make a board', false)).toBe(true);
    expect(alreadyStarted([request('done')], 'make another board', false)).toBe(false);
  });
  it('reports failure and unanswered questions instead of hiding them behind a spinner', () => {
    expect(sceneAgentState([request('running')], true, true)).toBe('attention');
    const question = { id: 'a', role: 'assistant', parts: [{ type: 'tool-ask_user', state: 'input-available', toolCallId: 'q', input: {} }] } as unknown as UIMessage;
    expect(sceneAgentState([request('running'), question], true, false)).toBe('attention');
    expect(sceneAgentState([request('partial')], false, false)).toBe('attention');
    expect(sceneAgentState([request('running')], true, false)).toBe('running');
    expect(sceneAgentState([request('done')], false, false)).toBe('done');
  });
});
