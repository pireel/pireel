import { selectedSpeechClips, type EditorDocumentV2, type SpeechTimelineClip } from '@pireel/studio-engine/composition';
import { joinWords, wordsFromText } from '@pireel/studio-engine/caption-fx';
import type { AsrSegment, WordDecoration } from '@pireel/studio-engine/build-blocks';
import type { CaptionCueEdit } from '@pireel/studio-engine/caption-document-edit';
import { wordMaskAt } from '@pireel/studio-engine/word-masks';
import { transcriptSectionRuns, type TranscriptSectionRun } from '@pireel/studio-engine/transcript-sections';
import type { TranscriptPause } from '@pireel/studio-engine/transcript-pauses';

export interface TranscriptToken {
  id: string;
  trackId: string;
  clipId: string;
  assetId: string;
  si: number;
  w0: number;
  w1: number;
  text: string;
  sourceStart: number;
  sourceEnd: number;
  startSec: number;
  endSec: number;
  speaker?: string;
  decoration?: WordDecoration;
  masked: boolean;
}

export function transcriptSourceRange(clip: SpeechTimelineClip, fps: number): [number, number] {
  const speed = clip.kind === 'audio' ? clip.properties.speed ?? 1 : 1;
  return [clip.sourceInSec, clip.sourceOutSec ?? clip.sourceInSec + clip.durationFrames / fps * speed];
}

export function transcriptTimelineTime(clip: SpeechTimelineClip, time: number, fps: number): number {
  const [from, to] = transcriptSourceRange(clip, fps);
  return (clip.startFrame + Math.min(1, Math.max(0, (time - from) / Math.max(0.001, to - from))) * clip.durationFrames) / fps;
}

/** Display copy carries its original word range. Corrected phrases stay atomic rather than
 * inventing word timestamps or proportionally guessing their source-word indexes. */
export function transcriptTokens(document: EditorDocumentV2): TranscriptToken[] {
  const fps = document.canvas.fps;
  const trackByClip = new Map(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, track.id] as const)));
  return selectedSpeechClips(document).flatMap((clip) => {
    const [from, to] = transcriptSourceRange(clip, fps);
    return (document.semantics.transcripts[clip.assetId] as AsrSegment[] ?? []).flatMap((segment, si) => {
      const words = segment.words?.length ? segment.words : wordsFromText(segment.text, segment.start, segment.end);
      const visible = (index: number) => {
        const word = words[index]!;
        const mid = (word.start + word.end) / 2;
        return mid >= from && mid < to;
      };
      const overrides = new Map(Object.entries(segment.cueTexts ?? {}).flatMap(([key, text]) => {
        const [w0, w1] = key.split(':').map(Number);
        if (!text.trim() || !Number.isInteger(w0) || !Number.isInteger(w1) || w0! < 0 || w1! < w0! || w1! >= words.length) return [];
        if (!Array.from({ length: w1! - w0! + 1 }, (_, i) => w0! + i).every(visible)) return [];
        return [[w0!, { w1: w1!, text }] as const];
      }));
      const tokens: TranscriptToken[] = [];
      for (let wi = 0; wi < words.length;) {
        if (!visible(wi)) { wi++; continue; }
        const override = overrides.get(wi);
        const end = override?.w1 ?? wi;
        const sourceStart = Math.max(from, words[wi]!.start);
        const sourceEnd = Math.min(to, words[end]!.end);
        const indexes = Array.from({ length: end - wi + 1 }, (_, i) => wi + i);
        const textMask = wordMaskAt(segment, wi)?.text;
        tokens.push({
          id: `${clip.id}:${si}:${wi}:${end}`, trackId: trackByClip.get(clip.id)!, clipId: clip.id, assetId: clip.assetId,
          si, w0: wi, w1: end, text: override?.text ?? textMask ?? words[wi]!.text,
          sourceStart, sourceEnd, startSec: transcriptTimelineTime(clip, sourceStart, fps), endSec: transcriptTimelineTime(clip, sourceEnd, fps),
          speaker: segment.speaker, decoration: indexes.map((index) => segment.wordDecorations?.[index]).find(Boolean),
          masked: indexes.some((index) => !!wordMaskAt(segment, index)),
        });
        wi = end + 1;
      }
      return tokens;
    });
  }).sort((a, b) => a.startSec - b.startSec || a.clipId.localeCompare(b.clipId) || a.si - b.si || a.w0 - b.w0);
}

export interface TranscriptParagraph extends TranscriptSectionRun {
  tokens: TranscriptToken[];
  items: Array<{ type: 'word'; token: TranscriptToken } | { type: 'pause'; pause: TranscriptPause }>;
}

/** Read the canonical section runs, then assign each token once by its real clip occurrence. */
export function transcriptParagraphs(document: EditorDocumentV2, tokens: TranscriptToken[], pauses: readonly TranscriptPause[] = []): TranscriptParagraph[] {
  const paragraphs = transcriptSectionRuns(selectedSpeechClips(document), document.canvas.fps)
    .map((run): TranscriptParagraph => ({ ...run, tokens: [], items: [] }));
  const owner = new Map(paragraphs.flatMap((paragraph) => paragraph.clipIds.map((id) => [id, paragraph] as const)));
  for (const token of tokens) owner.get(token.clipId)?.tokens.push(token);
  const byParagraph = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph] as const));
  for (const paragraph of paragraphs) paragraph.items = paragraph.tokens.map((token) => ({ type: 'word', token }));
  for (const pause of pauses) byParagraph.get(pause.paragraphId)?.items.push({ type: 'pause', pause });
  for (const paragraph of paragraphs) paragraph.items.sort((a, b) => (a.type === 'word' ? a.token.startSec : a.pause.startSec) - (b.type === 'word' ? b.token.startSec : b.pause.startSec));
  return paragraphs;
}

/** Speech provides meaning for a graphic placed in a pause; its placement remains the pause. */
export function transcriptPauseContext(pause: TranscriptPause, tokens: readonly TranscriptToken[]): { before: string; after: string } {
  return {
    before: joinWords(tokens.filter((token) => token.endSec <= pause.startSec + 1e-7).slice(-12).map((token) => token.text)),
    after: joinWords(tokens.filter((token) => token.startSec >= pause.endSec - 1e-7).slice(0, 12).map((token) => token.text)),
  };
}

/** Keep each source sentence separately editable, while committing a multi-sentence selection once. */
export function transcriptSelectionEdits(tokens: TranscriptToken[]): CaptionCueEdit[] {
  const groups: Array<{ tokens: TranscriptToken[]; last: TranscriptToken }> = [];
  for (const token of tokens) {
    const group = groups.at(-1);
    if (group && group.last.clipId === token.clipId && group.last.si === token.si && group.last.w1 + 1 === token.w0) {
      group.tokens.push(token); group.last = token;
    } else groups.push({ tokens: [token], last: token });
  }
  return groups.map(({ tokens: words, last }) => ({
    assetId: last.assetId, index: last.si, w0: words[0]!.w0, w1: last.w1, text: joinWords(words.map((token) => token.text)),
  }));
}

/** Binary lookup keeps playhead subscriptions cheap even for long transcripts. */
export function activeTranscriptTokenIndex(tokens: readonly { startSec: number; endSec: number }[], timeSec: number): number {
  let low = 0; let high = tokens.length - 1; let candidate = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (tokens[middle]!.startSec <= timeSec) { candidate = middle; low = middle + 1; }
    else high = middle - 1;
  }
  return candidate >= 0 && timeSec < tokens[candidate]!.endSec ? candidate : -1;
}
