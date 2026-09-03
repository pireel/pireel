import { describe, expect, it } from 'vitest';
import { normalizeVisualQuestionAnswers, visualQuestionSpecs } from './visual-question';

describe('targeted visual question', () => {
  it('builds five-frame specs for explicit ranges and drops malformed ones', () => {
    const specs = visualQuestionSpecs([
      { startSec: 10, endSec: 14 },
      { startSec: 5, endSec: 5 },
      { startSec: Number.NaN, endSec: 3 },
    ]);
    expect(specs).toHaveLength(1);
    expect(specs[0]).toMatchObject({ startSec: 10, endSec: 14 });
    expect(specs[0]!.frames).toHaveLength(5);
    expect(specs[0]!.frames.every((frame) => frame.atSec >= 10 && frame.atSec <= 14)).toBe(true);
  });

  it('maps relative-clock sub-ranges back to the source clock, bounds them, and normalizes verdicts', () => {
    const specs = visualQuestionSpecs([{ startSec: 10, endSec: 14 }, { startSec: 20, endSec: 23 }]);
    const answers = normalizeVisualQuestionAnswers(specs, [
      { candidateId: specs[0]!.id, answer: 'partial', confidence: 82.6, note: 'white shirt visible after she turns', ranges: [{ startSec: 1.5, endSec: 9, note: 'front' }, { startSec: 3, endSec: 3.05 }] },
      { candidateId: specs[1]!.id, answer: 'no', confidence: 200, ranges: [{ startSec: 0, endSec: 1 }] },
    ]);
    expect(answers[0]).toMatchObject({ answer: 'partial', confidence: 83, startSec: 10, endSec: 14 });
    expect(answers[0]!.ranges).toEqual([{ startSec: 11.5, endSec: 14, note: 'front' }]);
    // A "no" carries no ranges even when the model emitted some; confidence is clamped.
    expect(answers[1]).toMatchObject({ answer: 'no', confidence: 100, ranges: [] });
  });

  it('reports unknown for missing or unrecognized rows', () => {
    const specs = visualQuestionSpecs([{ startSec: 0, endSec: 2 }]);
    expect(normalizeVisualQuestionAnswers(specs, [])[0]).toMatchObject({ answer: 'unknown', confidence: 0, ranges: [] });
    expect(normalizeVisualQuestionAnswers(specs, [{ candidateId: specs[0]!.id, answer: 'maybe' }])[0]!.answer).toBe('unknown');
  });
});
