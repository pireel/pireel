import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2, type CaptionTimelineClip } from './editor-document';
import { resolveCaptionSentenceEdits } from './caption-sentence-edit';

function documentWithCues() {
  const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
  document.semantics.managedCaptionTrackId = 'captions';
  const cue = (id: string, startFrame: number, wordStart: number, wordEnd: number): CaptionTimelineClip => ({
    id,
    kind: 'caption',
    startFrame,
    durationFrames: 30,
    enabled: true,
    managed: true,
    block: { templateId: 'caption', slots: {}, label: id },
    sourceRef: { assetId: 'asset-main', segmentIndex: 2, wordStart, wordEnd },
    anchor: { type: 'word', assetId: 'asset-main', segmentIndex: 2, wordIndex: wordStart, offsetFrames: 0 },
  });
  document.timeline.tracks.push({
    id: 'captions', type: 'caption', role: 'managedCaptions', name: 'Captions', muted: false, hidden: false,
    locked: false, syncLocked: true, stackOrder: 1, clips: [cue('a', 0, 0, 1), cue('b', 30, 2, 4)],
  });
  return document;
}

describe('resolveCaptionSentenceEdits', () => {
  it('Chat 整句改字只分配到现有 cue 范围，不创建新边界', () => {
    const result = resolveCaptionSentenceEdits(documentWithCues(), 'asset-main', [{ index: 2, text: '今天我们一起测试字幕编辑' }]);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.items.map(({ index, w0, w1 }) => ({ index, w0, w1 }))).toEqual([
      { index: 2, w0: 0, w1: 1 },
      { index: 2, w0: 2, w1: 4 },
    ]);
    expect(result.items.map((item) => item.text).join('')).toBe('今天我们一起测试字幕编辑');
  });

  it('a partly cut row keeps only its kept words\' share of the corrected sentence', () => {
    // Row: 你只需要 | 知道他 | 一般活跃在哪个圈子 — the middle words were cut, two cues remain.
    const document = documentWithCues();
    document.semantics.transcripts['asset-main'] = [{ start: 0, end: 1, text: '' }, { start: 1, end: 2, text: '' }, {
      start: 2, end: 6, text: '当然你不用说具体的去找到他你只需要知道他一般活跃在哪个圈子',
      words: [
        { text: '当然你不用说', start: 2, end: 2.6 }, { text: '具体的去找到他', start: 2.6, end: 3.3 },
        { text: '你只需要', start: 3.3, end: 3.8 }, { text: '知道他', start: 3.8, end: 4.2 }, { text: '一般活跃在哪个圈子', start: 4.2, end: 5.2 },
      ],
    }] as never;
    const track = document.timeline.tracks.find((candidate) => candidate.id === 'captions')!;
    const cue = track.clips[0] as CaptionTimelineClip;
    track.clips = [
      { ...cue, id: 'a', startFrame: 0, sourceRef: { ...cue.sourceRef!, wordStart: 2, wordEnd: 3 } },
      { ...cue, id: 'b', startFrame: 30, sourceRef: { ...cue.sourceRef!, wordStart: 4, wordEnd: 4 } },
    ];
    const result = resolveCaptionSentenceEdits(document, 'asset-main', [{ index: 2, text: '当然你不用说具体地去找到他，你只需要知道他一般活跃在哪个圈子' }]);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.items.map((item) => item.text)).toEqual(['你只需要知道他', '一般活跃在哪个圈子']);
  });

  it('字幕未生成时拒绝伪造分段', () => {
    const document = documentWithCues();
    document.timeline.tracks.find((track) => track.id === 'captions')!.clips = [];
    expect(resolveCaptionSentenceEdits(document, 'asset-main', [{ index: 2, text: '修正' }])).toMatchObject({ ok: false });
  });
});
