import { describe, expect, it } from 'vitest';
import type { Composition } from './composition';
import { runServerTool, type ServerToolProject } from './server-tools';
import {
  applyEditProposal,
  cancelAnalysisJob,
  completeAnalysisJob,
  compositionRevision,
  createAnalysisJob,
  discardEditProposal,
  failAnalysisJob,
  reportAnalysisProgress,
  requestAnalysisCancellation,
  retryAnalysisJob,
  startAnalysisJob,
} from './analysis-jobs';

const comp = (): Composition => ({
  width: 1920,
  height: 1080,
  theme: 'general',
  video: null,
  blocks: [],
  shots: [{ id: 's1', srcStart: 0, srcEnd: 10, treatment: 'full' }],
});

const baseJob = () =>
  createAnalysisJob({
    id: 'job1',
    projectId: 'p1',
    type: 'visual-observations',
    input: { fromSec: 0, toSec: 10 },
    idempotencyKey: 'p1:visual-observations:0-10',
    baseRevision: compositionRevision(comp(), { projectVersion: 4, sourceFingerprint: 'vid1' }),
    now: 10,
  });

describe('analysis job state machine', () => {
  it('builds a transport-stable composition revision while retaining source identity', () => {
    const a: Composition = {
      ...comp(),
      video: { url: 'blob:first-session', durationSec: 10, sourceWidth: 1920, sourceHeight: 1080 },
      shots: [{ id: 's1', src: 'blob:clip-a', srcSig: 'clip-sig', srcStart: 0, srcEnd: 10, treatment: 'full' }],
    };
    const b: Composition = {
      ...a,
      video: { ...a.video!, url: 'blob:second-session' },
      shots: [{ ...a.shots![0]!, src: 'blob:clip-b' }],
    };
    expect(compositionRevision(a, { sourceFingerprint: 'main-sig' }).compositionHash).toBe(
      compositionRevision(b, { sourceFingerprint: 'main-sig' }).compositionHash,
    );
    expect(compositionRevision(a, { sourceFingerprint: 'main-sig' }).compositionHash).not.toBe(
      compositionRevision(b, { sourceFingerprint: 'another-main' }).compositionHash,
    );
  });

  it('progress is monotonic and completion publishes a reviewable proposal', () => {
    const running = startAnalysisJob(baseJob(), 20);
    const p1 = reportAnalysisProgress(running, 0.6, 'analyzing', 30);
    const p2 = reportAnalysisProgress(p1, 0.2, 'still analyzing', 40);
    expect(p2.progress).toBe(0.6);

    const done = completeAnalysisJob(
      p2,
      {
        operations: [{ tool: 'set_canvas', input: { preset: 'portrait' } }],
        confidence: 1.5,
        warnings: ['shot s1 needs review'],
      },
      { proposalId: 'prop1', now: 50 },
    );
    expect(done).toMatchObject({ status: 'succeeded', progress: 1, finishedAt: 50 });
    expect(done.proposal).toMatchObject({ id: 'prop1', status: 'ready', confidence: 1 });
    expect(() => reportAnalysisProgress(done, 0.9)).toThrow(/requires running/);
  });

  it('running cancellation is cooperative and retry refreshes the base revision', () => {
    const requested = requestAnalysisCancellation(startAnalysisJob(baseJob(), 20), 30);
    expect(requested).toMatchObject({ status: 'running', cancelRequested: true });
    expect(() =>
      completeAnalysisJob(requested, { operations: [{ tool: 'set_canvas', input: { preset: 'portrait' } }] }),
    ).toThrow(/cancellation requested/);

    const cancelled = cancelAnalysisJob(requested, 40);
    const nextRevision = compositionRevision({ ...comp(), width: 1080 }, { projectVersion: 6, sourceFingerprint: 'vid1' });
    const retried = retryAnalysisJob(cancelled, nextRevision, { now: 50 });
    expect(retried).toMatchObject({ status: 'queued', attempt: 2, progress: 0, baseRevision: nextRevision });
    expect(retried.cancelRequested).toBeUndefined();
  });

  it('failed retry clears the previous terminal result', () => {
    const failed = failAnalysisJob(startAnalysisJob(baseJob()), { code: 'provider_down', message: 'down', retryable: true }, 30);
    const retried = retryAnalysisJob(failed, failed.baseRevision, { now: 40, input: { fromSec: 2, toSec: 8 } });
    expect(retried.input).toEqual({ fromSec: 2, toSec: 8 });
    expect(retried.error).toBeUndefined();
  });

  it('rejects proposal fan-out that bypasses vectorized atomic tools', () => {
    const running = startAnalysisJob(baseJob());
    expect(() =>
      completeAnalysisJob(running, {
        operations: [
          { tool: 'set_shot_framing', input: { shotId: 's1', scale: 2 } },
          { tool: 'set_shot_framing', input: { shotId: 's2', scale: 2 } },
        ],
      }),
    ).toThrow(/batch every shot/);
  });
});

