import type { VisualQualityWindow } from './visual-quality';

export const EDITORIAL_CANDIDATE_PHASES = ['entry', 'early', 'middle', 'late', 'exit'] as const;
export type EditorialCandidatePhase = (typeof EDITORIAL_CANDIDATE_PHASES)[number];

export const EDITORIAL_CANDIDATE_ROLES = ['hook', 'momentum', 'proof', 'reflection', 'ending', 'versatile'] as const;
export type EditorialCandidateRole = (typeof EDITORIAL_CANDIDATE_ROLES)[number];

export const EDITORIAL_CONTENT_ROLES = ['person-primary', 'environment', 'detail', 'transition', 'mixed', 'other'] as const;
export type EditorialContentRole = (typeof EDITORIAL_CONTENT_ROLES)[number];

export const EDITORIAL_FACINGS = ['frontal', 'near_frontal', 'profile', 'back', 'no_person'] as const;
export type EditorialFacing = (typeof EDITORIAL_FACINGS)[number];

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

export const EDITORIAL_SHOT_SIZES = ['wide', 'medium', 'close-up', 'extreme-close-up', 'mixed'] as const;
export type EditorialShotSize = (typeof EDITORIAL_SHOT_SIZES)[number];
export const EDITORIAL_CAMERA_MOVES = ['static', 'handheld', 'pan', 'tilt', 'dolly', 'zoom', 'mixed'] as const;
export type EditorialCameraMove = (typeof EDITORIAL_CAMERA_MOVES)[number];

/** Neutral shot record — the assistant editor's log line for a candidate. Pixel facts only, no
 * judgement: what the person wears, where they are, what they hold, how it is framed and lit.
 * Selection criteria change per instruction ("only the white outfit", "no back views", "the
 * café ones"); the log lets those be answered by FILTERING existing evidence instead of paying
 * for another review, so it deliberately records the dimensions instructions tend to name. */
export interface EditorialShotLog {
  subject: string;
  wardrobe: string;
  setting: string;
  props: string;
  shotSize: EditorialShotSize;
  camera: EditorialCameraMove;
  lighting: string;
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
  /** Main person's dominant orientation across the interval, judged from pixels. */
  facing?: EditorialFacing;
  /** Neutral shot record (see EditorialShotLog); absent on reviews cached before it existed. */
  log?: EditorialShotLog;
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
  /** Secondary accepted range from the same raw source, kept ONLY for accepted-capacity shortfall
   * or a deliberate structural echo. The primary (unmarked) range is always preferred. */
  reserve?: boolean;
}

export type EditorialAssemblyViolation =
  | {
      kind: 'duration-overrun';
      targetDurationSec: number;
      actualDurationSec: number;
      excessDurationSec: number;
    }
  | {
      kind: 'duplicate-range';
      clipIndexes: [number, number];
      assetId: string;
    }
  | {
      kind: 'static-overlong';
      clipIndex: number;
      assetId: string;
      durationSec: number;
      adaptiveAverageSec: number;
      staticFraction: number;
    };

export interface EditorialAssemblyClip {
  assetId: string;
  startSec: number;
  sourceInSec: number;
  sourceOutSec: number;
  /** Planner output only: `batch` = an authored row (its explicit span honored, snapped to legal
   * action territory at most); `pool` = deterministic completion from unclaimed reviewed capacity. */
  origin?: 'batch' | 'pool';
}

export interface EditorialAssemblySource {
  assetId: string;
  candidates: readonly EditorialCandidateReview[];
}

export interface EditorialAssemblyPlan {
  clips: EditorialAssemblyClip[];
  targetDurationSec: number;
  actualDurationSec: number;
  changed: boolean;
  droppedClipCount: number;
  /** Authored rows placed with their own span (possibly snapped to legal action territory). */
  explicitClipCount?: number;
  /** Of those, rows whose span had to be trimmed to the chain's legal boundaries. */
  snappedClipCount?: number;
  /** Clips the planner added from unclaimed reviewed capacity to complete coverage. */
  fillerClipCount?: number;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;
/** Perceptual floor for a standalone assembled shot. Sub-second flashes read as glitches in a
 * narrated montage (a delivered 0.63s shot was flagged in review as exactly that); cutOptions
 * below this remain in the receipt as data but are never assembled. */
const MIN_ASSEMBLY_SHOT_SEC = 1.0;
/** Rhythm shaping for choice scores: both extremes read as assembly failures — a near-floor cut
 * feels like a flash, a monolithic hold (a delivered 19.5s single shot) reads as a stalled edit.
 * These are soft penalties on the per-choice score only; the DP's coverage-first dominance still
 * reaches for long spans whenever accepted capacity genuinely requires them. */
const ASSEMBLY_SHORT_SHOT_SEC = 1.5;
const ASSEMBLY_LONG_SHOT_SEC = 8;
const rhythmShapedScore = (score: number, durationSec: number) => (
  score
  - Math.max(0, ASSEMBLY_SHORT_SHOT_SEC - durationSec) * 12
  - Math.max(0, durationSec - ASSEMBLY_LONG_SHOT_SEC) * 2
);
const clampScore = (value: unknown) => Math.round(Math.max(0, Math.min(100, Number(value) || 0)));
const overlapDuration = (leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) => (
  Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart))
);

const STATIC_PHASE_NOTE = /\b(?:static|still(?:ness)?|motionless|no (?:action|movement)|waiting|preparation|empty frame)\b|静止|停留|准备|等待|空镜/i;

/** A person-led range that is mostly static hold fails the selection standard outright: it is
 * ELIMINATED before assembly rather than demoted, so duration fitting can never trade quality
 * for coverage with it. Capacity shrinks honestly and any resulting shortfall asks for more
 * sources instead of a stalled hold. Environment/detail roles keep static imagery by design. */
