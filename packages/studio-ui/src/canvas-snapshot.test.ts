// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { serializeBrowserOverlayElements, withCanvasSnapshots } from './browser-visual-layer-plan';

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
