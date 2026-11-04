import type { EditMode } from '@pireel/studio-engine/edit-mode';
import { openingFrameIssues, type MontageFrameSignal, type OpeningIssue, type OpeningRule } from '@pireel/studio-engine/montage-plan';

/**
 * The opening hook of a short video, for every edit mode. What a hook can be depends on two facts:
 * whether the source sound is the content (a speaker, a vlog's live sound: a hook can copy a later
 * moment with its sound to the front) and whether a separate voice-over locks the length (then the
 * hook lives inside the first beat and adds no time).
 *
 *  - cold-open: a later highlight copied, with its sound, to the very start; the main cut follows
 *    unchanged and plays it again in place. Longer film. (insert_clips words [first, last] at 0.)
 *  - teaser: three to five 1–1.5 s highlights cut fast before the main cut. Longer film.
 *  - result-first: the finished result shown first. Under a voice-over it is the first beat's picture
 *    (a copy of a later range); without one it is inserted before the main cut.
 *  - lead-shot: no copy: the most arresting shot of the pool opens the film. It may play again in its
 *    own place later, like a flash-forward; only a repeat close behind it reads as a mistake.
 *
 * A text hook (a line drawn from the script) can top any of them, and is due whenever the picture does
 * not say what the script says.
 */
export const HOOK_KINDS = ['cold-open', 'teaser', 'result-first', 'lead-shot'] as const;
export type HookKind = (typeof HOOK_KINDS)[number];

export interface HookContext {
  mode: EditMode;
  /** A separate voice-over fixes the length: the hook may not add time. */
  narrationLocked: boolean;
  /** The sources' own sound carries the content (speech to camera, live sound kept in the cut). */
  sourceSoundLeads: boolean;
  /** The picture literally shows what the script says (content mode with a high match). */
  pictureSaysScript?: boolean;
}

export interface HookChoice {
  kind: HookKind;
  /** What the opening frame must show (fed to the opening shot's fit). */
  opening: OpeningRule;
  /** Whether the hook makes the film longer than its main cut. */
  addsTime: boolean;
  /** Whether the hook is a copy of footage the main cut plays again (a lead shot may also recur later,
   *  as a flash-forward; neither should recur close behind itself). */
  repeats: boolean;
  /** A text hook from the script should top the opening. */
  textHook: boolean;
  /** The talking-head rule: a hook assembled from later speech changes what the speaker appears to
   *  say first, so it is proposed to the user before it is made. */
  confirmFirst: boolean;
}

export function chooseHook(context: HookContext): HookChoice {
  const { mode, narrationLocked, sourceSoundLeads } = context;
  const opening: OpeningRule = mode === 'showcase' || mode === 'talking' ? 'face' : 'subject';
  const textHook = mode !== 'talking' && !context.pictureSaysScript;
  const pick = (kind: HookKind): HookChoice => {
    const copies = kind !== 'lead-shot';
    const addsTime = kind === 'cold-open' || kind === 'teaser' || (kind === 'result-first' && !narrationLocked);
    return { kind, opening, addsTime, repeats: copies, textHook, confirmFirst: kind === 'cold-open' && mode === 'talking' };
  };
  // A locked voice-over leaves only hooks that add no time.
  if (narrationLocked) return pick(mode === 'product' || mode === 'process' ? 'result-first' : 'lead-shot');
  if (mode === 'talking' || (mode === 'timeline' && sourceSoundLeads)) return pick('cold-open');
  if (mode === 'beat' || mode === 'timeline') return pick('teaser');
  if (mode === 'product' || mode === 'process') return pick('result-first');
  return pick('lead-shot');
}

export interface LeadShotCandidate {
  assetId: string;
  /** Source range the opening could come from, and its samples (see montage-signals). */
  range: [number, number];
  signals: readonly MontageFrameSignal[];
  /** The review's own opening judgement (0–100), when it made one. */
  openingFrameScore?: number;
}

export interface RankedLeadShot { assetId: string; sourceInSec: number; score: number }

/**
 * Where each candidate could open the film: the first sample that clears the opening floor and holds
 * steady for `holdSec`, scored on the review's opening judgement and how clearly the frame shows its
 * subject. Candidates that never clear the floor are left out; the best opening comes first.
 */
export function rankLeadShots(candidates: readonly LeadShotCandidate[], rule: OpeningRule, signalFps: number, holdSec = 1.5): RankedLeadShot[] {
  const hold = Math.max(1, Math.round(holdSec * signalFps));
  const ranked: RankedLeadShot[] = [];
  for (const candidate of candidates) {
    let best: RankedLeadShot | undefined;
    for (let at = 0; at + hold <= candidate.signals.length; at += 1) {
      const first = candidate.signals[at]!;
      if (openingFrameIssues(first, rule).length) continue;
      const window = candidate.signals.slice(at, at + hold);
      if (window.slice(1).some((frame) => frame.cut)) continue;
      const shake = window.reduce((sum, frame) => sum + frame.shake, 0) / window.length;
      const talking = window.filter((frame) => frame.mouth != null).length > 3
        ? window.reduce((sum, frame, index) => sum + (index && frame.mouth != null && window[index - 1]!.mouth != null ? Math.abs(frame.mouth - window[index - 1]!.mouth!) : 0), 0) / window.length
        : 0;
      const presence = rule === 'face' ? first.faceH * 4 + (first.front ? 0.5 : 0) : (first.people > 0 || first.face ? 0.5 : 0) + 0.2 * first.sharp;
      const score = (candidate.openingFrameScore ?? 50) / 100 + presence - 80 * shake - 8 * talking;
      if (!best || score > best.score) best = { assetId: candidate.assetId, sourceInSec: candidate.range[0] + at / signalFps, score: Math.round(score * 1000) / 1000 };
    }
    if (best) ranked.push(best);
  }
  return ranked.sort((left, right) => right.score - left.score);
}

/** What fails the opening floor at a film's first frame, for a check after the cut is built. */
export function openingCheck(first: MontageFrameSignal | undefined, rule: OpeningRule): OpeningIssue[] {
  return first ? openingFrameIssues(first, rule) : ['no-subject'];
}

export interface TeaserSource { assetId: string; sourceInSec: number; score: number }

/**
 * A teaser from ranked highlights: up to `count` of them, one per source so the teaser shows range,
 * each `eachSec` long, in rank order. Returns the shots to insert before the main cut.
 */
export function teaserShots(highlights: readonly TeaserSource[], count = 4, eachSec = 1.2): { assetId: string; sourceInSec: number; durationSec: number }[] {
  const seen = new Set<string>();
  const out: { assetId: string; sourceInSec: number; durationSec: number }[] = [];
  for (const highlight of [...highlights].sort((left, right) => right.score - left.score)) {
    if (seen.has(highlight.assetId)) continue;
    seen.add(highlight.assetId);
    out.push({ assetId: highlight.assetId, sourceInSec: highlight.sourceInSec, durationSec: eachSec });
    if (out.length >= Math.min(5, Math.max(3, count))) break;
  }
  return out;
}
