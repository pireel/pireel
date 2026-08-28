export interface MouthStateSignals {
  jawOpenScore: number | null;
  lipApertureRatio: number | null;
}

export interface EditorialFaceObservation extends MouthStateSignals {
  timeSec: number;
  /** A primary face box was found in the full frame. */
  faceDetected: boolean;
  /** The cropped primary face produced landmarks precise enough to inspect the lips. */
  mouthReadable: boolean;
  visiblyOpen: boolean;
  /** Faces large enough relative to the primary face to compete for attention. */
  prominentFaceCount: number;
  /** Smaller detected faces that remain background context rather than co-subjects. */
  backgroundFaceCount: number;
}

export type EditorialFaceGateIssue = 'open-mouth' | 'multiple-people' | 'technical-risk';

const CONFIRMATION_GAP_SEC = 0.22;

const finiteOrNull = (value: number | null) => value != null && Number.isFinite(value) ? value : null;

/** A single landmark/detector spike must not invalidate an otherwise strong moving shot. */
function confirmedObservation(
  observations: readonly EditorialFaceObservation[],
  index: number,
  predicate: (observation: EditorialFaceObservation) => boolean,
): boolean {
  const current = observations[index];
  if (!current || !predicate(current)) return false;
  const adjacent = [observations[index - 1], observations[index + 1]];
  return adjacent.some((neighbor) => neighbor
    && predicate(neighbor)
    && Math.abs(neighbor.timeSec - current.timeSec) <= CONFIRMATION_GAP_SEC);
}

/** Conservative closed-lip gate. A single noisy landmark signal is insufficient unless it is strong. */
export function isMouthVisiblyOpen(signals: MouthStateSignals): boolean {
  const jaw = finiteOrNull(signals.jawOpenScore);
  const aperture = finiteOrNull(signals.lipApertureRatio);
  if (jaw != null && jaw >= 0.3) return true;
  if (aperture != null && aperture >= 0.13) return true;
  return jaw != null && aperture != null && jaw >= 0.12 && aperture >= 0.065;
}

/**
 * Hard gates for a source range. Missing scan samples are a technical failure, while an observed
 * frame with no visible face is valid (for example a back-view shot). Once a face is visible, its
 * mouth must remain readable often enough to enforce a closed-lip brief reliably.
 */
export function editorialFaceGateIssues(
  observations: readonly EditorialFaceObservation[],
  range: { startSec: number; endSec: number },
  options: {
    requiresClosedMouth?: boolean;
    requiresSoloSubject?: boolean;
    paddingSec?: number;
    minObservations?: number;
    minReadableFaceFraction?: number;
  } = {},
): EditorialFaceGateIssue[] {
  const padding = Math.max(0, options.paddingSec ?? 0.15);
  const relevant = observations.filter((observation) => (
    observation.timeSec >= range.startSec - padding
    && observation.timeSec <= range.endSec + padding
  ));
  const issues = new Set<EditorialFaceGateIssue>();
  const gateRequired = options.requiresClosedMouth || options.requiresSoloSubject;
  if (gateRequired && relevant.length < Math.max(1, options.minObservations ?? 3)) {
    issues.add('technical-risk');
  }
  if (options.requiresClosedMouth) {
    if (relevant.some((_observation, index) => confirmedObservation(
      relevant,
      index,
      (observation) => observation.visiblyOpen,
    ))) issues.add('open-mouth');
    const visibleFaceFrames = relevant.filter((observation) => observation.faceDetected);
    if (visibleFaceFrames.length) {
      const readable = visibleFaceFrames.filter((observation) => observation.mouthReadable).length;
      if (readable / visibleFaceFrames.length < (options.minReadableFaceFraction ?? 0.75)) {
        issues.add('technical-risk');
      }
    }
  }
  if (options.requiresSoloSubject && relevant.some((_observation, index) => confirmedObservation(
    relevant,
    index,
    (observation) => observation.prominentFaceCount > 1,
  ))) {
    issues.add('multiple-people');
  }
  return [...issues];
}

