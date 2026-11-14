import type { TranscriptSegment } from '@pireel/studio-engine/project-types';
import { narrativeTimelineRangesForAssetSourceRange, primaryNarrativeClips, type NarrativeTimelineRange } from './read-model';
import type { EditorDocumentV2 } from './types';

export interface NarrationSourceRange {
  fromSec: number;
  toSec: number;
}

export type NarrationTranscriptProtection = 'none' | 'all' | 'outside-candidates';

export interface NarrationCutPlanInput {
  assetId: string;
  sourceRanges: readonly NarrationSourceRange[];
  /** Use live transcript state when it has not yet been persisted into the document. */
  transcriptSegments?: readonly TranscriptSegment[];
  /**
   * `all` protects every spoken range (silence cleanup). `outside-candidates` permits the speech
   * explicitly selected for deletion but protects neighbouring words (semantic/word deletion).
   */
  transcriptProtection?: NarrationTranscriptProtection;
  /** Merge candidate cuts separated only by a short island containing no transcript speech. */
  bridgeSpeechlessIslandSec?: number;
  /** Absorb a short native-clip edge only when transcript protection allows it. */
  clipEdgeSnapSec?: number;
  minimumTimelineRangeSec?: number;
  /**
   * Keep the silence an edit left next to a cut point it chose: where a clip starts or ends inside the
   * source, the quiet run touching that edge is part of that edit (a breath, a beat before the next
   * line). Clip edges at the very start or end of the recording are raw footage and stay cuttable.
   */
  keepChosenEdges?: boolean;
}

export interface NarrationCutPlan {
  sourceRanges: NarrationSourceRange[];
  timelineRanges: NarrativeTimelineRange[];
}

const finiteRange = (range: NarrationSourceRange): boolean => (
  Number.isFinite(range.fromSec) && Number.isFinite(range.toSec) && range.toSec > range.fromSec
);

function transcriptSpeechRanges(segments: readonly TranscriptSegment[]): NarrationSourceRange[] {
  return segments.flatMap((segment) => (
    segment.words?.length
      ? segment.words.map((word) => ({ fromSec: word.start, toSec: word.end }))
      : [{ fromSec: segment.start, toSec: segment.end }]
  )).filter(finiteRange);
}

function subtractProtectedSpeech(
  ranges: readonly NarrationSourceRange[],
  speechRanges: readonly NarrationSourceRange[],
): NarrationSourceRange[] {
  const orderedSpeech = [...speechRanges].sort((left, right) => left.fromSec - right.fromSec);
  return ranges.flatMap((range) => {
    let fragments: NarrationSourceRange[] = [{ fromSec: range.fromSec, toSec: range.toSec }];
    for (const speech of orderedSpeech) {
      fragments = fragments.flatMap((fragment) => {
        if (speech.toSec <= fragment.fromSec + 0.001 || speech.fromSec >= fragment.toSec - 0.001) return [fragment];
        return [
          ...(speech.fromSec - fragment.fromSec > 0.001
            ? [{ fromSec: fragment.fromSec, toSec: Math.min(fragment.toSec, speech.fromSec) }]
            : []),
          ...(fragment.toSec - speech.toSec > 0.001
            ? [{ fromSec: Math.max(fragment.fromSec, speech.toSec), toSec: fragment.toSec }]
            : []),
        ];
      });
    }
    return fragments;
  });
}

function normalizeSourceRanges(
  ranges: readonly NarrationSourceRange[],
  speechRanges: readonly NarrationSourceRange[],
  bridgeSpeechlessIslandSec: number,
): NarrationSourceRange[] {
  const ordered = ranges
    .filter(finiteRange)
    .map((range) => ({ fromSec: range.fromSec, toSec: range.toSec }))
    .sort((left, right) => left.fromSec - right.fromSec || left.toSec - right.toSec);
  const normalized: NarrationSourceRange[] = [];
  for (const range of ordered) {
    const previous = normalized.at(-1);
    if (!previous) {
      normalized.push(range);
      continue;
    }
    const gapFrom = previous.toSec;
    const gapTo = range.fromSec;
    const overlaps = gapTo <= gapFrom + 1e-6;
    const shortSpeechlessIsland = gapTo - gapFrom <= bridgeSpeechlessIslandSec + 1e-6
      && !speechRanges.some((speech) => speech.fromSec < gapTo - 0.001 && speech.toSec > gapFrom + 0.001);
    if (overlaps || shortSpeechlessIsland) previous.toSec = Math.max(previous.toSec, range.toSec);
    else normalized.push(range);
  }
  return normalized;
}

