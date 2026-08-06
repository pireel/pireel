import { describe, expect, it } from 'vitest';
import { assembleComposeBrief, assembleComposeTheme, interpretApplyRaw } from './briefs';

describe('BYO 简报组装(与自家 LLM 路径同一批提示词纯函数)', () => {
  it('路由随项目:无主题 → 组件契约(json 三态),挂主题 → markup 契约(playbook 进 system)', () => {
    const block = { id: 'b1', kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: '新组件' };
    const kit = assembleComposeBrief({ block, instruction: '做一张对比卡', theme: 'general' });
    expect(kit.format).toBe('kit');
    expect(kit.system).toContain('COMPONENTS');
    expect(kit.system).toContain('{"custom": true}');
    expect(kit.system).not.toContain('ACTIVE THEME'); // 组件无主题:不给 token 表
    expect(kit.prompt).toContain('做一张对比卡');
    const themed = assembleComposeBrief({ block, instruction: '做一张对比卡', theme: 'general', frame: { title: '双年展海报', body: 'FRAME BODY' } });
    expect(themed.format).toBe('html');
    expect(themed.system).toContain('FRAME BODY'); // 主题=散文描述,全量进 system
    expect(themed.prompt).toContain('```html');
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
  it('frame 嫁接:审美层 frame 赢、工程契约不动的措辞进 theme(与 compose 路由同源单点)', () => {
    const t = assembleComposeTheme('general', undefined, { title: '双年展海报', body: 'FRAME BODY' });
    expect(t).toContain('FRAME DESIGN LANGUAGE');
    expect(t).toContain('THE FRAME WINS');
    expect(t).toContain('FRAME BODY');
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
