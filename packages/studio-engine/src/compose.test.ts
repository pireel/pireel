import { describe, expect, it } from 'vitest';
import { BLOCK_SYSTEM, buildBlockPrompt, parseBlockResponse } from './compose';

describe('BLOCK_SYSTEM 质量契约(反单调 + 分阶段动效)', () => {
  it('含版式原型库与动效编排(防回归:别改丢)', () => {
    expect(BLOCK_SYSTEM).toContain('LAYOUT ARCHETYPES');
    expect(BLOCK_SYSTEM).toContain('staged choreography');
    expect(BLOCK_SYSTEM).toContain('VARIETY');
    expect(BLOCK_SYSTEM).toContain('DEVICE RECIPES');
    // 图标/logo 走 get_icons 工具,画面禁 emoji,错图标不如无图标
    expect(BLOCK_SYSTEM).toContain('get_icons');
    expect(BLOCK_SYSTEM).toContain('NO emoji');
    expect(BLOCK_SYSTEM).toContain('worse than none');
    expect(BLOCK_SYSTEM).toContain('36px inherited fallback');
    expect(BLOCK_SYSTEM).toContain('smaller than 24px');
    // 就地改字句柄:可见文本必须带唯一 data-edit key(编辑面=预览本身的前提)
    expect(BLOCK_SYSTEM).toContain('data-edit');
  });
});

describe('buildBlockPrompt neighbors(反单调上下文)', () => {
  it('邻块清单拼进 prompt,«THIS» 标记本块', () => {
    const p = buildBlockPrompt({
      block: { id: 'b2', kind: 'custom', innerHtml: '<div></div>', timelineBody: '' },
      instruction: '做个大数字',
      context: { neighbors: ['1. [metric] 87%', '2. [pipeline] 三步流程  «THIS»', '3. [chart] 完播率'] },
    });
    expect(p).toContain('OTHER FRAGMENTS');
    expect(p).toContain('«THIS»');
    expect(p).toContain('[pipeline] 三步流程');
    // 内容匹配第一优先,反单调只是 tiebreaker(用户定的)——措辞必须保留这个层级
    expect(p).toContain('content first');
  });
  it('没有 neighbors 时不出现该段', () => {
    const p = buildBlockPrompt({ block: { id: 'b1', kind: 'custom', innerHtml: '<div></div>', timelineBody: '' }, instruction: 'x' });
    expect(p).not.toContain('OTHER FRAGMENTS');
  });
});

describe('parseBlockResponse', () => {
  const FB = { innerHtml: '<div>old</div>', timelineBody: 'tl.from("#x",{},0)' };

  it('分别抽出 html / js / note', () => {
    const text = '```html\n<div>new</div>\n```\n```js\ntl.to("#y",{},0)\n```\n改成了砸入。';
    const { innerHtml, timelineBody, note } = parseBlockResponse(text, FB);
    expect(innerHtml).toBe('<div>new</div>');
    expect(timelineBody).toBe('tl.to("#y",{},0)');
    expect(note).toBe('改成了砸入。');
  });

  it('缺某块时回退原值', () => {
    const text = '```html\n<div>only html</div>\n```\n好了';
    const { innerHtml, timelineBody } = parseBlockResponse(text, FB);
    expect(innerHtml).toBe('<div>only html</div>');
    expect(timelineBody).toBe(FB.timelineBody);
  });

  it('多个 html 块时取有实质内容的那个(跳过空的 <div></div> 前导块)', () => {
    const text = 'note\n```html\n<div></div>\n```\n```html\n<div class="wrap"><style>#b .wrap{color:red}</style></div>\n```\n```js\ntl.from("#b .wrap",{autoAlpha:0},0)\n```';
    const { innerHtml, timelineBody, note } = parseBlockResponse(text, FB);
    expect(innerHtml).toContain('.wrap{color:red}');
    expect(innerHtml).not.toBe('<div></div>');
    expect(timelineBody).toBe('tl.from("#b .wrap",{autoAlpha:0},0)');
    expect(note).toBe('note');
  });

  it('抽出 ```json 作为 editable-properties schema,三块互不干扰', () => {
    const schema = '{"accent":{"type":"string","format":"color","title":"Accent","default":"#ff5a36"}}';
    const text = `note\n\`\`\`html\n<div class="wrap"><style>#b .wrap{color:var(--p-accent)}</style></div>\n\`\`\`\n\`\`\`js\ntl.to("#b .wrap",{},0)\n\`\`\`\n\`\`\`json\n${schema}\n\`\`\``;
    const { innerHtml, timelineBody, propsSchema, note } = parseBlockResponse(text, FB);
    expect(innerHtml).toContain('var(--p-accent)');
    expect(timelineBody).toBe('tl.to("#b .wrap",{},0)');
    expect(propsSchema).toBe(schema);
    expect(note).toBe('note');
  });

  it('无 json 块时 propsSchema 回退到 fb,两者都缺时为空串', () => {
    const withFb = parseBlockResponse('```html\n<div>x</div>\n```', { ...FB, propsSchema: '{"n":{"type":"number","default":1}}' });
    expect(withFb.propsSchema).toBe('{"n":{"type":"number","default":1}}');
    expect(parseBlockResponse('```html\n<div>x</div>\n```', FB).propsSchema).toBe('');
  });
});

describe('buildBlockPrompt', () => {
  it('末行输出顺序与 BLOCK_SYSTEM 契约一致:note 在前,再 html 再 js', () => {
    const p = buildBlockPrompt({
      block: { id: 'b1', kind: 'custom', innerHtml: '<div>old</div>', timelineBody: '' },
      instruction: '改成大数字',
    });
    const last = p.split('\n\n').pop()!;
    expect(last).toContain('note');
    expect(last.indexOf('note')).toBeLessThan(last.indexOf('```html'));
    expect(last.indexOf('```html')).toBeLessThan(last.indexOf('```js'));
  });

  it('supplies a concrete scoped example instead of a repeated self-audit loop', () => {
    const prompt = buildBlockPrompt({
      block: { id: 'block_scope', kind: 'custom', innerHtml: '<div></div>', timelineBody: '' },
      instruction: 'make a metric',
    });
    expect(prompt).toContain('.label{');
    expect(prompt).toContain('Studio scopes the stylesheet');
    expect(prompt).not.toContain('MANDATORY FINAL CSS AUDIT');
  });
});
