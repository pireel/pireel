/**
 * Edited-timeline trim mapping core (pure functions, no DOM).
 *
 * Model: the video is cut into an ordered list of "clips", each a kept range [srcStart, srcEnd) on the source video.
 * The edited timeline = each clip's source range placed END TO END (cut-out source ranges don't exist in the edit).
 *   - clip i's edited start = sum of all preceding clips' source lengths.
 *   - total edited duration = Σ each clip's source length.
 * Overlay blocks (captions/effects) use EDITED time; cutting a source-footage segment removes its corresponding
 * edited range, and blocks after it shift left as a whole (removeEditedInterval).
 *
 * CRUD:
 *   · read = editedToSrc / spans / editedDuration (edited↔src mapping)
 *   · add = splitAtEdited (split a clip in two at the playhead)
 *   · delete/trim = trimLeftAtEdited / trimRightAtEdited / deleteAtEdited (cut source footage, return the removed edited range)
 * Trim ops return { clips, removed }; removed=[a,b] is the erased range in edited time, passed to
 * removeEditedInterval to compress overlay blocks.
 */

const EPS = 0.05; // edge guard: playhead too close to a clip's ends → split/trim disallowed

export interface Clip {
  srcStart: number;
  srcEnd: number;
}

/** Clip source length (its contribution to edited duration). */
export function clipLen(c: Clip): number {
  return Math.max(0, c.srcEnd - c.srcStart);
}

/** Total edited duration = Σ clip source lengths. */
export function editedDuration(clips: Clip[]): number {
  return clips.reduce((a, c) => a + clipLen(c), 0);
}

export interface ClipSpan<T extends Clip> {
  clip: T;
  index: number;
  /** This clip's start / end on the edited timeline. */
  editedStart: number;
  editedEnd: number;
}

/** Each clip's range on the edited timeline (placed end to end). */
export function spans<T extends Clip>(clips: T[]): ClipSpan<T>[] {
  let acc = 0;
  return clips.map((clip, index) => {
    const editedStart = acc;
    acc += clipLen(clip);
    return { clip, index, editedStart, editedEnd: acc };
  });
}

/**
 * Edited time → which clip it lands in + the corresponding source time. edited is clamped to [0, total]; empty clips return null.
 * Convention: edited on a clip boundary belongs to the preceding clip (the end takes srcEnd).
 */
export function editedToSrc(clips: Clip[], edited: number): { index: number; src: number } | null {
  if (!clips.length) return null;
  const total = editedDuration(clips);
  const te = Math.max(0, Math.min(total, edited));
  let acc = 0;
  for (let i = 0; i < clips.length; i++) {
    const l = clipLen(clips[i]!);
    if (te <= acc + l || i === clips.length - 1) {
      return { index: i, src: clips[i]!.srcStart + (te - acc) };
    }
    acc += l;
  }
  return null;
}

/**
 * Source-domain match predicate: on the multi-source main track, clips can come from different source files,
 * where srcStart/srcEnd are on EACH FILE's own timeline. Source-time operations (word mapping/sentence deletion/
 * restore) may only intersect clips from the SAME source (usually the transcribed narration source); clips of
 * other sources skip matching and only contribute edited length — otherwise the two files' seconds collide
 * numerically (observed: deleting a narration sentence would wrongly cut a chunk of an insert clip). Default =
 * all participate (single-source case unchanged).
 */
export type InSource<T extends Clip = Clip> = (c: T) => boolean;

/** Source time → edited time (only when src falls inside a kept clip). Returns null if in a cut range / out of bounds. */
export function srcToEdited<T extends Clip>(clips: T[], src: number, inSource: InSource<T> = () => true): number | null {
  let acc = 0;
  for (const c of clips) {
    const l = clipLen(c);
    if (inSource(c) && src >= c.srcStart && src <= c.srcEnd) return acc + (src - c.srcStart);
    acc += l;
  }
  return null;
}

/* ============================ CRUD ============================ */