function editorialStaticDominantSpan(
  contentRole: string | undefined,
  actionPhases: ReadonlyArray<{ phase: string; startSec: number; endSec: number; note: string }>,
  startSec: number,
  endSec: number,
): boolean {
  const durationSec = endSec - startSec;
  if (durationSec <= 0) return false;
  if (contentRole === 'environment' || contentRole === 'detail') return false;
  let staticSec = 0;
  for (const phase of actionPhases) {
    const overlap = overlapDuration(startSec, endSec, phase.startSec, phase.endSec);
    if (overlap && (phase.phase === 'setup' || phase.phase === 'hold') && STATIC_PHASE_NOTE.test(phase.note)) {
      staticSec += overlap;
    }
  }
  return staticSec / durationSec >= 0.65;
}

function phaseUtility(candidate: EditorialCandidateReview, phase: EditorialActionPhaseRange): number {
  const staticPhase = STATIC_PHASE_NOTE.test(phase.note);
  if (candidate.contentRole === 'environment' || candidate.contentRole === 'detail') {
    if (phase.phase === 'performance' || phase.phase === 'transition') return 1;
    return staticPhase ? 0.72 : 0.78;
  }
  if (staticPhase && (phase.phase === 'setup' || phase.phase === 'hold')) return 0.2;
  if (phase.phase === 'performance') return 1;
  if (phase.phase === 'transition') return 0.86;
  if (phase.phase === 'exit-reset') return 0.68;
  if (phase.phase === 'hold') return 0.62;
  return 0.42;
}

function centeredRange(startSec: number, endSec: number, centerSec: number, durationSec: number) {
  const boundedDuration = Math.min(endSec - startSec, Math.max(0, durationSec));
  const unclampedStart = centerSec - boundedDuration / 2;
  const rangeStart = Math.max(startSec, Math.min(endSec - boundedDuration, unclampedStart));
  return { startSec: round3(rangeStart), endSec: round3(rangeStart + boundedDuration) };
}

/** Reconcile semantic evidence after deterministic face/mouth checks tighten a reservoir.
 *
 * Provider phases are observations over the original technical interval. Local compliance may
 * later keep only a smaller island; clip every phase to that island and derive ranked, variable-
 * duration final-shot choices from the surviving performance geometry. This prevents an empty
 * cutOptions array from turning the whole reservoir into the accidental default shot. */
export function reconcileEditorialCandidateTemporalEvidence(
  candidate: EditorialCandidateReview,
): EditorialCandidateReview {
  const startSec = candidate.startSec;
  const endSec = candidate.endSec;
  const clippedRange = (rangeStart: number, rangeEnd: number) => {
    const clippedStart = round3(Math.max(startSec, rangeStart));
    const clippedEnd = round3(Math.min(endSec, rangeEnd));
    return clippedEnd - clippedStart >= 0.12 ? { startSec: clippedStart, endSec: clippedEnd } : null;
  };
  const actionPhases = candidate.actionPhases.flatMap((phase): EditorialActionPhaseRange[] => {
    const range = clippedRange(phase.startSec, phase.endSec);
    return range ? [{ ...phase, ...range }] : [];
  });
  const rejectedRanges = candidate.rejectedRanges.flatMap((range): EditorialRejectedRange[] => {
    const clipped = clippedRange(range.startSec, range.endSec);
    return clipped ? [{ ...range, ...clipped }] : [];
  });
  const scoreRange = (range: { startSec: number; endSec: number }, baseScore: number) => {
    const durationSec = range.endSec - range.startSec;
    if (durationSec <= 0) return 0;
    let coveredSec = 0;
    let weighted = 0;
    for (const phase of actionPhases) {
      const overlap = overlapDuration(range.startSec, range.endSec, phase.startSec, phase.endSec);
      if (!overlap) continue;
      coveredSec += overlap;
      weighted += overlap * phaseUtility(candidate, phase);
    }
    const utility = coveredSec > 0 ? weighted / coveredSec : 0.66;
    return Math.max(0, Math.min(100, Math.round(baseScore * (0.64 + utility * 0.36))));
  };
  const staticDominantSpan = (startSec: number, endSec: number) => (
    editorialStaticDominantSpan(candidate.contentRole, actionPhases, startSec, endSec)
  );
  const options: EditorialCutOption[] = candidate.cutOptions.flatMap((option): EditorialCutOption[] => {
    const range = clippedRange(option.startSec, option.endSec);
    if (!range || staticDominantSpan(range.startSec, range.endSec)) return [];
    return [{
      ...option,
      ...range,
      durationSec: round3(range.endSec - range.startSec),
      score: scoreRange(range, option.score),
    }];
  });

  // Natural phases remain the authoritative outer boundaries. Peak-centred fractions provide
  // variable-duration alternatives inside a long performance phase without imposing global 2/3/4s slots.
  for (const phase of actionPhases) {
    const utility = phaseUtility(candidate, phase);
    if (utility < 0.6 || staticDominantSpan(phase.startSec, phase.endSec)) continue;
    const full = { startSec: phase.startSec, endSec: phase.endSec };
    options.push({
      ...full,
      durationSec: round3(full.endSec - full.startSec),
      score: scoreRange(full, Math.round(candidate.score * (0.58 + utility * 0.42))),
      reason: `Locally reconciled ${phase.phase} phase: ${phase.note}`.slice(0, 140),
    });
    if (phase.phase !== 'performance' || phase.endSec - phase.startSec < 0.6) continue;
    const peakSec = Math.max(phase.startSec, Math.min(phase.endSec, candidate.peakSec ?? ((phase.startSec + phase.endSec) / 2)));
    for (const ratio of [0.45, 0.7]) {
      const range = centeredRange(phase.startSec, phase.endSec, peakSec, (phase.endSec - phase.startSec) * ratio);
      options.push({
        ...range,
        durationSec: round3(range.endSec - range.startSec),
        score: scoreRange(range, Math.min(100, candidate.score + (ratio === 0.45 ? 4 : 2))),
        reason: `${ratio === 0.45 ? 'Tight' : 'Balanced'} peak-centred performance cut derived from the reviewed action phase.`,
      });
    }
  }
  const deduped = [...new Map(options
    .filter((option) => option.durationSec >= 0.12)
    .sort((left, right) => right.score - left.score || left.durationSec - right.durationSec)
    .map((option) => [`${option.startSec.toFixed(2)}:${option.endSec.toFixed(2)}`, option])).values()];
  // Peak-centred tight cuts earn score boosts, so a pure top-4 evicts every long option and the
  // reservoir's reachable duration collapses far below its accepted span (a 19.5s reservoir once
  // shrank to a 5s ceiling and the montage could not cover the narration). The longest usable
  // option always survives as one of the four, so stated capacity stays reachable.
  const cutOptions = deduped.slice(0, 4);
  if (deduped.length > 4) {
    const longest = deduped.reduce((best, option) => (option.durationSec > best.durationSec ? option : best));
    if (!cutOptions.includes(longest)) cutOptions[cutOptions.length - 1] = longest;
  }
  // Static edges make the whole-reservoir choice dishonest: the review itself calls the head or
  // tail static (an 8s "static pose from behind" led a 19.5s span into a montage whenever
  // coverage was tight), so the long choice must start where visible action starts. Only
  // statically-NOTED edge phases are shaved; dynamic holds and exits stay.
  const shaveStaticEdges = (fromSec: number, toSec: number) => {
    let from = fromSec;
    let to = toSec;
    const ordered = [...actionPhases].sort((left, right) => left.startSec - right.startSec);
    for (const phase of ordered) {
      if (phase.startSec > from + 0.05) break;
      if ((phase.phase === 'setup' || phase.phase === 'hold') && STATIC_PHASE_NOTE.test(phase.note) && phase.endSec < to) {
        from = Math.max(from, phase.endSec);
      } else break;
    }
    for (const phase of [...ordered].reverse()) {
      if (phase.endSec < to - 0.05) break;
      if ((phase.phase === 'setup' || phase.phase === 'hold') && STATIC_PHASE_NOTE.test(phase.note) && phase.startSec > from) {
        to = Math.min(to, phase.startSec);
      } else break;
    }
    return to - from >= 1 ? { startSec: round3(from), endSec: round3(to) } : { startSec: fromSec, endSec: toSec };
  };
  const suggested = clippedRange(candidate.suggestedStartSec ?? startSec, candidate.suggestedEndSec ?? endSec);
  const shaved = shaveStaticEdges(suggested?.startSec ?? startSec, suggested?.endSec ?? endSec);
  return {
    ...candidate,
    suggestedStartSec: shaved.startSec,
    suggestedEndSec: shaved.endSec,
    ...(candidate.peakSec == null ? {} : { peakSec: round3(Math.max(startSec, Math.min(endSec, candidate.peakSec))) }),
    actionPhases,
    rejectedRanges,
    cutOptions,
  };
}

