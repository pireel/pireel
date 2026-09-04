import type { EditorialAssemblySource, EditorialCandidateReview } from '@pireel/studio-engine/editorial-candidates';
import { canonicalReviewedAssetId, type ReviewedOpeningContender } from './editorial-review-store';

/**
 * assemble_from_review — place the agent's ordered picks as a montage picture track. Every range is
 * placed exactly as given, in the given order, at natural speed, tiled to whole frames; the platform
 * keeps only legality and numbers (coverage, what is left in the reviewed pool) and says in notes
 * where a pick disagrees with the review's evidence. It never chooses, snaps, drops or fills:
 * the model holding the script owns every content decision (neither reference product has an
 * assembly planner; the earlier one here silently trimmed and dropped the agent's own picks).
 */

export interface AssemblyRow {
  assetId: string;
  startSec?: number;
  sourceInSec?: number;
  sourceOutSec?: number;
}

export interface AssemblyPlacedClip {
  id: string;
  assetId: string;
  durationSec: number;
  score: number;
  facing?: string;
  role?: string;
  action?: string;
  setting?: string;
}

export interface AssemblyCoverage {
  targetDurationSec: number;
  actualDurationSec: number;
  shortfallSec: number;
  covered: boolean;
}

export interface RemainingRange {
  assetId: string;
  candidateId: string;
  startSec: number;
  endSec: number;
  score: number;
  verdict: string;
  action?: string;
  facing?: string;
  role?: string;
}

export interface AssemblyBuild {
  /** Legacy add_clips input; `__replacePrimaryTrack` clears the current primary picture first. */
  input: Record<string, unknown>;
  coverage: AssemblyCoverage;
  /** Accepted reviewed ranges (or the parts of them) not used by this assembly, so the agent can
   * choose what closes a gap instead of a score doing it. */
  remaining: RemainingRange[];
  /** Where a pick disagrees with the review evidence (outside accepted bounds, inside a rejected
   * range, shorter than a readable shot). Information for the agent, never a correction. */
  notes: string[];
  placed: AssemblyPlacedClip[];
}

export type AssemblyBuildError =
  | { error: 'no_reviewed_sources' }
  | { error: 'no_target' }
  | { error: 'unreviewed_source'; assetId: string }
  | { error: 'range_required'; assetId: string };

// An id garbled in its uuid TAIL still names its source when the intact prefix (at least the full
// first group after `local_`) matches exactly one reviewed source.
const REVIEWED_ID_PREFIX_MIN = 'local_'.length + 8;
export function healReviewedSourceId(raw: string, sourceIds: ReadonlySet<string>): string | null {
  const canonical = canonicalReviewedAssetId(raw);
  if (!canonical) return null;
  if (sourceIds.has(canonical)) return canonical;
  if (canonical.length < REVIEWED_ID_PREFIX_MIN) return null;
  let best: string | null = null;
  let bestLength = 0;
  let ambiguous = false;
  for (const id of sourceIds) {
    let length = 0;
    while (length < canonical.length && length < id.length && canonical[length] === id[length]) length += 1;
    if (length > bestLength) {
      best = id;
      bestLength = length;
      ambiguous = false;
    } else if (length === bestLength && best && id !== best) {
      ambiguous = true;
    }
  }
  return !ambiguous && bestLength >= REVIEWED_ID_PREFIX_MIN ? best : null;
}

/** Quantize the planned clips to whole frames, lay them end to end, and absorb the rounding
 * remainder (a frame here and there on the longest clips) so the last clip ends on the target frame.
 * Without fps the seconds plan is returned unchanged. */
export function tileToFrames<T extends { startSec: number; sourceInSec: number; sourceOutSec: number }>(
  clips: readonly T[],
  targetDurationSec: number,
  fps?: number,
): T[] {
  if (!fps || !Number.isFinite(fps) || fps <= 0 || !clips.length) return [...clips];
  const frames = clips.map((clip) => Math.max(1, Math.round((clip.sourceOutSec - clip.sourceInSec) * fps)));
  const targetFrames = Math.round(targetDurationSec * fps);
  let total = frames.reduce((sum, value) => sum + value, 0);
  // Only close a rounding-sized gap (a few frames); a real shortfall stays visible as coverage.
  const byLength = frames.map((value, index) => index).sort((left, right) => frames[right]! - frames[left]!);
  let guard = 0;
  while (total < targetFrames && targetFrames - total <= clips.length && guard < 64) {
    for (const index of byLength) { if (total >= targetFrames) break; frames[index] += 1; total += 1; }
    guard += 1;
  }
  guard = 0;
  while (total > targetFrames && total - targetFrames <= clips.length && guard < 64) {
    for (const index of byLength) { if (total <= targetFrames || frames[index]! <= 1) continue; frames[index] -= 1; total -= 1; }
    guard += 1;
  }
  let cursor = 0;
  return clips.map((clip, index) => {
    const durationSec = frames[index]! / fps;
    const placed = { ...clip, startSec: Math.round((cursor / fps) * 1_000) / 1_000, sourceOutSec: Math.round((clip.sourceInSec + durationSec) * 1_000) / 1_000 };
    cursor += frames[index]!;
    return placed;
  });
}

