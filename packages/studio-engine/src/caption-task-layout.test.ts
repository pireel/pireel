import { describe, expect, it } from 'vitest';
import { buildCaptionTaskDocument, captionTaskCanvas, captionTaskStyle, captionTaskSafeArea, fitCaptionTaskBilingualStyle, fitCaptionTaskDocumentLayout, type CaptionTaskOptions } from './caption-task';
import { assembleHtml, projectDocumentToComposition } from './composition';
import { captionLineSegments } from './caption-layout-metrics';
import { wordsFromText } from './caption-fx';
import { getCaptionPreset } from './caption-presets';
const options: CaptionTaskOptions = { layoutVersion: 2, presetId: 'clean', aspect: 'original', shortenPauses: false };
const portrait = { width: 1080, height: 1920 };
const landscape = { width: 1920, height: 1080 };
const transcript = [{ text: 'Hello world', start: 0, end: 3, words: [{ text: 'Hello', start: 0, end: 1 }, { text: 'world', start: 1, end: 3 }] }];
const input = { projectId: 'layout', sourceUrl: 'blob:source', sourceSig: 'sig', ...portrait, durationSec: 4, transcript, options };
describe('caption layout recommendations', () => {
  it.each([portrait, landscape, { width: 1080, height: 1080 }])('keeps output font size consistent for %j', (source) => {
    const canvas = captionTaskCanvas('original', source);
    const style = captionTaskStyle({ ...options, translationLanguage: 'English' }, source);
    const exportScale = 1080 / Math.min(canvas.width, canvas.height);
    expect(Math.round(48 * style.scale!) * exportScale).toBeCloseTo(64, 0);
    expect(Math.round(48 * style.sub!.scale!) * exportScale).toBeCloseTo(48, 0);
    const safe = captionTaskSafeArea(source);
    expect(style.xPct! - style.wPct! / 2).toBeGreaterThanOrEqual(safe.left);
    expect(style.xPct! + style.wPct! / 2).toBeLessThanOrEqual(safe.right);
    expect(style.sub!.yPct).toBe(safe.bottom - 1);
  });
  it('raises the original for a wrapped translation while keeping the group bottom fixed', () => {
    const text = '这是一段比较长的中文译文，需要换成多行，但是不能盖住原文，也不能继续向底部的平台按钮区域伸展。';
    const style = captionTaskStyle({ ...options, translationLanguage: '中文' }, portrait);
    const fitted = fitCaptionTaskBilingualStyle(style, portrait, [text]);
    const fs = Math.round(48 * fitted.sub!.scale!);
    const lines = captionLineSegments(wordsFromText(text, 0, 1), getCaptionPreset('ln-clean'), fitted.wPct!, fitted.sub!.scale!, portrait.width, { font: 'sans' });
    expect(lines.length).toBeGreaterThan(1);
    const height = lines.length * fs * 1.35 + (lines.length - 1) * Math.round(fs * .15);
    const subTop = fitted.sub!.yPct! / 100 * portrait.height - height;
    expect(fitted.yPct! / 100 * portrait.height + Math.round(64 * .2)).toBeCloseTo(subTop, 4);
    expect(fitted.yPct).toBeLessThan(style.yPct!); expect(fitted.sub!.yPct).toBe(74);
  });
  it('stores measured bilingual positions in the exported native document', () => {
    const sub = '这是一段比较长的中文译文，需要换成多行，并且保留完整的阅读空间。';
    const document = buildCaptionTaskDocument({ ...input, options: { ...options, translationLanguage: '中文' }, transcript: [{ ...transcript[0]!, sub, subLang: '中文' }] });
    expect(document.appearance.captionStyle?.sub?.yPct).toBe(74);
    expect(document.appearance.captionStyle?.yPct).toBeLessThan(70);
    const html = assembleHtml(projectDocumentToComposition(document));
    expect(html).toContain('font-size:64px'); expect(html).toContain('font-size:48px'); expect(html).toContain('bottom:26%');
    expect(html).not.toContain('data-caption-safe-area');
  });
  it('preserves legacy version geometry and explicit manual overrides', () => {
    const legacy = { ...options, layoutVersion: undefined };
    expect(captionTaskStyle(legacy)).toMatchObject({ yPct: 86, wPct: 84 });
    const document = buildCaptionTaskDocument({ ...input, options: legacy });
    expect(fitCaptionTaskDocumentLayout(document, legacy)).toBe(document);
    const custom = captionTaskStyle({ ...options, custom: { scale: 1.5, yPct: 80, wPct: 60, color: '#abcdef' } });
    expect(custom).toMatchObject({ scale: 1.5, yPct: 80, wPct: 60, color: '#abcdef' });
  });
});
