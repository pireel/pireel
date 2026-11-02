/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { assembleBlockHtml, assembleHtml, blockPreviewDoc } from './assemble';
import { emptyComposition, type Block, type Composition } from './composition';
import { lintLookSource, lookHeadHtml, normalizeLook, type DocumentLook } from './look';
import { emptyEditorDocumentV2 } from './editor-document';
import { patchEditorAppearance } from './editor-document/commands/appearance';
import { validateEditorDocumentV2 } from './editor-document/validation';

const card = `function (props, ctx) {
  return {
    html: '<div class="card"><b>' + props.title + '</b><i>' + ctx.width + 'x' + ctx.height + '</i></div>',
    animate: function (tl, el) { tl.from(el.querySelector('.card'), { opacity: 0, duration: 0.3 }, 0); },
  };
}`;

const look: DocumentLook = {
  id: 'look-1',
  css: ':root { --ink: #fff; } .card { color: var(--ink); background: #111; }',
  pieces: { 'item-card': { label: 'Item card', source: card, propsSchema: { type: 'object', properties: { title: { type: 'string' } } } } },
  notes: 'Dark cards, white type.',
};

const instance: Block = {
  id: 'g1',
  templateId: 'look:item-card',
  slots: { props: { title: 'VIP 年卡' } },
  startSec: 1,
  durationSec: 3,
  trackIndex: 2,
  box: { x: 0.1, y: 0.05, w: 0.5, h: 0.1 },
};

const comp = (): Composition => ({ ...emptyComposition(), width: 1080, height: 1920, look, blocks: [instance] });

describe('look validation', () => {
  it('takes its faces as font ids: tokens inside pieces, a linked stylesheet, and no literal font loading', () => {
    const withFonts = normalizeLook({ ...look, fonts: { display: 'web:smiley-sans', body: 'sans' } }).look!;
    expect(withFonts.fonts).toEqual({ display: 'web:smiley-sans', body: 'sans' });
    const head = lookHeadHtml(withFonts);
    expect(head).toMatch(/--font-display: [^;]*Smiley Sans/);
    expect(head).toContain('font-family: var(--font-body)');
    expect(assembleHtml({ ...comp(), look: withFonts })).toMatch(/<link href="[^"]*smiley-sans[^"]*" rel="stylesheet"/);
    expect(normalizeLook({ ...look, fonts: { display: 'Smiley Sans' } }).issues).toEqual([expect.objectContaining({ path: 'look.fonts.display' })]);
    expect(normalizeLook({ ...look, fonts: { title: 'web:smiley-sans' } }).issues).toEqual([expect.objectContaining({ path: 'look.fonts.title' })]);
  });

  it('accepts a well-formed look and rejects what breaks the runtime boundary or purity', () => {
    expect(normalizeLook(look).look).toMatchObject({ id: 'look-1', pieces: { 'item-card': { label: 'Item card' } } });
    const bad = normalizeLook({
      id: 'x',
      css: '@import url(https://cdn.example/x.css);',
      pieces: {
        'Bad Id': { source: card },
        clock: { source: 'function (p, c) { return { html: String(Math.random()) }; }' },
        net: { source: 'function () { fetch("/x"); return { html: "" }; }' },
        timer: { source: 'function () { setTimeout(function(){}, 1); return { html: "" }; }' },
        notfn: { source: '{ html: "x" }' },
      },
    });
    expect(bad.look).toBeNull();
    const messages = bad.issues.map((issue) => `${issue.path} ${issue.message}`).join('\n');
    expect(messages).toMatch(/look\.css .*external/);
    expect(messages).toMatch(/Bad Id .*lowercase/);
    expect(messages).toMatch(/clock\.source .*randomness/);
    expect(messages).toMatch(/net\.source .*network/);
    expect(messages).toMatch(/timer\.source .*timers/);
    expect(messages).toMatch(/notfn\.source .*function expression/);
    expect(lintLookSource(card)).toEqual([]);
  });

  it('is stored through appearance.patch and checked by document validation', () => {
    const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
    const ok = patchEditorAppearance(document, { look });
    expect(ok.ok).toBe(true);
    expect(ok.document.appearance.look?.id).toBe('look-1');
    expect(validateEditorDocumentV2(ok.document).filter((issue) => issue.severity === 'error')).toEqual([]);
    const refused = patchEditorAppearance(document, { look: { ...look, pieces: { x: { label: 'x', source: 'function(){ eval("1") }' } } } });
    expect(refused.ok).toBe(false);
    expect(JSON.stringify(refused)).toContain('evaluating code');
  });
});

describe('look in the document', () => {
  it('carries the look once in the head and renders each instance as a host its piece builds', () => {
    const html = assembleHtml(comp());
    expect(html).toContain('@scope (.look-piece)');
    expect(html).toContain(':scope { --ink: #fff; }');
    expect(html).toContain('window.__look');
    expect(html.indexOf('window.__look')).toBeLessThan(html.indexOf('window.__timelines'));
    const block = assembleBlockHtml(instance, comp());
    expect(block.html).toContain('class="look-piece"');
    expect(block.timelineBody).toContain('window.__look.run("item-card", {"title":"VIP 年卡"}');
    // The piece is told its box in px and its own duration.
    expect(block.timelineBody).toContain('"width":540,"height":192,"duration":3');
    expect(blockPreviewDoc(comp(), instance)).toContain('window.__look');
  });

  it('runs in a page: builds the markup, animates on the timeline, and one broken piece leaves the rest working', () => {
    const withBroken: DocumentLook = { ...look, pieces: { ...look.pieces, broken: { label: 'Broken', source: 'function ( { syntax error' } } };
    const head = lookHeadHtml(withBroken);
    const script = /<script>\n([\s\S]*)\n<\/script>/.exec(head)![1]!;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    new Function(script)();
    expect(warn).toHaveBeenCalledWith('[look] piece failed to compile', 'broken', expect.anything());
    document.body.innerHTML = '<div id="g1"><div class="look-piece"></div></div>';
    const from = vi.fn();
    const tl = { from };
    const body = assembleBlockHtml(instance, comp()).timelineBody;
    new Function('tl', body)(tl);
    expect(document.querySelector('#g1 .card b')!.textContent).toBe('VIP 年卡');
    expect(document.querySelector('#g1 .card i')!.textContent).toBe('540x192');
    expect(from).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
