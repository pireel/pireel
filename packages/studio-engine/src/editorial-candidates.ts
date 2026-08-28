import type { VisualQualityWindow } from './visual-quality';

export const EDITORIAL_CANDIDATE_PHASES = ['entry', 'early', 'middle', 'late', 'exit'] as const;
export type EditorialCandidatePhase = (typeof EDITORIAL_CANDIDATE_PHASES)[number];

export const EDITORIAL_CANDIDATE_ROLES = ['hook', 'momentum', 'proof', 'reflection', 'ending', 'versatile'] as const;
export type EditorialCandidateRole = (typeof EDITORIAL_CANDIDATE_ROLES)[number];

export const EDITORIAL_CONTENT_ROLES = ['person-primary', 'environment', 'detail', 'transition', 'mixed', 'other'] as const;
export type EditorialContentRole = (typeof EDITORIAL_CONTENT_ROLES)[number];

export const EDITORIAL_CANDIDATE_ISSUES = [
  'incomplete-action',
  'weak-presence',
  'awkward-expression',
  'open-mouth',
  'multiple-people',
  'poor-composition',
  'subject-crop',
  'obstruction',
  'setup-artifact',
  'technical-risk',
  'style-mismatch',
  'near-duplicate',
] as const;
export type EditorialCandidateIssue = (typeof EDITORIAL_CANDIDATE_ISSUES)[number];

export interface EditorialCandidateFrame {
  phase: EditorialCandidatePhase;
  atSec: number;
}

export interface EditorialCandidateSpec {
  id: string;
  startSec: number;
  endSec: number;
  technicalRank: number;
  technicalScore: number;
  subjectCenteredness?: number;
  frames: EditorialCandidateFrame[];
}

export interface EditorialRoleFit {
  role: EditorialCandidateRole;
  score: number;
}

export const EDITORIAL_ACTION_PHASES = ['setup', 'transition', 'performance', 'hold', 'exit-reset'] as const;
export type EditorialActionPhase = (typeof EDITORIAL_ACTION_PHASES)[number];

export interface EditorialActionPhaseRange {
  phase: EditorialActionPhase;
  startSec: number;
  endSec: number;
  note: string;
}

export interface EditorialRejectedRange {
  startSec: number;
  endSec: number;
  reason: string;
}

export interface EditorialScoreBreakdown {
  subjectClarity: number;
  aestheticFit: number;
  composition: number;
  temporalCompleteness: number;
  editability: number;
}

export interface EditorialCutOption {
  durationSec: number;
  startSec: number;
  endSec: number;
  score: number;
  reason: string;
}

