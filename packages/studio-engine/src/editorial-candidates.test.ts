import { describe, expect, it } from 'vitest';
import {
  buildEditorialCandidateSpecs,
  evaluateEditorialAssembly,
  mapEditorialCandidateReviewsFromRelativeClock,
  normalizeEditorialCandidateReviews,
  planEditorialAssembly,
  rankEditorialWindows,
  reconcileEditorialCandidateTemporalEvidence,
  selectPrimarySourceCandidate,
} from './editorial-candidates';
import type { EditorialCandidateReview } from './editorial-candidates';
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
      reserve: candidate.reserve ?? false,
    }))).toEqual([
      { candidateId: 'candidate-2', rank: 1, verdict: 'strong', reserve: false },
      { candidateId: 'candidate-1', rank: 2, verdict: 'usable', reserve: true },
      { candidateId: 'candidate-3', rank: 3, verdict: 'reject', reserve: false },
    ]);
    expect(selectPrimarySourceCandidate(reviews, { allowMultiple: true })).toHaveLength(3);
    expect(selectPrimarySourceCandidate(reviews, { allowMultiple: true }).every((candidate) => !candidate.reserve)).toBe(true);
  });

  it('keeps no reserve when the secondary accepted range overlaps the primary or is a near-duplicate', () => {
    const specs = buildEditorialCandidateSpecs([window(1, 0, 4), window(2, 2, 6)]);
    const overlapping = normalizeEditorialCandidateReviews(specs, [
      { candidateId: 'candidate-1', rank: 1, verdict: 'strong', score: 92 },
      { candidateId: 'candidate-2', rank: 2, verdict: 'usable', score: 80 },
    ]);
    expect(selectPrimarySourceCandidate(overlapping).map((candidate) => candidate.candidateId)).toEqual(['candidate-1']);

    const dupSpecs = buildEditorialCandidateSpecs([window(1, 0, 2), window(2, 5, 8)]);
    const nearDuplicate = normalizeEditorialCandidateReviews(dupSpecs, [
      { candidateId: 'candidate-1', rank: 1, verdict: 'strong', score: 92 },
      { candidateId: 'candidate-2', rank: 2, verdict: 'usable', score: 80, issues: ['near-duplicate'] },
    ]);
    expect(selectPrimarySourceCandidate(nearDuplicate).map((candidate) => candidate.candidateId)).toEqual(['candidate-1']);
  });
});

const reviewedCandidate = (patch: Partial<EditorialCandidateReview> = {}): EditorialCandidateReview => ({
  candidateId: 'candidate-1', startSec: 0, endSec: 20, rank: 1, verdict: 'strong', score: 95,
  contentRole: 'person-primary', action: 'turns and walks toward camera', rationale: 'polished action',
  openingFrameScore: 80, openingFrameState: 'back to camera', roleFit: [], issues: [],
  scoreBreakdown: { subjectClarity: 90, aestheticFit: 95, composition: 92, temporalCompleteness: 90, editability: 94 },
  actionPhases: [
    { phase: 'setup', startSec: 0, endSec: 7, note: 'Stillness from behind with no movement.' },
    { phase: 'transition', startSec: 7, endSec: 12, note: 'Turns and starts walking.' },
    { phase: 'performance', startSec: 12, endSec: 19, note: 'Walks toward camera with direct eye contact.' },
  ],
  rejectedRanges: [], entryState: 'still', exitState: 'complete', cameraMotion: 'static',
  subjectPlacement: 'centered', bestUse: 'confident walk',
  cutOptions: [{ durationSec: 8, startSec: 0, endSec: 8, score: 90, reason: 'establishing mood' }],
  ...patch,
});

