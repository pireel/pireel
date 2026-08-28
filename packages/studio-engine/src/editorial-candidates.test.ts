import { describe, expect, it } from 'vitest';
import {
  buildEditorialCandidateSpecs,
  mapEditorialCandidateReviewsFromRelativeClock,
  normalizeEditorialCandidateReviews,
  rankEditorialWindows,
  selectPrimarySourceCandidate,
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
  it('samples five ordered observations without using the exact range edges', () => {
    const specs = buildEditorialCandidateSpecs([window(1, 10, 12)], 6);
    expect(specs).toEqual([{
      id: 'candidate-1',
      startSec: 10,
      endSec: 12,
      technicalRank: 1,
      technicalScore: 80,
      frames: [
        { phase: 'entry', atSec: 10.12 },
        { phase: 'early', atSec: 10.5 },
        { phase: 'middle', atSec: 11 },
        { phase: 'late', atSec: 11.5 },
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

  it('uses centered composition only as a brief-specific shortlist preference', () => {
    const strongerTechnical = { ...window(1, 0, 2, 84), subjectCenteredness: 0.15 };
    const centered = { ...window(2, 3, 5, 80), subjectCenteredness: 0.95 };
    expect(rankEditorialWindows([strongerTechnical, centered]).map((candidate) => candidate.rank)).toEqual([1, 2]);
    expect(rankEditorialWindows([strongerTechnical, centered], { preferCenteredSubject: true }).map((candidate) => candidate.rank)).toEqual([2, 1]);
  });

  it('sanitizes rankings and marks omitted provider rows as unreviewed', () => {
    const specs = buildEditorialCandidateSpecs([window(1, 0, 2), window(2, 3, 5)]);
    const reviews = normalizeEditorialCandidateReviews(specs, [{
      candidateId: 'candidate-1',
      rank: 1,
      verdict: 'strong',
      contentRole: 'environment',
      score: 112,
      action: 'confident walk',
      rationale: 'Complete action with a strong gaze.',
      roleFit: [{ role: 'hook', score: 95 }, { role: 'invented', score: 100 }],
      issues: ['near-duplicate', 'near-duplicate', 'invented'],
      cutOptions: [
        { durationSec: 2, startSec: 0, endSec: 2, score: 92, reason: 'clean establishing beat' },
        { durationSec: 99, startSec: -10, endSec: 99, score: 80, reason: 'bounded to source' },
      ],
    }]);
    expect(reviews[0]).toMatchObject({
      candidateId: 'candidate-1',
      verdict: 'strong',
      score: 100,
      contentRole: 'environment',
      roleFit: [{ role: 'hook', score: 95 }],
      issues: ['near-duplicate'],
      cutOptions: [
        { durationSec: 2, startSec: 0, endSec: 2, score: 92, reason: 'clean establishing beat' },
        { durationSec: 2, startSec: 0, endSec: 2, score: 80, reason: 'bounded to source' },
      ],
    });
    expect(reviews[1]).toMatchObject({ candidateId: 'candidate-2', verdict: 'unreviewed', score: 0 });
  });

  it('preserves the explicit open-mouth rejection reason', () => {
    const specs = buildEditorialCandidateSpecs([window(1, 0, 2)]);
    const reviews = normalizeEditorialCandidateReviews(specs, [{
      candidateId: 'candidate-1',
      rank: 1,
      verdict: 'reject',
      score: 10,
      issues: ['open-mouth'],
    }]);
    expect(reviews[0]).toMatchObject({ verdict: 'reject', issues: ['open-mouth'] });
  });

  it('keeps model timing as bounded coarse source-clock suggestions', () => {
    const specs = buildEditorialCandidateSpecs([window(1, 10, 14)]);
    const reviews = normalizeEditorialCandidateReviews(specs, [{
      candidateId: 'candidate-1',
      rank: 1,
      verdict: 'strong',
      score: 90,
      suggestedStartSec: 9,
      suggestedEndSec: 13.4,
      peakSec: 99,
      openingFrameScore: 96,
      openingFrameSec: 9,
      openingFrameState: 'closed-mouth frontal portrait',
    }]);
    expect(reviews[0]).toMatchObject({
      suggestedStartSec: 10,
      suggestedEndSec: 13.4,
      peakSec: 13.4,
      openingFrameScore: 96,
      openingFrameSec: 10,
      openingFrameState: 'closed-mouth frontal portrait',
    });
  });

  it('maps every candidate-relative model timestamp back to the original source clock', () => {
    const specs = buildEditorialCandidateSpecs([window(1, 10, 16)]);
    const mapped = mapEditorialCandidateReviewsFromRelativeClock(specs, [{
      candidateId: 'candidate-1',
      suggestedStartSec: 1,
      suggestedEndSec: 5.5,
      peakSec: 3.2,
      openingFrameSec: 1.4,
      actionPhases: [{ phase: 'performance', startSec: 1, endSec: 4, note: 'clean action' }],
      rejectedRanges: [{ startSec: 0, endSec: 0.8, reason: 'setup' }],
      cutOptions: [{ startSec: 1.2, endSec: 3.7, score: 92, reason: 'complete turn' }],
    }]);
    expect(mapped[0]).toMatchObject({
      suggestedStartSec: 11,
      suggestedEndSec: 15.5,
      peakSec: 13.2,
      openingFrameSec: 11.4,
      actionPhases: [{ startSec: 11, endSec: 14 }],
      rejectedRanges: [{ startSec: 10, endSec: 10.8 }],
      cutOptions: [{ startSec: 11.2, endSec: 13.7 }],
    });
  });

  it('keeps reusable aesthetic, action-phase and cut evidence from the same review', () => {
    const specs = buildEditorialCandidateSpecs([window(1, 10, 14)]);
    const reviews = normalizeEditorialCandidateReviews(specs, [{
      candidateId: 'candidate-1',
      rank: 1,
      verdict: 'strong',
      score: 91,
      scoreBreakdown: {
        subjectClarity: 94,
        aestheticFit: 90,
        composition: 88,
        temporalCompleteness: 93,
        editability: 95,
      },
      actionPhases: [
        { phase: 'setup', startSec: 9, endSec: 10.5, note: 'settles into position' },
        { phase: 'performance', startSec: 10.5, endSec: 13.2, note: 'holds the intended pose' },
        { phase: 'invented', startSec: 13.2, endSec: 13.5, note: 'ignored' },
      ],
      rejectedRanges: [{ startSec: 9.5, endSec: 10.4, reason: 'preparatory clothing adjustment' }],
      entryState: 'upright and nearly still',
      exitState: 'turns her shoulders to leave',
      cameraMotion: 'static',
      subjectPlacement: 'stable center',
      bestUse: 'confident visual hook',
    }]);
    expect(reviews[0]).toMatchObject({
      scoreBreakdown: { subjectClarity: 94, aestheticFit: 90, editability: 95 },
      actionPhases: [
        { phase: 'setup', startSec: 10, endSec: 10.5 },
        { phase: 'performance', startSec: 10.5, endSec: 13.2 },
      ],
      rejectedRanges: [{ startSec: 10, endSec: 10.4, reason: 'preparatory clothing adjustment' }],
      entryState: 'upright and nearly still',
      exitState: 'turns her shoulders to leave',
      cameraMotion: 'static',
      subjectPlacement: 'stable center',
      bestUse: 'confident visual hook',
    });
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

  it('keeps one accepted range per raw source while retaining rejected audit evidence', () => {
    const specs = buildEditorialCandidateSpecs([
      window(1, 0, 2),
      window(2, 3, 5),
      window(3, 6, 8),
    ]);
    const reviews = normalizeEditorialCandidateReviews(specs, [
      { candidateId: 'candidate-1', rank: 2, verdict: 'usable', score: 78 },
      { candidateId: 'candidate-2', rank: 1, verdict: 'strong', score: 92 },
      { candidateId: 'candidate-3', rank: 3, verdict: 'reject', score: 20, issues: ['setup-artifact'] },
    ]);
    expect(selectPrimarySourceCandidate(reviews).map((candidate) => ({
      candidateId: candidate.candidateId,
      rank: candidate.rank,
      verdict: candidate.verdict,
    }))).toEqual([
      { candidateId: 'candidate-2', rank: 1, verdict: 'strong' },
      { candidateId: 'candidate-3', rank: 2, verdict: 'reject' },
    ]);
    expect(selectPrimarySourceCandidate(reviews, { allowMultiple: true })).toHaveLength(3);
  });
});
