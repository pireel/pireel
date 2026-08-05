import { describe, expect, it } from 'vitest';
import { ELEMENT_TEMPLATES } from './gen-templates/element';
import { ElementTemplateCard } from './gen-templates/element-card';
import { localizedTemplatePrompt } from './gen-templates/types';
import { presetElements } from './preset-elements';

/**
 * 预置默认时间轴 ↔ 标记对账:时间轴里的每个 .class 选择器必须真实存在于该预置的
 * innerHtml——选择器落空 = tween 无靶 = 该段从第 0 帧静止可见(用户真机踩过)。
 * (同步后的时间轴由 LLM 看真实 HTML 改写,不在此钉;这里只守插入时的默认动画。)
 */
describe('预置默认时间轴选择器对账', () => {
  for (const p of presetElements()) {
    it(`${p.id}: 默认时间轴选择器全部有靶`, () => {
      let n = 0;
      for (const m of p.element.timelineBody.matchAll(new RegExp(`#${p.id}\\s+((?:\\.[A-Za-z][\\w-]*\\s*)+)`, 'g'))) {
        for (const c of m[1]!.trim().split(/\s+/)) {
          const cls = c.slice(1);
          n++;
          expect(new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"`).test(p.element.innerHtml), `${p.id}: .${cls} 无靶`).toBe(true);
        }
      }
      expect(n).toBeGreaterThan(0);
    });
  }
});

describe('生成区组件模板', () => {
  it('12 张模板卡使用唯一 ID，并由生成区和官方素材复用同一套可插入视觉定义', () => {
    expect(ELEMENT_TEMPLATES).toHaveLength(12);
    expect(new Set(ELEMENT_TEMPLATES.map((template) => template.id)).size).toBe(ELEMENT_TEMPLATES.length);
    expect(typeof ElementTemplateCard).toBe('function');
  });

  it('每张模板都有中英文提示词并按界面语言选择', () => {
    for (const template of ELEMENT_TEMPLATES) {
      expect(template.prompt.trim().length, `${template.id}: 英文提示词为空`).toBeGreaterThan(20);
      expect(template.promptI18n?.zh?.trim().length, `${template.id}: 中文提示词为空`).toBeGreaterThan(10);
      expect(localizedTemplatePrompt(template, 'zh-CN')).toBe(template.promptI18n!.zh);
      expect(localizedTemplatePrompt(template, 'en-US')).toBe(template.prompt);
    }
  });
});