/** Candidate silences without the quiet run touching a cut point an edit chose (keepChosenEdges). */
function withoutChosenEdgeAir(document: EditorDocumentV2, assetId: string, ranges: readonly NarrationSourceRange[]): NarrationSourceRange[] {
  const length = document.assets[assetId]?.metadata.durationSec;
  const edge = 0.05;
  const starts: number[] = [];
  const ends: number[] = [];
  for (const clip of primaryNarrativeClips(document)) {
    if (clip.assetId !== assetId || !clip.enabled) continue;
    if (clip.sourceInSec > edge) starts.push(clip.sourceInSec);
    const out = clip.sourceOutSec;
    if (typeof out === 'number' && (length == null || out < length - edge)) ends.push(out);
  }
  return ranges.flatMap((range) => {
    let { fromSec, toSec } = range;
    // A run from a clip's chosen start into the clip: only the part before the start may go.
    for (const at of starts) if (fromSec <= at + edge && toSec > at) toSec = Math.min(toSec, at);
    // A run reaching a clip's chosen end: only the part after the end may go.
    for (const at of ends) if (fromSec < at && toSec >= at - edge) fromSec = Math.max(fromSec, at);
    return toSec > fromSec ? [{ fromSec, toSec }] : [];
  });
}

/**
 * The single source-clock policy for narration cleanup. Detection tools provide candidates; this
 * planner normalizes them, protects transcript speech, absorbs safe clip-edge slivers, and maps the
 * result onto every surviving occurrence on the native timeline.
 */
export function planNarrationCuts(
  document: EditorDocumentV2,
  input: NarrationCutPlanInput,
): NarrationCutPlan {
  const transcriptSegments = input.transcriptSegments
    ?? document.semantics.transcripts[input.assetId]
    ?? [];
  const speechRanges = transcriptSpeechRanges(transcriptSegments);
  const requestedBridge = Number.isFinite(input.bridgeSpeechlessIslandSec)
    ? Math.max(0, input.bridgeSpeechlessIslandSec ?? 0)
    : 0;
  // Without transcript evidence, fail closed rather than erasing a genuine short utterance.
  const bridgeSpeechlessIslandSec = speechRanges.length ? requestedBridge : 0;
  const protection = input.transcriptProtection ?? 'none';
  const candidates = input.keepChosenEdges ? withoutChosenEdgeAir(document, input.assetId, input.sourceRanges.filter(finiteRange)) : input.sourceRanges;
  const protectedCandidates = protection === 'all'
    ? subtractProtectedSpeech(candidates.filter(finiteRange), speechRanges)
    : candidates;
  const sourceRanges = normalizeSourceRanges(protectedCandidates, speechRanges, bridgeSpeechlessIslandSec);
  const clipEdgeSnapSec = Number.isFinite(input.clipEdgeSnapSec)
    ? Math.max(0, input.clipEdgeSnapSec ?? 0)
    : 0;
  const minimumTimelineRangeSec = Number.isFinite(input.minimumTimelineRangeSec)
    ? Math.max(0, input.minimumTimelineRangeSec ?? 0.05)
    : 0.05;
  const timelineRanges = sourceRanges.flatMap((range) => {
    const protectedSourceRanges = protection === 'none'
      ? []
      : protection === 'all'
        ? speechRanges
        : speechRanges.filter((speech) => !(
          speech.fromSec >= range.fromSec - 0.02 && speech.toSec <= range.toSec + 0.02
        ));
    return narrativeTimelineRangesForAssetSourceRange(
      document,
      input.assetId,
      range.fromSec,
      range.toSec,
      { clipEdgeSnapSec, protectedSourceRanges },
    );
  }).filter((range) => range.toSec - range.fromSec > minimumTimelineRangeSec)
    .sort((left, right) => right.fromSec - left.fromSec);
  return { sourceRanges, timelineRanges };
}

/**
 * The pauses of a recording as its transcript shows them: the gaps between one word's end and the
 * next word's start that last at least `minimumPauseSec`, each shortened by `speechPaddingSec` at
 * both ends so the words keep their air. Less exact than listening (word edges are the
 * recognizer's), so it stands in only when the sound itself could not be analysed.
 */
