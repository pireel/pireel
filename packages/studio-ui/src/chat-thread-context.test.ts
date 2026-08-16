import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import type { ChatSituation } from '@pireel/studio-engine/prompts';
import { scopeSituationToThread, threadOwnsDirectorPlan } from './chat-thread-context';

const projectState: ChatSituation = {
  composition: { durationSec: 30, shots: [{ id: 'shot-1' }] },
  pipeline: { asr: true, plan: true, visual: true },
  directorPlan: {
    goal: '上一段对话的目标',
    creativeThesis: '上一段对话的策略',
    scenes: [],
  },
};

describe('Studio chat thread context', () => {
  it('does not expose another thread plan when a new chat says continue editing', () => {
    const messages: UIMessage[] = [{
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: '继续剪视频' }],
    }];
    const scoped = scopeSituationToThread(projectState, messages);
    expect(scoped.directorPlan).toBeUndefined();
    expect(scoped.pipeline?.plan).toBe(false);
    expect(scoped.composition).toBe(projectState.composition);
  });

  it('exposes a Director Plan only after this thread successfully creates it', () => {
    const failed: UIMessage = {
      id: 'assistant-failed',
      role: 'assistant',
      parts: [{
        type: 'tool-set_director_plan',
        toolCallId: 'plan-failed',
        state: 'output-error',
        input: {},
        errorText: 'failed',
      }] as UIMessage['parts'],
    };
    expect(threadOwnsDirectorPlan([failed])).toBe(false);

    const completed: UIMessage = {
      id: 'assistant-complete',
      role: 'assistant',
      parts: [{
        type: 'tool-set_director_plan',
        toolCallId: 'plan-complete',
        state: 'output-available',
        input: {},
        output: { ok: true },
      }] as UIMessage['parts'],
    };
    expect(threadOwnsDirectorPlan([completed])).toBe(true);
    expect(scopeSituationToThread(projectState, [completed]).directorPlan)
      .toBe(projectState.directorPlan);
  });

  it('does not expose an old Director Plan after the timeline has been emptied', () => {
    const completed: UIMessage = {
      id: 'assistant-complete',
      role: 'assistant',
      parts: [{
        type: 'tool-set_director_plan',
        toolCallId: 'plan-complete',
        state: 'output-available',
        input: {},
        output: { ok: true },
      }] as UIMessage['parts'],
    };
    const emptyTimeline: ChatSituation = {
      ...projectState,
      composition: {
        durationSec: 0,
        shots: [],
        blocks: [],
        audio: [],
      },
    };

    const scoped = scopeSituationToThread(emptyTimeline, [completed]);
    expect(scoped.directorPlan).toBeUndefined();
    expect(scoped.pipeline?.plan).toBe(false);
  });

  it('keeps the current thread plan when an audio-only timeline still has content', () => {
    const completed: UIMessage = {
      id: 'assistant-complete',
      role: 'assistant',
      parts: [{
        type: 'tool-set_director_plan',
        toolCallId: 'plan-complete',
        state: 'output-available',
        input: {},
        output: { ok: true },
      }] as UIMessage['parts'],
    };
    const audioTimeline: ChatSituation = {
      ...projectState,
      composition: {
        durationSec: 30,
        shots: [],
        blocks: [],
        audio: [{ id: 'narration', startSec: 0, endSec: 30 }],
      },
    };

    expect(scopeSituationToThread(audioTimeline, [completed]).directorPlan)
      .toBe(projectState.directorPlan);
  });
});
