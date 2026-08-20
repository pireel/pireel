import { describe, expect, it } from 'vitest';
import {
  STUDIO_AGENT_EXECUTION_LIMITS,
  reviewMomentKey,
  selectReviewMoments,
  validateStudioProposalBudget,
} from './agent-execution-budget';

describe('Studio Agent operation safeguards', () => {
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