/** Uniform dense observations for short editorial ranges, including safe insets near both edges. */
export function mouthSampleTimes(
  ranges: readonly { startSec: number; endSec: number }[],
  fps = 15,
  maxSamples = 360,
): number[] {
  const rate = Math.max(6, Math.min(20, fps));
  const stamps = ranges.flatMap((range) => {
    const start = Math.max(0, range.startSec);
    const end = Math.max(start, range.endSec);
    const span = end - start;
    const inset = Math.min(0.06, span * 0.04);
    const count = Math.max(3, Math.ceil(span * rate) + 1);
    return Array.from({ length: count }, (_, index) => (
      start + inset + (Math.max(0, span - inset * 2) * index) / Math.max(1, count - 1)
    ));
  }).sort((a, b) => a - b);
  const unique = stamps.filter((stamp, index) => index === 0 || Math.abs(stamp - stamps[index - 1]!) > 0.001);
  const bounded = unique.length <= maxSamples
    ? unique
    : Array.from({ length: maxSamples }, (_, index) => unique[Math.round((index * (unique.length - 1)) / (maxSamples - 1))]!);
  return bounded.map((stamp) => Math.round(stamp * 1_000) / 1_000);
}

export interface EditorialRangeSuggestion {
  startSec: number;
  endSec: number;
  suggestedStartSec?: number;
  suggestedEndSec?: number;
  peakSec?: number;
}

const roundMillis = (value: number) => Math.round(value * 1_000) / 1_000;

/**
 * Turn the model's semantic range into frame-level local boundaries. The model decides which
 * performance is intentional; dense MediaPipe observations only trim invalid edge/interior runs.
 */
export function refineEditorialRangeLocally(
  candidate: EditorialRangeSuggestion,
  observations: readonly EditorialFaceObservation[],
  options: {
    requiresClosedMouth?: boolean;
    requiresSoloSubject?: boolean;
    minDurationSec?: number;
  } = {},
): { startSec: number; endSec: number } {
  const coarseStart = Math.max(candidate.startSec, candidate.suggestedStartSec ?? candidate.startSec);
  const coarseEnd = Math.min(candidate.endSec, candidate.suggestedEndSec ?? candidate.endSec);
  if (!(coarseEnd > coarseStart)) return { startSec: candidate.startSec, endSec: candidate.endSec };
  if (!options.requiresClosedMouth && !options.requiresSoloSubject) {
    return { startSec: roundMillis(coarseStart), endSec: roundMillis(coarseEnd) };
  }
  const relevant = observations
    .filter((observation) => observation.timeSec >= coarseStart && observation.timeSec <= coarseEnd)
    .sort((left, right) => left.timeSec - right.timeSec);
  if (relevant.length < 2) return { startSec: roundMillis(coarseStart), endSec: roundMillis(coarseEnd) };
  const invalid = (_observation: EditorialFaceObservation, index: number) => (
    (options.requiresClosedMouth && confirmedObservation(
      relevant,
      index,
      (observation) => observation.visiblyOpen,
    ))
    || (options.requiresSoloSubject && confirmedObservation(
      relevant,
      index,
      (observation) => observation.prominentFaceCount > 1,
    ))
  );
  const runs: EditorialFaceObservation[][] = [];
  let run: EditorialFaceObservation[] = [];
  for (const [index, observation] of relevant.entries()) {
    if (invalid(observation, index)) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(observation);
    }
  }
  if (run.length) runs.push(run);
  if (!runs.length) return { startSec: roundMillis(coarseStart), endSec: roundMillis(coarseEnd) };
  const peak = Math.max(coarseStart, Math.min(coarseEnd, candidate.peakSec ?? (coarseStart + coarseEnd) / 2));
  const chosen = [...runs].sort((left, right) => {
    const leftContains = Number(peak >= left[0]!.timeSec && peak <= left.at(-1)!.timeSec);
    const rightContains = Number(peak >= right[0]!.timeSec && peak <= right.at(-1)!.timeSec);
    const leftSpan = left.at(-1)!.timeSec - left[0]!.timeSec;
    const rightSpan = right.at(-1)!.timeSec - right[0]!.timeSec;
    return rightContains - leftContains || rightSpan - leftSpan;
  })[0]!;
  const typicalStep = relevant.length > 1
    ? Math.max(0.01, (relevant.at(-1)!.timeSec - relevant[0]!.timeSec) / (relevant.length - 1))
    : 0.067;
  const startSec = Math.max(coarseStart, chosen[0]!.timeSec - typicalStep * 0.45);
  const endSec = Math.min(coarseEnd, chosen.at(-1)!.timeSec + typicalStep * 0.45);
  if (endSec - startSec < Math.max(0.35, options.minDurationSec ?? 0.75)) {
    return { startSec: roundMillis(coarseStart), endSec: roundMillis(coarseEnd) };
  }
  return { startSec: roundMillis(startSec), endSec: roundMillis(endSec) };
}
