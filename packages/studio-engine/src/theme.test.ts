import { describe, expect, it } from 'vitest';
import { GENERAL_THEME, getTheme, themeForLlm, themeVarsCss } from './theme';
import { composeBlock } from './compose';

describe('themeForLlm', () => {
  it('= brief + 自动拼的 token 表(单一来源 vars)+ 背景', () => {
    const t = themeForLlm(GENERAL_THEME);
    expect(t).toContain('design system'); // brief 正文
    expect(t).toContain('--accent: #d8472f;'); // vars 自动落进 token 表
    expect(t).toContain(`root background: ${GENERAL_THEME.background}`);
  });
  it('token 表与 themeVarsCss 同源(卡面色注入时垫 90% 透明度)', () => {
    // panel/panel-2 是玻璃化例外:组件叠在视频上,注入值统一 hex+e6(见 themeVarsCss)
    const glass = new Set(['panel', 'panel-2']);
    for (const [k, v] of Object.entries(GENERAL_THEME.vars)) {
      expect(themeVarsCss(GENERAL_THEME)).toContain(`--${k}: ${glass.has(k) ? `${v}e6` : v};`);
    }
  });
});

describe('palette 派生覆盖(颜色随片自适应,结构不变)', () => {
  it('默认主题 = general(通用结构主题)', () => {
    expect(getTheme(undefined).id).toBe('general');
  });
  it('themeVarsCss:派生 accent 覆盖默认(合并替换,不重复)', () => {
    const css = themeVarsCss(GENERAL_THEME, { accent: 'hsl(10 64% 50%)' });
    expect(css).toContain('--accent: hsl(10 64% 50%);'); // 派生生效
    expect(css).not.toContain('--accent: #d8472f;'); // 默认被替换掉
  });
  it('themeForLlm:LLM 看到的是派生 accent', () => {
    const t = themeForLlm(GENERAL_THEME, { accent: 'hsl(10 64% 50%)', panel: 'hsl(10 14% 97%)' });
    expect(t).toContain('--accent: hsl(10 64% 50%);');
    expect(t).toContain('--panel: hsl(10 14% 97%);');
  });
});

// 抓住每次 chat 的 system,验证主题简报被注进去
function spyModel() {
  const seen: string[] = [];
  return {
    seen,
    chat: async (i: { system?: string; prompt: string }) => {
      seen.push(i.system ?? '');
      return { text: '```html\n<div id="root"></div>\n```\nok' };
    },
  };
}

describe('主题注进 compose 的 system', () => {
  const theme = themeForLlm(getTheme('general'));

  it('composeBlock 注入主题', async () => {
    const m = spyModel();
    await composeBlock(m, { block: { id: 'b1', kind: 'caption', innerHtml: '<div></div>', timelineBody: '' }, instruction: '换效果', theme });
    expect(m.seen[0]).toContain('ACTIVE THEME');
    expect(m.seen[0]).toContain('--accent: #d8472f;');
  });

  it('不传 theme 时 system 不含主题段', async () => {
    const m = spyModel();
    await composeBlock(m, { block: { id: 'b1', kind: 'caption', innerHtml: '<div></div>', timelineBody: '' }, instruction: '改标题' });
    expect(m.seen[0]).not.toContain('ACTIVE THEME');
  });
});