export interface ClipEdit<T extends Clip> {
  clips: T[];
  /** Erased edited range (from trim/delete); split removes nothing → null. Passed to removeEditedInterval to compress blocks. */
  removed: [number, number] | null;
}

/**
 * Split: at the edited playhead, split the containing clip in two (its source range splits at the cut). Content unchanged → removed=null.
 * makeRight builds the right half (usually = copy properties + new id).
 */
export function splitAtEdited<T extends Clip>(
  clips: T[],
  edited: number,
  makeRight: (base: T, srcStart: number, srcEnd: number) => T,
): ClipEdit<T> {
  const hit = editedToSrc(clips, edited);
  if (!hit) return { clips, removed: null };
  const { index, src } = hit;
  const c = clips[index]!;
  if (!(src > c.srcStart + EPS && src < c.srcEnd - EPS)) return { clips, removed: null };
  const left = { ...c, srcEnd: src };
  const right = makeRight(c, src, c.srcEnd);
  return { clips: [...clips.slice(0, index), left, right, ...clips.slice(index + 1)], removed: null };
}

/** Trim left: cut the source footage LEFT of the playhead within the clip (srcStart→cut). */
export function trimLeftAtEdited<T extends Clip>(clips: T[], edited: number): ClipEdit<T> {
  const hit = editedToSrc(clips, edited);
  if (!hit) return { clips, removed: null };
  const { index, src } = hit;
  const c = clips[index]!;
  if (!(src > c.srcStart + EPS && src < c.srcEnd - EPS)) return { clips, removed: null };
  const sp = spans(clips)[index]!;
  const out = clips.map((x, i) => (i === index ? { ...x, srcStart: src } : x));
  return { clips: out, removed: [sp.editedStart, edited] };
}

/** Trim right: cut the source footage RIGHT of the playhead within the clip (cut→srcEnd). */
export function trimRightAtEdited<T extends Clip>(clips: T[], edited: number): ClipEdit<T> {
  const hit = editedToSrc(clips, edited);
  if (!hit) return { clips, removed: null };
  const { index, src } = hit;
  const c = clips[index]!;
  if (!(src > c.srcStart + EPS && src < c.srcEnd - EPS)) return { clips, removed: null };
  const sp = spans(clips)[index]!;
  const out = clips.map((x, i) => (i === index ? { ...x, srcEnd: src } : x));
  return { clips: out, removed: [edited, sp.editedEnd] };
}

/** Delete clip: remove the clip at the playhead. An empty track is a valid document state. */
export function deleteAtEdited<T extends Clip>(clips: T[], edited: number): ClipEdit<T> {
  const hit = editedToSrc(clips, edited);
  if (!hit) return { clips, removed: null };
  const sp = spans(clips)[hit.index]!;
  return { clips: clips.filter((_, i) => i !== hit.index), removed: [sp.editedStart, sp.editedEnd] };
}

/**
 * Remove range: erase edited time [a,b) — each clip keeps the part outside the range (clips spanning the range
 * split into left/right halves, the right built via makeRight). The range may span multiple clips. An empty
 * result is valid: the primary lane is document structure, not a requirement to retain footage. `removed` is
 * the clamped [a,b], passed to sibling-track ripple helpers.
 */
export function removeEditedRange<T extends Clip>(
  clips: T[],
  a: number,
  b: number,
  makeRight: (base: T, srcStart: number, srcEnd: number) => T,
): ClipEdit<T> {
  const total = editedDuration(clips);
  const lo = Math.max(0, Math.min(total, Math.min(a, b)));
  const hi = Math.max(0, Math.min(total, Math.max(a, b)));
  if (hi - lo < EPS) return { clips, removed: null };
  const out: T[] = [];
  for (const sp of spans(clips)) {
    const { clip, editedStart, editedEnd } = sp;
    if (editedEnd <= lo + 1e-9 || editedStart >= hi - 1e-9) {
      out.push(clip); // entirely outside the range
      continue;
    }
    // keep left side (clip starts before the range)
    if (editedStart < lo - 1e-9) out.push({ ...clip, srcEnd: clip.srcStart + (lo - editedStart) });
    // keep right side (clip ends after the range) — new clip (new id from makeRight)
    if (editedEnd > hi + 1e-9) out.push(makeRight(clip, clip.srcStart + (hi - editedStart), clip.srcEnd));
  }
  return { clips: out, removed: [lo, hi] };
}

