import { describe, expect, it } from 'vitest';
import { HARD_LINT_CODES, lintBlock } from './block-lint';

const ID = 'b7';
const ok = (innerHtml: string, timelineBody = '') => lintBlock({ blockId: ID, innerHtml, timelineBody });

describe('lintBlock(块产物静态检查)', () => {
  it('合规产物零 issue(作用域选择器 + @container + data-edit)', () => {
    const html = `
<div class="wrap"><b data-edit="headline">完播率提升</b><i class="ul"></i></div>
<style>
#b7 .wrap{position:absolute;inset:0;container-type:size;display:flex;font-size:36px}
@container (aspect-ratio > 1.1){ #b7 .wrap{flex-direction:row} }
#b7 .ul{height:8px;background:var(--accent)}
</style>`;
    expect(ok(html, "tl.from('#b7 .ul',{scaleX:0,duration:.4},0);")).toEqual([]);
  });

  it('未作用域选择器 → unscoped-selector(会污染整个文档,硬错误)', () => {
    const issues = ok(`<div data-edit="t">文字四个</div><style>.wrap{color:red} #b7 .x{color:blue}</style>`);
    expect(issues.map((i) => i.code)).toContain('unscoped-selector');
    expect(HARD_LINT_CODES.has('unscoped-selector')).toBe(true);
  });

  it('空壳组件不能以成功状态写入时间线', () => {
    for (const html of ['', '<div></div>', '<div class="wrap"></div><style>#b7 .wrap{position:absolute;inset:0}</style>']) {
      const issues = ok(html);
      expect(issues.map((issue) => issue.code)).toContain('empty-content');
    }
    expect(HARD_LINT_CODES.has('empty-content')).toBe(true);
  });

  it('@keyframes 里的百分比选择器不误报', () => {
    const issues = ok(`<div data-edit="t">文字四个字</div><style>@keyframes spin{0%{opacity:0}100%{opacity:1}} #b7 .x{color:blue}</style>`);
    expect(issues.filter((i) => i.code === 'unscoped-selector')).toEqual([]);
  });

  it('@media/@container 内部的未作用域选择器同样命中(不被条件行掩护)', () => {
    const media = ok(`<div data-edit="t">文字四个字</div><style>@media (min-width:1px){ .card{position:absolute;inset:0} }</style>`);
    expect(media.map((i) => i.code)).toContain('unscoped-selector');
    const container = ok(`<div data-edit="t">文字四个字</div><style>@container (aspect-ratio > 1.1){ .wrap{flex-direction:row} }</style>`);
    expect(container.map((i) => i.code)).toContain('unscoped-selector');
  });

  it('非 px 长度、script、非确定性 API、缺 data-edit 各自命中', () => {
    for (const value of ['1cm', '12pt', '2rem', '5vw', '8cqmin']) {
      const issues = ok(`<div data-edit="t">文字四个字</div><style>#b7 .x{font-size:${value}}</style>`);
      expect(issues.map((i) => i.code), value).toContain('non-px-length-unit');
      expect(HARD_LINT_CODES.has('non-px-length-unit')).toBe(true);
    }
    expect(ok(`<div data-edit="t">文</div><script>alert(1)</script>`).map((i) => i.code)).toContain('script-tag');
    expect(ok(`<div data-edit="t">文字四个字</div>`, 'setTimeout(()=>{},100)').map((i) => i.code)).toContain('nondeterministic');
    expect(ok(`<div>这是一段没有句柄的可见文字</div>`).map((i) => i.code)).toContain('no-data-edit');
  });

  it('可见文字没有 px 字号基线时命中硬错误，避免落到浏览器默认 16px', () => {
    const missing = ok(`<div data-edit="t">没有字号</div><style>#b7 .x{color:white}</style>`);
    expect(missing.map((i) => i.code)).toContain('missing-font-size');
    expect(HARD_LINT_CODES.has('missing-font-size')).toBe(true);
    expect(ok(`<div data-edit="t">明确字号</div><style>#b7 .x{font-size:36px}</style>`)).toEqual([]);
  });

  it('纯结构无文本(如只有图形)不要求 data-edit', () => {
    expect(ok(`<svg viewBox="0 0 10 10"><circle r="4"/></svg><style>#b7 svg{width:100%}</style>`)).toEqual([]);
  });
});