describe('edit proposal evaluation', () => {
  const readyProposal = () =>
    completeAnalysisJob(
      startAnalysisJob(baseJob()),
      {
        operations: [
          { tool: 'set_canvas', input: { preset: 'portrait' } },
          { tool: 'set_shot_framing', input: { shotId: 's1', scale: 2, anchorX: 0.3, anchorY: 0.4 } },
        ],
      },
      { proposalId: 'prop1', now: 30 },
    ).proposal!;

  const executor = (sourceFingerprint = 'vid1') => (operation: { tool: string; input: Record<string, unknown> }, candidate: Composition) => {
    const project: ServerToolProject = {
      id: 'p1',
      title: 'P1',
      comp: candidate,
      context: {},
      videoDurationSec: 10,
    };
    const out = runServerTool(operation.tool, operation.input, project);
    return { ok: out.result.ok, comp: out.comp, error: out.result.error, data: out.result.data, sourceFingerprint };
  };

  it('applies all operations on a clone and returns one final delta', () => {
    const original = comp();
    const result = applyEditProposal(
      readyProposal(),
      original,
      compositionRevision(original, { projectVersion: 99, sourceFingerprint: 'vid1' }),
      executor(),
      50,
    );
    expect(result.ok).toBe(true);
    expect(result.proposal).toMatchObject({ status: 'applied', appliedAt: 50 });
    expect(result.candidate).toMatchObject({ width: 1080, height: 1920 });
    expect(result.candidate!.shots![0]!.preciseFraming).toEqual({ scale: 2, anchorX: 0.3, anchorY: 0.4 });
    expect(result.delta).toBeTruthy();
    expect(original).toEqual(comp());

    const replay = applyEditProposal(result.proposal, result.candidate!, compositionRevision(result.candidate!), executor());
    expect(replay).toMatchObject({ ok: true, alreadyApplied: true });
  });

  it('rejects stale composition but ignores project-version-only changes', () => {
    const original = comp();
    const versionOnly = applyEditProposal(
      readyProposal(),
      original,
      compositionRevision(original, { projectVersion: 999, sourceFingerprint: 'vid1' }),
      executor(),
    );
    expect(versionOnly.ok).toBe(true);

    const changed = { ...original, width: 1080 };
    const stale = applyEditProposal(
      readyProposal(),
      changed,
      compositionRevision(changed, { projectVersion: 5, sourceFingerprint: 'vid1' }),
      executor(),
    );
    expect(stale).toMatchObject({ ok: false, code: 'proposal_stale' });
  });

  it('rolls the entire proposal back when a later operation fails', () => {
    const proposal = {
      ...readyProposal(),
      operations: [
        { tool: 'set_canvas', input: { preset: 'portrait' } },
        { tool: 'set_shot_framing', input: { shotId: 'missing', scale: 2 } },
      ],
    };
    const original = comp();
    const result = applyEditProposal(
      proposal,
      original,
      compositionRevision(original, { sourceFingerprint: 'vid1' }),
      executor(),
    );
    expect(result).toMatchObject({ ok: false, code: 'operation_failed', operationIndex: 1 });
    expect(result.candidate).toBeUndefined();
    expect(original).toEqual(comp());
  });

  it('discard is terminal and cannot be applied', () => {
    const proposal = discardEditProposal(readyProposal(), 60);
    expect(proposal).toMatchObject({ status: 'discarded', discardedAt: 60 });
    const result = applyEditProposal(proposal, comp(), proposal.baseRevision, executor());
    expect(result).toMatchObject({ ok: false, code: 'proposal_not_ready' });
  });
});