/**
 * Delete a batch of SOURCE-time ranges (transcript-driven editing: delete sentence/silence/filler word).
 * Each source range maps to edited range(s) under the current edit (may span multiple clips → multiple segments),
 * deleted DESCENDING within a range — source coords are unaffected by cuts so ranges may be any order, but edited
 * coords shift on every cut, so within a range it must be descending. removed = the actually-deleted edited ranges,
 * in ORDER OF DELETION: overlay blocks must run removeEditedInterval in the same order (each cut's coords are the
 * "before this cut" edited frame).
 */
export function removeSrcRanges<T extends Clip>(
  clips: T[],
  srcRanges: [number, number][],
  makeRight: (base: T, srcStart: number, srcEnd: number) => T,
  inSource: InSource<T> = () => true,
): { clips: T[]; removed: [number, number][] } {
  let cur = clips;
  const removed: [number, number][] = [];
  for (const [s, e] of srcRanges) {
    const segs: [number, number][] = [];
    for (const sp of spans(cur)) {
      if (!inSource(sp.clip)) continue; // other-source clips: different source-time domain, skip matching
      const a = Math.max(sp.clip.srcStart, s);
      const b = Math.min(sp.clip.srcEnd, e);
      if (b - a > 0.04) segs.push([sp.editedStart + (a - sp.clip.srcStart), sp.editedStart + (b - sp.clip.srcStart)]);
    }
    segs.sort((x, y) => y[0] - x[0]);
    for (const [from, to] of segs) {
      const r = removeEditedRange(cur, from, to, makeRight);
      if (!r.removed) continue;
      cur = r.clips;
      removed.push(r.removed);
    }
  }
  return { clips: cur, removed };
}

/** src time → edited time (loose: if in a cut range, take the first surviving point after it; out of bounds → the end). */
export function srcToEditedLoose<T extends Clip>(clips: T[], src: number, inSource: InSource<T> = () => true): number {
  const sp = spans(clips);
  let lastEnd = 0;
  for (const x of sp) {
    if (!inSource(x.clip)) continue; // other sources: only occupy edited length (already in spans), skip source-time matching
    if (src < x.clip.srcStart) return x.editedStart;
    if (src < x.clip.srcEnd) return x.editedStart + (src - x.clip.srcStart);
    lastEnd = x.editedEnd;
  }
  return lastEnd || (sp.length ? sp[sp.length - 1]!.editedEnd : 0);
}

/**
 * Restore a SOURCE-time range (transcript: click a deleted word to bring it back). Find the gaps in [s,e) not
 * currently covered, prefer merging into a source-adjacent clip (srcEnd/srcStart touch, only if canMerge allows
 * — don't over-extend a shot that has a partner), otherwise insert a new clip sorted by srcStart. Already fully
 * present = returned unchanged.
 */
