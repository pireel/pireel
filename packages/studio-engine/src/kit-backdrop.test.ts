import { describe, expect, it } from 'vitest';
import { blockBackdrop } from './assemble';
import { emptyComposition, type Composition, type VideoShot } from './composition';
import { kitElement } from './kit-templates';
import './kit-templates';
import { assembleBlockHtml as assembleBlock } from './assemble';

const comp = (shots: VideoShot[]): Composition => ({ ...emptyComposition(), shots });
const shot = (id: string, srcStart: number, srcEnd: number, treatment?: VideoShot['treatment']): VideoShot => ({ id, srcStart, srcEnd, ...(treatment ? { treatment } : {}) } as VideoShot);

describe('kit type ink follows what is behind the block', () => {
  it('reads the shot playing when the block starts', () => {
    const c = comp([shot('a', 0, 4), shot('b', 4, 8, 'split-l'), shot('c', 8, 12, 'punch-in')]);
    expect(blockBackdrop(c, 1)).toBe('footage');
    expect(blockBackdrop(c, 5)).toBe('page');
    expect(blockBackdrop(c, 9)).toBe('footage');
    expect(blockBackdrop(comp([]), 3)).toBe('footage');
  });

  it('sets light ink over footage and the theme ink on a page or a library preview', () => {
    const over = assembleBlock({ id: 'k1', templateId: 'kit:callout', slots: { props: { text: 'Hi' } }, startSec: 0, durationSec: 3, trackIndex: 2, box: { x: 0, y: 0, w: 0.5, h: 0.3 } }, comp([shot('a', 0, 4)]));
    expect(over.html).toContain('--sk-ink:#ffffff');
    const page = assembleBlock({ id: 'k2', templateId: 'kit:callout', slots: { props: { text: 'Hi' } }, startSec: 0, durationSec: 3, trackIndex: 2, box: { x: 0, y: 0, w: 0.5, h: 0.3 } }, comp([shot('a', 0, 4, 'split-r')]));
    expect(page.html).toContain('--sk-ink:var(--fg)');
    expect(kitElement('callout', 'k3', { text: 'Hi' }, { w: 600, h: 300 }).innerHtml).toContain('--sk-ink:var(--fg)');
  });
});

describe('shared property groups', () => {
  it('every registered component carries the same groups and the shared style fields', async () => {
    const { kitComponents } = await import('./kit-templates');
    for (const [id, def] of Object.entries(kitComponents as unknown as Record<string, { jsonSchema: { properties: Record<string, { 'x-group'?: string }> } }>)) {
      const props = def.jsonSchema.properties;
      // Each component offers the shared style a person would change on it; most take all four.
      const style = id === 'code' ? ['textScale'] : ['accent', 'ink', 'font', 'textScale'];
      for (const key of style) expect(props[key]?.['x-group'], `${id}.${key}`).toBe('style');
      expect(props.variant?.['x-group'], id).toBe('layout');
      for (const [key, f] of Object.entries(props)) expect(['layout', 'content', 'style', 'surface', 'motion'], `${id}.${key}`).toContain(f['x-group']);
    }
  });

  it('code offers editor schemes instead of separate colours', async () => {
    const { kitComponents } = await import('./kit-templates');
    const props = (kitComponents as unknown as Record<string, { jsonSchema: { properties: Record<string, { 'x-group'?: string; 'x-hidden'?: boolean }> } }>).code!.jsonSchema.properties;
    expect(props.codeTheme?.['x-group']).toBe('style');
    for (const key of ['accent', 'ink', 'font']) expect(props[key]).toBeUndefined();
    for (const key of ['surface', 'surfaceColor', 'border', 'borderColor', 'radius']) expect(props[key]?.['x-hidden'], key).toBe(true);
    const at = (codeTheme: string) => kitElement('code', 'c9', { code: 'const a = 1; // note', codeTheme }, { w: 800, h: 500 }).innerHtml;
    expect(at('night')).toContain('--code-keyword:#c792ea');
    expect(at('light')).toContain('--sk-panel:#ffffff');
    expect(at('theme')).not.toContain('--code-keyword:');
  });

  it('the host applies the shared style: colours, typeface and type size change the render', () => {
    const at = (props: Record<string, unknown>) => kitElement('callout', 'k4', { text: 'Hello', ...props }, { w: 600, h: 300 }).innerHtml;
    const plain = at({});
    const styled = at({ accent: '#ff0055', ink: '#112233', font: 'google:Inter' });
    expect(styled).toContain('--sk-accent:#ff0055');
    expect(styled).toContain('--sk-fg:#112233');
    expect(styled).toContain('--sk-font-head:');
    expect(plain).not.toContain('--sk-accent:#');
    const sizes = (html: string) => [...html.matchAll(/font-size:([\d.]+)px/g)].map((m) => Number(m[1]));
    expect(Math.max(...sizes(at({ textScale: 1.4 })))).toBeGreaterThan(Math.max(...sizes(plain)));
  });
});
