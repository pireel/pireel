import type { EditorDocumentV2 } from '@pireel/studio-engine/editor-document';
import { runAgentTimelineTool, type AgentTimelineOutcome } from '@pireel/studio-engine/agent-timeline';

/**
 * Picture laid to a voice-over. The narration fixes the length and where cuts may fall; a plan says
 * which source range each beat uses and what it should show; the fitter picks the cleanest window of
 * each range and settles each cut inside its pause; the compiler writes the spine in one step.
 *
 * Invariants, whatever the input: the shots tile [0, end] exactly; every cut lies in its pause; every
 * window lies inside its source range; no shot is shorter than the minimum. Nothing here stretches,
 * slows or repeats footage to fill time: a beat its range cannot hold is reported, not padded.
 */

/** Where a cut between two beats may fall: the pause after one clause and before the next. */
export interface MontageCutSlot { from: number; to: number }

/** Pauses after punctuation in the narration, in order: the only places a picture cut may land. */
export function narrationCutSlots(words: readonly { text: string; start: number; end: number }[]): MontageCutSlot[] {
  const slots: MontageCutSlot[] = [];
  for (let index = 0; index + 1 < words.length; index += 1) {
    const word = words[index]!;
    const next = words[index + 1]!;
    // Clause-ending punctuation, full- and half-width (，。！？；：、 … — ” 」 』).
    if (!/[\uFF0C\u3002\uFF01\uFF1F\uFF1B\uFF1A\u3001,.!?;:\u2026\u2014"\u201D\u300D\u300F]$/u.test(word.text.trim())) continue;
    slots.push({ from: word.end, to: Math.max(word.end, next.start) });
  }
  return slots;
}

/** One sampled frame of a source range (see montage-signals in the UI package for how it is measured). */
export interface MontageFrameSignal {
  /** Change of the camera's own velocity between frames (shake); a steady pan scores 0. */
  shake: number;
  /** Size of the camera move between frames (a whip pan is large). */
  pan: number;
  /** People large enough to matter in frame. */
  people: number;
  /** A face is visible; `front` when it faces the camera; `faceH` its height as a share of the frame. */
  face: boolean;
  front: boolean;
  faceH: number;
  /** Mouth opening of a face big enough to read, else null (talking shows as it changing). */
  mouth: number | null;
  /** Detail and light, relative within the source. */
  sharp: number;
  bright: number;
  /** A hard cut inside the source lands on this frame. */
  cut: boolean;
}

/** What a beat asked to see: a face toward the camera, a profile, a back, nobody, or anything. */
export type MontageWant = 'front' | 'side' | 'back' | 'none' | 'any';

export interface MontageFitShot {
  /** The source range (seconds) the plan gave this beat; the window is chosen inside it. */
  range: [number, number];
  want?: MontageWant;
  /** The opening frame must be a clear frontal face (a showcase hook). */
  firstFace?: boolean;
  /** Frames sampled at `signalFps` from range[0]; without them every window scores the same. */
  signals?: readonly MontageFrameSignal[];
}

export interface MontageFitInput {
  /** Narration end: the picture ends exactly here. */
  endSec: number;
  /** One slot per cut, in order: shots.length - 1 of them. */
  cuts: readonly MontageCutSlot[];
  shots: readonly MontageFitShot[];
  /** Sampling rate of the signals. */
  signalFps: number;
  /** Timeline frame rate: cuts are placed on frames. */
  fps: number;
  minShotSec?: number;
}

export interface MontageFittedShot { startSec: number; endSec: number; sourceInSec: number; score: number }
export type MontageFitResult =
  | { ok: true; cuts: number[]; shots: MontageFittedShot[] }
  | { ok: false; error: string; shots: number[] };

const MIN_SHOT_SEC = 0.8;

/** How well a window of `frames` samples starting at `at` shows what the beat asked for (higher is better). */
function windowScore(shot: MontageFitShot, at: number, frames: number): number {
  const all = shot.signals ?? [];
  const window = all.slice(at, at + frames);
  if (!window.length) return 0;
  if (window.slice(1).some((frame) => frame.cut)) return -Infinity;
  if (shot.firstFace && !(window[0]!.front && window[0]!.faceH >= 0.12)) return -Infinity;
  const mean = (pick: (frame: MontageFrameSignal) => number, rows = window) => rows.reduce((sum, frame) => sum + pick(frame), 0) / rows.length;
  const motion = mean((frame) => frame.shake) / 2 + mean((frame) => Math.max(0, frame.pan - 6)) / 4;
  const edges = (mean((frame) => frame.shake, window.slice(0, 3)) + mean((frame) => frame.shake, window.slice(-3))) / 4;
  const crowd = mean((frame) => Math.max(0, frame.people - 1));
  const want = shot.want ?? 'any';
  const absent = want === 'none' || want === 'any' ? 0 : mean((frame) => (frame.people === 0 && !frame.face ? 1 : 0));
  const mouths = window.map((frame) => frame.mouth).filter((value): value is number => value !== null);
  let talk = 0;
  if (mouths.length > 3) {
    for (let index = 1; index < mouths.length; index += 1) talk += Math.abs(mouths[index]! - mouths[index - 1]!);
    talk /= mouths.length - 1;
  }
  const dark = Math.max(0, (70 - mean((frame) => frame.bright)) / 40);
  const sharp = mean((frame) => frame.sharp);
  const asked = want === 'front' ? mean((frame) => (frame.front ? 1 : 0)) + 2 * mean((frame) => frame.faceH)
    : want === 'side' ? 0.6 * mean((frame) => (frame.face ? 1 : 0))
    : want === 'back' ? 0.8 * mean((frame) => (frame.people > 0 && !frame.face ? 1 : 0))
    : want === 'none' ? -mean((frame) => (frame.people > 0 ? 1 : 0))
    : 0;
  return -motion - 0.5 * edges - 0.8 * crowd - absent - 8 * talk - dark + 0.15 * sharp + asked;
}

/** The best window of `lengthSec` inside the shot's range: its source-in second and score. */
function bestWindow(shot: MontageFitShot, lengthSec: number, signalFps: number): { sourceInSec: number; score: number } {
  const [from, to] = shot.range;
  if (lengthSec > to - from + 1e-6) return { sourceInSec: from, score: -Infinity };
  const samples = shot.signals?.length ?? 0;
  const frames = Math.max(1, Math.round(lengthSec * signalFps));
  const last = Math.floor((to - from - lengthSec) * signalFps + 1e-6);
  if (!samples) return { sourceInSec: from, score: 0 };
  let best = { sourceInSec: from, score: -Infinity };
  for (let at = 0; at <= last; at += 1) {
    const score = windowScore(shot, at, frames);
    if (score > best.score) best = { sourceInSec: from + at / signalFps, score };
  }
  return best;
}

/**
 * Settle every cut inside its pause and every window inside its range, together, for the best total.
 * A shot that no placement can hold is reported (its range is too short for any length its pauses
 * allow, or no window passes its hard rules), so the plan can give that beat other material.
 */
export function fitMontage(input: MontageFitInput): MontageFitResult {
  const { shots, cuts, endSec, fps, signalFps } = input;
  const minShot = input.minShotSec ?? MIN_SHOT_SEC;
  if (!shots.length) return { ok: false, error: 'no shots to fit', shots: [] };
  if (cuts.length !== shots.length - 1) return { ok: false, error: `expected ${shots.length - 1} cut slots, got ${cuts.length}`, shots: [] };
  const onFrame = (sec: number) => Math.round(sec * fps) / fps;
  const options: number[][] = [[0]];
  for (const slot of cuts) {
    const first = Math.ceil(slot.from * fps - 1e-6);
    const last = Math.floor(slot.to * fps + 1e-6);
    const frames = last >= first ? Array.from({ length: last - first + 1 }, (_, index) => (first + index) / fps) : [onFrame((slot.from + slot.to) / 2)];
    options.push(frames);
  }
  options.push([onFrame(endSec)]);
  const cache = new Map<string, { sourceInSec: number; score: number }>();
  const fitted = (index: number, start: number, end: number) => {
    const length = end - start;
    if (length < minShot - 1e-6) return { sourceInSec: shots[index]!.range[0], score: -Infinity };
    const key = `${index}:${Math.round(length * fps)}`;
    if (!cache.has(key)) cache.set(key, bestWindow(shots[index]!, length, signalFps));
    return cache.get(key)!;
  };
  // best[k][c]: best total for shots 0..k-1 with cut k at options[k][c].
  let layer = new Map<number, { score: number; back: number[] }>([[0, { score: 0, back: [0] }]]);
  const stuck: number[] = [];
  for (let index = 0; index < shots.length; index += 1) {
    const next = new Map<number, { score: number; back: number[] }>();
    for (const end of options[index + 1]!) {
      let winner: { score: number; back: number[] } | undefined;
      for (const [start, value] of layer) {
        const score = value.score + fitted(index, start, end).score;
        if (score > -Infinity && (!winner || score > winner.score)) winner = { score, back: [...value.back, end] };
      }
      if (winner) next.set(end, winner);
    }
    if (!next.size) { stuck.push(index); break; }
    layer = next;
  }
  if (stuck.length) {
    // Name every shot that cannot be held on its own, not just the first the search reached.
    const alone = shots.flatMap((shot, index) => {
      const shortest = Math.max(minShot, options[index + 1]![0]! - options[index]![options[index]!.length - 1]!);
      return shot.range[1] - shot.range[0] + 1e-6 < shortest ? [index] : [];
    });
    const blocked = alone.length ? alone : stuck;
    return { ok: false, error: `no placement holds shot${blocked.length === 1 ? '' : 's'} ${blocked.join(', ')}: give ${blocked.length === 1 ? 'it' : 'them'} a longer range or other material`, shots: blocked };
  }
  const [only] = [...layer.values()];
  const times = only!.back;
  const fittedShots = shots.map((_, index) => {
    const startSec = times[index]!;
    const end = times[index + 1]!;
    const window = fitted(index, startSec, end);
    return { startSec, endSec: end, sourceInSec: window.sourceInSec, score: Math.round(window.score * 1000) / 1000 };
  });
  return { ok: true, cuts: times.slice(1, -1), shots: fittedShots };
}

export interface MontageCompileShot { assetId: string; sourceInSec: number; startSec: number; endSec: number }

/**
 * Write a fitted montage as the whole story spine in one edit: the current spine is replaced, every
 * shot lands on its frames (cut frames are rounded once on the timeline, so lengths always add up),
 * plays at natural speed and is muted under the voice-over.
 */
export function compileMontage(document: EditorDocumentV2, shots: readonly MontageCompileShot[]): AgentTimelineOutcome {
  const fps = document.canvas.fps;
  if (!shots.length) return { ok: false, error: 'no shots to place' };
  const frames = [Math.round(shots[0]!.startSec * fps), ...shots.map((shot) => Math.round(shot.endSec * fps))];
  if (frames[0] !== 0) return { ok: false, error: 'the montage must start at 0' };
  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index]!;
    if (index && Math.round(shot.startSec * fps) !== frames[index]) return { ok: false, error: `shot ${index} does not start where shot ${index - 1} ends` };
    if (frames[index + 1]! <= frames[index]!) return { ok: false, error: `shot ${index} has no length` };
    const available = document.assets[shot.assetId]?.metadata.durationSec;
    if (!document.assets[shot.assetId]) return { ok: false, error: `asset not found: ${shot.assetId}` };
    const out = shot.sourceInSec + (frames[index + 1]! - frames[index]!) / fps;
    if (typeof available === 'number' && out > available + 1e-3) return { ok: false, error: `shot ${index} needs ${out.toFixed(3)}s of ${shot.assetId}, which has ${available.toFixed(3)}s` };
  }
  const spineId = document.semantics.primaryNarrativeTrackId;
  const spine = document.timeline.tracks.find((track) => track.id === spineId);
  let next = document;
  if (spine?.clips.length) {
    const cleared = runAgentTimelineTool(next, 'remove_clips', { clipIds: spine.clips.map((clip) => clip.id), includeLinked: false });
    if (!cleared.ok || !cleared.document) return cleared;
    next = cleared.document;
  }
  const placed = runAgentTimelineTool(next, 'add_clips', {
    clips: shots.map((shot, index) => {
      const durationFrames = frames[index + 1]! - frames[index]!;
      return {
        role: 'primary',
        assetId: shot.assetId,
        startFrame: frames[index]!,
        durationFrames,
        source: [shot.sourceInSec, Math.round((shot.sourceInSec + durationFrames / fps) * 1000) / 1000],
        mute: true,
      };
    }),
  });
  if (!placed.ok || !placed.document) return placed;
  const end = placed.document.timeline.tracks.find((track) => track.id === placed.document!.semantics.primaryNarrativeTrackId)?.clips
    .reduce((last, clip) => Math.max(last, clip.startFrame + clip.durationFrames), 0);
  if (end !== frames[frames.length - 1]) return { ok: false, error: `placed spine ends at frame ${end}, expected ${frames[frames.length - 1]}` };
  return { ...placed, summary: `Laid ${shots.length} shots to the narration` };
}
