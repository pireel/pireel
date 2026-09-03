import { describe, expect, it } from 'vitest';
import type { EditorialCandidateReview } from '@pireel/studio-engine/editorial-candidates';
import { buildAssemblyFromReview, healReviewedSourceId, reviewedPlacementIssue } from './editorial-assembly-tool';

const candidate = (overrides: Partial<EditorialCandidateReview>): EditorialCandidateReview => ({
  candidateId: 'candidate-1', verdict: 'strong', startSec: 0.3, endSec: 2.1,
  rank: 1, score: 90, contentRole: 'person-primary', action: 'turn', rationale: 'complete',
  openingFrameScore: 90, openingFrameState: 'stable', roleFit: [], issues: [],
  scoreBreakdown: { subjectClarity: 90, aestheticFit: 90, composition: 90, temporalCompleteness: 90, editability: 90 },
  actionPhases: [], rejectedRanges: [], entryState: '', exitState: '', cameraMotion: '', subjectPlacement: '', bestUse: '', cutOptions: [],
  ...overrides,
} as EditorialCandidateReview);

const beach = {
  assetId: 'asset-beach',
  candidates: [
    candidate({ candidateId: 'beach-1', startSec: 0.3, endSec: 2.1 }),
    candidate({ candidateId: 'beach-2', verdict: 'reject', startSec: 4, endSec: 6, score: 20 }),
  ],
};
const street = {
  assetId: 'local_0123456789ab-street',
  candidates: [candidate({ candidateId: 'street-1', startSec: 1, endSec: 4, score: 70 })],
};

describe('reviewedPlacementIssue', () => {
  it('accepts an interval inside an accepted candidate and refuses everything else for a reviewed source', () => {
    expect(reviewedPlacementIssue([beach], [{ assetId: 'asset-beach', sourceInSec: 0.4, sourceOutSec: 2 }])).toBeNull();
    expect(reviewedPlacementIssue([beach], [{ assetId: 'asset-beach' }])).toMatchObject({ reason: 'range-required' });
    expect(reviewedPlacementIssue([beach], [{ assetId: 'asset-beach', sourceInSec: 4, sourceOutSec: 6 }])).toMatchObject({ reason: 'outside-accepted-range' });
    expect(reviewedPlacementIssue([{ assetId: 'x', candidates: [candidate({ verdict: 'reject' })] }], [{ assetId: 'x', sourceInSec: 0, sourceOutSec: 1 }])).toMatchObject({ reason: 'review-rejected' });
    // Unreviewed sources are not the guard's business.
    expect(reviewedPlacementIssue([beach], [{ assetId: 'other' }])).toBeNull();
  });
});

describe('buildAssemblyFromReview', () => {
  it('places the authored picks in order, fills from the pool, and reports coverage', () => {
    const built = buildAssemblyFromReview({
      sources: [beach, street],
      opening: [],
      rows: [{ assetId: 'asset-beach', sourceInSec: 0.3, sourceOutSec: 2.1 }],
      targetDurationSec: 4.5,
    });
    expect('error' in built).toBe(false);
    if ('error' in built) return;
    expect(built.input.__replacePrimaryTrack).toBe(true);
    const clips = built.input.clips as Array<Record<string, unknown>>;
    expect(clips[0]).toMatchObject({ assetId: 'asset-beach', startSec: 0, muted: true, role: 'primary' });
    expect(built.placed[0]).toMatchObject({ origin: 'batch', assetId: 'asset-beach' });
    expect(built.placed.some((shot) => shot.origin === 'pool' && shot.assetId === street.assetId)).toBe(true);
    expect(built.coverage.targetDurationSec).toBe(4.5);
    expect(built.coverage.actualDurationSec).toBeGreaterThan(1.8);
    // Filler clips carry their OWN asset id, never the first authored row's.
    for (const clip of clips) expect([beach.assetId, street.assetId]).toContain(clip.assetId);
  });

  it('heals a garbled reviewed id, refuses unreviewed sources, and seeds from the opening when nothing is authored', () => {
    expect(healReviewedSourceId('local_0123456789ab-strXXt', new Set([street.assetId]))).toBe(street.assetId);
    expect(buildAssemblyFromReview({ sources: [beach], opening: [], rows: [{ assetId: 'nope', sourceInSec: 0, sourceOutSec: 1 }], targetDurationSec: 2 }))
      .toMatchObject({ error: 'unreviewed_source', assetId: 'nope' });
    expect(buildAssemblyFromReview({ sources: [beach], opening: [], rows: [{ assetId: 'asset-beach' }], targetDurationSec: 2 }))
      .toMatchObject({ error: 'range_required' });
    expect(buildAssemblyFromReview({ sources: [], opening: [], rows: [], targetDurationSec: 2 })).toMatchObject({ error: 'no_reviewed_sources' });
    expect(buildAssemblyFromReview({ sources: [beach], opening: [], rows: [], targetDurationSec: 0 })).toMatchObject({ error: 'no_target' });
    const seeded = buildAssemblyFromReview({ sources: [beach, street], opening: [{ assetId: street.assetId, candidateId: 'street-1' }], rows: [], targetDurationSec: 3 });
    expect('error' in seeded).toBe(false);
    if ('error' in seeded) return;
    expect((seeded.input.clips as Array<Record<string, unknown>>)[0]).toMatchObject({ assetId: street.assetId, sourceInSec: 1 });
  });

  it('reports a shortfall when the reviewed pool cannot cover the target', () => {
    const built = buildAssemblyFromReview({ sources: [beach], opening: [], rows: [{ assetId: 'asset-beach', sourceInSec: 0.3, sourceOutSec: 2.1 }], targetDurationSec: 30 });
    expect('error' in built).toBe(false);
    if ('error' in built) return;
    expect(built.coverage.covered).toBe(false);
    expect(built.coverage.shortfallSec).toBeGreaterThan(20);
  });
});