export function restoreSrcRange<T extends Clip>(
  clips: T[],
  s: number,
  e: number,
  make: (srcStart: number, srcEnd: number) => T,
  canMerge: (c: T) => boolean = () => true,
  inSource: InSource<T> = () => true,
): T[] {
  // Multi-source: restore runs only among THIS source's clips (sort/merge/insert all use this source's srcStart
  // semantics); other-source clips are lifted out first, each remembering its predecessor's srcStart, then
  // reattached after the restored clip whose range still covers that srcStart. Merging can move a predecessor's
  // srcStart down (next-merge) as well as its srcEnd up (prev-merge), but its original srcStart always stays
  // inside its range, and in-source ranges never overlap, so containment identifies the predecessor uniquely.
  const foreign = clips.filter((c) => !inSource(c));
  if (foreign.length) {
    const anchors: { clip: T; afterSrcStart: number | null }[] = [];
    let lastSrc: T | null = null;
    for (const c of clips) {
      if (inSource(c)) {
        lastSrc = c;
        continue;
      }
      anchors.push({ clip: c, afterSrcStart: lastSrc ? lastSrc.srcStart : null });
    }
    const restored = restoreSrcRange(clips.filter(inSource), s, e, make, canMerge);
    const out: T[] = [];
    for (const a of anchors) if (a.afterSrcStart == null) out.push(a.clip);
    for (const c of restored) {
      out.push(c);
      for (const a of anchors) if (a.afterSrcStart != null && a.afterSrcStart >= c.srcStart - 1e-6 && a.afterSrcStart < c.srcEnd - 1e-6) out.push(a.clip);
    }
    // predecessor unexpectedly gone (theoretically impossible, restore deletes no clips): fall back to appending at the end, lose nothing
    for (const a of anchors) if (!out.includes(a.clip)) out.push(a.clip);
    return out;
  }
  const sorted = [...clips].sort((a, b) => a.srcStart - b.srcStart);
  const pieces: [number, number][] = [];
  let cur = s;
  for (const c of sorted) {
    if (c.srcEnd <= cur + EPS) continue;
    if (c.srcStart >= e - EPS) break;
    if (c.srcStart > cur + EPS) pieces.push([cur, Math.min(c.srcStart, e)]);
    cur = Math.max(cur, c.srcEnd);
    if (cur >= e - EPS) break;
  }
  if (cur < e - EPS) pieces.push([cur, e]);
  const real = pieces.filter(([a, b]) => b - a > 0.02);
  if (!real.length) return clips;
  let out = sorted;
  for (const [a, b] of real) {
    const prevI = out.findIndex((c) => Math.abs(c.srcEnd - a) < 0.03 && canMerge(c));
    if (prevI >= 0) {
      out = out.map((c, i) => (i === prevI ? { ...c, srcEnd: b } : c));
      continue;
    }
    const nextI = out.findIndex((c) => Math.abs(c.srcStart - b) < 0.03 && canMerge(c));
    if (nextI >= 0) {
      out = out.map((c, i) => (i === nextI ? { ...c, srcStart: a } : c));
      continue;
    }
    const idx = out.findIndex((c) => c.srcStart >= b - EPS);
    const nb = make(a, b);
    out = idx < 0 ? [...out, nb] : [...out.slice(0, idx), nb, ...out.slice(idx)];
  }
  return out;
}

/** Delete clip (by id). */
export function deleteClipById<T extends Clip & { id: string }>(clips: T[], id: string): ClipEdit<T> {
  const i = clips.findIndex((c) => c.id === id);
  if (i < 0) return { clips, removed: null };
  const sp = spans(clips)[i]!;
  return { clips: clips.filter((_, j) => j !== i), removed: [sp.editedStart, sp.editedEnd] };
}

/* ============================ Block compression (edited time) ============================ */

interface Timed {
  startSec: number;
  durationSec: number;
}

/**
 * Erase range [a,b) from the edited timeline and compress: blocks before it stay, blocks after shift left by (b-a),
 * blocks spanning the range have the overlapping part cut off, blocks entirely inside the deleted range are dropped.
 */
export function removeEditedInterval<B extends Timed>(blocks: B[], a: number, b: number, minDur = 0.1): B[] {
  if (b - a <= 0) return blocks;
  const gap = b - a;
  const out: B[] = [];
  for (const blk of blocks) {
    const s = blk.startSec;
    const e = blk.startSec + blk.durationSec;
    if (e <= a) {
      out.push(blk); // entirely before
    } else if (s >= b) {
      out.push({ ...blk, startSec: s - gap }); // entirely after → shift left
    } else {
      // spans/inside the deleted range: keep the part outside, compress
      const keptBefore = Math.max(0, a - s);
      const keptAfter = Math.max(0, e - b);
      const newDur = keptBefore + keptAfter;
      if (newDur < minDur) continue; // basically all inside the deleted range → drop
      out.push({ ...blk, startSec: Math.min(s, a), durationSec: newDur });
    }
  }
  return out;
}

