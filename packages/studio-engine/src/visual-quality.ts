/** Browser-local visual quality observations. These are measurements, not edit decisions. */

export interface FrameQualityObservation {
  timeSec: number;
  /** Normalized technical measurements in [0, 1]. */
  sharpness: number;
  exposure: number;
  stability: number;
  /** Whether the locally detected person/face is present; not folded into technical score. */
  subjectPresence?: number;
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
  sampleCount: number;
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

function candidateFor(samples: FrameQualityObservation[], startSec: number, endSec: number): Candidate {
  const technical = samples.map((sample) => (
    clamp01(sample.sharpness) * 0.45
    + clamp01(sample.exposure) * 0.3
    + clamp01(sample.stability) * 0.25
  ));
  const conservative = quantile(technical, 0.2);
  const score = Math.round(clamp01(conservative * 0.62 + average(technical) * 0.38) * 100);
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
    sampleCount: samples.length,
  };
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
  options: { minDurationSec?: number; maxDurationSec?: number; maxWindows?: number } = {},
): VisualQualityWindow[] {
  const samples = observations
    .filter((sample) => Number.isFinite(sample.timeSec) && sample.timeSec >= 0 && sample.timeSec <= durationSec + 0.1)
    .map((sample) => ({
      ...sample,
      sharpness: clamp01(sample.sharpness),
      exposure: clamp01(sample.exposure),
      stability: clamp01(sample.stability),
      ...(sample.subjectPresence == null ? {} : { subjectPresence: clamp01(sample.subjectPresence) }),
    }))
    .sort((a, b) => a.timeSec - b.timeSec);
  if (!samples.length || durationSec <= 0) return [];

  const minDuration = Math.max(0.6, options.minDurationSec ?? 1.2);
  const maxDuration = Math.max(minDuration, options.maxDurationSec ?? 3.2);
  const maxWindows = Math.max(1, Math.floor(options.maxWindows ?? 12));
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
        candidates.push(candidateFor(local.slice(start, end + 1), rangeStart, rangeEnd));
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score || b.sharpness - a.sharpness || a.startSec - b.startSec);
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
