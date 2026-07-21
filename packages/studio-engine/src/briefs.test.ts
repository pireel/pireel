import { describe, expect, it } from 'vitest';
import { assembleComposeBrief, assembleComposeTheme, assemblePlanBrief } from './briefs';

describe('BYO 简报组装(与自家 LLM 路径同一批提示词纯函数)', () => {
  it('compose 简报:system 带工程契约+ACTIVE THEME,prompt 带指令与输出格式契约', () => {
    const b = assembleComposeBrief({
      block: { id: 'b1', kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: '新组件' },
      instruction: '做一张对比卡',
      theme: 'general',
    });
    expect(b.system).toContain('ACTIVE THEME');
    expect(b.prompt).toContain('做一张对比卡');
    // 输出格式契约在 prompt 末尾(note → ```html → ```js),apply_block 按同一契约解析
    expect(b.prompt).toContain('```html');
  });
  it('frame 嫁接:审美层 frame 赢、工程契约不动的措辞进 theme(与 compose 路由同源单点)', () => {
    const t = assembleComposeTheme('general', undefined, { title: '双年展海报', body: 'FRAME BODY' });
    expect(t).toContain('FRAME DESIGN LANGUAGE');
    expect(t).toContain('THE FRAME WINS');
    expect(t).toContain('FRAME BODY');
  });
  it('plan 简报:单发 JSON 契约(非工具环变体),句子进 prompt', () => {
    const b = assemblePlanBrief({ sentences: [{ index: 0, text: '大家好', start: 0, end: 1.2 }], theme: 'general' });
    expect(b.prompt).toContain('大家好');
    expect(b.system.length).toBeGreaterThan(100);
  });
});