/** Validate one proposed narrated montage against adaptive pacing rather than fixed shot seconds.
 * The optimizer remains free to choose natural action boundaries, but it may not overrun the
 * measured narration, duplicate an identical source range, or spend an abnormally long slot on
 * a phase the review itself describes as static setup. */
export function evaluateEditorialAssembly(input: {
  clips: readonly EditorialAssemblyClip[];
  sources: readonly EditorialAssemblySource[];
  targetDurationSec?: number;
}): EditorialAssemblyViolation[] {
  const clips = input.clips.filter((clip) => clip.sourceOutSec > clip.sourceInSec && clip.startSec >= 0);
  const violations: EditorialAssemblyViolation[] = [];
  const firstRange = new Map<string, number>();
  clips.forEach((clip, index) => {
    const key = `${clip.assetId}:${round3(clip.sourceInSec)}:${round3(clip.sourceOutSec)}`;
    const previous = firstRange.get(key);
    if (previous == null) firstRange.set(key, index);
    else violations.push({ kind: 'duplicate-range', clipIndexes: [previous, index], assetId: clip.assetId });
  });
  const targetDurationSec = Number(input.targetDurationSec);
  if (Number.isFinite(targetDurationSec) && targetDurationSec > 0 && clips.length) {
    const actualDurationSec = Math.max(...clips.map((clip) => clip.startSec + clip.sourceOutSec - clip.sourceInSec));
    const toleranceSec = Math.max(1, targetDurationSec * 0.03);
    if (actualDurationSec > targetDurationSec + toleranceSec) {
      violations.push({
        kind: 'duration-overrun',
        targetDurationSec: round3(targetDurationSec),
        actualDurationSec: round3(actualDurationSec),
        excessDurationSec: round3(actualDurationSec - targetDurationSec),
      });
    }
    const adaptiveAverageSec = targetDurationSec / clips.length;
    const sourceById = new Map(input.sources.map((source) => [source.assetId, source]));
    clips.forEach((clip, clipIndex) => {
      const durationSec = clip.sourceOutSec - clip.sourceInSec;
      if (durationSec <= adaptiveAverageSec * 1.25) return;
      const source = sourceById.get(clip.assetId);
      const candidate = source?.candidates.find((row) => (
        (row.verdict === 'strong' || row.verdict === 'usable')
        && clip.sourceInSec >= row.startSec - 0.06
        && clip.sourceOutSec <= row.endSec + 0.06
      ));
      if (!candidate || candidate.contentRole === 'environment' || candidate.contentRole === 'detail') return;
      const staticSec = candidate.actionPhases.reduce((total, phase) => (
        (phase.phase === 'setup' || phase.phase === 'hold') && STATIC_PHASE_NOTE.test(phase.note)
          ? total + overlapDuration(clip.sourceInSec, clip.sourceOutSec, phase.startSec, phase.endSec)
          : total
      ), 0);
      const staticFraction = staticSec / durationSec;
      if (staticFraction < 0.65) return;
      violations.push({
        kind: 'static-overlong',
        clipIndex,
        assetId: clip.assetId,
        durationSec: round3(durationSec),
        adaptiveAverageSec: round3(adaptiveAverageSec),
        staticFraction: round3(staticFraction),
      });
    });
  }
  return violations;
}

