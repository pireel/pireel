import { describe, expect, it, vi } from 'vitest';
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

  it('keeps selected-media click-through hit testing inside the control runtime scope', () => {
    const scripts = [...PREVIEW_RUNTIME.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    const controlRuntime = scripts[0]!;
    const pickAt = controlRuntime.slice(controlRuntime.indexOf("d.type === 'hf:pickAt'"), controlRuntime.indexOf("d.type === 'hf:vidTimeline'"));

    expect(controlRuntime).toContain('function closestSelectableComp(el)');
    expect(pickAt).toContain('closestSelectableComp(pe)');
    expect(pickAt).toContain("fpost({ type: 'selectVisual'");
    expect(pickAt).toContain("fpost({ type: 'select'");
  });

  it('hot-swaps media motion timelines without replacing the media node or killing timeline-owned tweens', () => {
    const controlRuntime = [...PREVIEW_RUNTIME.matchAll(/<script>([\s\S]*?)<\/script>/g)][0]![1]!;
    const preview = controlRuntime.slice(
      controlRuntime.indexOf("d.type === 'hf:animPreview'"),
      controlRuntime.indexOf("d.type === 'hf:capStyle'"),
    );

    expect(controlRuntime).toContain("d.type === 'hf:blockTimeline'");
    expect(controlRuntime).toContain('animPreviewTweens[d.id]');
    expect(preview).not.toContain('killTweensOf(apT)');
  });

  it('forwards a selected-media click to the overlaid component hit inside the iframe', async () => {
    // @ts-expect-error jsdom is a test-only runtime dependency without declarations in this workspace.
    const { JSDOM } = await import('jsdom');
    const controlRuntime = [...PREVIEW_RUNTIME.matchAll(/<script>([\s\S]*?)<\/script>/g)][0]![1]!;
    const dom = new JSDOM(
      '<!doctype html><body><div id="root" data-composition-id="root"><div id="overlay" data-composition-id="overlay"><span id="target"></span></div></div></body>',
      { pretendToBeVisual: true, runScripts: 'outside-only' },
    );
    const postMessage = vi.fn();
    Object.defineProperty(dom.window, 'postMessage', { configurable: true, value: postMessage });
    const target = dom.window.document.getElementById('target')!;
    Object.defineProperty(dom.window.document, 'elementFromPoint', { configurable: true, value: () => target });

    dom.window.eval(controlRuntime);
    postMessage.mockClear();
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'hf:pickAt', x: 0.5, y: 0.5 } }));

    expect(postMessage).toHaveBeenCalledWith({ source: 'hf', type: 'select', blockId: 'overlay' }, '*');
    dom.window.close();
  });

  it('resolves device-local image locators inside image and CSS slots', () => {
    expect(PREVIEW_RUNTIME).toContain("d.type === 'hf:imageFile'");
    expect(PREVIEW_RUNTIME).toContain("'pireel-local-image:' + encodeURIComponent");
    expect(PREVIEW_RUNTIME).toContain("document.querySelectorAll('img[src]')");
    expect(PREVIEW_RUNTIME).toContain("document.querySelectorAll('[style]')");
    expect(PREVIEW_RUNTIME).toContain("document.querySelectorAll('style')");
  });
});
