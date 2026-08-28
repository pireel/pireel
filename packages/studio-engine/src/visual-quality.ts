/** Browser-local visual quality observations. These are measurements, not edit decisions. */

export interface FrameQualityObservation {
  timeSec: number;
  /** Normalized technical measurements in [0, 1]. */
  sharpness: number;
  exposure: number;
  stability: number;
  /** Whether the locally detected person/face is present; not folded into technical score. */
  subjectPresence?: number;
  /** Horizontal visual-center alignment of the detected subject in [0, 1]; not technical quality. */
  subjectCenteredness?: number;
}

export interface VisualQualityWindow {
  /** Rank among returned candidates (1 = strongest technical window). */
  rank: number;
  startSec: number;
  endSec: number;
  /** Conservative technical score in [0, 100], including weak-frame penalties. */
  score: number;
  sharpness: number;
  exposure: number;
  stability: number;
  subjectPresence?: number;
  /** Conservative subject-centeredness observation, kept separate from technical score. */
  subjectCenteredness?: number;
  sampleCount: number;
  /** Weakest locally observed technical frame in [0, 100]. */
  worstFrameScore: number;
  /** Conservative entry/exit score in [0, 100]. */
  edgeScore: number;
  /** Fraction of samples with at least one severe technical failure. */
  hardFailureFraction: number;
}

export interface VisualQualityPolicy {
  minScore: number;
  minSharpness: number;
  minExposure: number;
  minStability: number;
  minEdgeScore: number;
  maxHardFailureFraction: number;
}

export const DEFAULT_VISUAL_QUALITY_POLICY: VisualQualityPolicy = {
  minScore: 48,
  minSharpness: 0.22,
  minExposure: 0.25,
  minStability: 0.16,
  minEdgeScore: 42,
  maxHardFailureFraction: 0,
};

export interface FrameMotionVector { dx: number; dy: number }

export function frameStabilityScore(
  current: FrameMotionVector,
  previous: FrameMotionVector | null,
  photometricError: number,
): number {
  const translation = Math.hypot(current.dx, current.dy);
  const translationScore = Math.exp(-Math.max(0, translation - 0.75) / 2.5);
  const consistencyScore = previous
    ? Math.exp(-Math.hypot(current.dx - previous.dx, current.dy - previous.dy) / 1.5)
    : translationScore;
  const photometricScore = 1 - Math.max(0, photometricError - 0.2) * 0.8;
  return clamp01((consistencyScore * 0.68 + translationScore * 0.32) * photometricScore);
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
const round3 = (value: number) => Math.round(value * 1000) / 1000;

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * q)));
  return sorted[index] ?? 0;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

interface Candidate extends Omit<VisualQualityWindow, 'rank'> {}

function candidateFor(
  samples: FrameQualityObservation[],
  startSec: number,
  endSec: number,
  policy: VisualQualityPolicy,
): Candidate {
  const technical = samples.map((sample) => (
    clamp01(sample.sharpness) * 0.45
    + clamp01(sample.exposure) * 0.3
    + clamp01(sample.stability) * 0.25
  ));
  const conservative = quantile(technical, 0.2);
  const score = Math.round(clamp01(conservative * 0.62 + average(technical) * 0.38) * 100);
  const edgeCount = Math.max(1, Math.ceil(samples.length * 0.2));
  const edgeTechnical = [...technical.slice(0, edgeCount), ...technical.slice(-edgeCount)];
  const hardFailures = samples.filter((sample) => (
    clamp01(sample.sharpness) < policy.minSharpness
    || clamp01(sample.exposure) < policy.minExposure
    || clamp01(sample.stability) < policy.minStability
  )).length;
  const metric = (values: number[]) => {
    // Report a conservative blend too: a clean midpoint must not conceal a bad entry or exit.
    return round3(quantile(values, 0.2) * 0.6 + average(values) * 0.4);
  };
  return {
    startSec: round3(startSec),
    endSec: round3(endSec),
    score,
    sharpness: metric(samples.map((sample) => clamp01(sample.sharpness))),
    exposure: metric(samples.map((sample) => clamp01(sample.exposure))),
    stability: metric(samples.map((sample) => clamp01(sample.stability))),
    ...(samples.some((sample) => sample.subjectPresence != null) ? {
      subjectPresence: metric(samples.flatMap((sample) => sample.subjectPresence == null ? [] : [clamp01(sample.subjectPresence)])),
    } : {}),
    ...(samples.some((sample) => sample.subjectCenteredness != null) ? {
      subjectCenteredness: metric(samples.flatMap((sample) => sample.subjectCenteredness == null ? [] : [clamp01(sample.subjectCenteredness)])),
    } : {}),
    sampleCount: samples.length,
    worstFrameScore: Math.round(quantile(technical, 0) * 100),
    edgeScore: Math.round(quantile(edgeTechnical, 0.2) * 100),
    hardFailureFraction: round3(hardFailures / Math.max(1, samples.length)),
  };
}

