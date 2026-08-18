import { describe, expect, it } from 'vitest';
import { PREVIEW_RUNTIME } from './sample-composition';

describe('preview runtime', () => {
  it('contains only syntactically valid inline scripts', () => {
    const scripts = [...PREVIEW_RUNTIME.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    expect(scripts).toHaveLength(2);
    for (const script of scripts) {
      expect(() => new Function(script)).not.toThrow();
    }
  });

  it('maps a resized generated component through its authored scene clock', () => {
    expect(PREVIEW_RUNTIME).toContain("num(el, 'data-authored-duration', d)");
    expect(PREVIEW_RUNTIME).toContain('local * authored / d');
  });

  it('moves component content live while preserving one-shot parent commits', () => {
    expect(PREVIEW_RUNTIME).toContain("nudge.el.style.translate = (nudge.bx + dx)");
    expect(PREVIEW_RUNTIME).toContain("sel2.style.translate = ''");
    expect(PREVIEW_RUNTIME).toContain("post({ type: 'boxDragEnd'");
  });

  it('keeps native media placement and selection on dedicated runtime channels', () => {
    expect(PREVIEW_RUNTIME).toContain("d.type === 'hf:mediaBox'");
    expect(PREVIEW_RUNTIME).toContain("d.type === 'hf:pickAt'");
    expect(PREVIEW_RUNTIME).toContain("post({ type: 'selectVisual', clipId:");
    expect(PREVIEW_RUNTIME).toContain("!el.hasAttribute('data-hf-visual-clip')");
  });

  it('resolves device-local image locators inside image and CSS slots', () => {
    expect(PREVIEW_RUNTIME).toContain("d.type === 'hf:imageFile'");
    expect(PREVIEW_RUNTIME).toContain("'pireel-local-image:' + encodeURIComponent");
    expect(PREVIEW_RUNTIME).toContain("document.querySelectorAll('img[src]')");
    expect(PREVIEW_RUNTIME).toContain("document.querySelectorAll('[style]')");
    expect(PREVIEW_RUNTIME).toContain("document.querySelectorAll('style')");
  });
});
