// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { browserOverlayElements, serializeBrowserOverlayElements, withCanvasSnapshots } from './browser-visual-layer-plan';
import { fontRequestsIn } from './export-fonts';

describe('the elements one overlay pass draws', () => {
  it('are the ones it serializes: the named blocks, or all of them, without the hidden', () => {
    const root = document.createElement('div');
    root.id = 'root';
    root.innerHTML = '<div id="b1"><span style="font-family:Head;font-weight:700">One</span><style>#b1{color:red}</style></div>'
      + '<div id="b2" style="visibility:hidden">Two</div><div id="b3">Three</div>';
    document.body.appendChild(root);
    expect(browserOverlayElements(root, document).map((element) => element.id)).toEqual(['b1', 'b3']);
    expect(browserOverlayElements(root, document, [{ id: 'b3' }, { id: 'b2' }, { id: 'gone' }]).map((element) => element.id)).toEqual(['b3']);
    expect(serializeBrowserOverlayElements(root, document, [{ id: 'b1' }, { id: 'b2' }])).not.toContain('Two');
    // The text those elements draw, by the style it is drawn in; a stylesheet's own text is not drawn.
    const styleOf = (element: Element) => ({ fontFamily: (element as HTMLElement).style.fontFamily || 'Body', fontWeight: (element as HTMLElement).style.fontWeight || '400', fontStyle: 'normal' });
    expect(fontRequestsIn(browserOverlayElements(root, document), styleOf)).toEqual([
      { families: ['Head'], weight: 700, style: 'normal', text: 'One' },
      { families: ['Body'], weight: 400, style: 'normal', text: 'Three' },
    ]);
    root.remove();
  });
});

describe('canvas snapshots in exported overlays', () => {
  it('replaces each canvas with an image of its current pixels, keeping its attributes', () => {
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AAAA');
    const root = document.createElement('div');
    root.id = 'root';
    root.innerHTML = '<div id="b1" class="comp"><div class="stage"><canvas class="gl" width="30" height="20"></canvas><div class="solid">Hi</div></div></div>';
    document.body.appendChild(root);
    const markup = serializeBrowserOverlayElements(root, document);
    expect(markup).toContain('<img class="gl" width="30" height="20" src="data:image/png;base64,AAAA"');
    expect(markup).not.toContain('<canvas');
    // The live document keeps its canvas.
    expect(root.querySelector('canvas')).not.toBeNull();
    toDataURL.mockRestore();
  });

  it('leaves an element without canvases untouched and skips an unreadable canvas', () => {
    const plain = document.createElement('div');
    expect(withCanvasSnapshots(plain, document)).toBe(plain);
    const host = document.createElement('div');
    host.innerHTML = '<canvas class="x"></canvas>';
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => { throw new Error('tainted'); });
    const out = withCanvasSnapshots(host, document) as HTMLElement;
    expect(out.querySelector('canvas')).not.toBeNull();
    toDataURL.mockRestore();
  });
});