describe('editorial temporal reconciliation and assembly', () => {
  it('demotes static setup and derives better variable cuts from reviewed action phases', () => {
    const reconciled = reconcileEditorialCandidateTemporalEvidence(reviewedCandidate());
    expect(reconciled.cutOptions[0]!.startSec).toBeGreaterThanOrEqual(12);
    expect(reconciled.cutOptions[0]!.endSec).toBeLessThanOrEqual(19);
    const staticSetup = reconciled.cutOptions.find((option) => option.startSec === 0 && option.endSec === 8);
    expect(staticSetup == null || staticSetup.score <= 45).toBe(true);
    expect(reconciled.cutOptions.some((option) => option.startSec >= 7 && option.endSec <= 19)).toBe(true);
  });

  it('clips stale provider timing to the locally accepted source interval', () => {
    const reconciled = reconcileEditorialCandidateTemporalEvidence(reviewedCandidate({
      startSec: 12.2,
      endSec: 16.1,
      suggestedStartSec: 0,
      suggestedEndSec: 19,
      peakSec: 18,
    }));
    expect(reconciled.actionPhases).toEqual([
      expect.objectContaining({ phase: 'performance', startSec: 12.2, endSec: 16.1 }),
    ]);
    expect(reconciled.suggestedStartSec).toBe(12.2);
    expect(reconciled.suggestedEndSec).toBe(16.1);
    expect(reconciled.peakSec).toBe(16.1);
    expect(reconciled.cutOptions.length).toBeGreaterThan(0);
    expect(reconciled.cutOptions.every((option) => option.startSec >= 12.2 && option.endSec <= 16.1)).toBe(true);
  });

  it('detects the real class of narrated montage failures without fixed shot lengths', () => {
    const source = { assetId: '998', candidates: [reviewedCandidate()] };
    const clips = [
      { assetId: '998', startSec: 4.1, sourceInSec: 0, sourceOutSec: 8 },
      { assetId: 'bbf', startSec: 46.8, sourceInSec: 3.407, sourceOutSec: 7.5 },
      { assetId: 'bbf', startSec: 50.9, sourceInSec: 3.407, sourceOutSec: 7.5 },
      { assetId: 'tail', startSec: 55.3, sourceInSec: 0, sourceOutSec: 4 },
      ...Array.from({ length: 9 }, (_, index) => ({
        assetId: `short-${index}`,
        startSec: 12 + index * 3,
        sourceInSec: 0,
        sourceOutSec: 2.5,
      })),
    ];
    const violations = evaluateEditorialAssembly({ clips, sources: [source], targetDurationSec: 54.288 });
    expect(violations.map((violation) => violation.kind)).toEqual(expect.arrayContaining([
      'duration-overrun', 'duplicate-range', 'static-overlong',
    ]));
  });

  it('uses reviewed natural phases to fit narration and replaces the static 0-8s recommendation', () => {
    const planned = planEditorialAssembly({
      clips: [
        { assetId: '998', startSec: 0, sourceInSec: 0, sourceOutSec: 8 },
        { assetId: 'other', startSec: 8, sourceInSec: 2, sourceOutSec: 9 },
      ],
      sources: [
        { assetId: '998', candidates: [reviewedCandidate()] },
        { assetId: 'other', candidates: [reviewedCandidate({
          candidateId: 'candidate-other', startSec: 2, endSec: 9,
          actionPhases: [{ phase: 'performance', startSec: 2, endSec: 9, note: 'continuous finished action' }],
          cutOptions: [{ durationSec: 7, startSec: 2, endSec: 9, score: 92, reason: 'complete action' }],
        })] },
      ],
      targetDurationSec: 12,
    });
    expect(planned.actualDurationSec).toBeLessThanOrEqual(12);
    expect(planned.clips[0]).toMatchObject({ assetId: '998' });
    expect(planned.clips[0]!.sourceInSec).toBeGreaterThanOrEqual(7);
    expect(evaluateEditorialAssembly({
      clips: planned.clips,
      sources: [{ assetId: '998', candidates: [reviewedCandidate()] }],
      targetDurationSec: 12,
    }).some((violation) => violation.kind === 'static-overlong')).toBe(false);
  });

  it('reaches the stated reservoir capacity when curated short cuts alone cannot cover narration', () => {
    // Incident shape: the request sums ~9s but one reservoir spans 19.5s. Curated cutOptions are
    // all short; the suggested longest-usable range must remain a reachable knapsack choice so an
    // under-requested batch can still cover the narration instead of capping at the request sum.
    const planned = planEditorialAssembly({
      clips: [
        { assetId: 'long', startSec: 0, sourceInSec: 8, sourceOutSec: 13 },
        { assetId: 'short', startSec: 5, sourceInSec: 2, sourceOutSec: 6 },
      ],
      sources: [
        { assetId: 'long', candidates: [reviewedCandidate({
          candidateId: 'candidate-long', startSec: 0, endSec: 19.5,
          suggestedStartSec: 0, suggestedEndSec: 19.5,
          actionPhases: [{ phase: 'performance', startSec: 0, endSec: 19.5, note: 'continuous walk with turns' }],
          cutOptions: [
            { durationSec: 1.8, startSec: 8, endSec: 9.8, score: 99, reason: 'tight peak' },
            { durationSec: 2.8, startSec: 7.5, endSec: 10.3, score: 97, reason: 'balanced peak' },
            { durationSec: 4, startSec: 7, endSec: 11, score: 95, reason: 'wide peak' },
            { durationSec: 5, startSec: 8, endSec: 13, score: 91, reason: 'requested take' },
          ],
        })] },
        { assetId: 'short', candidates: [reviewedCandidate({
          candidateId: 'candidate-short', startSec: 2, endSec: 6,
          suggestedStartSec: 2, suggestedEndSec: 6,
          actionPhases: [{ phase: 'performance', startSec: 2, endSec: 6, note: 'complete gesture' }],
          cutOptions: [{ durationSec: 4, startSec: 2, endSec: 6, score: 92, reason: 'complete action' }],
        })] },
      ],
      targetDurationSec: 22,
    });
    expect(planned.actualDurationSec).toBeGreaterThan(18);
    expect(planned.actualDurationSec).toBeLessThanOrEqual(22);
  });

  it('drops only the range that misses accepted evidence instead of dooming the whole batch', () => {
    const planned = planEditorialAssembly({
      clips: [
        { assetId: 'a', startSec: 0, sourceInSec: 20, sourceOutSec: 24 },
        { assetId: 'other', startSec: 4, sourceInSec: 2, sourceOutSec: 9 },
      ],
      sources: [
        { assetId: 'a', candidates: [reviewedCandidate({ candidateId: 'candidate-a', startSec: 0, endSec: 10 })] },
        { assetId: 'other', candidates: [reviewedCandidate({
          candidateId: 'candidate-other', startSec: 2, endSec: 9,
          actionPhases: [{ phase: 'performance', startSec: 2, endSec: 9, note: 'continuous finished action' }],
          cutOptions: [{ durationSec: 7, startSec: 2, endSec: 9, score: 92, reason: 'complete action' }],
        })] },
      ],
      targetDurationSec: 7,
    });
    // The mis-ranged request is dropped, but its reservoir's ACCEPTED evidence stays available
    // to pool completion — any 'a' placement must sit inside the accepted 0–10s span, never the
    // rejected 20–24s request.
    expect(planned.clips.length).toBeGreaterThan(0);
    expect(planned.clips
      .filter((clip) => clip.assetId === 'a')
      .every((clip) => clip.sourceInSec >= 0 && clip.sourceOutSec <= 10)).toBe(true);
    const total = planned.clips.reduce((sum, clip) => sum + (clip.sourceOutSec - clip.sourceInSec), 0);
    expect(total).toBeGreaterThanOrEqual(6.5);
    expect(total).toBeLessThanOrEqual(7.5);
  });

  it('returns the request untouched when no range matches accepted evidence, letting the guard teach', () => {
    const planned = planEditorialAssembly({
      clips: [{ assetId: 'a', startSec: 0, sourceInSec: 20, sourceOutSec: 24 }],
      sources: [{ assetId: 'a', candidates: [reviewedCandidate({ candidateId: 'candidate-a', startSec: 0, endSec: 10 })] }],
      targetDurationSec: 7,
    });
    expect(planned.changed).toBe(false);
    expect(planned.clips).toEqual([{ assetId: 'a', startSec: 0, sourceInSec: 20, sourceOutSec: 24 }]);
  });

  it('never assembles a sub-second flash shot even when the reviewed reservoir is that short', () => {
    const planned = planEditorialAssembly({
      clips: [
        { assetId: 'flash', startSec: 0, sourceInSec: 0, sourceOutSec: 0.5 },
        { assetId: 'other', startSec: 0.5, sourceInSec: 2, sourceOutSec: 9 },
      ],
      sources: [
        { assetId: 'flash', candidates: [reviewedCandidate({
          candidateId: 'candidate-flash', startSec: 0, endSec: 0.5, score: 45,
          actionPhases: [{ phase: 'performance', startSec: 0, endSec: 0.5, note: 'brief glance' }],
          cutOptions: [{ durationSec: 0.5, startSec: 0, endSec: 0.5, score: 45, reason: 'entire interval' }],
        })] },
        { assetId: 'other', candidates: [reviewedCandidate({
          candidateId: 'candidate-other', startSec: 2, endSec: 9,
          actionPhases: [{ phase: 'performance', startSec: 2, endSec: 9, note: 'continuous finished action' }],
          cutOptions: [{ durationSec: 7, startSec: 2, endSec: 9, score: 92, reason: 'complete action' }],
        })] },
      ],
      targetDurationSec: 7,
    });
    expect(planned.clips.every((clip) => clip.sourceOutSec - clip.sourceInSec >= 1)).toBe(true);
    expect(planned.clips.some((clip) => clip.assetId === 'flash')).toBe(false);
  });

  it('completes coverage from unused pool reservoirs when the batch under-samples', () => {
    const planned = planEditorialAssembly({
      clips: [{ assetId: 'picked', startSec: 0, sourceInSec: 0, sourceOutSec: 6 }],
      sources: [
        { assetId: 'picked', candidates: [reviewedCandidate({
          candidateId: 'candidate-picked', startSec: 0, endSec: 6, score: 90,
          actionPhases: [{ phase: 'performance', startSec: 0, endSec: 6, note: 'complete action' }],
          cutOptions: [{ durationSec: 6, startSec: 0, endSec: 6, score: 90, reason: 'complete action' }],
        })] },
        { assetId: 'unpicked', candidates: [reviewedCandidate({
          candidateId: 'candidate-unpicked', startSec: 1, endSec: 8, score: 84,
          actionPhases: [{ phase: 'performance', startSec: 1, endSec: 8, note: 'complete action' }],
          cutOptions: [{ durationSec: 7, startSec: 1, endSec: 8, score: 84, reason: 'complete action' }],
        })] },
      ],
      targetDurationSec: 12,
    });
    const total = planned.clips.reduce((sum, clip) => sum + (clip.sourceOutSec - clip.sourceInSec), 0);
    // The batch alone tops out at 6s; the pool reservoir closes the remaining coverage.
    expect(total).toBeGreaterThanOrEqual(11);
    expect(planned.clips.some((clip) => clip.assetId === 'unpicked')).toBe(true);
    // The batch row still leads the sequence (opening protection).
    expect(planned.clips[0]?.assetId).toBe('picked');
  });

  it('prefers spreading coverage across reservoirs over one monolithic hold when capacity allows', () => {
    const planned = planEditorialAssembly({
      clips: [
        { assetId: 'hold', startSec: 0, sourceInSec: 0, sourceOutSec: 20 },
        { assetId: 'alt-a', startSec: 20, sourceInSec: 0, sourceOutSec: 7 },
        { assetId: 'alt-b', startSec: 27, sourceInSec: 0, sourceOutSec: 7 },
      ],
      sources: [
        { assetId: 'hold', candidates: [reviewedCandidate({
          candidateId: 'candidate-hold', startSec: 0, endSec: 20, score: 88,
          actionPhases: [{ phase: 'performance', startSec: 0, endSec: 20, note: 'long steady hold' }],
          cutOptions: [
            { durationSec: 20, startSec: 0, endSec: 20, score: 88, reason: 'entire hold' },
            { durationSec: 6, startSec: 0, endSec: 6, score: 84, reason: 'strong entry' },
          ],
        })] },
        { assetId: 'alt-a', candidates: [reviewedCandidate({
          candidateId: 'candidate-a', startSec: 0, endSec: 7, score: 86,
          actionPhases: [{ phase: 'performance', startSec: 0, endSec: 7, note: 'complete action' }],
          cutOptions: [{ durationSec: 7, startSec: 0, endSec: 7, score: 86, reason: 'complete action' }],
        })] },
        { assetId: 'alt-b', candidates: [reviewedCandidate({
          candidateId: 'candidate-b', startSec: 0, endSec: 7, score: 85,
          actionPhases: [{ phase: 'performance', startSec: 0, endSec: 7, note: 'complete action' }],
          cutOptions: [{ durationSec: 7, startSec: 0, endSec: 7, score: 85, reason: 'complete action' }],
        })] },
      ],
      targetDurationSec: 20,
    });
    const total = planned.clips.reduce((sum, clip) => sum + (clip.sourceOutSec - clip.sourceInSec), 0);
    expect(total).toBeGreaterThanOrEqual(19);
    // Coverage is reachable without the 20s monolith; rhythm shaping keeps it out of the plan.
    expect(planned.clips.every((clip) => clip.sourceOutSec - clip.sourceInSec <= 8)).toBe(true);
  });

  it('uses a readable portion of the final reviewed interval to close a discrete duration gap', () => {
    const planned = planEditorialAssembly({
      clips: [
        { assetId: 'first', startSec: 0, sourceInSec: 0, sourceOutSec: 3 },
        { assetId: 'second', startSec: 3, sourceInSec: 10, sourceOutSec: 14 },
      ],
      sources: [
        { assetId: 'first', candidates: [reviewedCandidate({
          candidateId: 'first-candidate', startSec: 0, endSec: 3,
          actionPhases: [{ phase: 'performance', startSec: 0, endSec: 3, note: 'complete first action' }],
          cutOptions: [{ durationSec: 3, startSec: 0, endSec: 3, score: 94, reason: 'complete first action' }],
        })] },
        { assetId: 'second', candidates: [reviewedCandidate({
          candidateId: 'second-candidate', startSec: 10, endSec: 14,
          actionPhases: [{ phase: 'performance', startSec: 10, endSec: 14, note: 'continuous second action' }],
          cutOptions: [{ durationSec: 4, startSec: 10, endSec: 14, score: 92, reason: 'complete second action' }],
        })] },
      ],
      targetDurationSec: 5.5,
    });
    expect(planned.actualDurationSec).toBe(5.5);
    expect(planned.clips).toHaveLength(2);
    expect(planned.clips[1]!.sourceOutSec - planned.clips[1]!.sourceInSec).toBe(2.5);
    expect(planned.clips[1]!.startSec).toBe(3);
  });

  it('does not create an unreadable tail shot when the remaining gap is too small', () => {
    const planned = planEditorialAssembly({
      clips: [
        { assetId: 'first', startSec: 0, sourceInSec: 0, sourceOutSec: 3 },
        { assetId: 'second', startSec: 3, sourceInSec: 10, sourceOutSec: 14 },
      ],
      sources: [],
      targetDurationSec: 3.4,
    });
    expect(planned.actualDurationSec).toBe(3);
    expect(planned.clips).toHaveLength(1);
  });
});
