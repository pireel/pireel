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

  it('在具体块提示末尾重复不可违反的 CSS 作用域审计', () => {
    const prompt = buildBlockPrompt({
      block: { id: 'block_scope', kind: 'custom', innerHtml: '<div></div>', timelineBody: '' },
      instruction: 'make a metric',
    });
    expect(prompt).toContain('MANDATORY FINAL CSS AUDIT');
    expect(prompt).toContain('Every one must start with #block_scope');
  });
});
