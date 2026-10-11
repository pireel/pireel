import { describe, expect, it } from 'vitest';
import { emptyPlaybook, playbookSnapshot, renderBrandPrompt, validatePlaybook, validatePlaybookSnapshot, type BrandPlaybook } from './brand-playbook';

const valid = (): BrandPlaybook => ({
  ...emptyPlaybook('brand_1', 'Mine', 'douyin'),
  blocks: {
    portrait: { text: '快节奏数码口播，结论先行。' },
    captions: { on: true, style: { color: '#ffffff', strokeColor: '#000000', yPct: 22 }, accent: 'keywords', text: '每屏约 3 个词。' },
    logo: { key: 'uploads/u/logo.png', kind: 'image', width: 200, height: 80, corner: 'top-right', widthPct: 12, opacity: 1 },
    sound: { lufs: -15, pauses: 'tight' },
    camera: { text: '说到价格时快推近 & 换产品时甩镜 <偶尔>。', evidence: { videos: ['v1', 'v2'], confidence: 'high' } },
    graphics: { text: '白底黑字圆角数字卡，从下方弹入。', references: [{ key: 'uploads/u/mg.jpg', kind: 'image', width: 540, height: 960 }] },
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
      [p => { p.blocks.camera = { text: 'x'.repeat(4001) }; }, /camera\.text/],
      [p => { p.blocks.graphics!.references = [{ key: '', kind: 'image', width: 1, height: 1 }]; }, /graphics\.references\.0/],
    ];
    for (const [mutate, error] of cases) {
      const playbook = valid(); mutate(playbook);
      expect(() => validatePlaybook(playbook)).toThrow(error);
    }
  });

  it('reads legacy labelled descriptions as prose without changing stored observations', () => {
    const original = valid();
    original.blocks.graphics!.text = '用不用：用\n程度：讲数据时配图形，观点回到人物。\n样子：白底黑字数字卡。';
    const upgraded = validatePlaybook(original);
    expect(upgraded.blocks.graphics?.text).toBe('讲数据时配图形，观点回到人物。 白底黑字数字卡。');
    expect(upgraded.blocks.graphics?.references).toEqual(original.blocks.graphics?.references);
    expect(original.blocks.graphics?.text).toContain('用不用：');
    expect(validatePlaybook(upgraded)).toBe(upgraded);
    expect(renderBrandPrompt(original)).not.toContain('用不用：');
    const english = valid();
    english.blocks.camera = { text: 'Use: No\nDegree: No deliberate camera moves were seen.\nLooks: Static framing.' };
    expect(validatePlaybook(english).blocks.camera?.text).toBe('No. No deliberate camera moves were seen. Static framing.');
    expect(validatePlaybook(valid()).blocks.camera?.text).toBe(valid().blocks.camera?.text);
  });

  it('refuses brands of an older shape', () => {
    expect(() => validatePlaybook({ ...emptyPlaybook('b', 'Old'), schema: 1, fixed: {}, moves: [] })).toThrow(/schema/);
  });

  it('reads a brand made before the toolkit split: its picture prose becomes the layout technique', () => {
    const old = { ...valid(), schema: 2, blocks: { portrait: { text: '快节奏。' }, visual: { text: '素材出现时人物缩成圆形小窗。' } } };
    const upgraded = validatePlaybook(old);
    expect(upgraded.schema).toBe(3);
    expect(upgraded.blocks.layout?.text).toBe('素材出现时人物缩成圆形小窗。');
    expect(upgraded.blocks).not.toHaveProperty('visual');
    expect(renderBrandPrompt(old as unknown as BrandPlaybook)).toContain('<layout>');
  });
});

describe('renderBrandPrompt', () => {
  it('renders one XML block per part: fixed values as attributes, prose as escaped content', () => {
    const prompt = renderBrandPrompt(valid());
    expect(prompt.startsWith('<brand name="Mine">')).toBe(true);
    expect(prompt).toContain('<captions on="true" color="#ffffff" stroke="#000000" accent="keywords" bottom-edge="22% from top">\n每屏约 3 个词。\n</captions>');
    expect(prompt).toContain('<logo corner="top-right" width="12%" opacity="1"/>');
    expect(prompt).toContain('<sound loudness="-15 LUFS" pauses="tight"/>');
    expect(prompt).toContain('<camera>\n说到价格时快推近 &amp; 换产品时甩镜 &lt;偶尔&gt;。\n</camera>');
    expect(prompt).toContain('<graphics references="1">');
    expect(prompt.indexOf('<portrait>')).toBeLessThan(prompt.indexOf('<captions'));
  });

  it('renders only the blocks a consumer asks for', () => {
    const prompt = renderBrandPrompt(valid(), ['portrait', 'camera']);
    expect(prompt).toContain('<camera>');
    expect(prompt).not.toContain('<captions');
    expect(prompt).not.toContain('<graphics');
  });
});

describe('playbookSnapshot', () => {
  it('drops the source list and copies deeply', () => {
    const playbook = valid();
    const snapshot = playbookSnapshot(playbook);
    expect(snapshot).not.toHaveProperty('source');
    playbook.blocks.camera!.text = 'changed';
    expect(snapshot.blocks.camera!.text).toContain('推近');
    expect(() => validatePlaybookSnapshot(snapshot)).not.toThrow();
  });
});
