import { describe, expect, it } from 'vitest';
import { applyEditorCommand, emptyEditorDocumentV2, timelineSpeechRangesForAsset, type EditorDocumentV2 } from './editor-document';
import { transcriptPauses, transcriptPauseCuts, type TranscriptPause } from './transcript-pauses';
import { transcriptSectionRuns, isTranscriptSourceClip } from './transcript-sections';

function fixture(fps = 100): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps });
  document.assets.voice = { id: 'voice', kind: 'video', locator: { remoteUrl: 'https://media.test/talk.mp4' }, metadata: { durationSec: 4 } };
  document.timeline.tracks[0]!.clips = [{ id: 'take', kind: 'narrative', assetId: 'voice', startFrame: 0, durationFrames: 4 * fps, enabled: true, sourceInSec: 0, sourceOutSec: 4, properties: { treatment: 'full' } }];
  document.semantics.transcripts.voice = [{ start: 0, end: 4, text: '你好世界', words: [
    { text: '你好', start: 0.2, end: 0.4 }, { text: '世界', start: 0.59, end: 3.7 },
  ] }];
  return document;
}

function removePause(document: EditorDocumentV2, pause: TranscriptPause): EditorDocumentV2 {
  const ranges = transcriptPauseCuts(pause).flatMap((cut) => timelineSpeechRangesForAsset(document, cut.trackId, cut.assetId, cut.range[0], cut.range[1], cut.clipId).map((range) => ({ ...range, trackId: cut.trackId })));
  let next = document;
  for (const range of ranges.sort((a, b) => b.startFrame - a.startFrame)) {
    const result = applyEditorCommand(next, { type: 'range.remove', trackId: range.trackId, startFrame: range.startFrame, endFrame: range.endFrame, mode: 'ripple' });
    if (!result.ok) throw new Error(result.error.message);
    next = result.document;
  }
  return next;
}

describe('manual transcript pause markers', () => {
  it('marks measured word gaps and speech head/tail gaps, including short pauses', () => {
    const pauses = transcriptPauses(fixture());
    expect(pauses.map((pause) => [pause.startSec, pause.endSec])).toEqual([[0, 0.2], [0.4, 0.59], [3.7, 4]]);
    expect(transcriptPauseCuts(pauses[1]!)[0]!.range).toEqual([0.4, 0.59]);
  });

  it('removes only the selected pause and keeps the surviving fragments in one section', () => {
    const document = fixture();
    const cleaned = removePause(document, transcriptPauses(document)[1]!);
    expect(cleaned.timeline.tracks[0]!.clips).toHaveLength(2);
    expect(transcriptSectionRuns(cleaned.timeline.tracks[0]!.clips.filter(isTranscriptSourceClip), 100)).toHaveLength(1);
    expect(transcriptPauses(cleaned).map((pause) => Number((pause.endSec - pause.startSec).toFixed(2)))).toEqual([0.2, 0.3]);
    expect(cleaned.semantics.transcripts).toEqual(document.semantics.transcripts);
    expect(transcriptPauses(document)).toHaveLength(3); // original document remains an undo snapshot
  });

  it('does not invent word-level gaps when timestamps are estimated from a sentence', () => {
    const document = fixture();
    document.semantics.transcripts.voice = [{ start: 0, end: 4, text: '这是只有句子时间的字幕稿' }];
    expect(transcriptPauses(document)).toEqual([]);
  });

  it('measures display duration after retiming and maps deletion back to the source', () => {
    const document = fixture();
    const clip = document.timeline.tracks[0]!.clips[0]!;
    clip.durationFrames = 200;
    document.semantics.transcripts.voice![0]!.words![1]!.start = 0.78;
    const pause = transcriptPauses(document).find((item) => item.startSec === 0.2)!;
    expect(pause.endSec - pause.startSec).toBeCloseTo(0.19);
    expect(transcriptPauseCuts(pause)[0]!.range).toEqual([0.4, 0.78]);
  });

  it('combines surviving silence across cleanup cuts without resurrecting removed source time', () => {
    const document = fixture();
    document.semantics.transcripts.voice![0]!.words![1]!.start = 1.4;
    const cut = applyEditorCommand(document, { type: 'range.remove', trackId: document.semantics.primaryNarrativeTrackId, startFrame: 60, endFrame: 80, mode: 'ripple' });
    if (!cut.ok) throw new Error(cut.error.message);
    const pause = transcriptPauses(cut.document).find((item) => item.spans.length === 2)!;
    expect(pause.endSec - pause.startSec).toBeCloseTo(0.8);
    expect(transcriptPauseCuts(pause).map((item) => item.range)).toEqual([[0.4, 0.6], [0.8, 1.4]]);
    expect(transcriptPauses(removePause(cut.document, pause))).toHaveLength(2);
  });

  it('protects overlapping speech and snaps pause boundaries inward to video frames', () => {
    const document = fixture(30);
    document.semantics.transcripts.voice = [
      { start: 0, end: 2, text: 'first', words: [{ text: 'first', start: 0, end: 0.21 }, { text: 'end', start: 1.003, end: 4 }] },
      { start: 0.4, end: 0.8, text: 'overlap', words: [{ text: 'overlap', start: 0.4, end: 0.8 }] },
    ];
    const pauses = transcriptPauses(document);
    expect(pauses).toHaveLength(2);
    for (const pause of pauses) {
      const [start, end] = transcriptPauseCuts(pause)[0]!.range;
      expect(start).toBeGreaterThanOrEqual(0.21);
      expect(end).toBeLessThanOrEqual(1.003);
      expect(end <= 0.4 || start >= 0.8).toBe(true);
    }
  });
});
