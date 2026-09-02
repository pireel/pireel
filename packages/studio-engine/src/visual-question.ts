import { buildEditorialCandidateSpecs, type EditorialCandidateSpec } from './editorial-candidates';
import type { VisualQualityWindow } from './visual-quality';

/**
 * Targeted visual question over already-known source ranges.
 *
 * The review contract records the evidence an editor usually needs (facing, action, phases, the
 * shot log). Instructions still arrive that name something it does not record ("only where she
 * is smiling", "the shots with the red bag"). Rather than widening the contract field by field,
 * a question is asked ONCE over the ranges in play and answered per range with pixel-grounded
 * sub-ranges — cheap (a few still frames per range), cacheable by question, and general.
 */

export const VISUAL_QUESTION_ANSWERS = ['yes', 'no', 'partial', 'unknown'] as const;
export type VisualQuestionVerdict = (typeof VISUAL_QUESTION_ANSWERS)[number];

export interface VisualQuestionRange {
  startSec: number;
  endSec: number;
}

export interface VisualQuestionAnswer {
  candidateId: string;
  startSec: number;
  endSec: number;
  answer: VisualQuestionVerdict;
  /** 0–100, the model's own certainty about this range. */
  confidence: number;
  note: string;
  /** Source-clock sub-ranges where the answer holds (present when answer is yes/partial). */
  ranges: Array<VisualQuestionRange & { note: string }>;
}

export type RawVisualQuestionAnswer = {
  candidateId?: unknown;
  answer?: unknown;
  confidence?: unknown;
  note?: unknown;
  ranges?: Array<{ startSec?: unknown; endSec?: unknown; note?: unknown }>;
};

export const MAX_VISUAL_QUESTION_RANGES = 8;
export const MAX_VISUAL_QUESTION_CHARS = 300;

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Candidate specs (five observation frames each) for explicit source ranges. */
export function visualQuestionSpecs(ranges: readonly VisualQuestionRange[]): EditorialCandidateSpec[] {
  const windows: VisualQualityWindow[] = ranges
    .filter((range) => Number.isFinite(range.startSec) && Number.isFinite(range.endSec) && range.endSec > range.startSec)
    .slice(0, MAX_VISUAL_QUESTION_RANGES)
    .map((range, index) => ({
      rank: index + 1,
      startSec: round3(range.startSec),
      endSec: round3(range.endSec),
      score: 100,
      sharpness: 1,
      exposure: 1,
      stability: 1,
      sampleCount: 5,
      worstFrameScore: 100,
      edgeScore: 100,
      hardFailureFraction: 0,
    }));
  return buildEditorialCandidateSpecs(windows, MAX_VISUAL_QUESTION_RANGES);
}

/** Bound and enum-normalize provider answers; timestamps arrive on the candidate-relative clock
 * the evidence was labeled with and are mapped back to the source clock here. */
export function normalizeVisualQuestionAnswers(
  specs: readonly EditorialCandidateSpec[],
  raw: readonly RawVisualQuestionAnswer[],
): VisualQuestionAnswer[] {
  const rawById = new Map(raw.map((row) => [String(row?.candidateId ?? ''), row]));
  return specs.map((spec) => {
    const row = rawById.get(spec.id);
    const answer = (VISUAL_QUESTION_ANSWERS as readonly string[]).includes(String(row?.answer))
      ? String(row!.answer) as VisualQuestionVerdict
      : 'unknown';
    const ranges = (Array.isArray(row?.ranges) ? row.ranges : [])
      .flatMap((range): Array<VisualQuestionRange & { note: string }> => {
        const start = Number(range?.startSec);
        const end = Number(range?.endSec);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
        const boundedStart = round3(Math.max(spec.startSec, Math.min(spec.endSec, spec.startSec + start)));
        const boundedEnd = round3(Math.max(spec.startSec, Math.min(spec.endSec, spec.startSec + end)));
        if (boundedEnd - boundedStart < 0.2) return [];
        return [{ startSec: boundedStart, endSec: boundedEnd, note: typeof range?.note === 'string' ? range.note.slice(0, 120) : '' }];
      })
      .sort((left, right) => left.startSec - right.startSec)
      .slice(0, 6);
    return {
      candidateId: spec.id,
      startSec: spec.startSec,
      endSec: spec.endSec,
      answer,
      confidence: Math.round(Math.max(0, Math.min(100, Number(row?.confidence) || 0))),
      note: typeof row?.note === 'string' ? row.note.slice(0, 200) : '',
      ranges: answer === 'no' ? [] : ranges,
    };
  });
}
