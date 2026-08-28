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

  it('逗号选择器逐项检查，不能由一个已作用域分支掩护全局分支', () => {
    const mixed = ok(`<div data-edit="t">文字四个</div><style>#b7 .safe, .leak{font-size:36px}</style>`);
    expect(mixed.map((issue) => issue.code)).toContain('unscoped-selector');
    expect(ok(`<div data-edit="t">文字四个</div><style>#b7 .a, #b7 .b{font-size:36px}</style>`)).toEqual([]);
  });

  it('原生 CSS nesting 继承父选择器作用域，不误报内部相对选择器', () => {
    const issues = ok(`<div data-edit="t">文字四个</div><style>#b7 .wrap{font-size:36px;.title{color:white}@media (min-width:1px){&>.mark{width:2em}}}</style>`);
    expect(issues).toEqual([]);
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

  it('未声明字号的文字继承平台 36px 基线，显式字号不得低于 24px', () => {
    expect(ok(`<div data-edit="t">继承平台字号</div><style>#b7 .x{color:white}</style>`)).toEqual([]);
    expect(ok(`<div data-edit="t">最小字号</div><style>#b7 .x{font-size:24px}</style>`)).toEqual([]);
    const tooSmall = ok(`<div data-edit="t">过小字号</div><style>#b7 .x{font-size:23px}</style>`);
    expect(tooSmall.map((issue) => issue.code)).toContain('too-small-font-size');
    expect(HARD_LINT_CODES.has('too-small-font-size')).toBe(true);
  });

  it('语义字号 token 必须在组件内解析为 px', () => {
    expect(ok(`<div data-edit="t">语义字号</div><style>#b7{--type-body:36px}#b7 .x{font-size:var(--type-body)}</style>`)).toEqual([]);
    const unresolved = ok(`<div data-edit="t">未知字号</div><style>#b7 .x{font-size:var(--type-body)}</style>`);
    expect(unresolved.map((issue) => issue.code)).toContain('non-px-length-unit');
    const tooSmall = ok(`<div data-edit="t">过小语义字号</div><style>#b7{--type-meta:20px}#b7 .x{font-size:var(--type-meta)}</style>`);
    expect(tooSmall.map((issue) => issue.code)).toContain('too-small-font-size');
    const unusedTooSmall = ok(`<div data-edit="t">继承平台字号</div><style>#b7{--type-unused:18px}</style>`);
    expect(unusedTooSmall.map((issue) => issue.code)).toContain('too-small-font-size');
    const unstableToken = ok(`<div data-edit="t">继承平台字号</div><style>#b7{--type-unused:2em}</style>`);
    expect(unstableToken.map((issue) => issue.code)).toContain('non-px-length-unit');
  });

  it('font 简写不能绕过显式字号契约', () => {
    const shorthand = ok(`<div data-edit="t">简写字号</div><style>#b7 .x{font:700 18px/1.2 var(--font-body)}</style>`);
    expect(shorthand.map((issue) => issue.code)).toContain('non-px-length-unit');
  });

  it('平台基线让 em 间距和装饰稳定，但 font-size 本身仍不能使用 em', () => {
    expect(ok(`<div data-edit="t">安全相对单位<svg/></div><style>#b7 .x{font-size:36px;letter-spacing:.4em;padding-left:.4em}#b7 svg{width:2em;height:1em}</style>`)).toEqual([]);

    const relativeFont = ok(`<div data-edit="t">不稳定字号</div><style>#b7 .x{font-size:2em}</style>`);
    expect(relativeFont.map((issue) => issue.code)).toContain('non-px-length-unit');
    expect(ok(`<svg viewBox="0 0 10 10"><circle r="4"/></svg><style>#b7 svg{width:2em}</style>`)).toEqual([]);
  });

  it('只允许平台流式化产物携带容器单位，模型原始输出仍拒绝', () => {
    const fluid = `<div data-hf-fluidized style="container-type:size"><div data-edit="t">流式布局</div></div><style>#b7 .x{font-size:36px;padding:min(4cqw,3cqh)}</style>`;
    expect(ok(fluid)).toEqual([]);
    const raw = ok(fluid.replace(' data-hf-fluidized', ''));
    expect(raw.map((issue) => issue.code)).toContain('non-px-length-unit');
  });

  it('旧版平台流式字号可继续编辑，新生成的同类写法仍被拒绝', () => {
    const legacy = `<div style="position:absolute;inset:0;container-type:size;"><div data-edit="t">旧版流式字号</div><style>#b7 .x{font-size:min(8cqw,4cqh)}</style></div>`;
    expect(ok(legacy)).toEqual([]);
    const raw = ok(`<div data-edit="t">模型流式字号</div><style>#b7 .x{font-size:min(8cqw,4cqh)}</style>`);
    expect(raw.map((issue) => issue.code)).toContain('non-px-length-unit');
  });

  it('纯结构无文本(如只有图形)不要求 data-edit', () => {
    expect(ok(`<svg viewBox="0 0 10 10"><circle r="4"/></svg><style>#b7 svg{width:100%}</style>`)).toEqual([]);
  });
});
