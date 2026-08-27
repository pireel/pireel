import { describe, expect, it } from 'vitest';
import {
  buildEditorialCandidateSpecs,
  normalizeEditorialCandidateReviews,
} from './editorial-candidates';
import type { VisualQualityWindow } from './visual-quality';

const window = (rank: number, startSec: number, endSec: number, score = 80): VisualQualityWindow => ({
  rank,
  startSec,
  endSec,
  score,
  sharpness: 0.8,
  exposure: 0.8,
  stability: 0.8,
  sampleCount: 4,
  worstFrameScore: score,
  edgeScore: score,
  hardFailureFraction: 0,
});

describe('editorial candidate review contract', () => {
  it('samples entry, middle and exit without using the exact range edges', () => {
    const specs = buildEditorialCandidateSpecs([window(1, 10, 12)], 6);
    expect(specs).toEqual([{
      id: 'candidate-1',
      startSec: 10,
      endSec: 12,
      technicalRank: 1,
      technicalScore: 80,
      frames: [
        { phase: 'entry', atSec: 10.12 },
        { phase: 'middle', atSec: 11 },
        { phase: 'exit', atSec: 11.88 },
      ],
    }]);
  });

  it('caps one comparative review at six candidates and preserves technical ordering', () => {
    const specs = buildEditorialCandidateSpecs(
      Array.from({ length: 9 }, (_, index) => window(index + 1, index * 2, index * 2 + 1.5)),
      99,
    );
    expect(specs).toHaveLength(6);
    expect(specs.map((candidate) => candidate.technicalRank)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('sanitizes rankings and marks omitted provider rows as unreviewed', () => {
    const specs = buildEditorialCandidateSpecs([window(1, 0, 2), window(2, 3, 5)]);
    const reviews = normalizeEditorialCandidateReviews(specs, [{
      candidateId: 'candidate-1',
      rank: 1,
      verdict: 'strong',
      score: 112,
      action: 'confident walk',
      rationale: 'Complete action with a strong gaze.',
      roleFit: [{ role: 'hook', score: 95 }, { role: 'invented', score: 100 }],
      issues: ['near-duplicate', 'near-duplicate', 'invented'],
    }]);
    expect(reviews[0]).toMatchObject({
      candidateId: 'candidate-1',
      verdict: 'strong',
      score: 100,
      roleFit: [{ role: 'hook', score: 95 }],
      issues: ['near-duplicate'],
    });
    expect(reviews[1]).toMatchObject({ candidateId: 'candidate-2', verdict: 'unreviewed', score: 0 });
  });

  it('turns duplicate provider ranks into a deterministic total order', () => {
    const specs = buildEditorialCandidateSpecs([window(1, 0, 2), window(2, 3, 5)]);
    const reviews = normalizeEditorialCandidateReviews(specs, [
      { candidateId: 'candidate-1', rank: 1, verdict: 'usable', score: 70 },
      { candidateId: 'candidate-2', rank: 1, verdict: 'strong', score: 90 },
    ]);
    expect(reviews.map((candidate) => [candidate.candidateId, candidate.rank])).toEqual([
      ['candidate-2', 1],
      ['candidate-1', 2],
    ]);
  });
});
