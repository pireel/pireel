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
