import { describe, expect, it } from 'vitest';
import {
  buildEditorialReviewProxyPlan,
  editorialReviewProxyMeetsProviderMinimum,
} from './editorial-review-proxy';

describe('editorial review proxy plan', () => {
  it('uses each maximal interval exactly by default so its model clock starts at zero', () => {
    const plan = buildEditorialReviewProxyPlan([
      { id: 'candidate-1', startSec: 2, endSec: 6, technicalRank: 1, technicalScore: 90, frames: [] },
      { id: 'candidate-2', startSec: 9, endSec: 11, technicalRank: 2, technicalScore: 80, frames: [] },
    ], 12);
    expect(plan.map((segment) => ({
      candidateId: segment.candidateId,
      sourceStartSec: segment.sourceStartSec,
      sourceEndSec: segment.sourceEndSec,
      proxyStartSec: segment.proxyStartSec,
      proxyEndSec: segment.proxyEndSec,
    }))).toEqual([
      { candidateId: 'candidate-1', sourceStartSec: 2, sourceEndSec: 6, proxyStartSec: 0, proxyEndSec: 4 },
      { candidateId: 'candidate-2', sourceStartSec: 9, sourceEndSec: 11, proxyStartSec: 4, proxyEndSec: 6 },
    ]);
  });

  it('concatenates candidate context while preserving source and proxy clocks', () => {
    const plan = buildEditorialReviewProxyPlan([
      { id: 'candidate-1', startSec: 1, endSec: 3, technicalRank: 1, technicalScore: 90, frames: [] },
      { id: 'candidate-2', startSec: 8, endSec: 10, technicalRank: 2, technicalScore: 80, frames: [] },
    ], 12, 0.5);
    expect(plan).toEqual([
      {
        candidateId: 'candidate-1',
        proxyStartSec: 0,
        proxyEndSec: 3,
        sourceStartSec: 0.5,
        sourceEndSec: 3.5,
        candidateStartSec: 1,
        candidateEndSec: 3,
      },
      {
        candidateId: 'candidate-2',
        proxyStartSec: 3,
        proxyEndSec: 6,
        sourceStartSec: 7.5,
        sourceEndSec: 10.5,
        candidateStartSec: 8,
        candidateEndSec: 10,
      },
    ]);
  });

  it('clamps context at the source edges', () => {
    const plan = buildEditorialReviewProxyPlan([
      { id: 'candidate-1', startSec: 0, endSec: 1, technicalRank: 1, technicalScore: 80, frames: [] },
      { id: 'candidate-2', startSec: 9, endSec: 10, technicalRank: 2, technicalScore: 70, frames: [] },
    ], 10, 1);
    expect(plan.map((segment) => [segment.sourceStartSec, segment.sourceEndSec])).toEqual([[0, 2], [8, 10]]);
  });

  it('routes provider-too-short reels directly to ordered still review', () => {
    expect(editorialReviewProxyMeetsProviderMinimum([
      { id: 'short', startSec: 4, endSec: 5.9, technicalRank: 1, technicalScore: 90, frames: [] },
    ])).toBe(false);
    expect(editorialReviewProxyMeetsProviderMinimum([
      { id: 'long-enough', startSec: 4, endSec: 6.3, technicalRank: 1, technicalScore: 90, frames: [] },
    ])).toBe(true);
  });
});
