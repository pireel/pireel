import {
  planEditorialAssembly,
  type EditorialAssemblySource,
  type EditorialCandidateReview,
} from '@pireel/studio-engine/editorial-candidates';
import { canonicalReviewedAssetId, type ReviewedOpeningContender } from './editorial-review-store';

/**
 * assemble_from_review — the deterministic montage assembler as a tool. The agent's ordered picks
 * are placed as written (snapped to legal action territory at most); the remaining target time is
 * completed from unclaimed reviewed capacity; the primary picture track is replaced atomically. It
 * used to run as a hidden client-side rewrite of add_clips; as a tool its receipt is the contract
 * and the agent decides when to call it.
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
  origin: 'batch' | 'pool';
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

export interface AssemblyBuild {
  /** Legacy add_clips input; `__replacePrimaryTrack` clears the current primary picture first. */
  input: Record<string, unknown>;
  coverage: AssemblyCoverage;
  explicitClipCount: number;
  snappedClipCount: number;
  fillerClipCount: number;
  droppedClipCount: number;
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
  // Rows without startSec mean "in this order": synthesize the sequence so the planner treats the
  // batch as an authored order rather than a freehand pile at 0.
  let cursorSec = 0;
  const ordered = rows.map((row) => {
    const spanSec = Math.max(0, Number(row.sourceOutSec) - Number(row.sourceInSec));
    const startSec = Number.isFinite(Number(row.startSec)) ? Number(row.startSec) : cursorSec;
    cursorSec = Math.max(cursorSec, startSec) + spanSec;
    return { assetId: row.assetId, startSec, sourceInSec: Number(row.sourceInSec), sourceOutSec: Number(row.sourceOutSec) };
  });
  const plan = planEditorialAssembly({ targetDurationSec, sources, opening, clips: ordered });
  const tiled = tileToFrames(plan.clips, targetDurationSec, params.fps);
  const clips = tiled.map((planned) => ({
    role: 'primary',
    assetId: planned.assetId,
    startSec: planned.startSec,
    sourceInSec: planned.sourceInSec,
    sourceOutSec: planned.sourceOutSec,
    durationSec: Math.round((planned.sourceOutSec - planned.sourceInSec) * 1_000) / 1_000,
    muted: true,
  }));
  const placed: AssemblyPlacedClip[] = clips.map((clip, index) => {
    const candidate = (sources.find((source) => source.assetId === clip.assetId)?.candidates ?? [])
      .find((row) => (row.verdict === 'strong' || row.verdict === 'usable')
        && clip.sourceInSec >= row.startSec - 0.06
        && clip.sourceOutSec <= row.endSec + 0.06);
    return {
      id: `placed-${index + 1}`,
      assetId: clip.assetId,
      origin: plan.clips[index]?.origin ?? 'pool',
      durationSec: Math.round(clip.durationSec * 10) / 10,
      score: candidate?.score ?? 0,
      ...(candidate?.facing ? { facing: candidate.facing } : {}),
      ...(candidate?.contentRole ? { role: candidate.contentRole } : {}),
      ...(candidate?.action ? { action: String(candidate.action).slice(0, 90) } : {}),
      ...(candidate?.log?.setting ? { setting: candidate.log.setting.slice(0, 60) } : {}),
    };
  });
  const shortfallSec = Math.max(0, Math.round((plan.targetDurationSec - plan.actualDurationSec) * 10) / 10);
  return {
    input: { clips, __replacePrimaryTrack: true },
    coverage: {
      targetDurationSec: plan.targetDurationSec,
      actualDurationSec: plan.actualDurationSec,
      shortfallSec,
      covered: shortfallSec <= Math.max(1, plan.targetDurationSec * 0.03),
    },
    explicitClipCount: plan.explicitClipCount ?? 0,
    snappedClipCount: plan.snappedClipCount ?? 0,
    fillerClipCount: plan.fillerClipCount ?? 0,
    droppedClipCount: plan.droppedClipCount,
    placed,
  };
}
