import type { VisualQualityWindow } from './visual-quality';

export const EDITORIAL_CANDIDATE_PHASES = ['entry', 'middle', 'exit'] as const;
export type EditorialCandidatePhase = (typeof EDITORIAL_CANDIDATE_PHASES)[number];

export const EDITORIAL_CANDIDATE_ROLES = ['hook', 'momentum', 'proof', 'reflection', 'ending', 'versatile'] as const;
export type EditorialCandidateRole = (typeof EDITORIAL_CANDIDATE_ROLES)[number];

export const EDITORIAL_CANDIDATE_ISSUES = [
  'incomplete-action',
  'weak-presence',
  'awkward-expression',
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

/**
 * Convert a technical shortlist into temporally comparable candidates. Three observations are
 * deliberate: a pretty midpoint is insufficient evidence that the action enters and exits cleanly.
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
      frames: [
        { phase: 'entry', atSec: round3(startSec + inset) },
        { phase: 'middle', atSec: round3(startSec + span / 2) },
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
