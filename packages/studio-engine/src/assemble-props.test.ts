import { describe, expect, it } from 'vitest';
import { assembleBlockHtml, assembleHtml } from './assemble';
import type { Block, Composition } from './composition-core';

const manifest = JSON.stringify({
  accent: { type: 'string', format: 'color', title: 'Accent', default: '#ff5a36' },
  value: { type: 'number', title: 'Value', default: 72, minimum: 0, maximum: 100 },
  layout: { type: 'string', title: 'Layout', default: 'row', enum: ['row', 'column'] },
});
const innerHtml = `<div class="wrap" data-props='${manifest}'><style>#b1 .bar{width:calc(var(--p-value) * 1%);background:var(--p-accent)} #b1[data-p-layout="column"] .wrap{flex-direction:column}</style><b class="bar"></b></div>`;
const block = (slots: Record<string, unknown>, box?: Block['box']): Block => ({
  id: 'b1', templateId: 'custom', slots: { innerHtml, timelineBody: '', ...slots }, startSec: 0, durationSec: 3, trackIndex: 1, ...(box ? { box } : {}),
});
const comp = (b: Block): Composition => ({ width: 1080, height: 1920, theme: 'general', video: null, shots: [], blocks: [b] });

describe('editable properties in the assembled document', () => {
  it('materializes every declared property on the container, override beating default, orphan ignored', () => {
    const b = block({ props: { value: 40, layout: 'column', ghost: 'x' } }, { x: 0.1, y: 0.1, w: 0.5, h: 0.2 });
    const { html } = assembleBlockHtml(b, comp(b));
    const container = /<div class="comp" [^>]*>/.exec(html)![0];
    expect(container).toContain('data-p-accent="#ff5a36"');
    expect(container).toContain('data-p-value="40"');
    expect(container).toContain('data-p-layout="column"');
    expect(container).not.toContain('ghost');
    expect(container).toMatch(/style="position:absolute;--p-accent:#ff5a36;--p-value:40;left:/);
    // the content layer's own style carries none of it — inline values on the container are what var() inherits
    expect(/<div data-hf-content style="[^"]*"/.exec(html)![0]).not.toContain('--p-');
  });

  it('works for full-canvas components too and stays out of non-custom blocks', () => {
    const full = block({});
    const { html } = assembleBlockHtml(full, comp(full));
    expect(html).toMatch(/style="position:absolute;--p-accent:#ff5a36;--p-value:72;inset:0;/);
    expect(html).toContain('data-p-layout="row"');
    const kit: Block = { id: 'k1', templateId: 'kit:metric', slots: { props: { value: 'x' } }, startSec: 0, durationSec: 3, trackIndex: 1 };
    expect(assembleBlockHtml(kit, comp(kit)).html).not.toContain('data-p-');
  });

  it('renders the same fragment inside the whole document (the patch channel relies on it)', () => {
    const b = block({ props: { accent: '#000000' } }, { x: 0.1, y: 0.1, w: 0.5, h: 0.2 });
    const fragment = assembleBlockHtml(b, comp(b)).html;
    expect(assembleHtml(comp(b))).toContain(fragment);
  });
});
