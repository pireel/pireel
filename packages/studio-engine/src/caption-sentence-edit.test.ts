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

  it('字幕未生成时拒绝伪造分段', () => {
    const document = documentWithCues();
    document.timeline.tracks.find((track) => track.id === 'captions')!.clips = [];
    expect(resolveCaptionSentenceEdits(document, 'asset-main', [{ index: 2, text: '修正' }])).toMatchObject({ ok: false });
  });
});
