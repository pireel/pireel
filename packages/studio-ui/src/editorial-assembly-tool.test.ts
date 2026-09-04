import { describe, expect, it } from 'vitest';
import type { EditorialCandidateReview } from '@pireel/studio-engine/editorial-candidates';
import { buildAssemblyFromReview, healReviewedSourceId, tileToFrames } from './editorial-assembly-tool';

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

describe('buildAssemblyFromReview', () => {
  it('places the authored picks in order, never chooses shots itself, and lists what is left to pick', () => {
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
    expect(built.placed.every((shot) => shot.origin === 'batch')).toBe(true);
    expect(built.coverage.covered).toBe(false);
    expect(built.remaining.map((row) => row.assetId)).toContain(street.assetId);
    expect(built.remaining.find((row) => row.assetId === street.assetId)).toMatchObject({ startSec: 1, endSec: 4, score: 70 });
    // The beach candidate is fully used by the authored pick and does not reappear.
    expect(built.remaining.some((row) => row.assetId === beach.assetId)).toBe(false);
    expect(built.coverage.targetDurationSec).toBe(4.5);
    expect(built.coverage.actualDurationSec).toBeCloseTo(1.8, 1);
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

describe('tileToFrames', () => {
  it('lays clips end to end in whole frames and closes a rounding-sized gap on the target frame', () => {
    const clips = [
      { assetId: 'a', startSec: 0, sourceInSec: 1, sourceOutSec: 2.9 },     // 57 frames
      { assetId: 'b', startSec: 1.9, sourceInSec: 5, sourceOutSec: 5.88 },  // 26.4 → 26 frames
      { assetId: 'c', startSec: 2.78, sourceInSec: 9, sourceOutSec: 9.95 }, // 28.5 → 29 frames (rounded)
    ];
    const tiled = tileToFrames(clips, 3.8, 30); // target 114 frames; raw sum 112
    const frames = tiled.map((clip) => Math.round((clip.sourceOutSec - clip.sourceInSec) * 30));
    expect(frames.reduce((sum, value) => sum + value, 0)).toBe(114);
    expect(tiled.map((clip) => Math.round(clip.startSec * 30))).toEqual([0, frames[0], frames[0]! + frames[1]!]);
    // The extra frames went to the longest clips first.
    expect(frames[0]).toBe(58);
    // A real shortfall is not papered over.
    const short = tileToFrames(clips, 30, 30);
    expect(short.reduce((sum, clip) => sum + Math.round((clip.sourceOutSec - clip.sourceInSec) * 30), 0)).toBeLessThan(200);
    // Without fps the plan is untouched.
    expect(tileToFrames(clips, 3.8)).toEqual(clips);
  });
});
