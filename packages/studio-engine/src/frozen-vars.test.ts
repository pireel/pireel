/**
 * Insertion-time look freeze (Block.vars): once a block is in the composition it keeps the
 * theme tokens it was created under — mounting a different theme later restyles only new
 * blocks. Pins the stamping funnel (freezeBlockVars) and the scoped render override.
 */
import { describe, expect, it } from 'vitest';
import { GENERAL_THEME, effectiveThemeVars, varsDeclCss, themeVarsCss } from './theme';
import { type Composition, assembleBlockHtml, assembleHtml, customBlock, captionBlock, freezeBlockVars, blockFreezesVars } from './composition';
import { runServerTool } from './server-tools';

const comp = (over: Partial<Composition> = {}): Composition => ({
  width: 1080,
  height: 1920,
  theme: 'general',
  video: null,
  blocks: [],
  ...over,
});

const cst = () => customBlock({ innerHtml: '<div class="x">hi</div>', timelineBody: '', startSec: 0, durationSec: 2 });

describe('freezeBlockVars (stamping funnel)', () => {
  it('stamps an unstamped component block with the merged effective tokens (palette override included)', () => {
    const c = freezeBlockVars(comp({ blocks: [cst()], palette: { accent: '#123456' } }));
    const b = c.blocks[0]!;
    expect(b.vars).toEqual(effectiveThemeVars(GENERAL_THEME, { accent: '#123456' }));
    expect(b.vars!.accent).toBe('#123456');
    expect(b.vars!.paper).toBe(GENERAL_THEME.vars.paper);
  });

  it('never restamps: a stamped block keeps its frozen look across a later palette change', () => {
    const first = freezeBlockVars(comp({ blocks: [cst()], palette: { accent: '#111111' } }));
    const themed = freezeBlockVars({ ...first, palette: { accent: '#222222' } });
    expect(themed.blocks[0]!.vars!.accent).toBe('#111111');
  });

  it('preset components are themeless: kit instances and preset-library elements freeze at the NEUTRAL general tokens, never the project palette', () => {
    const kit = { id: 'k1', templateId: 'kit:metric', slots: { props: {} }, startSec: 0, durationSec: 3, trackIndex: 2 };
    const preset = { id: 'p1', templateId: 'custom', slots: { innerHtml: '<div></div>', timelineBody: '', presetId: 'pe_num' }, startSec: 0, durationSec: 3, trackIndex: 2 };
    const c = freezeBlockVars(comp({ blocks: [kit, preset, cst()], palette: { accent: '#123456', paper: '#000000' } }));
    for (const b of [c.blocks[0]!, c.blocks[1]!]) {
      expect(b.vars).toEqual(effectiveThemeVars(GENERAL_THEME)); // neutral — library card look
      expect(b.vars!.accent).toBe(GENERAL_THEME.vars.accent);
    }
    expect(c.blocks[2]!.vars!.accent).toBe('#123456'); // non-preset custom block still freezes the project palette
  });

  it('skips captions/transitions/media (they follow global styling), and is a same-reference no-op when clean', () => {
    expect(blockFreezesVars('caption')).toBe(false);
    expect(blockFreezesVars('transition')).toBe(false);
    expect(blockFreezesVars('media')).toBe(false);
    expect(blockFreezesVars('custom')).toBe(true);
    expect(blockFreezesVars('kit:metric')).toBe(true);
    const cap = captionBlock({ words: [{ text: 'hi', start: 0, end: 1 }] });
    const c0 = comp({ blocks: [cap] });
    expect(freezeBlockVars(c0)).toBe(c0); // nothing eligible → same reference
    const c1 = freezeBlockVars(comp({ blocks: [cst()] }));
    expect(freezeBlockVars(c1)).toBe(c1); // already stamped → same reference
    expect(c1.blocks.find((b) => b.templateId === 'caption')?.vars).toBeUndefined();
  });
});

describe('scoped render override', () => {
  it('assembleBlockHtml emits a #id-scoped vars rule for a frozen block, none for an unstamped one', () => {
    const b = cst();
    const live = comp({ blocks: [b], palette: { accent: '#22aa55' } });
    expect(assembleBlockHtml(b, live).html).not.toContain('<style>');
    const frozen = freezeBlockVars(live).blocks[0]!;
    const html = assembleBlockHtml(frozen, live).html;
    expect(html).toContain(`<style>#${b.id}{`);
    expect(html).toContain('--accent: #22aa55;');
    // identical declaration text as #root would serve → stamping alone changes nothing visually
    expect(html).toContain(varsDeclCss(frozen.vars!));
  });

  it('a frozen block keeps its insertion-time accent after the composition palette changes', () => {
    const stamped = freezeBlockVars(comp({ blocks: [cst()], palette: { accent: '#111111' } }));
    const themed = { ...stamped, palette: { accent: '#ff0000' } };
    const doc = assembleHtml(themed);
    expect(doc).toContain(themeVarsCss(GENERAL_THEME, { accent: '#ff0000' })); // #root went red
    expect(doc).toContain(`#${stamped.blocks[0]!.id}{`);
    expect(doc).toContain('--accent: #111111;'); // the block did not
  });
});

describe('offline funnel (runServerTool)', () => {
  it('stamps blocks touched offline before the comp is persisted', () => {
    const p = {
      id: 'p1',
      title: 't',
      comp: comp({ blocks: [cst()], palette: { accent: '#654321' } }),
      context: {},
      videoDurationSec: null,
    };
    const out = runServerTool('move_block', { blockId: p.comp.blocks[0]!.id, startSec: 1 }, p as never);
    expect(out.result.ok).toBe(true);
    expect(out.comp!.blocks[0]!.vars!.accent).toBe('#654321');
  });
});
