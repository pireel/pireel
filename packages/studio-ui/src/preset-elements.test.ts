import { describe, expect, it } from 'vitest';
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