/** One placeable action unit ("brick") derived from a reviewed phase, and a chain of contiguous
 * bricks from one continuous take. */
export interface EditorialShotUnit {
  startSec: number;
  endSec: number;
  score: number;
}
export type EditorialShotChain = EditorialShotUnit[];

/** Explode one reconciled accepted candidate into chains of contiguous action units.
 *
 * The review's action phases ARE the content segmentation; treating the candidate span as the
 * placeable unit forced every downstream stage to re-derive content structure from annotations
 * (whole-span injection, static shaving, keep-longest — each a patch over the same mismatch).
 * Here each non-static phase becomes a scored brick (phase utility scales the candidate score),
 * statically-noted setup/hold phases are simply NOT bricks — they split the take into separate
 * chains — and a temporal gap between phases splits chains too (unannotated footage is never
 * silently bridged). Environment/detail roles keep their static imagery as usable bricks. */
export function reservoirShotChains(candidate: EditorialCandidateReview): EditorialShotChain[] {
  const phases = [...candidate.actionPhases]
    .map((phase) => ({
      ...phase,
      startSec: Math.max(candidate.startSec, phase.startSec),
      endSec: Math.min(candidate.endSec, phase.endSec),
    }))
    .filter((phase) => phase.endSec - phase.startSec > 0.05)
    .sort((left, right) => left.startSec - right.startSec);
  if (!phases.length) {
    // Sparse/legacy reviews without phases: the (static-shaved) suggested span is one brick.
    const startSec = candidate.suggestedStartSec ?? candidate.startSec;
    const endSec = candidate.suggestedEndSec ?? candidate.endSec;
    return endSec - startSec > 0.05 ? [[{ startSec: round3(startSec), endSec: round3(endSec), score: candidate.score }]] : [];
  }
  const chains: EditorialShotChain[] = [];
  let current: EditorialShotChain = [];
  let cursor: number | null = null;
  for (const phase of phases) {
    const staticBreak = STATIC_PHASE_NOTE.test(phase.note)
      && (phase.phase === 'setup' || phase.phase === 'hold')
      && candidate.contentRole !== 'environment'
      && candidate.contentRole !== 'detail';
    const discontinuous = cursor !== null && phase.startSec > cursor + 0.25;
    if ((staticBreak || discontinuous) && current.length) {
      chains.push(current);
      current = [];
    }
    cursor = Math.max(cursor ?? phase.endSec, phase.endSec);
    if (staticBreak) continue;
    current.push({
      startSec: round3(phase.startSec),
      endSec: round3(phase.endSec),
      score: Math.round(Math.min(100, candidate.score * (0.6 + phaseUtility(candidate, phase) * 0.4))),
    });
  }
  if (current.length) chains.push(current);
  return chains;
}

/** All placeable takes from one chain: every contiguous run of bricks long enough to stand alone
 * (score = duration-weighted mean), the reviewer's own scored cut options clipped to the chain
 * (its actual aesthetic takes — possibly overlapping each other, which is fine: the DP takes at
 * most one span per chain, so "select 2–4 and 3–8 then merge to 2–8" is already expressed as the
 * contiguous-run choice), plus peak-centred fractions of single long bricks so a lone 20s
 * performance phase still offers shorter takes. Rhythm shaping biases toward mid lengths. */
function chainAssemblyChoices(
  chain: EditorialShotChain,
  baseClip: EditorialAssemblyClip,
  cutOptions: readonly EditorialCutOption[] = [],
): Array<{ clip: EditorialAssemblyClip; score: number }> {
  const spans: Array<{ startSec: number; endSec: number; score: number }> = [];
  const chainStartSec = chain[0]?.startSec ?? 0;
  const chainEndSec = chain[chain.length - 1]?.endSec ?? 0;
  for (const option of cutOptions) {
    // Clip the reviewer's take to this chain's legal territory: static or otherwise excluded
    // zones split chains, so a take that crosses one contributes only its compliant part here.
    const startSec = Math.max(option.startSec, chainStartSec);
    const endSec = Math.min(option.endSec, chainEndSec);
    if (endSec - startSec >= MIN_ASSEMBLY_SHOT_SEC) spans.push({ startSec, endSec, score: option.score });
  }
  for (let from = 0; from < chain.length; from += 1) {
    let weighted = 0;
    for (let to = from; to < chain.length; to += 1) {
      const unit = chain[to]!;
      weighted += (unit.endSec - unit.startSec) * unit.score;
      const startSec = chain[from]!.startSec;
      const endSec = unit.endSec;
      const durationSec = endSec - startSec;
      if (durationSec < MIN_ASSEMBLY_SHOT_SEC) continue;
      spans.push({ startSec, endSec, score: weighted / durationSec });
      if (from === to && durationSec > ASSEMBLY_LONG_SHOT_SEC) {
        const centerSec = (unit.startSec + unit.endSec) / 2;
        for (const ratio of [0.45, 0.7]) {
          const range = centeredRange(unit.startSec, unit.endSec, centerSec, durationSec * ratio);
          if (range.endSec - range.startSec >= MIN_ASSEMBLY_SHOT_SEC) {
            spans.push({ ...range, score: unit.score });
          }
        }
      }
    }
  }
  return [...new Map(spans
    .map((span) => ({
      clip: { ...baseClip, sourceInSec: round3(span.startSec), sourceOutSec: round3(span.endSec) },
      score: Math.round(rhythmShapedScore(span.score, span.endSec - span.startSec) * 10) / 10,
    }))
    .sort((left, right) => right.score - left.score)
    .map((choice) => [
      `${round3(choice.clip.sourceInSec)}:${round3(choice.clip.sourceOutSec)}`,
      choice,
    ])).values()];
}