function passesPolicy(candidate: Candidate, policy: VisualQualityPolicy): boolean {
  return candidate.score >= policy.minScore
    && candidate.sharpness >= policy.minSharpness
    && candidate.exposure >= policy.minExposure
    && candidate.stability >= policy.minStability
    && candidate.edgeScore >= policy.minEdgeScore
    && candidate.hardFailureFraction <= policy.maxHardFailureFraction;
}

export function fineQualitySampleTimes(
  windows: readonly Pick<VisualQualityWindow, 'startSec' | 'endSec'>[],
  durationSec: number,
  options: { fps?: number; paddingSec?: number; maxFrames?: number } = {},
): number[] {
  if (!windows.length || durationSec <= 0) return [];
  const fps = Math.max(2, Math.min(12, options.fps ?? 6));
  const padding = Math.max(0, Math.min(1, options.paddingSec ?? 0.25));
  const maxFrames = Math.max(12, Math.min(360, Math.floor(options.maxFrames ?? 180)));
  const ranges = windows
    .map((window) => ({
      start: Math.max(0, Math.min(durationSec, window.startSec - padding)),
      end: Math.max(0, Math.min(durationSec, window.endSec + padding)),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end + 1 / fps) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  const stamps = merged.flatMap((range) => {
    const span = range.end - range.start;
    const count = Math.max(3, Math.ceil(span * fps) + 1);
    return Array.from({ length: count }, (_, index) => round3(range.start + (span * index) / (count - 1)));
  });
  if (stamps.length <= maxFrames) return [...new Set(stamps)];
  return Array.from({ length: maxFrames }, (_, index) => {
    const sourceIndex = Math.round((index * (stamps.length - 1)) / Math.max(1, maxFrames - 1));
    return stamps[sourceIndex]!;
  }).filter((stamp, index, all) => index === 0 || stamp !== all[index - 1]);
}

/**
 * Turn dense local samples into a short, ranked list of technically strong source ranges.
 * Candidates never cross a real scene cut. Greedy overlap removal keeps the result useful to
 * an editor instead of returning many near-identical windows around one clean moment.
 */
export function buildVisualQualityWindows(
  observations: readonly FrameQualityObservation[],
  durationSec: number,
  sceneCutsSec: readonly number[] = [],
  options: {
    minDurationSec?: number;
    maxDurationSec?: number;
    maxWindows?: number;
    enforceThresholds?: boolean;
    policy?: Partial<VisualQualityPolicy>;
  } = {},
): VisualQualityWindow[] {
  const samples = observations
    .filter((sample) => Number.isFinite(sample.timeSec) && sample.timeSec >= 0 && sample.timeSec <= durationSec + 0.1)
    .map((sample) => ({
      ...sample,
      sharpness: clamp01(sample.sharpness),
      exposure: clamp01(sample.exposure),
      stability: clamp01(sample.stability),
      ...(sample.subjectPresence == null ? {} : { subjectPresence: clamp01(sample.subjectPresence) }),
      ...(sample.subjectCenteredness == null ? {} : { subjectCenteredness: clamp01(sample.subjectCenteredness) }),
    }))
    .sort((a, b) => a.timeSec - b.timeSec);
  if (!samples.length || durationSec <= 0) return [];

  const minDuration = Math.max(0.6, options.minDurationSec ?? 1.2);
  // These ranges are maximal reusable source reservoirs, not final timeline shot lengths. Do not
  // impose an editing-duration template here: the editorial model will find action-based child
  // ranges inside the clipped reservoir. An explicit cap remains available to diagnostic callers.
  const maxDuration = Math.max(minDuration, options.maxDurationSec ?? durationSec);
  const maxWindows = Math.max(1, Math.floor(options.maxWindows ?? 12));
  const policy: VisualQualityPolicy = { ...DEFAULT_VISUAL_QUALITY_POLICY, ...options.policy };
  const cuts = sceneCutsSec
    .filter((cut) => Number.isFinite(cut) && cut > 0 && cut < durationSec)
    .sort((a, b) => a - b);
  const bounds = [0, ...cuts, durationSec];
  const candidates: Candidate[] = [];

  for (let boundaryIndex = 0; boundaryIndex < bounds.length - 1; boundaryIndex++) {
    const boundaryStart = bounds[boundaryIndex]!;
    const boundaryEnd = bounds[boundaryIndex + 1]!;
    const local = samples
      .filter((sample) => sample.timeSec >= boundaryStart - 0.01 && sample.timeSec < boundaryEnd - 0.01)
      .map((sample) => ({ ...sample }));
    if (!local.length) continue;
    // The first stability observation after a hard cut compares unlike scenes. It says nothing
    // about camera shake inside the new scene, so replace it with the next within-scene reading.
    if (boundaryIndex > 0) local[0]!.stability = local[1]?.stability ?? 1;
    const typicalStep = local.length > 1
      ? Math.max(0.1, quantile(local.slice(1).map((sample, index) => sample.timeSec - local[index]!.timeSec), 0.5))
      : Math.min(maxDuration, Math.max(minDuration, boundaryEnd - boundaryStart));

    for (let start = 0; start < local.length; start++) {
      for (let end = start; end < local.length; end++) {
        const rangeStart = Math.max(boundaryStart, local[start]!.timeSec - typicalStep / 2);
        const rangeEnd = Math.min(boundaryEnd, local[end]!.timeSec + typicalStep / 2);
        const span = rangeEnd - rangeStart;
        if (span > maxDuration + 0.05) break;
        if (span < minDuration - 0.05 && !(boundaryEnd - boundaryStart < minDuration && start === 0 && end === local.length - 1)) continue;
        const candidate = candidateFor(local.slice(start, end + 1), rangeStart, rangeEnd, policy);
        if (options.enforceThresholds !== false && !passesPolicy(candidate, policy)) continue;
        candidates.push(candidate);
      }
    }
  }

  // Every candidate below already passed the absolute quality policy. Prefer the longest clean
  // reservoir first, then use technical quality to break comparable spans. This preserves honest
  // available duration without allowing a longer range to bypass the hard gates above.
  candidates.sort((a, b) => (
    (b.endSec - b.startSec) - (a.endSec - a.startSec)
    || b.score - a.score
    || b.sharpness - a.sharpness
    || a.startSec - b.startSec
  ));
  const picked: Candidate[] = [];
  for (const candidate of candidates) {
    const overlaps = picked.some((existing) => (
      candidate.startSec < existing.endSec + 0.35 && candidate.endSec > existing.startSec - 0.35
    ));
    if (overlaps) continue;
    picked.push(candidate);
    if (picked.length >= maxWindows) break;
  }
  return picked.map((candidate, index) => ({ rank: index + 1, ...candidate }));
}