/**
 * Pause-tightening margin math (shared by cut_narration's two executors and the cleanup eval):
 * the agent passes FULL gap ranges + keepGapSec, and the tool leaves the breathing room — the
 * model never does boundary arithmetic (mature cut planners keep their 60/150/320ms kept-gap
 * in code the same way). Each range shrinks symmetrically by keepGapSec/2 per side; ranges that
 * would drop below minCut seconds are removed entirely (the gap is already tight enough).
 */
export function tightenCutRanges(
  ranges: { from: number; to: number }[],
  keepGapSec: number,
  minCut = 0.1,
): { from: number; to: number }[] {
  const half = Math.min(Math.max(keepGapSec, 0), 1.5) / 2;
  if (half <= 0) return ranges.filter((r) => r.to - r.from >= minCut);
  return ranges
    .map((r) => ({ from: r.from + half, to: r.to - half }))
    .filter((r) => r.to - r.from >= minCut);
}

/** Seconds of a source-clock range [s,e] surviving the current edit, summed over clips matching `pred`. */
export function aliveDurWhere(clips: { srcStart: number; srcEnd: number }[], pred: (c: never) => boolean, s: number, e: number): number {
  let d = 0;
  for (const c of clips) if (pred(c as never)) d += Math.max(0, Math.min(c.srcEnd, e) - Math.max(c.srcStart, s));
  return d;
}

/** One dead-air region in the narration. `after` = the row it follows (-1 = recording head);
 *  `wi` present = a pause INSIDE row `after`, sitting after that word. Edges (pre-roll head /
 *  post-roll tail) are tagged — cut policy treats them asymmetrically. */
export interface NarrationGap {
  after: number;
  wi?: number;
  a: number;
  b: number;
  edge?: 'head' | 'tail';
}

/**
 * The ONE dead-air inventory for the narration — the script panel, the browser transcript and the
 * offline transcript all enumerate silence through here. Two implementations of "where is the dead
 * air" is exactly how the agent and the panel end up disagreeing about the same recording.
 * Inter-sentence gaps, mid-sentence stalls (TRUE word timestamps only — estimated ones interpolate
 * and would invent gaps), the pre-roll head, and — when the recording length is known — the
 * post-roll tail; everything at `minPauseSec` (0.8s: shorter is speech rhythm, not dead air).
 */
export function narrationGaps(
  segs: { start: number; end: number; words?: { start: number; end: number }[] }[],
  videoDurationSec?: number,
  minPauseSec = 0.8,
): NarrationGap[] {
  if (!segs.length) return [];
  const out: NarrationGap[] = [];
  const add = (g: NarrationGap) => {
    if (g.b - g.a >= minPauseSec) out.push(g);
  };
  add({ after: -1, a: 0, b: segs[0]!.start, edge: 'head' });
  segs.forEach((seg, i) => {
    const words = seg.words;
    if (words?.length) for (let k = 0; k < words.length - 1; k++) add({ after: i, wi: k, a: words[k]!.end, b: words[k + 1]!.start });
    if (i < segs.length - 1) add({ after: i, a: seg.end, b: segs[i + 1]!.start });
  });
  if (videoDurationSec != null && videoDurationSec > 0) add({ after: segs.length - 1, a: segs[segs.length - 1]!.end, b: videoDurationSec, edge: 'tail' });
  return out;
}

