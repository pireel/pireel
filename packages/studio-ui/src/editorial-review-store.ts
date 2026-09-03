import type { EditorialCandidateReview } from '@pireel/studio-engine/editorial-candidates';

/**
 * Reviewed sources of the current session, per project. Filled by inspect_media mode:editorial
 * (single or batch) as reviews complete; read by assemble_from_review and by the add_clips review
 * guard. The persistent review cache (editorial-review-cache) makes a repeated inspect_media free,
 * so after a reload the honest path is to run the review again rather than trust stale memory.
 */
export interface ReviewedSourceRecord {
  assetId: string;
  candidates: readonly EditorialCandidateReview[];
  comparisonSummary?: string;
}

export interface ReviewedOpeningContender {
  assetId: string;
  candidateId: string;
}

interface ProjectReviewState {
  sources: Map<string, ReviewedSourceRecord>;
  opening: ReviewedOpeningContender[];
}

const projects = new Map<string, ProjectReviewState>();

const stateFor = (projectId: string): ProjectReviewState => {
  let state = projects.get(projectId);
  if (!state) {
    state = { sources: new Map(), opening: [] };
    projects.set(projectId, state);
  }
  return state;
};

export const canonicalReviewedAssetId = (value: unknown): string => (typeof value === 'string'
  ? value.trim().replace(/^@/, '').replace(/^local:/, '')
  : '');

export function recordReviewedSource(projectId: string, record: ReviewedSourceRecord): void {
  const assetId = canonicalReviewedAssetId(record.assetId);
  if (!projectId || !assetId || !Array.isArray(record.candidates)) return;
  stateFor(projectId).sources.set(assetId, { ...record, assetId });
}

/** The batch review's shared cross-source opening comparison, rank order. Replaces the previous one. */
export function recordOpeningComparison(
  projectId: string,
  contenders: ReadonlyArray<{ sourceId: unknown; candidateId: unknown; rank: unknown }>,
): void {
  if (!projectId) return;
  stateFor(projectId).opening = [...contenders]
    .filter((row) => typeof row.sourceId === 'string' && typeof row.candidateId === 'string')
    .sort((left, right) => Number(left.rank) - Number(right.rank))
    .map((row) => ({ assetId: canonicalReviewedAssetId(row.sourceId), candidateId: String(row.candidateId) }));
}

export function reviewedSourcesFor(projectId: string): ReviewedSourceRecord[] {
  return [...(projects.get(projectId)?.sources.values() ?? [])];
}

export function openingContendersFor(projectId: string): ReviewedOpeningContender[] {
  return [...(projects.get(projectId)?.opening ?? [])];
}

export function clearReviewedSources(projectId: string): void {
  projects.delete(projectId);
}