const accepted = (candidates: readonly EditorialCandidateReview[]) => candidates
  .filter((candidate) => candidate.verdict === 'strong' || candidate.verdict === 'usable');

const MIN_REMAINING_SEC = 1;

/** Accepted candidate ranges minus what the assembly used from the same source, as pickable rows. */
export function remainingAcceptedRanges(
  sources: readonly EditorialAssemblySource[],
  placed: ReadonlyArray<{ assetId: string; sourceInSec: number; sourceOutSec: number }>,
): RemainingRange[] {
  const out: RemainingRange[] = [];
  for (const source of sources) {
    const used = placed.filter((clip) => clip.assetId === source.assetId).map((clip) => [clip.sourceInSec, clip.sourceOutSec] as const);
    for (const candidate of accepted(source.candidates)) {
      let free: Array<[number, number]> = [[candidate.startSec, candidate.endSec]];
      for (const [inSec, outSec] of used) {
        free = free.flatMap(([start, end]) => {
          if (outSec <= start || inSec >= end) return [[start, end]];
          const parts: Array<[number, number]> = [];
          if (inSec > start) parts.push([start, inSec]);
          if (outSec < end) parts.push([outSec, end]);
          return parts;
        });
      }
      for (const [start, end] of free) {
        if (end - start < MIN_REMAINING_SEC) continue;
        const ending = (candidate.roleFit ?? []).reduce((best, fit) => (fit.score > (best?.score ?? -1) ? fit : best), undefined as { role: string; score: number } | undefined);
        out.push({
          assetId: source.assetId,
          candidateId: candidate.candidateId,
          startSec: Math.round(start * 1_000) / 1_000,
          endSec: Math.round(end * 1_000) / 1_000,
          score: candidate.score ?? 0,
          verdict: candidate.verdict,
          ...(candidate.action ? { action: String(candidate.action).slice(0, 90) } : {}),
          ...(candidate.facing ? { facing: candidate.facing } : {}),
          ...(ending ? { role: ending.role } : {}),
        });
      }
    }
  }
  return out.sort((left, right) => right.score - left.score);
}

/** The opening seed when the caller authored nothing: the shared comparison's rank 1, else the
 * highest-scored accepted candidate across sources. */
function seedRow(sources: readonly EditorialAssemblySource[], opening: readonly ReviewedOpeningContender[]): AssemblyRow | null {
  for (const contender of opening) {
    const source = sources.find((row) => row.assetId === contender.assetId);
    const candidate = source?.candidates.find((row) => row.candidateId === contender.candidateId);
    if (candidate && (candidate.verdict === 'strong' || candidate.verdict === 'usable')) {
      return { assetId: source!.assetId, startSec: 0, sourceInSec: candidate.startSec, sourceOutSec: candidate.endSec };
    }
  }
  let best: { assetId: string; candidate: EditorialCandidateReview } | null = null;
  for (const source of sources) {
    for (const candidate of accepted(source.candidates)) {
      if (!best || (candidate.score ?? 0) > (best.candidate.score ?? 0)) best = { assetId: source.assetId, candidate };
    }
  }
  return best ? { assetId: best.assetId, startSec: 0, sourceInSec: best.candidate.startSec, sourceOutSec: best.candidate.endSec } : null;
}