export function transcriptPauseRanges(
  segments: readonly TranscriptSegment[],
  options: { minimumPauseSec: number; speechPaddingSec: number },
): NarrationSourceRange[] {
  const words = transcriptSpeechRanges(segments).sort((left, right) => left.fromSec - right.fromSec);
  const out: NarrationSourceRange[] = [];
  let spokenUntil = words[0]?.toSec ?? 0;
  for (const word of words.slice(1)) {
    if (word.fromSec - spokenUntil >= options.minimumPauseSec) {
      const range = { fromSec: spokenUntil + options.speechPaddingSec, toSec: word.fromSec - options.speechPaddingSec };
      if (range.toSec - range.fromSec > 0.05) out.push(range);
    }
    spokenUntil = Math.max(spokenUntil, word.toSec);
  }
  return out;
}

/**
 * The pauses still in the edit: inside each story clip of a recording, the gaps between words that
 * last at least `overSec`. What a pause trim is judged by: a step that ran and left minutes of dead
 * air did not do its work, whatever it reported.
 */
export function pausesLeftInEdit(document: EditorDocumentV2, assetId: string, overSec: number): { count: number; totalSec: number; longestSec: number } {
  const words = transcriptSpeechRanges((document.semantics.transcripts[assetId] ?? []) as TranscriptSegment[]).sort((left, right) => left.fromSec - right.fromSec);
  const left = { count: 0, totalSec: 0, longestSec: 0 };
  for (const clip of primaryNarrativeClips(document)) {
    if (clip.assetId !== assetId || clip.enabled === false) continue;
    let spokenUntil: number | null = null;
    for (const word of words) {
      if (word.toSec <= clip.sourceInSec || word.fromSec >= clip.sourceOutSec) continue;
      const gap = spokenUntil === null ? 0 : word.fromSec - spokenUntil;
      if (gap >= overSec) { left.count += 1; left.totalSec += gap; left.longestSec = Math.max(left.longestSec, gap); }
      spokenUntil = Math.max(spokenUntil ?? 0, word.toSec);
    }
  }
  return { count: left.count, totalSec: Math.round(left.totalSec * 10) / 10, longestSec: Math.round(left.longestSec * 10) / 10 };
}

/** A remnant is shorter than this, in seconds. */
const SLIVER_MAX_SEC = 0.5;
/** How far a word's recognised edge may sit outside a clip and the word still count as inside it. */
const SLIVER_WORD_EDGE_SEC = 0.03;
/** Source seconds two neighbouring clips may be apart and still play on as one. */
const SLIVER_JOIN_SEC = 0.05;

/**
 * What cuts left between them on the story spine: a clip under half a second that plays no whole
 * word, with a cut on both sides. Two cuts made apart (a pause trimmed, then a retake removed next to
 * it) leave a frame or a few of the word one of them took: the tail of "做。", the first instant of
 * the next sentence. It is heard as a click, and seen as a flash. Returned as timeline frame
 * ranges, ready to be cut out.
 *
 * Left alone: a clip that plays a whole word however short, one that continues its neighbour (a
 * split made on purpose), and any clip of a recording whose transcript has no word timing.
 */
export function spineSlivers(document: EditorDocumentV2): { clipId: string; startFrame: number; endFrame: number }[] {
  const fps = document.canvas.fps;
  const spine = primaryNarrativeClips(document).filter((clip) => clip.enabled !== false);
  const wordsOf = new Map<string, NarrationSourceRange[] | null>();
  const words = (assetId: string) => {
    if (!wordsOf.has(assetId)) {
      const segments = (document.semantics.transcripts[assetId] ?? []) as TranscriptSegment[];
      wordsOf.set(assetId, segments.length && segments.every((segment) => segment.words?.length) ? transcriptSpeechRanges(segments) : null);
    }
    return wordsOf.get(assetId)!;
  };
  const out: { clipId: string; startFrame: number; endFrame: number }[] = [];
  spine.forEach((clip, index) => {
    if (clip.durationFrames / fps >= SLIVER_MAX_SEC) return;
    const timed = words(clip.assetId);
    if (!timed) return;
    const before = spine[index - 1];
    const after = spine[index + 1];
    const joinsBefore = !!before && before.assetId === clip.assetId && Math.abs(before.sourceOutSec - clip.sourceInSec) <= SLIVER_JOIN_SEC;
    const joinsAfter = !!after && after.assetId === clip.assetId && Math.abs(after.sourceInSec - clip.sourceOutSec) <= SLIVER_JOIN_SEC;
    if (joinsBefore || joinsAfter) return;
    const wholeWord = timed.some((word) => word.fromSec >= clip.sourceInSec - SLIVER_WORD_EDGE_SEC && word.toSec <= clip.sourceOutSec + SLIVER_WORD_EDGE_SEC);
    if (wholeWord) return;
    out.push({ clipId: clip.id, startFrame: clip.startFrame, endFrame: clip.startFrame + clip.durationFrames });
  });
  return out;
}
