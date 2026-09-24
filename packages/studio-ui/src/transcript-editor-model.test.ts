import { describe, expect, it } from 'vitest';
import { emptyComposition, firstNarrativeAssetId, applyEditorCommand } from '@pireel/studio-engine/composition';
import { compositionToEditorDocument } from '@pireel/studio-engine/project-document';
import { applyCaptionDocumentEdit } from '@pireel/studio-engine/caption-document-edit';
import { activeTranscriptTokenIndex, transcriptTokens, transcriptSelectionEdits, transcriptParagraphs, transcriptPauseContext } from './transcript-editor-model';
import { transcriptPauses } from '@pireel/studio-engine/transcript-pauses';

function fixture() {
  const document = compositionToEditorDocument({ projectId: 'transcript-ui', videoSig: 'voice', composition: {
    ...emptyComposition(), video: { url: 'blob:voice', durationSec: 10 },
    shots: [{ id: 'voice-clip', srcStart: 0, srcEnd: 10, treatment: 'full' }],
  } }).document;
  const assetId = firstNarrativeAssetId(document)!;
  document.semantics.transcripts[assetId] = [
    { start: 0, end: 4, text: '你好世界。', words: [
      { text: '你好', start: 0.1, end: 0.3 }, { text: '世界。', start: 2, end: 3.8 },
    ] },
    { start: 4, end: 8, text: '这是第二句。', words: [
      { text: '这是', start: 4.1, end: 4.3 }, { text: '第二句。', start: 6.1, end: 7.8 },
    ] },
  ];
  return { document, assetId };
}