/** Fit reviewed visual choices to measured narration with a multiple-choice knapsack.
 *
 * Each chain of contiguous action units contributes its natural takes rather than fixed global
 * shot lengths. The optimizer keeps source order, uses at most one take from one chain,
 * maximizes covered narration first and editorial score second, then places the result
 * contiguously at natural-speed source time. This is deterministic assembly from the one paid
 * review receipt; it never asks the provider to review the same footage again. */
export function planEditorialAssembly(input: {
  clips: readonly EditorialAssemblyClip[];
  sources: readonly EditorialAssemblySource[];
  targetDurationSec: number;
  /** Cross-source opening contenders in rank order (from the shared opening comparison); the
   * highest-ranked contender whose chain survived selection is pinned as the first shot. */
  opening?: ReadonlyArray<{ assetId: string; candidateId: string }>;
  /** Default true (legacy): unclaimed reviewed capacity fills the target by score. false = the
   * caller's rows are the whole selection; what they do not cover stays uncovered and is reported,
   * so the choice of every shot stays with the agent (the platform keeps legality and coverage
   * numbers, the model keeps content). */
  completeFromPool?: boolean;
}): EditorialAssemblyPlan {
  const targetDurationSec = round3(Math.max(0, Number(input.targetDurationSec) || 0));
  if (!targetDurationSec || !input.clips.length) {
    return {
      clips: [...input.clips],
      targetDurationSec,
      actualDurationSec: input.clips.length
        ? round3(Math.max(...input.clips.map((clip) => clip.startSec + clip.sourceOutSec - clip.sourceInSec)))
        : 0,
      changed: false,
      droppedClipCount: 0,
    };
  }
  const sourceById = new Map(input.sources.map((source) => [source.assetId, source]));
  type ChainEntry = {
    assetId: string;
    candidateId: string;
    endingFit: number;
    chain: EditorialShotChain;
    cutOptions: readonly EditorialCutOption[];
    startSec: number;
    endSec: number;
    used: boolean;
  };
  type PlanningRow = {
    clip: EditorialAssemblyClip;
    originalIndex: number;
    choices: Array<{ clip: EditorialAssemblyClip; score: number }>;
    entry?: ChainEntry;
    /** The row's authored span is its one take (the model's decision, not the planner's). */
    explicit?: boolean;
    /** That span crossed static/excluded territory and was cut back to the chain's legal edge. */
    snapped?: boolean;
  };
  // Duration-weighted brick score of an arbitrary span inside a chain (explicit takes carry no
  // rhythm shaping: their length is the author's editorial decision).
  const chainSpanScore = (chain: EditorialShotChain, startSec: number, endSec: number) => {
    let weighted = 0;
    let covered = 0;
    for (const unit of chain) {
      const overlap = overlapDuration(startSec, endSec, unit.startSec, unit.endSec);
      if (!overlap) continue;
      weighted += overlap * unit.score;
      covered += overlap;
    }
    return covered ? weighted / covered : 0;
  };
  // The bricks of a chain that lie inside [startSec, endSec] — the capacity an explicit take
  // leaves unclaimed on either side of itself, which returns to the pool as its own chain.
  const chainWithin = (chain: EditorialShotChain, startSec: number, endSec: number): EditorialShotChain => (
    chain.flatMap((unit) => {
      const clippedStart = Math.max(unit.startSec, startSec);
      const clippedEnd = Math.min(unit.endSec, endSec);
      return clippedEnd - clippedStart >= 0.25 ? [{ ...unit, startSec: round3(clippedStart), endSec: round3(clippedEnd) }] : [];
    })
  );
  // The full brick-chain pool: every accepted candidate of every reviewed source, exploded into
  // chains of contiguous action units. This IS the assembly's whole choice space — the batch only
  // decides which chains lead (opening/ordering) by claiming them below.
  const chainPool: ChainEntry[] = input.sources.flatMap((source) => (
    source.candidates
      .filter((candidate) => candidate.verdict === 'strong' || candidate.verdict === 'usable')
      .map(reconcileEditorialCandidateTemporalEvidence)
      .flatMap((candidate) => reservoirShotChains(candidate).flatMap((chain) => (chain.length ? [{
        assetId: source.assetId,
        candidateId: candidate.candidateId,
        endingFit: (candidate.roleFit ?? []).find((fit) => fit.role === 'ending')?.score ?? 0,
        chain,
        cutOptions: candidate.cutOptions ?? [],
        startSec: chain[0]!.startSec,
        endSec: chain[chain.length - 1]!.endSec,
        used: false,
      }] : [])))
  ));
  const rows = input.clips.flatMap<PlanningRow>((clip, originalIndex) => {
    const source = sourceById.get(clip.assetId);
    if (!source) {
      // An UNREVIEWED source keeps the neutral pass-through so the contract stays total.
      return [{ clip, originalIndex, choices: [{ clip, score: 50 }] }];
    }
    // The batch row claims the chain its requested range overlaps; a range from a reviewed
    // source that touches no chain (mis-ranged, static-only, or already claimed) is dropped —
    // passing it through would doom the WHOLE optimized batch to the placement guard error.
    const entry = chainPool.find((candidate) => (
      candidate.assetId === clip.assetId
      && !candidate.used
      && overlapDuration(clip.sourceInSec, clip.sourceOutSec, candidate.startSec, candidate.endSec) > 0
    ));
    if (!entry) return [];
    entry.used = true;
    // The authored span is the take. The platform only enforces legality — the chain already
    // excludes static holds and broken action, so the span is cut back to the chain's edges —
    // and the shot floor. Everything else about its length is the author's call: a "two seconds
    // per shot" instruction from the user has to land somewhere, and this is where.
    const legalStart = round3(Math.max(clip.sourceInSec, entry.startSec));
    const legalEnd = round3(Math.min(clip.sourceOutSec, entry.endSec));
    if (legalEnd - legalStart >= MIN_ASSEMBLY_SHOT_SEC) {
      const snapped = Math.abs(legalStart - clip.sourceInSec) > 0.05 || Math.abs(legalEnd - clip.sourceOutSec) > 0.05;
      // Capacity the take leaves on either side goes back to the pool as separate chains, so an
      // explicit 5s take out of a 19s chain does not silently retire the other 14s.
      for (const residual of [chainWithin(entry.chain, entry.startSec, legalStart), chainWithin(entry.chain, legalEnd, entry.endSec)]) {
        if (!residual.length) continue;
        chainPool.push({
          ...entry, chain: residual, startSec: residual[0]!.startSec, endSec: residual[residual.length - 1]!.endSec, used: false,
        });
      }
      const take: EditorialAssemblyClip = { ...clip, sourceInSec: legalStart, sourceOutSec: legalEnd };
      return [{
        clip, originalIndex, entry, explicit: true, snapped,
        choices: [{ clip: take, score: Math.round(chainSpanScore(entry.chain, legalStart, legalEnd) * 10) / 10 }],
      }];
    }
    // A span with no legal remainder above the floor (a sub-second sliver, or entirely static)
    // cannot be honored; the chain's own natural takes stand in for it.
    const choices = chainAssemblyChoices(entry.chain, clip, entry.cutOptions);
    if (!choices.length) return [];
    return [{ clip, originalIndex, choices, entry }];
  });
  // Deterministic pool completion: the batch seeds the opening and ordering preference, but
  // COVERAGE is the algorithm's job. Every accepted chain the batch left unclaimed joins the
  // choice space as a droppable filler row, so a fully covered narration is reachable whenever
  // the reviewed pool allows it — even when EVERY batch row was unusable (mis-ranged, or
  // pointing at a sub-floor sliver: a real batch of one 0.76s row once returned untouched
  // before pool completion ran, and 87s of accepted footage read as "pool exhausted").
  // An under-target plan therefore means the POOL is exhausted — a fact to surface to the
  // user — never that the model under-sampled its batch.
  for (const entry of chainPool) {
    if (input.completeFromPool === false) break;
    if (entry.used) continue;
    const baseClip: EditorialAssemblyClip = {
      assetId: entry.assetId, startSec: 0, sourceInSec: entry.startSec, sourceOutSec: entry.endSec,
    };
    const choices = chainAssemblyChoices(entry.chain, baseClip, entry.cutOptions);
    if (!choices.length) continue;
    rows.push({ clip: baseClip, originalIndex: input.clips.length + rows.length, choices, entry });
  }
  if (!rows.length) {
    // Nothing usable in the batch AND nothing in the reviewed pool. Return the request untouched
    // so the placement guard emits its teaching error instead of an empty unexplained mutation.
    return {
      clips: [...input.clips],
      targetDurationSec,
      actualDurationSec: round3(Math.max(...input.clips.map((clip) => clip.startSec + clip.sourceOutSec - clip.sourceInSec))),
      changed: false,
      droppedClipCount: 0,
    };
  }

  type State = {
    score: number;
    durationSec: number;
    selected: Array<{ rowIndex: number; clip: EditorialAssemblyClip }>;
  };
  const targetTick = Math.max(1, Math.round(targetDurationSec * 10));
  let states = new Map<number, State>([[0, { score: 0, durationSec: 0, selected: [] }]]);
  rows.forEach((row, rowIndex) => {
    const next = new Map<number, State>();
    // One state survives per 0.1s bucket. Within a bucket durations are near-ties, so editorial
    // score decides; only a material duration-gap difference (the saturated final bucket collects
    // real overshoots) outranks score. The drop-carry goes through the same comparison — an
    // unconditional set could overwrite a same-bucket combination with strictly higher score.
    const keepBetter = (tick: number, state: State) => {
      const existing = next.get(tick);
      if (!existing) {
        next.set(tick, state);
        return;
      }
      const stateGap = Math.abs(targetDurationSec - state.durationSec);
      const existingGap = Math.abs(targetDurationSec - existing.durationSec);
      if (stateGap < existingGap - 0.05 || (stateGap <= existingGap + 0.05 && state.score > existing.score)) {
        next.set(tick, state);
      }
    };
    for (const [tick, state] of states) {
      // An authored (explicit) row is never traded away for a better-scoring filler: it is dropped
      // only when nothing of it fits the remaining time (no portion produces a state).
      const mayDrop = rowIndex > 0 && !row.explicit;
      if (mayDrop) keepBetter(tick, state);
      for (const choice of row.choices) {
        const durationSec = choice.clip.sourceOutSec - choice.clip.sourceInSec;
        const remainingSec = round3(targetDurationSec - state.durationSec);
        if (remainingSec <= 0) continue;
        const portions: Array<{ clip: EditorialAssemblyClip; durationSec: number; score: number }> = [];
        if (durationSec > remainingSec + 0.001) {
          // Whole natural choices are preferred. When the next reviewed choice would cross the
          // narration boundary, use a meaningful peak-centred portion of that already-approved
          // interval instead of dropping the whole shot and leaving a visible tail gap.
          const minimumReadableSec = Math.min(1.2, Math.max(0.8, durationSec * 0.35));
          if (remainingSec < minimumReadableSec) continue;
          // Fitting an over-long take is the planner's job, and it offers the DP two ways to do
          // it: the reviewer's own cut option that lies inside the take and fills the remaining
          // time (a real aesthetic take, scored as such), and a blind peak-centred window. Both
          // become states; coverage-first dominance then decides — a short high-scoring option
          // never wins over a portion that actually closes the gap.
          const reviewedFit = (row.entry?.cutOptions ?? [])
            .filter((option) => (
              option.startSec >= choice.clip.sourceInSec - 0.001
              && option.endSec <= choice.clip.sourceOutSec + 0.001
              && option.endSec - option.startSec <= remainingSec + 0.001
              && option.endSec - option.startSec >= Math.max(minimumReadableSec, remainingSec - 0.3)
            ))
            .sort((left, right) => right.score - left.score || (right.endSec - right.startSec) - (left.endSec - left.startSec))[0];
          if (reviewedFit) {
            const startSec = round3(reviewedFit.startSec);
            const endSec = round3(reviewedFit.endSec);
            portions.push({ clip: { ...choice.clip, sourceInSec: startSec, sourceOutSec: endSec }, durationSec: endSec - startSec, score: reviewedFit.score });
          }
          const sourceCenterSec = (choice.clip.sourceInSec + choice.clip.sourceOutSec) / 2;
          const trimmed = centeredRange(choice.clip.sourceInSec, choice.clip.sourceOutSec, sourceCenterSec, remainingSec);
          portions.push({
            clip: { ...choice.clip, sourceInSec: trimmed.startSec, sourceOutSec: trimmed.endSec },
            durationSec: trimmed.endSec - trimmed.startSec,
            score: choice.score,
          });
        } else {
          portions.push({ clip: choice.clip, durationSec, score: choice.score });
        }
        for (const portion of portions) {
          const nextDurationSec = round3(state.durationSec + portion.durationSec);
          const nextTick = Math.min(targetTick, Math.max(1, Math.round(nextDurationSec * 10)));
          keepBetter(nextTick, {
            // Score is weighted by the seconds it fills: the objective is average QUALITY over the
            // covered narration. An unweighted per-choice sum rewarded shot COUNT instead — with
            // coverage fixed, the optimum was "every chain in the film at its shortest take", which
            // dragged 25–35-score garnish (a slippers detail shot) into a montage that had 84s of
            // high-scoring person footage for a 53s narration.
            score: state.score + portion.score * portion.durationSec,
            durationSec: nextDurationSec,
            selected: [...state.selected, { rowIndex, clip: portion.clip }],
          });
        }
      }
    }
    states = next.size ? next : states;
  });
  const bestEntry = [...states.entries()].sort(([leftTick, left], [rightTick, right]) => (
    Math.abs(targetDurationSec - left.durationSec) - Math.abs(targetDurationSec - right.durationSec)
    || Math.abs(targetTick - leftTick) - Math.abs(targetTick - rightTick)
    || right.score - left.score
    || right.selected.length - left.selected.length
  ))[0];
  const selected = bestEntry?.[1].selected ?? [];
  // Ordering: the authored batch keeps its authored order and leads — sequence is the author's
  // decision as much as the takes are. Review evidence orders only what the planner ADDED: the
  // opening pins to the highest-ranked surviving contender (only when no authored row leads),
  // the strongest ending-fit chain closes, and adjacent same-source shots are spaced apart.
  // Batch rows that were dropped leave gaps in `rows`, so classify by the row's ORIGINAL index
  // (filler rows are numbered past the batch), never by its position in `rows`.
  const batchCount = input.clips.length;
  const isAuthored = (item: { rowIndex: number }) => (rows[item.rowIndex]?.originalIndex ?? batchCount) < batchCount;
  const authored = selected.filter(isAuthored);
  const orderedSelected = selected.filter((item) => !isAuthored(item));
  const entryOf = (item: { rowIndex: number }) => rows[item.rowIndex]?.entry ?? null;
  for (const contender of authored.length ? [] : input.opening ?? []) {
    const index = orderedSelected.findIndex((item) => {
      const entry = entryOf(item);
      return !!entry && entry.assetId === contender.assetId && entry.candidateId === contender.candidateId;
    });
    if (index > 0) orderedSelected.unshift(...orderedSelected.splice(index, 1));
    if (index >= 0) break;
  }
  let endingPinned = false;
  if (orderedSelected.length > 2) {
    let endingIndex = -1;
    let bestEndingFit = 60;
    for (let index = 1; index < orderedSelected.length; index += 1) {
      const fit = entryOf(orderedSelected[index]!)?.endingFit ?? 0;
      if (fit > bestEndingFit) {
        bestEndingFit = fit;
        endingIndex = index;
      }
    }
    if (endingIndex >= 0) {
      if (endingIndex !== orderedSelected.length - 1) orderedSelected.push(...orderedSelected.splice(endingIndex, 1));
      endingPinned = true;
    }
  }
  const spacingCeiling = orderedSelected.length - (endingPinned ? 1 : 0);
  for (let index = 1; index < spacingCeiling; index += 1) {
    if (orderedSelected[index]!.clip.assetId !== orderedSelected[index - 1]!.clip.assetId) continue;
    for (let swap = index + 1; swap < spacingCeiling; swap += 1) {
      if (orderedSelected[swap]!.clip.assetId !== orderedSelected[index - 1]!.clip.assetId) {
        const displaced = orderedSelected[index]!;
        orderedSelected[index] = orderedSelected[swap]!;
        orderedSelected[swap] = displaced;
        break;
      }
    }
  }
  let atSec = round3(Math.min(...input.clips.map((clip) => clip.startSec)));
  const clips = [...authored, ...orderedSelected].map((item) => {
    const { clip } = item;
    const placed: EditorialAssemblyClip = { ...clip, startSec: atSec, origin: isAuthored(item) ? 'batch' : 'pool' };
    atSec = round3(atSec + clip.sourceOutSec - clip.sourceInSec);
    return placed;
  });
  // Rounding the dynamic-programming buckets can leave a sub-frame-scale overrun. Trim only the
  // last chosen natural range, never slow footage or duplicate a shot to manufacture duration.
  const actualEnd = clips.length ? clips[clips.length - 1]!.startSec
    + clips[clips.length - 1]!.sourceOutSec - clips[clips.length - 1]!.sourceInSec : 0;
  const targetEnd = Math.min(...input.clips.map((clip) => clip.startSec)) + targetDurationSec;
  if (actualEnd > targetEnd + 0.001 && clips.length) {
    const last = clips[clips.length - 1]!;
    const overflow = actualEnd - targetEnd;
    if (last.sourceOutSec - last.sourceInSec - overflow >= MIN_ASSEMBLY_SHOT_SEC) last.sourceOutSec = round3(last.sourceOutSec - overflow);
  }
  const actualDurationSec = clips.length
    ? round3(clips[clips.length - 1]!.startSec + clips[clips.length - 1]!.sourceOutSec - clips[0]!.startSec - clips[clips.length - 1]!.sourceInSec)
    : 0;
  const changed = clips.length !== input.clips.length || clips.some((clip, index) => {
    const original = input.clips[index];
    return !original
      || clip.assetId !== original.assetId
      || Math.abs(clip.startSec - original.startSec) > 0.01
      || Math.abs(clip.sourceInSec - original.sourceInSec) > 0.01
      || Math.abs(clip.sourceOutSec - original.sourceOutSec) > 0.01;
  });
  const explicitRows = authored.filter((item) => rows[item.rowIndex]?.explicit);
  return {
    clips,
    targetDurationSec,
    actualDurationSec,
    changed,
    droppedClipCount: Math.max(0, batchCount - authored.length),
    explicitClipCount: explicitRows.length,
    snappedClipCount: explicitRows.filter((item) => rows[item.rowIndex]?.snapped).length,
    fillerClipCount: orderedSelected.length,
  };
}

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
  facing?: unknown;
  log?: { subject?: unknown; wardrobe?: unknown; setting?: unknown; props?: unknown; shotSize?: unknown; camera?: unknown; lighting?: unknown } | null;
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
const logText = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 80) : '');
function normalizeShotLog(raw: NonNullable<RawCandidateReview['log']>): EditorialShotLog {
  return {
    subject: logText(raw.subject),
    wardrobe: logText(raw.wardrobe),
    setting: logText(raw.setting),
    props: logText(raw.props),
    shotSize: (EDITORIAL_SHOT_SIZES as readonly string[]).includes(String(raw.shotSize)) ? String(raw.shotSize) as EditorialShotSize : 'mixed',
    camera: (EDITORIAL_CAMERA_MOVES as readonly string[]).includes(String(raw.camera)) ? String(raw.camera) as EditorialCameraMove : 'mixed',
    lighting: logText(raw.lighting),
  };
}

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
      ...( (EDITORIAL_FACINGS as readonly string[]).includes(String(candidate?.facing))
        ? { facing: String(candidate!.facing) as EditorialFacing }
        : {}),
      ...(candidate?.log && typeof candidate.log === 'object' ? { log: normalizeShotLog(candidate.log) } : {}),
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

