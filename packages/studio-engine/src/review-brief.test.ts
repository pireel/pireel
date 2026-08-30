import { describe, expect, it } from 'vitest';
import { composeEditorialBrief, extractSkillReviewBrief, MAX_REVIEW_SESSION_NOTES_CHARS } from './review-brief';

describe('skill review brief', () => {
  it('extracts the first fenced review-brief block from skill markdown', () => {
    const markdown = [
      '# Skill',
      'Prose before.',
      '```review-brief',
      'Judge posture and framing.',
      'Reject blur.',
      '```',
      'Prose after.',
      '```review-brief',
      'A second block is ignored.',
      '```',
    ].join('\n');
    expect(extractSkillReviewBrief(markdown)).toBe('Judge posture and framing.\nReject blur.');
  });

  it('returns null when the block is absent or empty', () => {
    expect(extractSkillReviewBrief('# Skill\nNo block here.')).toBeNull();
    expect(extractSkillReviewBrief('```review-brief\n\n```')).toBeNull();
    expect(extractSkillReviewBrief('')).toBeNull();
    expect(extractSkillReviewBrief(null)).toBeNull();
  });

  it('keeps skill criteria first and demotes the model brief to bounded session notes', () => {
    const composed = composeEditorialBrief('CRITERIA', 'session facts');
    expect(composed.startsWith('CRITERIA')).toBe(true);
    expect(composed).toContain('session facts');
    expect(composed).toContain('criteria above always take precedence');

    const long = 'x'.repeat(MAX_REVIEW_SESSION_NOTES_CHARS + 100);
    expect(composeEditorialBrief('CRITERIA', long).length)
      .toBeLessThanOrEqual('CRITERIA'.length + MAX_REVIEW_SESSION_NOTES_CHARS + 120);
  });

  it('returns the template alone for empty or duplicated notes', () => {
    expect(composeEditorialBrief('CRITERIA', '')).toBe('CRITERIA');
    expect(composeEditorialBrief('CRITERIA with detail', 'with detail')).toBe('CRITERIA with detail');
  });
});
