import { describe, expect, it } from 'vitest';
import { healReviewedSourceId } from './editorial-assembly-tool';

describe('healReviewedSourceId', () => {
  it('heals a garbled reviewed id to its one near-miss, and leaves unknown or ambiguous ids alone', () => {
    const street = 'local_0123456789ab-street';
    expect(healReviewedSourceId('local_0123456789ab-strXXt', new Set([street]))).toBe(street);
    expect(healReviewedSourceId(street, new Set([street]))).toBe(street);
    expect(healReviewedSourceId('local_99999999-x', new Set([street]))).toBeNull();
    expect(healReviewedSourceId('local_0123456789ab-zz', new Set([street, 'local_0123456789ab-beach']))).toBeNull();
  });
});
