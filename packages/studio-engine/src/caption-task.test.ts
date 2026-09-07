import { describe, expect, it } from 'vitest';
import { buildCaptionTaskDocument, captionTaskCanvas, CAPTION_TASK_PRESETS } from './caption-task';
import { assembleHtml, firstNarrativeAssetId, projectDocumentToComposition } from './composition';
import { captionWordHighlighted } from './caption-canvas';
const transcript = [{ text: 'Hello world', start: 0, end: 3, words: [{ text: 'Hello', start: 0, end: 1 }, { text: 'world', start: 2, end: 3 }] }];
const input = { projectId: 'test-captions', sourceName: 'test.mp4', sourceUrl: 'blob:video', sourceSig: 'test-sig', width: 1920, height: 1080, durationSec: 4, transcript, options: { presetId: 'clean', aspect: 'portrait' as const, shortenPauses: false } };
describe('standalone caption documents', () => {
  it('produces native editable captions for every displayed preset', () => {
    for (const preset of CAPTION_TASK_PRESETS) {
      const doc = buildCaptionTaskDocument({ ...input, options: { ...input.options, presetId: preset.id } });
      expect(doc.canvas.width).toBe(1080); expect(doc.canvas.height).toBe(1920);
      expect(doc.semantics.managedCaptionTrackId).toBeTruthy();
      expect(doc.assets[firstNarrativeAssetId(doc)!]!.label).toBe('test.mp4');
    }
  });
  it('preserves source transcript timestamps when pauses change the output timeline', () => {
    const doc = buildCaptionTaskDocument({ ...input, cuts: [{ fromSec: 1, toSec: 2 }] });
    const comp = projectDocumentToComposition(doc);
    expect(comp.shots).toHaveLength(2);
    expect(doc.semantics.transcripts[firstNarrativeAssetId(doc)!]).toMatchObject(transcript);
    expect(comp.blocks.filter((block) => block.templateId === 'caption').at(-1)?.startSec).toBeLessThan(2);
  });
  it('carries custom colors, outline, font and position through to the export HTML', () => {
    const doc = buildCaptionTaskDocument({ ...input, options: { ...input.options, presetId: 'karaoke', custom: { font: 'serif', color: '#abcdef', accentColor: '#00ccff', strokeColor: '#112233', strokeWidth: 3, scale: 1.5, bg: null, yPct: 70 } } });
    const html = assembleHtml(projectDocumentToComposition(doc));
    expect(doc.appearance.captionStyle).toMatchObject({ font: 'serif', strokeWidth: 3, yPct: 70 });
    expect(html).toContain('-webkit-text-stroke:4.5px #112233');
    expect(html).toContain('#00ccff'); expect(html).toContain('#abcdef');
  });
  it('keeps aspect ratios and rejects invalid input', () => {
    expect(captionTaskCanvas('square', input)).toEqual({ width: 1080, height: 1080 });
    expect(captionTaskCanvas('original', { width: 1080, height: 1920 })).toEqual({ width: 1080, height: 1920 });
    expect(() => captionTaskCanvas('original', { width: 0, height: 0 })).toThrow();
    expect(() => buildCaptionTaskDocument({ ...input, durationSec: NaN })).toThrow();
  });
});
describe('Canvas caption animation state', () => {
  const words = [{ text: 'one', start: .1, end: .4 }, { text: 'two', start: 1, end: 2, emphasis: true }];
  it('holds the active word across short gaps and hands over at the next onset', () => {
    expect(captionWordHighlighted(words, 0, .7, false)).toBe(true);
    expect(captionWordHighlighted(words, 0, 1, false)).toBe(false);
    expect(captionWordHighlighted(words, 1, 1, false)).toBe(true);
  });
  it('keeps semantic emphasis distinct from follow-along and rejects estimated timing', () => {
    expect(captionWordHighlighted(words, 0, .3, true)).toBe(false);
    expect(captionWordHighlighted(words, 1, .3, true)).toBe(true);
    expect(captionWordHighlighted([{ ...words[0]!, timing: 'estimated' }], 0, .3, false)).toBe(false);
  });
});
