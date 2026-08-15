import { describe, expect, it } from 'vitest';
import {
  STUDIO_AGENT_EXECUTION_LIMITS,
  reviewMomentKey,
  selectReviewMoments,
  studioAgentBudgetPrompt,
  studioAgentTurnUsage,
  validateStudioProposalBudget,
} from './agent-execution-budget';

describe('Studio Agent execution budget', () => {
  it('counts only the latest user turn, including continuations appended to one assistant message', () => {
    const usage = studioAgentTurnUsage([
      { role: 'user', parts: [{ type: 'text' }] },
      { role: 'assistant', parts: [{ type: 'step-start' }, { type: 'tool-old' }] },
      { role: 'user', parts: [{ type: 'text' }] },
      {
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          { type: 'tool-set_canvas' },
          { type: 'step-start' },
          { type: 'dynamic-tool', toolName: 'set_shot_framing' },
        ],
      },
    ]);
    expect(usage).toMatchObject({ toolCalls: 2, exhausted: false });
    expect(usage.remainingToolCalls).toBe(STUDIO_AGENT_EXECUTION_LIMITS.toolCallsPerTurn - 2);
  });

  it('does not stop a useful job merely because it needed many model continuations', () => {
    const parts = Array.from({ length: 40 }, () => ({ type: 'step-start' }));
    const usage = studioAgentTurnUsage([{ role: 'user', parts: [{ type: 'text' }] }, { role: 'assistant', parts }]);
    expect(usage).toEqual({
      toolCalls: 0,
      remainingToolCalls: STUDIO_AGENT_EXECUTION_LIMITS.toolCallsPerTurn,
      exhausted: false,
    });
    expect(studioAgentBudgetPrompt(usage)).toContain('There is no model-round ceiling');
  });

  it('forces a truthful handoff without exposing internal capacity as user-facing budget', () => {
    const parts = Array.from({ length: STUDIO_AGENT_EXECUTION_LIMITS.toolCallsPerTurn }, () => ({ type: 'tool-split_shot' }));
    const usage = studioAgentTurnUsage([{ role: 'user', parts: [{ type: 'text' }] }, { role: 'assistant', parts }]);
    expect(usage.exhausted).toBe(true);
    expect(studioAgentBudgetPrompt(usage)).toContain('Do not call another tool');
    expect(studioAgentBudgetPrompt(usage)).toContain('NEVER mention budgets, limits');
    expect(studioAgentBudgetPrompt(usage)).toContain('single concrete next action');
  });

  it('requires persisted split/framing operations to use their vectorized forms', () => {
    expect(
      validateStudioProposalBudget([
        { tool: 'split_shot', input: { atSec: 2 } },
        { tool: 'split_shot', input: { atSec: 4 } },
      ]),
    ).toMatchObject({ ok: false, code: 'too_many_split_calls' });
    expect(
      validateStudioProposalBudget([
        { tool: 'set_shot_framing', input: { shotId: 's1', scale: 2 } },
        { tool: 'set_shot_framing', input: { shotId: 's2', scale: 2 } },
      ]),
    ).toMatchObject({ ok: false, code: 'too_many_framing_calls' });
    expect(
      validateStudioProposalBudget([
        { tool: 'split_shot', input: { atSecs: [2, 4], purpose: 'framing' } },
        { tool: 'set_shot_framing', input: { updates: [{ shotId: 's1', scale: 2 }, { shotId: 's2', scale: 2 }] } },
      ]),
    ).toEqual({ ok: true });
  });

  it('stops a third review of the same unchanged tenth-second moment', () => {
    const attempts = new Map([[reviewMomentKey(2.04), 2], [reviewMomentKey(5), 1]]);
    expect(selectReviewMoments([2, 5, 8], attempts)).toEqual({ allowedAtSecs: [5, 8], repeatedAtSecs: [2] });
  });
});
