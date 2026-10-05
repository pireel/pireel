import { describe, expect, it } from 'vitest';
import { emptyPlaybook, playbookSnapshot, renderBrandPrompt, validatePlaybook, validatePlaybookSnapshot, type BrandPlaybook } from './brand-playbook';

const valid = (): BrandPlaybook => ({
  ...emptyPlaybook('brand_1', 'Mine', 'douyin'),
  blocks: {
    portrait: { text: '快节奏数码口播，结论先行。' },
    captions: { on: true, style: { color: '#ffffff', strokeColor: '#000000', yPct: 22 }, accent: 'keywords', text: '每屏约 3 个词。' },
    logo: { key: 'uploads/u/logo.png', kind: 'image', width: 200, height: 80, corner: 'top-right', widthPct: 12, opacity: 1 },
    palette: { accent: '#ffd600' },
    sound: { lufs: -15, pauses: 'tight' },
    editing: { text: '说到价格时快推近 & 换产品时甩镜 <偶尔>。', evidence: { videos: ['v1', 'v2'], confidence: 'high' } },
    motion_graphics: { text: '白底黑字圆角数字卡，从下方弹入。', references: [{ key: 'uploads/u/mg.jpg', kind: 'image', width: 540, height: 960 }] },
  },
});

describe('validatePlaybook', () => {
  it('accepts a brand and a blank one', () => {
    expect(() => validatePlaybook(valid())).not.toThrow();
    expect(() => validatePlaybook(emptyPlaybook('b', 'B'))).not.toThrow();
  });

  it('refuses the field that is wrong, never patching it', () => {
    const cases: [(p: BrandPlaybook) => void, RegExp][] = [
      [p => { (p as { schema: number }).schema = 1; }, /schema/],
      [p => { (p.blocks as Record<string, unknown>).moves = []; }, /blocks\.moves/],
      [p => { p.blocks.sound = { lufs: 3 }; }, /sound\.lufs/],
      [p => { p.blocks.logo!.key = 'blob:local'; }, /blocks\.logo/],
      [p => { p.blocks.captions!.style = { color: 'red' }; }, /captions\.style\.color/],
      [p => { p.blocks.editing = { text: 'x'.repeat(4001) }; }, /editing\.text/],
      [p => { p.blocks.motion_graphics!.references = [{ key: '', kind: 'image', width: 1, height: 1 }]; }, /motion_graphics\.references\.0/],
    ];
    for (const [mutate, error] of cases) {
      const playbook = valid(); mutate(playbook);
      expect(() => validatePlaybook(playbook)).toThrow(error);
    }
  });

  it('refuses brands of an older shape', () => {
    expect(() => validatePlaybook({ ...emptyPlaybook('b', 'Old'), schema: 1, fixed: {}, moves: [] })).toThrow(/schema/);
  });
});

describe('renderBrandPrompt', () => {
  it('renders one XML block per part: fixed values as attributes, prose as escaped content', () => {
    const prompt = renderBrandPrompt(valid());
    expect(prompt.startsWith('<brand name="Mine">')).toBe(true);
    expect(prompt).toContain('<captions on="true" color="#ffffff" stroke="#000000" accent="keywords" bottom-edge="22% from top">\n每屏约 3 个词。\n</captions>');
    expect(prompt).toContain('<logo corner="top-right" width="12%" opacity="1"/>');
    expect(prompt).toContain('<sound loudness="-15 LUFS" pauses="tight"/>');
    expect(prompt).toContain('<editing>\n说到价格时快推近 &amp; 换产品时甩镜 &lt;偶尔&gt;。\n</editing>');
    expect(prompt).toContain('<motion_graphics references="1">');
    expect(prompt.indexOf('<portrait>')).toBeLessThan(prompt.indexOf('<captions'));
  });

  it('renders only the blocks a consumer asks for', () => {
    const prompt = renderBrandPrompt(valid(), ['portrait', 'editing']);
    expect(prompt).toContain('<editing>');
    expect(prompt).not.toContain('<captions');
    expect(prompt).not.toContain('<motion_graphics');
  });
});

describe('playbookSnapshot', () => {
  it('drops the source list and copies deeply', () => {
    const playbook = valid();
    const snapshot = playbookSnapshot(playbook);
    expect(snapshot).not.toHaveProperty('source');
    playbook.blocks.editing!.text = 'changed';
    expect(snapshot.blocks.editing!.text).toContain('推近');
    expect(() => validatePlaybookSnapshot(snapshot)).not.toThrow();
  });
});
