import { describe, expect, it } from 'vitest';
import { assembleComposeBrief, assembleComposeTheme, interpretApplyRaw } from './briefs';

describe('BYO 简报组装(与自家 LLM 路径同一批提示词纯函数)', () => {
  it('新元素无 Frame 也走自由设计；已有 kit 块才保留组件 props 契约', () => {
    const block = { id: 'b1', kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: '新组件' };
    const fresh = assembleComposeBrief({ block, instruction: '做一张对比卡', theme: 'general' });
    expect(fresh.format).toBe('html');
    expect(fresh.system).toContain('ACTIVE THEME');
    expect(fresh.prompt).toContain('```html');

    const kit = assembleComposeBrief({
      block,
      instruction: '把数字改成 52%',
      theme: 'general',
      kitCurrent: { component: 'metric', props: { value: '47%' } },
    });
    expect(kit.format).toBe('kit');
    expect(kit.system).toContain('MOTION GRAPHIC TYPES');
    expect(kit.system).toContain('{"custom": true}');
    expect(kit.system).not.toContain('ACTIVE THEME'); // 组件无主题:不给 token 表
    expect(kit.prompt).toContain('把数字改成 52%');
    const branded = assembleComposeBrief({ block, instruction: '做一张对比卡', theme: 'general', brandGraphics: 'BRAND GRAPHICS PROSE' });
    expect(branded.format).toBe('html');
    expect(branded.system).toContain('=== CREATOR BRAND GRAPHICS ===');
    expect(branded.system).toContain('BRAND GRAPHICS PROSE'); // 品牌图形=散文描述,全量进 system
    expect(branded.prompt).toContain('```html');
  });

  it('format 覆盖:custom 之后强制 markup 契约(无主题项目也能拿到)', () => {
    const block = { id: 'b1', kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: '新组件' };
    const b = assembleComposeBrief({ block, instruction: '画一张循环图', format: 'html' });
    expect(b.format).toBe('html');
    expect(b.prompt).toContain('```html');
  });

  it('kitCurrent:编辑 kit 块时现值进简报,未提及的字段能存活', () => {
    const block = { id: 'b1', kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: 'x' };
    const b = assembleComposeBrief({ block, instruction: '把数字改成 52%', kitCurrent: { component: 'metric', props: { value: '47%', label: '复购率' } } });
    expect(b.prompt).toContain('"component": "metric"');
    expect(b.prompt).toContain('复购率');
  });
  it('品牌图形嫁接:审美层品牌赢、工程契约不动的措辞进 theme(与 compose 路由同源单点)', () => {
    const t = assembleComposeTheme('general', undefined, 'BRAND GRAPHICS PROSE', 'PRIVATE QUALITY FLOOR');
    expect(t.indexOf('PRIVATE QUALITY FLOOR')).toBeLessThan(t.indexOf('BRAND GRAPHICS PROSE'));
    expect(t).toContain('=== HOST VISUAL CRAFT BASELINE ===');
    expect(t).not.toContain('hidden Frame');
    expect(t.indexOf('=== CREATOR BRAND GRAPHICS ===')).toBeLessThan(t.indexOf('BRAND GRAPHICS PROSE'));
    expect(t).toContain('THE BRAND WINS');
  });
  it('无品牌图形时不出品牌段;空白散文视同没有', () => {
    expect(assembleComposeTheme('general', undefined, null, 'PRIVATE QUALITY FLOOR')).not.toContain('CREATOR BRAND GRAPHICS');
    expect(assembleComposeTheme('general', undefined, '   ')).not.toContain('CREATOR BRAND GRAPHICS');
  });
});


describe('interpretApplyRaw(两执行器共享的三态判读)', () => {
  it('markup 走 html;组件 json 走 kit;未知组件单独打回', () => {
    expect(interpretApplyRaw('note\n```html\n<div></div>\n```\n```js\n```').kind).toBe('html');
    expect(interpretApplyRaw('好了\n```json\n{"component":"metric","props":{"value":"1"}}\n```')).toMatchObject({ kind: 'kit', component: 'metric' });
    expect(interpretApplyRaw('```json\n{"component":"sparkline","props":{}}\n```')).toMatchObject({ kind: 'kit-unknown', component: 'sparkline' });
  });
  it('custom / null 各是各的答案;垃圾退回 html 的既有兜底', () => {
    expect(interpretApplyRaw('```json\n{"custom": true}\n```').kind).toBe('custom');
    expect(interpretApplyRaw('```json\nnull\n```').kind).toBe('declined');
    expect(interpretApplyRaw('just prose').kind).toBe('html');
  });
});