describe('continuous transcript editing', () => {
  it('uses surrounding speech as pause-graphic context without changing its timing window', () => {
    const { document } = fixture();
    const pause = transcriptPauses(document).find((item) => item.startSec > 0.2 && item.endSec <= 2)!;
    const before = structuredClone(pause);
    expect(transcriptPauseContext(pause, transcriptTokens(document))).toEqual({ before: '你好', after: '世界。这是第二句。' });
    expect(pause).toEqual(before);
  });
  it('keeps exact word addresses and irregular timestamps instead of splitting display cues', () => {
    const { document, assetId } = fixture();
    expect(transcriptTokens(document).map(({ text, startSec, endSec, w0, assetId: owner }) => ({ text, startSec, endSec, w0, owner }))).toEqual([
      { text: '你好', startSec: 0.1, endSec: 0.3, w0: 0, owner: assetId },
      { text: '世界。', startSec: 2, endSec: 3.8, w0: 1, owner: assetId },
      { text: '这是', startSec: 4.1, endSec: 4.3, w0: 0, owner: assetId },
      { text: '第二句。', startSec: 6.1, endSec: 7.8, w0: 1, owner: assetId },
    ]);
  });

  it('commits a selection across sentences together and shows the corrected text immediately', () => {
    const { document, assetId } = fixture();
    const edits = transcriptSelectionEdits(transcriptTokens(document).slice(1, 3));
    expect(edits).toEqual([
      { assetId, index: 0, w0: 1, w1: 1, text: '世界。' },
      { assetId, index: 1, w0: 0, w1: 0, text: '这是' },
    ]);
    const result = applyCaptionDocumentEdit({ document, mainTranscript: null, clipTranscripts: {}, cueEdits: edits.map((edit, index) => ({ ...edit, text: index ? '这里是' : '朋友。' })) });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(transcriptTokens(result.document).map((token) => token.text)).toEqual(['你好', '朋友。', '这里是', '第二句。']);
    expect(result.document.semantics.transcripts[assetId]![0]!.words).toEqual(document.semantics.transcripts[assetId]![0]!.words);
  });

  it('keeps a corrected phrase attached to its full original word range and its highlight', () => {
    const { document, assetId } = fixture();
    document.semantics.transcripts[assetId]![0] = { ...document.semantics.transcripts[assetId]![0]!, cueTexts: { '0:1': '大家好。' }, wordDecorations: { '0': { highlight: 'color', color: '#C6FF48' } } };
    expect(transcriptTokens(document)[0]).toMatchObject({ text: '大家好。', w0: 0, w1: 1, startSec: 0.1, endSec: 3.8, decoration: { highlight: 'color', color: '#C6FF48' } });
    expect(transcriptSelectionEdits(transcriptTokens(document).slice(0, 1))[0]).toMatchObject({ assetId, index: 0, w0: 0, w1: 1, text: '大家好。' });
  });

  it('follows the actual edited timeline after removing a spoken range', () => {
    const { document } = fixture();
    const trackId = document.semantics.primaryNarrativeTrackId!;
    const result = applyEditorCommand(document, { type: 'range.remove', trackId, startFrame: 0, endFrame: 30, mode: 'ripple', includeLinked: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(transcriptTokens(result.document)[0]).toMatchObject({ text: '世界。', w0: 1, startSec: 1, endSec: 2.8 });
  });

  it('keeps cleanup fragments in one displayed paragraph while explicit splits create two', () => {
    const { document } = fixture();
    const trackId = document.semantics.primaryNarrativeTrackId!;
    const cleaned = applyEditorCommand(document, { type: 'range.remove', trackId, startFrame: 30, endFrame: 45, mode: 'ripple' });
    if (!cleaned.ok) throw new Error(cleaned.error.message);
    const words = transcriptTokens(cleaned.document);
    expect(transcriptParagraphs(cleaned.document, words)).toHaveLength(1);
    expect(transcriptParagraphs(cleaned.document, words)[0]!.tokens).toEqual(words);
    const divided = applyEditorCommand(cleaned.document, { type: 'clip.split', trackId, clipId: 'voice-clip', atFrame: 15 });
    if (!divided.ok) throw new Error(divided.error.message);
    expect(transcriptParagraphs(divided.document, transcriptTokens(divided.document))).toHaveLength(2);
  });

  it('reorders the text into separate sections without losing source word addresses', () => {
    const { document } = fixture();
    const trackId = document.semantics.primaryNarrativeTrackId!;
    const cleaned = applyEditorCommand(document, { type: 'range.remove', trackId, startFrame: 30, endFrame: 45, mode: 'ripple' });
    if (!cleaned.ok) throw new Error(cleaned.error.message);
    const ids = cleaned.document.timeline.tracks.find((track) => track.id === trackId)!.clips.map((clip) => clip.id);
    const moved = applyEditorCommand(cleaned.document, { type: 'narrative.reorder', clipIds: ids.reverse() });
    if (!moved.ok) throw new Error(moved.error.message);
    const paragraphs = transcriptParagraphs(moved.document, transcriptTokens(moved.document));
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs.flatMap((paragraph) => paragraph.tokens.map((token) => token.text))).toEqual(['世界。', '这是', '第二句。', '你好']);
    expect(paragraphs.at(-1)!.tokens[0]).toMatchObject({ si: 0, w0: 0, text: '你好' });
  });

  it('reads an older document with no section metadata safely', () => {
    const { document } = fixture();
    const paragraphs = transcriptParagraphs(document, transcriptTokens(document));
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]!.tokens.map((token) => token.text)).toEqual(['你好', '世界。', '这是', '第二句。']);
  });
});

describe('playback token lookup', () => {
  const tokens = [{ startSec: 0, endSec: 0.5 }, { startSec: 0.5, endSec: 1 }, { startSec: 2, endSec: 3 }];
  it('follows exact boundaries, silence, backward seeks and the end of the timeline', () => {
    expect([0, 0.49, 0.5, 1.5, 2.5, 0.2, 3].map(time => activeTranscriptTokenIndex(tokens, time))).toEqual([0, 0, 1, -1, 2, 0, -1]);
    expect(activeTranscriptTokenIndex([], 0)).toBe(-1);
  });
});
