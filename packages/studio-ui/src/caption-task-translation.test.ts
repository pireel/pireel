import { describe, expect, it, vi } from 'vitest';
import { buildCaptionTaskDocument } from '@pireel/studio-engine/caption-task';
import { assembleHtml, projectDocumentToComposition, firstNarrativeAssetId } from '@pireel/studio-engine/composition';
import { translateCaptionTask } from './caption-task-translation';
import type { CaptionTaskRecord } from './caption-task-store';

const task = (): CaptionTaskRecord => ({ id: 'task', scope: 'owner', name: 'video.mp4', sourceSig: 'source', width: 1080, height: 1920, durationSec: 6, stage: 'ready', updatedAt: 0,
  options: { presetId: 'clean', aspect: 'original', shortenPauses: false, translationLanguage: '中文' },
  transcript: [
    { text: 'Hello world', start: 0, end: 2, words: [{ text: 'Hello', start: 0, end: .8 }, { text: 'world', start: 1, end: 2 }] },
    { text: 'Good morning', start: 3, end: 5, words: [{ text: 'Good', start: 3, end: 3.8 }, { text: 'morning', start: 4, end: 5 }] },
  ],
});
const build = (source: CaptionTaskRecord) => buildCaptionTaskDocument({ ...source, projectId: source.id, sourceUrl: 'blob:video', transcript: source.transcript! });
const translate = () => vi.fn(async (rows: { index: number; text: string }[]) => rows.map((row) => ({ index: row.index, text: row.text === 'Hello world' ? '你好世界' : '早上好' })));

describe('standalone bilingual captions', () => {
  it('keeps originals and word timestamps, and includes translations in the native export', async () => {
    const original = task(); const snapshot = structuredClone(original); const document = build(original);
    const result = await translateCaptionTask(original, document, translate(), () => {});
    expect(original).toEqual(snapshot);
    expect(result.transcript[0]).toMatchObject({ ...original.transcript![0], cueSubs: { '0:1': '你好世界' }, subLang: '中文' });
    expect(result.document.semantics.transcripts[firstNarrativeAssetId(result.document)!]?.[0]?.cueSubs?.['0:1']).toBe('你好世界');
    const html = assembleHtml(projectDocumentToComposition(result.document)).replace(/<[^>]*>/g, '');
    expect(html).toContain('你好世界'); expect(html).toContain('Hello');
  });
  it('only translates retained speech, and reuses translations when just changing the style', async () => {
    const original = { ...task(), cuts: [{ fromSec: 3, toSec: 6 }] };
    const service = translate();
    const result = await translateCaptionTask(original, build(original), service, () => {});
    expect(service).toHaveBeenCalledWith([{ index: 0, text: 'Hello world' }], '中文');
    const restyled = { ...original, ...result, options: { ...original.options, presetId: 'cinema' } };
    await translateCaptionTask(restyled, build(restyled), service, () => {});
    expect(service).toHaveBeenCalledOnce();
    const changedLanguage = { ...restyled, options: { ...restyled.options, translationLanguage: '日本語' as const } };
    await translateCaptionTask(changedLanguage, build(changedLanguage), service, () => {});
    expect(service).toHaveBeenCalledTimes(2);
  });
  it('rejects incomplete or duplicate responses atomically and honours cancellation', async () => {
    const original = task(); const document = build(original); const snapshot = structuredClone(document);
    await expect(translateCaptionTask(original, document, async () => [{ index: 0, text: '部分' }], () => {})).rejects.toThrow('不完整');
    await expect(translateCaptionTask(original, document, async () => [{ index: 0, text: '一' }, { index: 0, text: '二' }], () => {})).rejects.toThrow('不完整');
    expect(document).toEqual(snapshot);
    const service = translate();
    await expect(translateCaptionTask(original, document, service, () => { throw new DOMException('Cancelled', 'AbortError'); })).rejects.toMatchObject({ name: 'AbortError' });
    expect(service).not.toHaveBeenCalled();
  });
  it('hides translations when bilingual captions are switched off', async () => {
    const original = task(); const result = await translateCaptionTask(original, build(original), translate(), () => {});
    const off = build({ ...original, ...result, options: { ...original.options, translationLanguage: undefined } });
    expect(off.appearance.captionStyle?.sub?.lang).toBeUndefined();
    expect(assembleHtml(projectDocumentToComposition(off)).replace(/<[^>]*>/g, '')).not.toContain('你好世界');
  });
  it('batches long projects with stable row IDs across requests', async () => {
    const original = { ...task(), durationSec: 252, transcript: Array.from({ length: 251 }, (_, index) => ({ text: `Sentence${index}`, start: index, end: index + .7, words: [{ text: `Sentence${index}`, start: index, end: index + .7 }] })) };
    const service = translate();
    const result = await translateCaptionTask(original, build(original), service, () => {});
    expect(service.mock.calls.map(([rows]) => rows.length)).toEqual([250, 1]);
    expect(service.mock.calls[1]![0][0]!.index).toBe(250);
    expect(result.transcript.every((segment) => segment.subLang === '中文')).toBe(true);
  });
});