/** The quality standard is the only gate: EVERY accepted range survives. The highest-ranked one
 * leads (opening/ordering semantics); the rest are marked `reserve` purely as secondary-choice
 * information. Only overlapping alternatives collapse to their best-ranked representative (two
 * verdicts on the same footage are one shot, not two), and rejects remain as audit evidence.
 * Earlier count-capped policies (one reserve, then three) threw away reviewed 90+-score windows
 * from long sources and forced coverage into monolithic holds. */
export function selectPrimarySourceCandidate(
  candidates: readonly EditorialCandidateReview[],
  options: { allowMultiple?: boolean } = {},
): EditorialCandidateReview[] {
  const ordered = [...candidates].sort((left, right) => left.rank - right.rank || right.score - left.score || left.startSec - right.startSec);
  if (options.allowMultiple) return ordered.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  const kept: EditorialCandidateReview[] = [];
  for (const candidate of ordered) {
    if (candidate.verdict !== 'strong' && candidate.verdict !== 'usable') continue;
    if (candidate.issues.includes('near-duplicate')) continue;
    if (kept.some((other) => overlapDuration(candidate.startSec, candidate.endSec, other.startSec, other.endSec) > 0)) continue;
    kept.push(candidate);
  }
  if (!kept.length) return ordered.map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  const primaryId = kept[0]!.candidateId;
  return ordered
    .filter((candidate) => kept.some((other) => other.candidateId === candidate.candidateId)
      || candidate.verdict === 'reject'
      || candidate.verdict === 'unreviewed')
    .map((candidate, index) => ({
      ...candidate,
      rank: index + 1,
      ...(kept.some((other) => other.candidateId === candidate.candidateId) && candidate.candidateId !== primaryId
        ? { reserve: true }
        : {}),
    }));
}
