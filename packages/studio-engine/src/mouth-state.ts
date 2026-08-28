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

const finiteOrNull = (value: number | null) => value != null && Number.isFinite(value) ? value : null;

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
    if (relevant.some((observation) => observation.visiblyOpen)) issues.add('open-mouth');
    const visibleFaceFrames = relevant.filter((observation) => observation.faceDetected);
    if (visibleFaceFrames.length) {
      const readable = visibleFaceFrames.filter((observation) => observation.mouthReadable).length;
      if (readable / visibleFaceFrames.length < (options.minReadableFaceFraction ?? 0.75)) {
        issues.add('technical-risk');
      }
    }
  }
  if (options.requiresSoloSubject && relevant.some((observation) => (
    observation.prominentFaceCount > 1 || observation.backgroundFaceCount >= 3
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
