import { describe, expect, it } from 'vitest';
import { componentFontSlot, displayFontContext } from './display-text-presets';
import { buildBlockPrompt } from './compose';
import { assembleHtml } from './assemble';
import type { Composition } from './composition-core';

describe('component display font', () => {
  it('describes library, local and builtin ids; preset and junk resolve to nothing', () => {
    expect(displayFontContext('web:douyin-sans')).toEqual({ id: 'web:douyin-sans', family: 'Douyin Sans', label: '抖音美好体' });
    expect(displayFontContext('local:Impact')).toEqual({ id: 'local:Impact', family: 'Impact', label: 'Impact' });
    expect(displayFontContext('mono')?.id).toBe('mono');
    expect(displayFontContext('preset')).toBeNull();
    expect(displayFontContext('web:nope')).toBeNull();
    expect(displayFontContext(42)).toBeNull();
  });

  it('keeps the existing face when an edit names none, drops preset/junk', () => {
    expect(componentFontSlot('web:douyin-sans')).toEqual({ fontFamily: 'web:douyin-sans' });
    expect(componentFontSlot(undefined, 'web:lxgw-wenkai')).toEqual({ fontFamily: 'web:lxgw-wenkai' });
    expect(componentFontSlot('web:nope', 'web:lxgw-wenkai')).toEqual({ fontFamily: 'web:lxgw-wenkai' });
    expect(componentFontSlot('preset')).toEqual({});
  });

  it('tells the brief what var(--font-display) resolves to, only when a face was chosen', () => {
    const block = { id: 'b1', kind: 'custom', innerHtml: '<div></div>', timelineBody: '' };
    const withFont = buildBlockPrompt({ block, instruction: 'x', context: { displayFont: displayFontContext('web:douyin-sans')! } });
    expect(withFont).toContain('DISPLAY FONT: var(--font-display)');
    expect(withFont).toContain('"Douyin Sans" (抖音美好体)');
    expect(buildBlockPrompt({ block, instruction: 'x' })).not.toContain('DISPLAY FONT');
  });

  it('defines --font-display on the component root and links its stylesheet', () => {
    const comp: Composition = {
      width: 1080, height: 1920, theme: 'general', video: null, shots: [],
      blocks: [{ id: 'b1', templateId: 'custom', slots: { innerHtml: '<div>hi</div>', timelineBody: '', fontFamily: 'web:douyin-sans' }, startSec: 0, durationSec: 3, trackIndex: 1 }],
    };
    const html = assembleHtml(comp);
    expect(html).toMatch(/#b1\{[^}]*--font-display:[^;]*Douyin Sans/);
    expect(html).toContain('/douyin-sans/result.css');
    const plain = assembleHtml({ ...comp, blocks: [{ ...comp.blocks[0]!, slots: { innerHtml: '<div>hi</div>', timelineBody: '' } }] });
    expect(plain).not.toContain('--font-display');
  });
});
