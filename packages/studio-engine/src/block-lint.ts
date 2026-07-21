/**
 * 块产物静态检查(纯函数)—— LLM 生成的 innerHtml/timelineBody 在进 composition 前过一遍:
 * 未作用域的 CSS 会污染整个文档、vw/vh 破坏固定画布字号、script 标签是注入面、
 * 非确定性 API 破坏逐帧渲染、缺 data-edit 句柄断掉「双击就地改」。
 * 不过关 → 调用方带着 issue 列表让模型修一轮;修不好宁可保留占位也不进坏产物。
 */

export interface BlockLintIssue {
  code: 'unscoped-selector' | 'viewport-units' | 'script-tag' | 'nondeterministic' | 'no-data-edit';
  message: string;
}

/** 修一轮也压不下去就拒收的硬错误(坏 CSS/script 会伤及整个文档)。 */
export const HARD_LINT_CODES: ReadonlySet<string> = new Set(['unscoped-selector', 'script-tag', 'nondeterministic']);

export function lintBlock(args: { blockId: string; innerHtml: string; timelineBody: string }): BlockLintIssue[] {
  const { blockId, innerHtml, timelineBody } = args;
  const issues: BlockLintIssue[] = [];

  if (/<script\b/i.test(innerHtml)) {
    issues.push({ code: 'script-tag', message: 'innerHtml must not contain <script> — animation belongs in the timeline body' });
  }

  // <style> 作用域:每条规则的选择器都必须含 #blockId(剥掉 @keyframes 块;@container/@media 条件行跳过)
  for (const styleMatch of innerHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = styleMatch[1]!;
    const noKf = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, '');
    const ruleRe = /(^|\{|\})([^{}]+)\{/g;
    let m: RegExpExecArray | null;
    const flagged = new Set<string>();
    while ((m = ruleRe.exec(noKf)) !== null) {
      const sel = m[2]!.trim();
      if (!sel || sel.startsWith('@')) continue; // at-rule 条件行(其内部规则会被单独匹配到)
      if (!sel.includes(`#${blockId}`) && !flagged.has(sel)) {
        flagged.add(sel);
        issues.push({ code: 'unscoped-selector', message: `CSS selector "${sel.slice(0, 60)}" is not scoped under #${blockId}` });
      }
    }
    if (/\d(vw|vh)\b/i.test(css)) {
      issues.push({ code: 'viewport-units', message: 'vw/vh units are forbidden — use plain px on the fixed 1080-wide canvas' });
    }
  }

  if (/\b(setTimeout|setInterval|requestAnimationFrame|Date\.now|Math\.random)\b/.test(timelineBody)) {
    issues.push({ code: 'nondeterministic', message: 'timeline body must be deterministic — no timers / Date.now / Math.random / rAF' });
  }

  // 可见文本却没有任何 data-edit 句柄 → 双击就地改字失效
  const textish = innerHtml
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '');
  if (textish.length >= 8 && !/data-edit=/.test(innerHtml)) {
    issues.push({ code: 'no-data-edit', message: 'visible text must carry data-edit="<unique-key>" handles for in-place editing' });
  }

  return issues;
}
