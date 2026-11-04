import type { AsrSegment } from './build-blocks';

/**
 * Script captions for a silent montage, or over a voice-over lane (planNarrationScriptSegments).
 *
 * Managed captions derive from transcript truth attached to PLACED clips (speech on the timeline).
 * A product montage cut to a user-supplied copy has no speech, but it has the same need: sentence
 * captions synced to the picture. Instead of a second caption system, the copy becomes transcript
 * truth for the picture clips themselves: each line is timed across the montage proportionally to
 * its length, snapped inside the shot its midpoint falls in, and written as a transcript segment on
 * that shot's SOURCE clock. Everything downstream — presets, layout, line editing, translation —
 * then works unchanged, and the lines stay editable like any transcript.
 */

export interface ScriptCaptionShot {
  /** Inserted-source identity (runtime transcript key). Absent = a slice of the main video. */
  src?: string;
  srcStart: number;
  srcEnd: number;
}

export interface ScriptCaptionPlan {
  /** Segments for main-video shots (no src), on the main video's source clock. */
  main: AsrSegment[];
  /** Segments per inserted source, on that source's clock. */
  clips: Record<string, AsrSegment[]>;
  lineCount: number;
}

const MAX_SCRIPT_LINES = 160;
/** A caption shorter than this reads as a flash; lines are never squeezed below it inside a shot. */
const MIN_LINE_SEC = 0.6;

/** One caption per line; a line without explicit breaks is split at sentence punctuation. */
export function splitScriptLines(script: string): string[] {
  const explicit = script.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lines = explicit.length > 1
    ? explicit
    // CJK terminators split anywhere; Latin ones only before whitespace so "850.5mg" stays whole.
    : explicit.flatMap((line) => line.split(/(?<=[。！？；])\s*|(?<=[.!?;])\s+/u).map((part) => part.trim()).filter(Boolean));
  return lines.slice(0, MAX_SCRIPT_LINES);
}