export function buildAssemblyFromReview(params: {
  sources: readonly EditorialAssemblySource[];
  opening: readonly ReviewedOpeningContender[];
  rows: readonly AssemblyRow[];
  targetDurationSec: number;
  /** Timeline fps: when given, clips are tiled in whole frames so the picture ends exactly on the
   * target frame (independent second→frame rounding per clip left 1–3 frame gaps). */
  fps?: number;
}): AssemblyBuild | AssemblyBuildError {
  const { sources, opening } = params;
  const targetDurationSec = Number(params.targetDurationSec);
  if (!sources.length) return { error: 'no_reviewed_sources' };
  if (!Number.isFinite(targetDurationSec) || targetDurationSec <= 0) return { error: 'no_target' };
  const sourceIds = new Set(sources.map((source) => source.assetId));
  const healed: AssemblyRow[] = [];
  for (const row of params.rows) {
    const assetId = healReviewedSourceId(String(row.assetId ?? ''), sourceIds);
    if (!assetId) return { error: 'unreviewed_source', assetId: String(row.assetId ?? '') };
    if (!Number.isFinite(Number(row.sourceInSec)) || !Number.isFinite(Number(row.sourceOutSec))) return { error: 'range_required', assetId };
    healed.push({ ...row, assetId });
  }
  const rows = healed.length ? healed : (() => { const seed = seedRow(sources, opening); return seed ? [seed] : []; })();
  if (!rows.length) return { error: 'no_reviewed_sources' };
  // Rows without startSec mean "in this order": lay them end to end.
  let cursorSec = 0;
  const ordered = rows.map((row) => {
    const sourceInSec = Number(row.sourceInSec);
    const sourceOutSec = Number(row.sourceOutSec);
    const spanSec = Math.max(0, sourceOutSec - sourceInSec);
    const startSec = Number.isFinite(Number(row.startSec)) ? Number(row.startSec) : cursorSec;
    cursorSec = Math.max(cursorSec, startSec) + spanSec;
    return { assetId: row.assetId, startSec, sourceInSec, sourceOutSec };
  });
  const tiled = tileToFrames(ordered, targetDurationSec, params.fps);
  const clips = tiled.map((planned) => ({
    role: 'primary',
    assetId: planned.assetId,
    startSec: planned.startSec,
    sourceInSec: planned.sourceInSec,
    sourceOutSec: planned.sourceOutSec,
    durationSec: Math.round((planned.sourceOutSec - planned.sourceInSec) * 1_000) / 1_000,
    muted: true,
  }));
  const notes: string[] = [];
  const placed: AssemblyPlacedClip[] = clips.map((clip, index) => {
    const candidates = sources.find((source) => source.assetId === clip.assetId)?.candidates ?? [];
    const acceptedRows = accepted(candidates);
    const inside = acceptedRows.find((row) => clip.sourceInSec >= row.startSec - 0.06 && clip.sourceOutSec <= row.endSec + 0.06);
    const touching = inside ?? acceptedRows.find((row) => clip.sourceInSec < row.endSec && clip.sourceOutSec > row.startSec);
    const label = `clips[${index}] ${clip.assetId} ${clip.sourceInSec}–${clip.sourceOutSec}s`;
    if (!touching) {
      notes.push(`${label}: outside every accepted range of this source${acceptedRows.length ? ` (accepted: ${acceptedRows.map((row) => `${row.startSec}–${row.endSec}s`).join(', ')})` : ''}.`);
    } else if (!inside) {
      notes.push(`${label}: extends past the accepted range ${touching.startSec}–${touching.endSec}s.`);
    }
    const rejected = candidates.flatMap((row) => row.rejectedRanges ?? []).find((range) => clip.sourceInSec < range.endSec && clip.sourceOutSec > range.startSec);
    if (rejected) notes.push(`${label}: overlaps a range the review rejected (${rejected.startSec}–${rejected.endSec}s${rejected.reason ? `: ${rejected.reason}` : ''}).`);
    if (clip.durationSec < 1) notes.push(`${label}: ${clip.durationSec}s reads as a flash.`);
    const candidate = touching;
    return {
      id: `placed-${index + 1}`,
      assetId: clip.assetId,
      durationSec: Math.round(clip.durationSec * 10) / 10,
      score: candidate?.score ?? 0,
      ...(candidate?.facing ? { facing: candidate.facing } : {}),
      ...(candidate?.contentRole ? { role: candidate.contentRole } : {}),
      ...(candidate?.action ? { action: String(candidate.action).slice(0, 90) } : {}),
      ...(candidate?.log?.setting ? { setting: candidate.log.setting.slice(0, 60) } : {}),
    };
  });
  const actualDurationSec = clips.length
    ? Math.round((clips[clips.length - 1]!.startSec + clips[clips.length - 1]!.durationSec - clips[0]!.startSec) * 1_000) / 1_000
    : 0;
  const shortfallSec = Math.max(0, Math.round((targetDurationSec - actualDurationSec) * 10) / 10);
  const remaining = remainingAcceptedRanges(sources, clips);
  return {
    input: { clips, __replacePrimaryTrack: true },
    remaining,
    notes,
    coverage: {
      targetDurationSec: Math.round(targetDurationSec * 1_000) / 1_000,
      actualDurationSec,
      shortfallSec,
      covered: shortfallSec <= Math.max(1, targetDurationSec * 0.03),
    },
    placed,
  };
}
