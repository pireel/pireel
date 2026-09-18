/** @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PreviewStageHost, rewriteDocumentSelectors, splitFontFaces } from './preview-stage-host';

const fakeGsap = () => {
  const contexts: Array<{ reverted: boolean }> = [];
  const gsap = {
    contexts,
    context: (fn: () => void) => {
      const ctx = { reverted: false, revert: () => { ctx.reverted = true; } };
      contexts.push(ctx);
      fn();
      return ctx;
    },
    timeline: () => ({ time: () => undefined, duration: () => 1 }),
  };
  return gsap;
};

const DOC = `<!doctype html><html><head>
<style>html, body { width: 1080px; height: 1920px; overflow: hidden; background: transparent; }
@font-face { font-family: "Stage Test"; src: url(/fonts/test.woff2); }
body.hf-editor .hf-ph { display: flex; }
#root { position: relative; }</style>
<link rel="stylesheet" href="https://fonts.example/css?family=Stage+Test">
<script src="/vendor/gsap.min.js"></script>
</head><body>
<div id="root" data-width="1080" data-height="1920"><div class="comp" id="title" data-composition-id="title"><span data-edit="text">Hello</span></div></div>
<script>window.__timelines = window.__timelines || {}; window.__timelines.title = gsap.timeline({ paused: true });</script>
<script>
document.body.classList.add('hf-editor');
window.addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type === 'hf:ping') window.parent.postMessage({ type: 'pong', nonce: d.nonce, found: !!document.getElementById('title'), width: window.innerWidth }, '*');
});
</script>
</body></html>`;

describe('PreviewStageHost', () => {
  let gsap: ReturnType<typeof fakeGsap>;
  beforeEach(() => {
    vi.useFakeTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    gsap = fakeGsap();
    (window as unknown as { gsap?: unknown }).gsap = gsap;
  });
  afterEach(() => {
    delete (window as unknown as { gsap?: unknown }).gsap;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const flush = () => vi.runAllTimersAsync();

  it('mounts the document in a shadow root, runs its scripts against the facades and answers messages', async () => {
    const host = new PreviewStageHost();
    document.body.appendChild(host.element);
    const loaded = vi.fn();
    const received: unknown[] = [];
    host.onMessage = (event) => received.push({ data: event.data, fromHost: event.source === host.contentWindow });
    host.addEventListener('load', loaded);
    host.srcdoc = DOC;
    await flush();
    expect(loaded).toHaveBeenCalledOnce();
    const shadow = host.element.shadowRoot!;
    expect(shadow.getElementById('title')).not.toBeNull();
    expect(document.getElementById('title')).toBeNull(); // isolated from the page
    expect(shadow.querySelector('.hf-stage-body')?.classList.contains('hf-editor')).toBe(true);
    expect(gsap.contexts).toHaveLength(1);

    host.contentWindow.postMessage({ type: 'hf:ping', nonce: 7 }, '*');
    await flush();
    expect(received).toEqual([{ data: { type: 'pong', nonce: 7, found: true, width: expect.any(Number) }, fromHost: true }]);
  });

  it('keeps document-level selectors working and hoists fonts to the page', async () => {
    const host = new PreviewStageHost();
    document.body.appendChild(host.element);
    host.srcdoc = DOC;
    await flush();
    const css = [...host.element.shadowRoot!.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    expect(css).toContain('.hf-stage-body, .hf-stage-body { width: 1080px');
    expect(css).toContain('.hf-stage-body.hf-editor .hf-ph');
    expect(css).not.toContain('@font-face');
    expect(document.head.querySelector('style[data-hf-stage-font]')?.textContent).toContain('Stage Test');
    expect(document.head.querySelector('link[rel="stylesheet"]')?.getAttribute('href')).toBe('https://fonts.example/css?family=Stage+Test');
  });

  it('keeps styles the runtime appends to the head inside the stage and sends only font links to the page', async () => {
    const host = new PreviewStageHost();
    document.body.appendChild(host.element);
    host.srcdoc = DOC.replace('</body>', `<script>
      var st = document.createElement('style'); st.id = 'hf-runtime-css';
      st.textContent = '[contenteditable="true"]{outline:2px dashed cyan} body.hf-editor .x{}';
      document.head.appendChild(st);
      var fl = document.createElement('link'); fl.rel = 'stylesheet'; fl.href = 'https://fonts.example/css?family=Late';
      document.head.appendChild(fl);
    </script></body>`);
    await flush();
    const shadow = host.element.shadowRoot!;
    expect(shadow.getElementById('hf-runtime-css')?.textContent).toBe('[contenteditable="true"]{outline:2px dashed cyan} .hf-stage-body.hf-editor .x{}');
    expect(document.head.querySelector('#hf-runtime-css')).toBeNull();
    expect(document.head.querySelector('link[href="https://fonts.example/css?family=Late"]')).not.toBeNull();
    expect(shadow.querySelector('link')).toBeNull();
  });

  it('clears the stage and reverts its animations when the document is replaced or removed', async () => {
    const host = new PreviewStageHost();
    document.body.appendChild(host.element);
    host.srcdoc = DOC;
    await flush();
    host.srcdoc = '';
    expect(host.element.shadowRoot!.children).toHaveLength(0);
    expect(gsap.contexts[0]!.reverted).toBe(true);
    host.srcdoc = DOC;
    await flush();
    expect(host.element.shadowRoot!.getElementById('title')).not.toBeNull();
    host.dispose();
    expect(host.element.shadowRoot!.children).toHaveLength(0);
  });

  it('drops a mount that was superseded before GSAP resolved', async () => {
    const host = new PreviewStageHost();
    document.body.appendChild(host.element);
    const loaded = vi.fn();
    host.addEventListener('load', loaded);
    host.srcdoc = DOC;
    host.srcdoc = DOC.replace('Hello', 'Second');
    await flush();
    expect(loaded).toHaveBeenCalledOnce();
    expect(host.element.shadowRoot!.getElementById('title')?.textContent).toBe('Second');
  });
});

describe('stage stylesheet rewriting', () => {
  it('re-targets html and body selectors only where they name the document', () => {
    expect(rewriteDocumentSelectors('html, body { margin: 0 } body.hf-editor .x{} .bodyguard{} #body{} div>body{}'))
      .toBe('.hf-stage-body, .hf-stage-body { margin: 0 } .hf-stage-body.hf-editor .x{} .bodyguard{} #body{} div>.hf-stage-body{}');
  });

  it('lifts font faces out of a stylesheet', () => {
    const { css, fontFaces } = splitFontFaces('@font-face{font-family:A;src:url(a)} .x{color:red} @font-face { font-family: B; }');
    expect(fontFaces).toEqual(['@font-face{font-family:A;src:url(a)}', '@font-face { font-family: B; }']);
    expect(css.trim()).toBe('.x{color:red}');
  });
});
