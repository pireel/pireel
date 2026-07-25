/**
 * Static lint of block output (pure function) — LLM-generated innerHtml/timelineBody
 * gets one pass before entering composition: unscoped CSS pollutes the whole
 * document, vw/vh breaks the fixed-canvas font sizing, script tags are an injection
 * surface, non-deterministic APIs break per-frame rendering, and a missing data-edit
 * handle disables double-click-to-edit.
 * Fails → the caller sends the issue list back to the model for one fix round;
 * if unfixable, keep a placeholder rather than commit bad output.
 */

export interface BlockLintIssue {
  code: 'unscoped-selector' | 'viewport-units' | 'script-tag' | 'nondeterministic' | 'no-data-edit';
  message: string;
}

/** Hard errors rejected even after a fix round (bad CSS/script harms the whole document). */
export const HARD_LINT_CODES: ReadonlySet<string> = new Set(['unscoped-selector', 'script-tag', 'nondeterministic']);

export function lintBlock(args: { blockId: string; innerHtml: string; timelineBody: string }): BlockLintIssue[] {
  const { blockId, innerHtml, timelineBody } = args;
  const issues: BlockLintIssue[] = [];

  if (/<script\b/i.test(innerHtml)) {
    issues.push({ code: 'script-tag', message: 'innerHtml must not contain <script> — animation belongs in the timeline body' });
  }

  // <style> scoping: every rule's selector must contain #blockId (strip @keyframes blocks; rules nested
  // inside @media/@container/@supports are checked like any other rule, only the condition line is skipped)
  for (const styleMatch of innerHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = styleMatch[1]!;
    const noKf = css.replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, '');
    const flagged = new Set<string>();
    let buf = '';
    for (const ch of noKf) {
      if (ch === '{') {
        const sel = buf.trim();
        buf = '';
        if (!sel || sel.startsWith('@')) continue; // at-rule condition line; its body is walked by the same loop
        if (!sel.includes(`#${blockId}`) && !flagged.has(sel)) {
          flagged.add(sel);
          issues.push({ code: 'unscoped-selector', message: `CSS selector "${sel.slice(0, 60)}" is not scoped under #${blockId}` });
        }
      } else if (ch === '}' || ch === ';') {
        buf = ''; // end of a rule body or declaration: whatever accumulated is not a selector
      } else {
        buf += ch;
      }
    }
    if (/\d(vw|vh)\b/i.test(css)) {
      issues.push({ code: 'viewport-units', message: 'vw/vh units are forbidden — use plain px on the fixed 1080-wide canvas' });
    }
  }

  if (/\b(setTimeout|setInterval|requestAnimationFrame|Date\.now|Math\.random)\b/.test(timelineBody)) {
    issues.push({ code: 'nondeterministic', message: 'timeline body must be deterministic — no timers / Date.now / Math.random / rAF' });
  }

  // visible text with no data-edit handle → double-click in-place editing breaks
  const textish = innerHtml
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, '');
  if (textish.length >= 8 && !/data-edit=/.test(innerHtml)) {
    issues.push({ code: 'no-data-edit', message: 'visible text must carry data-edit="<unique-key>" handles for in-place editing' });
  }

  return issues;
}
