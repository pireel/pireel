/**
 * Static lint of block output (pure function) — LLM-generated innerHtml/timelineBody
 * gets one pass before entering composition: unscoped CSS pollutes the whole
 * document, unstable CSS lengths break fixed-canvas sizing, script tags are an injection
 * surface, non-deterministic APIs break per-frame rendering, and a missing data-edit
 * handle disables double-click-to-edit.
 * Fails → the caller sends the issue list back to the model for one fix round;
 * if unfixable, keep a placeholder rather than commit bad output.
 */

export interface BlockLintIssue {
  code:
    | 'empty-content'
    | 'unscoped-selector'
    | 'non-px-length-unit'
    | 'missing-font-size'
    | 'script-tag'
    | 'nondeterministic'
    | 'no-data-edit';
  message: string;
}

/** Hard errors rejected even after a fix round (bad CSS/script harms the whole document). */
export const HARD_LINT_CODES: ReadonlySet<string> = new Set([
  'empty-content',
  'unscoped-selector',
  'non-px-length-unit',
  'missing-font-size',
  'script-tag',
  'nondeterministic',
]);

const FORBIDDEN_LENGTH_UNIT = /(?:^|[^\w.-])(-?(?:\d+(?:\.\d+)?|\.\d+))(rem|ex|ch|cap|ic|lh|rlh|cm|mm|q|in|pt|pc|vw|vh|vmin|vmax|cqw|cqh|cqi|cqb|cqmin|cqmax)\b/i;
const PLAIN_PX_FONT_SIZE = /^\s*(?:\d+(?:\.\d+)?|\.\d+)px\s*(?:!important\s*)?$/i;
const SEMANTIC_FONT_SIZE = /^\s*var\(\s*(--type-[\w-]+)\s*\)\s*(?:!important\s*)?$/i;
const CSS_DECLARATION = /([\w-]+)\s*:\s*([^;{}]+)/g;
const EM_LENGTH = /(-?(?:\d+(?:\.\d+)?|\.\d+))em\b/gi;

function declaredTypeTokens(css: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of css.matchAll(/(--type-[\w-]+)\s*:\s*(?:\d+(?:\.\d+)?|\.\d+)px\s*(?:!important\s*)?(?=;|})/gi)) {
    tokens.add(match[1]!.toLowerCase());
  }
  return tokens;
}

function isValidFontSize(value: string, typeTokens: ReadonlySet<string>): boolean {
  if (PLAIN_PX_FONT_SIZE.test(value)) return true;
  const semantic = SEMANTIC_FONT_SIZE.exec(value);
  return Boolean(semantic && typeTokens.has(semantic[1]!.toLowerCase()));
}

/** `em` is useful only when it deliberately follows a resolved text size. */
function invalidEmDeclaration(css: string): { property: string; value: string } | undefined {
  for (const match of css.matchAll(CSS_DECLARATION)) {
    const property = match[1]!.toLowerCase();
    const value = match[2]!.trim();
    const lengths = [...value.matchAll(EM_LENGTH)];
    if (lengths.length === 0) continue;

    if (property === 'letter-spacing' && lengths.every((entry) => Math.abs(Number(entry[1])) <= 0.2)) {
      continue;
    }
    if ((property === 'width' || property === 'height') && /^1(?:\.0+)?em\s*(?:!important\s*)?$/i.test(value)) {
      continue;
    }
    return { property, value };
  }
  return undefined;
}

export function lintBlock(args: { blockId: string; innerHtml: string; timelineBody: string }): BlockLintIssue[] {
  const { blockId, innerHtml, timelineBody } = args;
  const issues: BlockLintIssue[] = [];

  const contentMarkup = innerHtml
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const visibleText = contentMarkup.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s+/gi, '');
  const hasVisualContent = /<(?:svg|img|picture|video|canvas|path|circle|ellipse|rect|line|polyline|polygon)\b/i.test(contentMarkup);
  if (!visibleText && !hasVisualContent) {
    issues.push({ code: 'empty-content', message: 'generated block has no visible text or visual structure' });
  }

  if (/<script\b/i.test(innerHtml)) {
    issues.push({ code: 'script-tag', message: 'innerHtml must not contain <script> — animation belongs in the timeline body' });
  }

  const cssSources: string[] = [];
  // <style> scoping: every rule's selector must contain #blockId (strip @keyframes blocks; rules nested
  // inside @media/@container/@supports are checked like any other rule, only the condition line is skipped)
  for (const styleMatch of innerHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = styleMatch[1]!;
    cssSources.push(css);
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
  }
  for (const styleAttr of innerHtml.matchAll(/\sstyle\s*=\s*["']([^"']*)["']/gi)) {
    cssSources.push(styleAttr[1]!);
  }

  const allCss = cssSources.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  const typeTokens = declaredTypeTokens(allCss);
  const forbidden = FORBIDDEN_LENGTH_UNIT.exec(allCss);
  if (forbidden) {
    issues.push({
      code: 'non-px-length-unit',
      message: `CSS length unit "${forbidden[2]}" is unstable on the fixed canvas — use resolved type tokens or px; percentages are allowed only for relative placement and sizing`,
    });
  }
  const invalidEm = invalidEmDeclaration(allCss);
  if (invalidEm) {
    issues.push({
      code: 'non-px-length-unit',
      message: `CSS ${invalidEm.property} value "${invalidEm.value.slice(0, 40)}" uses em outside the allowed text-relative cases (bounded letter-spacing or a 1em inline icon)`,
    });
  }
  let hasValidFontSize = false;
  for (const match of allCss.matchAll(/font-size\s*:\s*([^;}]*)/gi)) {
    if (!isValidFontSize(match[1]!, typeTokens)) {
      issues.push({
        code: 'non-px-length-unit',
        message: `font-size must be explicit px or var(--type-*) declared to px in this component, received "${match[1]!.trim().slice(0, 40)}"`,
      });
      break;
    }
    hasValidFontSize = true;
  }
  if (visibleText && !hasValidFontSize) {
    issues.push({
      code: 'missing-font-size',
      message: 'visible text has no stable font-size — set a readable px baseline or declare --type-* tokens in px and apply one on the root wrapper',
    });
  }

  if (/\b(setTimeout|setInterval|requestAnimationFrame|Date\.now|Math\.random)\b/.test(timelineBody)) {
    issues.push({ code: 'nondeterministic', message: 'timeline body must be deterministic — no timers / Date.now / Math.random / rAF' });
  }

  // visible text with no data-edit handle → double-click in-place editing breaks
  const textish = visibleText;
  if (textish.length >= 8 && !/data-edit=/.test(innerHtml)) {
    issues.push({ code: 'no-data-edit', message: 'visible text must carry data-edit="<unique-key>" handles for in-place editing' });
  }

  return issues;
}
