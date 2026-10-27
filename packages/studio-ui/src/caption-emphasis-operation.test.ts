import { describe, expect, it, vi } from 'vitest';
import { applyCaptionDocumentEdit, compositionToEditorDocument, emptyComposition, firstNarrativeAssetId, renderBlock } from '@pireel/studio-engine/composition';
import { applyCaptionTextEdits } from '@pireel/studio-engine/caption-text-edit';
import { emphasizeCaptionDocument } from './caption-emphasis-operation';

function fixture() {
  const composition = { ...emptyComposition(), video: { url: 'blob:test', durationSec: 4 }, shots: [{ id: 'shot', srcStart: 0, srcEnd: 4, treatment: 'full' as const }] };
  const document = compositionToEditorDocument({ projectId: 'caption-test', composition, videoSig: 'test' }).document;
  const edit = applyCaptionDocumentEdit({ document, patch: { on: true, preset: 'kw-yellow' }, mainTranscript: [{ text: '不是免费而是按次收费', start: 0, end: 3, words: ['不是', '免费', '而是', '按次', '收费'].map((text, i) => ({ text, start: i * .5, end: i * .5 + .4 })) }], clipTranscripts: {} });
  if (!edit.ok) throw new Error(edit.error.message);
  return edit.document;
}

describe('keyword emphasis document operation', () => {
  it('updates source annotations and rendered blocks together, then reuses the result without another model call', async () => {
    const document = fixture();
    const original = JSON.stringify(document);
    const select = vi.fn(async (rows: { index: number; text: string }[]) => rows.map((row) => ({ index: row.index, text: row.text.slice(0, 4) })));
    const after = await emphasizeCaptionDocument(document, select);
    const words = after.semantics.transcripts[firstNarrativeAssetId(after)!]![0]!.words!;
    expect(words.every((w) => w.emphasis === undefined)).toBe(true);
    expect(after.semantics.transcripts[firstNarrativeAssetId(after)!]![0]!.cueEmphasis).toEqual({ '0:4': { text: '不是免费而是按次收费', words: [0, 1] } });
    expect(JSON.stringify(document)).toBe(original);
    const captions = after.timeline.tracks.flatMap((track) => track.clips).filter((clip) => clip.kind === 'caption');
    expect(captions).not.toHaveLength(0);
    expect(captions[0]?.kind === 'caption' && renderBlock({ ...captions[0].block, id: captions[0].id, startSec: 0, durationSec: 3, trackIndex: 1 }).timelineBody).toContain('-w0 .t');
    expect(await emphasizeCaptionDocument(after, select)).toBe(after);
    expect(select).toHaveBeenCalledOnce();
  });
  it('invalidates edited copy emphasis and selects against the new display words without rewriting ASR', async () => {
    const select = vi.fn(async (rows: { index: number; text: string }[]) => rows.map((row) => ({ index: row.index, text: row.text.slice(0, 4) })));
    const before = await emphasizeCaptionDocument(fixture(), select);
    const asset = firstNarrativeAssetId(before)!;
    const text = '完全免费而不是按次收费';
    const changed = applyCaptionTextEdits(before.semantics.transcripts[asset]!, [{ index: 0, w0: 0, w1: 4, text }]);
    expect(changed[0]!.cueEmphasis).toBeUndefined();
    const edit = applyCaptionDocumentEdit({ document: before, mainTranscript: null, clipTranscripts: { [asset]: changed } });
    if (!edit.ok) throw new Error(edit.error.message);
    const after = await emphasizeCaptionDocument(edit.document, select);
    expect(select).toHaveBeenCalledTimes(2);
    expect(after.semantics.transcripts[asset]![0]!.text).toBe('不是免费而是按次收费');
    expect(after.semantics.transcripts[asset]![0]!.cueEmphasis!['0:4']!.text).toBe(text);
  });
  it('does not modify the document when the model call fails', async () => {
    const document = fixture(); const original = JSON.stringify(document);
    await expect(emphasizeCaptionDocument(document, async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(JSON.stringify(document)).toBe(original);
  });
  it('skips a phrase that is not in its line and keeps the rest', async () => {
    const after = await emphasizeCaptionDocument(fixture(), async () => [{ index: 0, text: '不存在' }, { index: 0, text: '按次收费' }, { index: 9, text: '免费' }]);
    expect(after.semantics.transcripts[firstNarrativeAssetId(after)!]![0]!.cueEmphasis!['0:4']!.words).toEqual([3, 4]);
  });
  it('refuses a locked caption lane', async () => {
    const document = fixture();
    document.timeline.tracks.find((track) => track.id === document.semantics.managedCaptionTrackId)!.locked = true;
    await expect(emphasizeCaptionDocument(document, async () => [])).rejects.toThrow();
  });
});
