import { describe, expect, it } from 'vitest';
import { buildCaptionTaskDocument, captionTaskCanvas, storedCaptionTaskOptions } from './caption-task';
import { CAPTION_ART_PRESETS, CAPTION_STYLE_PRESETS } from './caption-presets';
import { assembleHtml, firstNarrativeAssetId, projectDocumentToComposition } from './composition';
const transcript = [{ text: 'Hello world', start: 0, end: 3, words: [{ text: 'Hello', start: 0, end: 1 }, { text: 'world', start: 2, end: 3 }] }];
const input = { projectId: 'test-captions', sourceName: 'test.mp4', sourceUrl: 'blob:video', sourceSig: 'test-sig', width: 1920, height: 1080, durationSec: 4, transcript, options: { caption: {}, aspect: 'portrait' as const, shortenPauses: false } };
describe('standalone caption documents', () => {
  it('produces native editable captions for every workbench preset', () => {
    for (const preset of [...CAPTION_ART_PRESETS, ...CAPTION_STYLE_PRESETS]) {
      const doc = buildCaptionTaskDocument({ ...input, options: { ...input.options, caption: { preset: preset.id } } });
      expect(doc.appearance.captionStyle?.preset).toBe(preset.id);
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
    const doc = buildCaptionTaskDocument({ ...input, options: { ...input.options, caption: { font: 'serif', color: '#abcdef', accentColor: '#00ccff', strokeColor: '#112233', strokeWidth: 3, scale: 1.5, bg: null, yPct: 70 } } });
    const html = assembleHtml(projectDocumentToComposition(doc));
    expect(doc.appearance.captionStyle).toMatchObject({ font: 'serif', strokeWidth: 3, yPct: 70 });
    expect(html).toContain('-webkit-text-stroke:4.5px #112233');
    expect(html).toContain('#00ccff'); expect(html).toContain('#abcdef');
  });
  it('reads options saved with the old scene preset shape', () => {
    const legacy = { presetId: 'keywords', layoutVersion: 2, custom: { color: '#abcdef', yPct: 70 }, aspect: 'original', shortenPauses: false } as unknown as Parameters<typeof storedCaptionTaskOptions>[0];
    expect(storedCaptionTaskOptions(legacy)).toEqual({ aspect: 'original', shortenPauses: false, caption: { color: '#abcdef', yPct: 70 }, highlights: true });
    const current = { ...input.options, caption: { preset: 'art-beast' } };
    expect(storedCaptionTaskOptions(current)).toBe(current);
  });
  it('keeps aspect ratios and rejects invalid input', () => {
    expect(captionTaskCanvas('square', input)).toEqual({ width: 1080, height: 1080 });
    expect(captionTaskCanvas('original', { width: 1080, height: 1920 })).toEqual({ width: 1080, height: 1920 });
    expect(() => captionTaskCanvas('original', { width: 0, height: 0 })).toThrow();
    expect(() => buildCaptionTaskDocument({ ...input, durationSec: NaN })).toThrow();
  });
});
