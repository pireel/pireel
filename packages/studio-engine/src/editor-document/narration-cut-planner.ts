import type { TranscriptSegment } from '../project-dto';
import { narrativeTimelineRangesForAssetSourceRange, type NarrativeTimelineRange } from './read-model';
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
  const protectedCandidates = protection === 'all'
    ? subtractProtectedSpeech(input.sourceRanges.filter(finiteRange), speechRanges)
    : input.sourceRanges;
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
