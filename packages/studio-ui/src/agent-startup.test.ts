import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { alreadyStarted, firstEditMessage, firstMessageEditsFootage, footageToEdit, sceneAgentState, startWithRoughCut } from '@pireel/studio-ui/agent-startup';
import { compositionToEditorDocument, emptyComposition } from '@pireel/studio-engine/composition';
import { t } from '@pireel/studio-ui/i18n';
const request = (state: string): UIMessage => ({ id: 'u', role: 'user', parts: [{ type: 'text', text: 'make a board' }], metadata: { task: { id: 'task', goal: 'make a board', mode: 'request', state } } });
describe('scene startup and progress', () => {
  it('makes the first message on untouched footage the one-click edit its switches describe', () => {
    const footage = compositionToEditorDocument({ projectId: 'p', videoSig: 'sig', composition: { ...emptyComposition(), width: 1080, height: 1920, video: { url: 'blob:x', durationSec: 10 }, shots: [{ id: 'source-video', srcStart: 0, srcEnd: 10, treatment: 'full' as const }] } }).document;
    const blank = compositionToEditorDocument({ projectId: 'p', composition: emptyComposition() }).document;
    expect(firstMessageEditsFootage(footage, [], 'auto', ['rough-cut', 'captions'])).toBe(true);
    expect(footageToEdit(footage)).toBe(true);
    expect(footageToEdit(blank)).toBe(false);
    // No footage, a conversation already under way, every switch off, or a whiteboard: an ordinary request.
    expect(firstMessageEditsFootage(blank, [], 'auto', ['rough-cut'])).toBe(false);
    expect(firstMessageEditsFootage(footage, [request('done')], 'auto', ['rough-cut'])).toBe(false);
    expect(firstMessageEditsFootage(footage, [], 'auto', [])).toBe(false);
    expect(firstMessageEditsFootage(footage, [], 'whiteboard-explainer', ['rough-cut'])).toBe(false);
    // Once edited, the creator asks in words.
    expect(firstMessageEditsFootage({ ...footage, appearance: { ...footage.appearance, captionStyle: { on: true } } }, [], 'auto', ['rough-cut'])).toBe(false);
  });
  it('words that first message as the home does: the edit alone, or the edit and what was asked', () => {
    expect(firstEditMessage([{ type: 'text', text: '' }])).toEqual([{ type: 'text', text: t('chatGen.editWithSwitches') }]);
    expect(firstEditMessage([{ type: 'text', text: '开头更紧凑' }])).toEqual([
      { type: 'text', text: `${t('chatGen.editWithSwitches')}\n${t('chatGen.requestedChanges')} ` }, { type: 'text', text: '开头更紧凑' },
    ]);
  });
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
