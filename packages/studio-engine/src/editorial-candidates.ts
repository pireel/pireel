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

export interface EditorialAssemblySource {
  assetId: string;
  candidates: readonly EditorialCandidateReview[];
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;
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