/**
 * Per-row edit-state marks for the narration transcript — the transcript the agent reads must be
 * the CURRENT truth, not the immutable source table (an agent that re-reads after cutting and sees
 * a pristine script is blind: it re-issues the same ranges and reports numbers the editor can't
 * show). Rows keep their stable source timestamps for addressing; these marks carry what happened:
 *  - prefix: '[REMOVED] ' when a sentence no longer survives, '[partly cut, X.Xs kept] ' when part does;
 *  - gapNote: dead air from the narrationGaps inventory, with its tightened state — the agent reads
 *    dead air from here instead of doing its own row arithmetic, and never re-cuts one already
 *    marked. Inner pauses carry their exact source range (sentence timestamps can't locate them).
 *  - head/tail: the recording's pre-roll and post-roll silence as their own lines — without them
 *    the agent can see every gap except the two the cleanup guide tells it to check first.
 * Empty clips (virgin timeline, no shots yet) = gap positions still noted, no cut state.
 */
export function narrationRowMarks(
  segs: { start: number; end: number; words?: { start: number; end: number }[] }[],
  clips: { srcStart: number; srcEnd: number }[],
  pred: (c: never) => boolean,
  videoDurationSec?: number,
): { rows: { prefix: string; gapNote: string }[]; head: string; tail: string } {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const edited = clips.length > 0;
  const gapState = (a: number, b: number): string => {
    if (!edited) return '';
    const kept = aliveDurWhere(clips, pred, a, b);
    return kept < 0.8 ? ` — CUT, ${r1(kept)}s kept` : '';
  };
  const noteOf = (g: NarrationGap): string =>
    g.edge
      ? `(+${r1(g.b - g.a)}s dead air at the ${g.edge}, ${r1(g.a)}–${r1(g.b)}s${gapState(g.a, g.b)})`
      : g.wi != null
        ? `${r1(g.b - g.a)}s pause inside at ${r1(g.a)}–${r1(g.b)}s${gapState(g.a, g.b)}`
        : `+${r1(g.b - g.a)}s gap after${gapState(g.a, g.b)}`;
  const gaps = narrationGaps(segs, videoDurationSec);
  const byRow = new Map<number, string[]>();
  let head = '';
  let tail = '';
  for (const g of gaps) {
    if (g.edge === 'head') head = noteOf(g);
    else if (g.edge === 'tail') tail = noteOf(g);
    else byRow.set(g.after, [...(byRow.get(g.after) ?? []), noteOf(g)]);
  }
  const rows = segs.map((seg, i) => {
    const alive = edited ? aliveDurWhere(clips, pred, seg.start, seg.end) : seg.end - seg.start;
    const dur = seg.end - seg.start;
    const prefix = alive < 0.05 ? '[REMOVED] ' : dur - alive > 0.3 ? `[partly cut, ${r1(alive)}s kept] ` : '';
    const notes = byRow.get(i);
    return { prefix, gapNote: notes?.length ? ` (${notes.join('; ')})` : '' };
  });
  return { rows, head, tail };
}

/** One removed interval as recorded DURING a back-to-front multi-cut (positions are pre-removal
 *  edited seconds at the moment that cut was applied), plus an optional transcript snippet. */
export interface CutSeamEntry {
  at: number;
  len: number;
  text?: string;
}

/**
 * Final seam positions after a back-to-front multi-cut. Ranges are removed in descending order so
 * each recorded position is exact at its own removal — but every EARLIER cut applied afterwards
 * shifts it left by that cut's length. The receipt must speak the final timeline (the one the user
 * scrubs), so: seam = recorded position − total length of removed intervals earlier in the timeline.
 */
export function finalizeCutSeams(entries: CutSeamEntry[]): { atSec: number; removedSec: number; text?: string }[] {
  return entries
    .map((e) => ({
      atSec: Math.round((e.at - entries.reduce((a, o) => a + (o.at < e.at ? o.len : 0), 0)) * 10) / 10,
      removedSec: Math.round(e.len * 10) / 10,
      ...(e.text ? { text: e.text } : {}),
    }))
    .sort((a, b) => a.atSec - b.atSec);
}