export interface EditorialCandidateReview {
  candidateId: string;
  startSec: number;
  endSec: number;
  rank: number;
  verdict: 'strong' | 'usable' | 'reject' | 'unreviewed';
  score: number;
  /** Provider judgement before deterministic local compliance checks refine or reject the range. */
  aestheticVerdict?: 'strong' | 'usable' | 'reject' | 'unreviewed';
  aestheticScore?: number;
  /** Whether local face/mouth evidence passed, trimmed the range, rejected it, or was incomplete. */
  localCompliance?: 'passed' | 'trimmed' | 'rejected' | 'unverified';
  /** Visible source role, classified before applying role-specific editorial requirements. */
  contentRole: EditorialContentRole;
  action: string;
  rationale: string;
  /** Provider semantic boundaries mapped back onto the original source clock by the host. */
  suggestedStartSec?: number;
  suggestedEndSec?: number;
  peakSec?: number;
  /** How well the candidate can satisfy the opening role described by the current brief. */
  openingFrameScore: number;
  openingFrameSec?: number;
  openingFrameState: string;
  roleFit: EditorialRoleFit[];
  issues: EditorialCandidateIssue[];
  /** Reusable semantic evidence returned by the same paid review call. */
  scoreBreakdown: EditorialScoreBreakdown;
  actionPhases: EditorialActionPhaseRange[];
  rejectedRanges: EditorialRejectedRange[];
  entryState: string;
  exitState: string;
  cameraMotion: string;
  subjectPlacement: string;
  bestUse: string;
  /** Ranked non-destructive ways to take a shorter final shot from this accepted reservoir. */
  cutOptions: EditorialCutOption[];
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const clampScore = (value: unknown) => Math.round(Math.max(0, Math.min(100, Number(value) || 0)));

/** Private/editorial preference only: technical quality stays authoritative, while centered
 * composition may promote an otherwise comparable candidate into the small review shortlist. */
export function rankEditorialWindows(
  windows: readonly VisualQualityWindow[],
  options: { preferCenteredSubject?: boolean; centerednessWeight?: number } = {},
): VisualQualityWindow[] {
  if (!options.preferCenteredSubject) return [...windows];
  const weight = Math.max(0, Math.min(20, options.centerednessWeight ?? 10));
  return [...windows].sort((left, right) => {
    const leftScore = left.score + (left.subjectCenteredness ?? 0.5) * weight;
    const rightScore = right.score + (right.subjectCenteredness ?? 0.5) * weight;
    return rightScore - leftScore || left.rank - right.rank;
  });
}

/**
 * Convert a technical shortlist into temporally comparable candidates. Five observations make
 * transient expression/action defects visible without losing the entry and exit evidence.
 */
export function buildEditorialCandidateSpecs(
  windows: readonly VisualQualityWindow[],
  maxCandidates = 6,
): EditorialCandidateSpec[] {
  const limit = Math.max(1, Math.min(6, Math.floor(maxCandidates) || 6));
  return windows.slice(0, limit).map((window, index) => {
    const startSec = round3(Math.max(0, window.startSec));
    const endSec = round3(Math.max(startSec, window.endSec));
    const span = Math.max(0, endSec - startSec);
    const inset = Math.min(0.12, span * 0.08);
    return {
      id: `candidate-${index + 1}`,
      startSec,
      endSec,
      technicalRank: window.rank,
      technicalScore: clampScore(window.score),
      ...(window.subjectCenteredness == null ? {} : { subjectCenteredness: window.subjectCenteredness }),
      frames: [
        { phase: 'entry', atSec: round3(startSec + inset) },
        { phase: 'early', atSec: round3(startSec + span / 4) },
        { phase: 'middle', atSec: round3(startSec + span / 2) },
        { phase: 'late', atSec: round3(startSec + (span * 3) / 4) },
        { phase: 'exit', atSec: round3(Math.max(startSec, endSec - inset)) },
      ],
    };
  });
}

export type RawCandidateReview = {
  candidateId?: unknown;
  rank?: unknown;
  verdict?: unknown;
  contentRole?: unknown;
  score?: unknown;
  action?: unknown;
  rationale?: unknown;
  suggestedStartSec?: unknown;
  suggestedEndSec?: unknown;
  peakSec?: unknown;
  openingFrameScore?: unknown;
  openingFrameSec?: unknown;
  openingFrameState?: unknown;
  roleFit?: Array<{ role?: unknown; score?: unknown }>;
  issues?: unknown[];
  scoreBreakdown?: {
    subjectClarity?: unknown;
    aestheticFit?: unknown;
    composition?: unknown;
    temporalCompleteness?: unknown;
    editability?: unknown;
  };
  actionPhases?: Array<{ phase?: unknown; startSec?: unknown; endSec?: unknown; note?: unknown }>;
  rejectedRanges?: Array<{ startSec?: unknown; endSec?: unknown; reason?: unknown }>;
  entryState?: unknown;
  exitState?: unknown;
  cameraMotion?: unknown;
  subjectPlacement?: unknown;
  bestUse?: unknown;
  cutOptions?: Array<{ durationSec?: unknown; startSec?: unknown; endSec?: unknown; score?: unknown; reason?: unknown }>;
};

/**
 * The review model sees each already-clipped maximal interval on a private 0-based clock. Convert
 * every returned timestamp back to the stable source clock before the normal bounded sanitizer runs.
 * Discontinuous source islands stay separate candidate ids, so no returned range can cross a gap.
 */
export function mapEditorialCandidateReviewsFromRelativeClock(
  specs: readonly EditorialCandidateSpec[],
  raw: readonly RawCandidateReview[],
): RawCandidateReview[] {
  const specsById = new Map(specs.map((spec) => [spec.id, spec]));
  return raw.map((candidate) => {
    const spec = specsById.get(String(candidate.candidateId ?? ''));
    if (!spec) return { ...candidate };
    const sourceTime = (value: unknown): unknown => {
      if (value == null || value === '') return value;
      const relative = Number(value);
      return Number.isFinite(relative) ? round3(spec.startSec + relative) : value;
    };
    return {
      ...candidate,
      suggestedStartSec: sourceTime(candidate.suggestedStartSec),
      suggestedEndSec: sourceTime(candidate.suggestedEndSec),
      peakSec: sourceTime(candidate.peakSec),
      openingFrameSec: sourceTime(candidate.openingFrameSec),
      actionPhases: Array.isArray(candidate.actionPhases)
        ? candidate.actionPhases.map((phase) => ({
          ...phase,
          startSec: sourceTime(phase.startSec),
          endSec: sourceTime(phase.endSec),
        }))
        : candidate.actionPhases,
      rejectedRanges: Array.isArray(candidate.rejectedRanges)
        ? candidate.rejectedRanges.map((range) => ({
          ...range,
          startSec: sourceTime(range.startSec),
          endSec: sourceTime(range.endSec),
        }))
        : candidate.rejectedRanges,
      cutOptions: Array.isArray(candidate.cutOptions)
        ? candidate.cutOptions.map((option) => ({
          ...option,
          startSec: sourceTime(option.startSec),
          endSec: sourceTime(option.endSec),
        }))
        : candidate.cutOptions,
    };
  });
}

/** Keep provider output bounded and total: a missing candidate is explicit, never silently promoted. */
export function normalizeEditorialCandidateReviews(
  specs: readonly EditorialCandidateSpec[],
  raw: readonly RawCandidateReview[],
): EditorialCandidateReview[] {
  const rawById = new Map(raw.map((candidate) => [String(candidate.candidateId ?? ''), candidate]));
  const allowedRoles = new Set<string>(EDITORIAL_CANDIDATE_ROLES);
  const allowedContentRoles = new Set<string>(EDITORIAL_CONTENT_ROLES);
  const allowedIssues = new Set<string>(EDITORIAL_CANDIDATE_ISSUES);
  const allowedPhases = new Set<string>(EDITORIAL_ACTION_PHASES);
  const allowedVerdicts = new Set(['strong', 'usable', 'reject']);
  const normalized = specs.map((spec) => {
    const candidate = rawById.get(spec.id);
    const roleFit = (Array.isArray(candidate?.roleFit) ? candidate.roleFit : [])
      .filter((fit) => allowedRoles.has(String(fit?.role)))
      .map((fit) => ({ role: String(fit.role) as EditorialCandidateRole, score: clampScore(fit.score) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, EDITORIAL_CANDIDATE_ROLES.length);
    const issues = [...new Set((Array.isArray(candidate?.issues) ? candidate.issues : [])
      .map(String)
      .filter((issue) => allowedIssues.has(issue)))] as EditorialCandidateIssue[];
    const suggestedStart = Number(candidate?.suggestedStartSec);
    const suggestedEnd = Number(candidate?.suggestedEndSec);
    const hasSuggestedRange = Number.isFinite(suggestedStart)
      && Number.isFinite(suggestedEnd)
      && suggestedEnd > suggestedStart
      && suggestedEnd >= spec.startSec
      && suggestedStart <= spec.endSec;
    const boundedSuggestedStart = hasSuggestedRange ? round3(Math.max(spec.startSec, suggestedStart)) : undefined;
    const boundedSuggestedEnd = hasSuggestedRange ? round3(Math.min(spec.endSec, suggestedEnd)) : undefined;
    const peak = Number(candidate?.peakSec);
    const boundedPeak = Number.isFinite(peak)
      ? round3(Math.max(boundedSuggestedStart ?? spec.startSec, Math.min(boundedSuggestedEnd ?? spec.endSec, peak)))
      : undefined;
    const openingFrameSec = Number(candidate?.openingFrameSec);
    const boundedOpeningFrameSec = Number.isFinite(openingFrameSec)
      ? round3(Math.max(spec.startSec, Math.min(spec.endSec, openingFrameSec)))
      : undefined;
    const boundedRange = (startValue: unknown, endValue: unknown) => {
      const start = Number(startValue);
      const end = Number(endValue);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end < spec.startSec || start > spec.endSec) return null;
      const boundedStart = round3(Math.max(spec.startSec, start));
      const boundedEnd = round3(Math.min(spec.endSec, end));
      return boundedEnd > boundedStart ? { startSec: boundedStart, endSec: boundedEnd } : null;
    };
    const actionPhases = (Array.isArray(candidate?.actionPhases) ? candidate.actionPhases : [])
      .flatMap((phase): EditorialActionPhaseRange[] => {
        if (!allowedPhases.has(String(phase?.phase))) return [];
        const range = boundedRange(phase?.startSec, phase?.endSec);
        if (!range) return [];
        return [{
          phase: String(phase.phase) as EditorialActionPhase,
          ...range,
          note: typeof phase.note === 'string' ? phase.note.slice(0, 140) : '',
        }];
      })
      .sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec)
      .slice(0, EDITORIAL_ACTION_PHASES.length);
    const rejectedRanges = (Array.isArray(candidate?.rejectedRanges) ? candidate.rejectedRanges : [])
      .flatMap((rejected): EditorialRejectedRange[] => {
        const range = boundedRange(rejected?.startSec, rejected?.endSec);
        if (!range) return [];
        return [{
          ...range,
          reason: typeof rejected.reason === 'string' ? rejected.reason.slice(0, 160) : '',
        }];
      })
      .sort((left, right) => left.startSec - right.startSec || left.endSec - right.endSec)
      .slice(0, 6);
    const cutOptions = (Array.isArray(candidate?.cutOptions) ? candidate.cutOptions : [])
      .flatMap((option): EditorialCutOption[] => {
        const range = boundedRange(option?.startSec, option?.endSec);
        if (!range) return [];
        return [{
          durationSec: round3(range.endSec - range.startSec),
          ...range,
          score: clampScore(option?.score),
          reason: typeof option?.reason === 'string' ? option.reason.slice(0, 140) : '',
        }];
      })
      .sort((left, right) => left.durationSec - right.durationSec || right.score - left.score)
      .slice(0, 4);
    const breakdown = candidate?.scoreBreakdown;
    return {
      candidateId: spec.id,
      startSec: spec.startSec,
      endSec: spec.endSec,
      rank: Math.max(1, Math.floor(Number(candidate?.rank) || specs.length + 1)),
      verdict: allowedVerdicts.has(String(candidate?.verdict))
        ? String(candidate!.verdict) as EditorialCandidateReview['verdict']
        : 'unreviewed',
      contentRole: allowedContentRoles.has(String(candidate?.contentRole))
        ? String(candidate!.contentRole) as EditorialContentRole
        : 'other',
      score: clampScore(candidate?.score),
      action: typeof candidate?.action === 'string' ? candidate.action.slice(0, 160) : '',
      rationale: typeof candidate?.rationale === 'string' ? candidate.rationale.slice(0, 240) : '',
      ...(boundedSuggestedStart != null && boundedSuggestedEnd != null && boundedSuggestedEnd - boundedSuggestedStart >= 0.35
        ? { suggestedStartSec: boundedSuggestedStart, suggestedEndSec: boundedSuggestedEnd }
        : {}),
      ...(boundedPeak != null ? { peakSec: boundedPeak } : {}),
      openingFrameScore: clampScore(candidate?.openingFrameScore),
      ...(boundedOpeningFrameSec != null ? { openingFrameSec: boundedOpeningFrameSec } : {}),
      openingFrameState: typeof candidate?.openingFrameState === 'string' ? candidate.openingFrameState.slice(0, 140) : '',
      roleFit,
      issues,
      scoreBreakdown: {
        subjectClarity: clampScore(breakdown?.subjectClarity),
        aestheticFit: clampScore(breakdown?.aestheticFit),
        composition: clampScore(breakdown?.composition),
        temporalCompleteness: clampScore(breakdown?.temporalCompleteness),
        editability: clampScore(breakdown?.editability),
      },
      actionPhases,
      rejectedRanges,
      entryState: typeof candidate?.entryState === 'string' ? candidate.entryState.slice(0, 140) : '',
      exitState: typeof candidate?.exitState === 'string' ? candidate.exitState.slice(0, 140) : '',
      cameraMotion: typeof candidate?.cameraMotion === 'string' ? candidate.cameraMotion.slice(0, 100) : '',
      subjectPlacement: typeof candidate?.subjectPlacement === 'string' ? candidate.subjectPlacement.slice(0, 100) : '',
      bestUse: typeof candidate?.bestUse === 'string' ? candidate.bestUse.slice(0, 160) : '',
      cutOptions,
    };
  });
  return normalized
    .sort((a, b) => a.rank - b.rank || b.score - a.score || a.startSec - b.startSec)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

/** One raw take normally contains one intended performance surrounded by setup and alternate tries.
 * Keep the highest-ranked accepted range selectable while retaining rejects as audit evidence. */
export function selectPrimarySourceCandidate(
  candidates: readonly EditorialCandidateReview[],
  options: { allowMultiple?: boolean } = {},
): EditorialCandidateReview[] {
  const ordered = [...candidates].sort((left, right) => left.rank - right.rank || right.score - left.score || left.startSec - right.startSec);
  if (options.allowMultiple) return ordered.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  const primary = ordered.find((candidate) => candidate.verdict === 'strong' || candidate.verdict === 'usable');
  if (!primary) return ordered.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  return ordered
    .filter((candidate) => candidate.candidateId === primary.candidateId || candidate.verdict === 'reject' || candidate.verdict === 'unreviewed')
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}