/** Reading weight of a line: CJK counts per character, other scripts per word-ish chunk. */
function lineWeight(text: string): number {
  const cjk = (text.match(/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/gu) ?? []).length;
  const rest = text.replace(/\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/gu, ' ');
  const words = rest.split(/\s+/).filter(Boolean).length;
  return Math.max(1, cjk + words * 2);
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function planScriptCaptionSegments(
  shots: readonly ScriptCaptionShot[],
  lines: readonly string[],
): ScriptCaptionPlan {
  const placed = shots
    .filter((shot) => Number.isFinite(shot.srcStart) && Number.isFinite(shot.srcEnd) && shot.srcEnd > shot.srcStart)
    .reduce<Array<ScriptCaptionShot & { start: number; end: number }>>((list, shot) => {
      const start = list.length ? list[list.length - 1]!.end : 0;
      list.push({ ...shot, start, end: round3(start + (shot.srcEnd - shot.srcStart)) });
      return list;
    }, []);
  const plan: ScriptCaptionPlan = { main: [], clips: {}, lineCount: 0 };
  const total = placed.length ? placed[placed.length - 1]!.end : 0;
  if (!total || !lines.length) return plan;
  const weights = lines.map(lineWeight);
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = 0;
  const lastBySrc = new Map<string | undefined, number>();
  lines.forEach((text, index) => {
    const t0 = cursor;
    const t1 = index === lines.length - 1 ? total : round3(cursor + (total * weights[index]!) / weightSum);
    cursor = t1;
    const mid = (t0 + t1) / 2;
    const shot = placed.find((candidate) => mid >= candidate.start && mid < candidate.end) ?? placed[placed.length - 1]!;
    // Snap inside the shot the line belongs to: a caption never straddles a cut.
    let start = Math.max(t0, shot.start);
    let end = Math.min(t1, shot.end);
    if (end - start < MIN_LINE_SEC) {
      end = Math.min(shot.end, start + MIN_LINE_SEC);
      start = Math.max(shot.start, end - MIN_LINE_SEC);
    }
    // Same source appearing in several shots: keep its segments strictly ordered on its clock.
    const previousEnd = lastBySrc.get(shot.src);
    let sourceStart = round3(shot.srcStart + (start - shot.start));
    let sourceEnd = round3(shot.srcStart + (end - shot.start));
    if (previousEnd != null && sourceStart < previousEnd + 0.02) {
      sourceStart = round3(previousEnd + 0.02);
      sourceEnd = Math.max(sourceEnd, round3(sourceStart + MIN_LINE_SEC));
    }
    lastBySrc.set(shot.src, sourceEnd);
    const segment: AsrSegment = { start: sourceStart, end: sourceEnd, text };
    if (shot.src) (plan.clips[shot.src] ??= []).push(segment);
    else plan.main.push(segment);
    plan.lineCount += 1;
  });
  return plan;
}

export interface NarrationScriptClip {
  /** The narration asset (transcript key). */
  src: string;
  srcStart: number;
  srcEnd: number;
  /** Speech timing already known for this asset (synthesis subtitles or ASR), on its source clock. */
  timing?: readonly AsrSegment[];
}

interface ReadingKnot { clip: number; weight: number; start: number; end: number; startAt: number; endAt: number }

/**
 * Script captions over a voice-over lane. The lines are the same speech the narration says, so they
 * follow the narration's clock, never the picture's: each line is placed by its reading position in
 * the script, mapped onto the speech timing the narration already has (sentence rows from synthesis
 * subtitles or ASR) and, where it has none, spread by length across the clip. A line stays inside
 * the clip its midpoint falls in; segments are written on each narration asset's source clock.
 */
export function planNarrationScriptSegments(
  clips: readonly NarrationScriptClip[],
  lines: readonly string[],
): ScriptCaptionPlan {
  const plan: ScriptCaptionPlan = { main: [], clips: {}, lineCount: 0 };
  const usable = clips.filter((clip) => Number.isFinite(clip.srcStart) && Number.isFinite(clip.srcEnd) && clip.srcEnd > clip.srcStart);
  if (!usable.length || !lines.length) return plan;
  // Reading spans: each known sentence inside the clip; a clip without timing is one span.
  const spans = usable.map((clip, index) => {
    const rows = (clip.timing ?? [])
      .filter((row) => row.end > clip.srcStart && row.start < clip.srcEnd && row.text.trim())
      .map((row) => ({ clip: index, start: Math.max(row.start, clip.srcStart), end: Math.min(row.end, clip.srcEnd), weight: lineWeight(row.text) }))
      .sort((left, right) => left.start - right.start);
    return rows.length ? rows : [{ clip: index, start: clip.srcStart, end: clip.srcEnd, weight: 0 }];
  });
  const known = spans.flat().filter((span) => span.weight > 0);
  const rate = known.length ? known.reduce((sum, span) => sum + span.weight, 0) / Math.max(0.001, known.reduce((sum, span) => sum + span.end - span.start, 0)) : 1;
  let cursor = 0;
  const knots: ReadingKnot[] = spans.flat().map((span) => {
    const weight = span.weight || Math.max(0.001, (span.end - span.start) * rate);
    const knot = { clip: span.clip, weight, start: span.start, end: span.end, startAt: cursor, endAt: cursor + weight };
    cursor += weight;
    return knot;
  });
  const lineWeights = lines.map(lineWeight);
  const scale = cursor / lineWeights.reduce((sum, weight) => sum + weight, 0);
  // Reading position → source second inside the span that holds it (a position on a span edge reads
  // as the start of the next span for a line start, the end of the previous one for a line end).
  const knotAt = (at: number, edge: 'start' | 'end') => knots.find((knot) => (edge === 'start' ? at < knot.endAt : at <= knot.endAt)) ?? knots[knots.length - 1]!;
  const timeIn = (knot: ReadingKnot, at: number) => knot.start + (knot.end - knot.start) * Math.min(1, Math.max(0, (at - knot.startAt) / (knot.endAt - knot.startAt)));
  let position = 0;
  const lastBySrc = new Map<string, number>();
  lines.forEach((text, index) => {
    const from = position;
    const to = index === lines.length - 1 ? cursor : position + lineWeights[index]! * scale;
    position = to;
    const home = knotAt((from + to) / 2, 'start');
    const clip = usable[home.clip]!;
    const first = knotAt(from, 'start');
    const last = knotAt(to, 'end');
    let start = first.clip === home.clip ? timeIn(first, from) : clip.srcStart;
    let end = last.clip === home.clip ? timeIn(last, to) : clip.srcEnd;
    const previousEnd = lastBySrc.get(clip.src);
    // Rows that touch read as one sentence downstream: keep each line its own row.
    if (previousEnd != null && start < previousEnd + 0.02) start = previousEnd + 0.02;
    if (end - start < MIN_LINE_SEC) end = Math.min(clip.srcEnd, start + MIN_LINE_SEC);
    start = round3(start); end = round3(Math.max(end, start + 0.05));
    lastBySrc.set(clip.src, end);
    (plan.clips[clip.src] ??= []).push({ start, end, text });
    plan.lineCount += 1;
  });
  return plan;
}
