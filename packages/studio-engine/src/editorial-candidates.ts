import type { VisualQualityWindow } from './visual-quality';

export const EDITORIAL_CANDIDATE_PHASES = ['entry', 'early', 'middle', 'late', 'exit'] as const;
export type EditorialCandidatePhase = (typeof EDITORIAL_CANDIDATE_PHASES)[number];

export const EDITORIAL_CANDIDATE_ROLES = ['hook', 'momentum', 'proof', 'reflection', 'ending', 'versatile'] as const;
export type EditorialCandidateRole = (typeof EDITORIAL_CANDIDATE_ROLES)[number];

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

export interface EditorialCandidateReview {
  candidateId: string;
  startSec: number;
  endSec: number;
  rank: number;
  verdict: 'strong' | 'usable' | 'reject' | 'unreviewed';
  score: number;
  action: string;
  rationale: string;
  roleFit: EditorialRoleFit[];
  issues: EditorialCandidateIssue[];
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

type RawCandidateReview = {
  candidateId?: unknown;
  rank?: unknown;
  verdict?: unknown;
  score?: unknown;
  action?: unknown;
  rationale?: unknown;
  roleFit?: Array<{ role?: unknown; score?: unknown }>;
  issues?: unknown[];
};

/** Keep provider output bounded and total: a missing candidate is explicit, never silently promoted. */
export function normalizeEditorialCandidateReviews(
  specs: readonly EditorialCandidateSpec[],
  raw: readonly RawCandidateReview[],
): EditorialCandidateReview[] {
  const rawById = new Map(raw.map((candidate) => [String(candidate.candidateId ?? ''), candidate]));
  const allowedRoles = new Set<string>(EDITORIAL_CANDIDATE_ROLES);
  const allowedIssues = new Set<string>(EDITORIAL_CANDIDATE_ISSUES);
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
    return {
      candidateId: spec.id,
      startSec: spec.startSec,
      endSec: spec.endSec,
      rank: Math.max(1, Math.floor(Number(candidate?.rank) || specs.length + 1)),
      verdict: allowedVerdicts.has(String(candidate?.verdict))
        ? String(candidate!.verdict) as EditorialCandidateReview['verdict']
        : 'unreviewed',
      score: clampScore(candidate?.score),
      action: typeof candidate?.action === 'string' ? candidate.action.slice(0, 160) : '',
      rationale: typeof candidate?.rationale === 'string' ? candidate.rationale.slice(0, 240) : '',
      roleFit,
      issues,
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
