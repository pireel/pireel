/**
 * Static lint of block output (pure function) — LLM-generated innerHtml/timelineBody
 * gets one pass before entering composition: unscoped CSS pollutes the whole
 * document, unstable CSS lengths break fixed-canvas sizing, script tags are an injection
 * surface, non-deterministic APIs break per-frame rendering, and a missing data-edit
 * handle disables double-click-to-edit.
 * Fails → the caller sends the issue list back to the model for one fix round;
 * if unfixable, keep a placeholder rather than commit bad output.
 */

import { BLOCK_MIN_READABLE_FONT_PX } from './block-typography';

export interface BlockLintIssue {
  code:
    | 'empty-content'
    | 'unscoped-selector'
    | 'non-px-length-unit'
    | 'too-small-font-size'
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
  'too-small-font-size',
  'script-tag',
  'nondeterministic',
]);

const FORBIDDEN_LENGTH_UNIT = /(?:^|[^\w.-])(-?(?:\d+(?:\.\d+)?|\.\d+))(rem|ex|ch|cap|ic|lh|rlh|cm|mm|q|in|pt|pc|vw|vh|vmin|vmax)\b/i;
const CONTAINER_LENGTH_UNIT = /(?:^|[^\w.-])(-?(?:\d+(?:\.\d+)?|\.\d+))(cqw|cqh|cqi|cqb|cqmin|cqmax)\b/i;
const PLAIN_PX_FONT_SIZE = /^\s*(?:\d+(?:\.\d+)?|\.\d+)px\s*(?:!important\s*)?$/i;
const SEMANTIC_FONT_SIZE = /^\s*var\(\s*(--type-[\w-]+)\s*\)\s*(?:!important\s*)?$/i;
const PLATFORM_FLUID_FONT_SIZE = /^\s*min\(\s*-?(?:\d+(?:\.\d+)?|\.\d+)cqw\s*,\s*-?(?:\d+(?:\.\d+)?|\.\d+)cqh\s*\)\s*(?:!important\s*)?$/i;

type TypeResolution = { kind: 'px'; value: number } | { kind: 'platform-fluid' };

function typeTokenDeclarations(css: string): Array<{ name: string; value: string }> {
  return [...css.matchAll(/(--type-[\w-]+)\s*:\s*([^;{}]+)(?=;|}|$)/gi)].map((match) => ({
    name: match[1]!.toLowerCase(),
    value: match[2]!.trim(),
  }));
}

function declaredTypeTokens(css: string, platformFluidized: boolean): Map<string, TypeResolution> {
  const tokens = new Map<string, TypeResolution>();
  for (const { name, value } of typeTokenDeclarations(css)) {
    if (PLAIN_PX_FONT_SIZE.test(value)) tokens.set(name, { kind: 'px', value: Number.parseFloat(value) });
    else if (platformFluidized && PLATFORM_FLUID_FONT_SIZE.test(value)) tokens.set(name, { kind: 'platform-fluid' });
  }
  return tokens;
}

function resolveFontSize(value: string, typeTokens: ReadonlyMap<string, TypeResolution>, platformFluidized: boolean): TypeResolution | undefined {
  if (PLAIN_PX_FONT_SIZE.test(value)) return { kind: 'px', value: Number.parseFloat(value) };
  const semantic = SEMANTIC_FONT_SIZE.exec(value);
  if (semantic) return typeTokens.get(semantic[1]!.toLowerCase());
  if (platformFluidized && PLATFORM_FLUID_FONT_SIZE.test(value)) return { kind: 'platform-fluid' };
  return undefined;
}

function explicitFontSizeValues(css: string): string[] {
  return [...css.matchAll(/(?:^|[;{}\n])\s*font-size\s*:\s*([^;}]*)/gi)].map((match) => match[1]!.trim());
}

function hasFontShorthand(css: string): boolean {
  return /(?:^|[;{}\n])\s*font\s*:/i.test(css);
}

function splitSelectorList(selector: string): string[] {
  const selectors: string[] = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const ch = selector[i]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '[') bracketDepth += 1;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      selectors.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  selectors.push(selector.slice(start).trim());
  return selectors.filter(Boolean);
}

function selectorHasScope(selector: string, blockId: string): boolean {
  const escapedId = blockId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`#${escapedId}(?![\\w-])`).test(selector);
}

/** Native CSS nesting inherits its parent's scope; root grouping at-rules do not. */
function unscopedSelectors(css: string, blockId: string): string[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = new Set<string>();
  const stack: Array<{ scoped: boolean; ignore: boolean }> = [];
  let buf = '';
  let quote = '';
  let escaped = false;
  let parenDepth = 0;
  let bracketDepth = 0;

  for (const ch of source) {
    if (quote) {
      buf += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(') parenDepth += 1;
    else if (ch === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === '[') bracketDepth += 1;
    else if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1);

    if (parenDepth === 0 && bracketDepth === 0 && ch === '{') {
      const prelude = buf.trim();
      buf = '';
      const parent = stack.at(-1);
      const parentScoped = parent?.scoped ?? false;
      if (parent?.ignore || /^@(?:-webkit-)?keyframes\b/i.test(prelude) || /^@(font-face|font-feature-values|property|page|counter-style)\b/i.test(prelude)) {
        stack.push({ scoped: parentScoped, ignore: true });
        continue;
      }
      if (prelude.startsWith('@')) {
        const scoped = parentScoped || (/^@scope\b/i.test(prelude) && selectorHasScope(prelude, blockId));
        stack.push({ scoped, ignore: false });
        continue;
      }

      const selectors = splitSelectorList(prelude);
      const scoped = parentScoped || (selectors.length > 0 && selectors.every((selector) => selectorHasScope(selector, blockId)));
      if (!parentScoped) {
        for (const selector of selectors) if (!selectorHasScope(selector, blockId)) found.add(selector);
      }
      stack.push({ scoped, ignore: false });
      continue;
    }
    if (parenDepth === 0 && bracketDepth === 0 && ch === '}') {
      buf = '';
      stack.pop();
      continue;
    }
    if (parenDepth === 0 && bracketDepth === 0 && ch === ';') {
      buf = '';
      continue;
    }
    buf += ch;
  }
  return [...found];
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
  // Selector-list branches are checked independently. Grouping at-rules keep walking,
  // while keyframes/declaration at-rules are ignored and nested rules inherit a scoped parent.
  for (const styleMatch of innerHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    const css = styleMatch[1]!;
    cssSources.push(css);
    for (const selector of unscopedSelectors(css, blockId)) {
      issues.push({ code: 'unscoped-selector', message: `CSS selector "${selector.slice(0, 60)}" is not scoped under #${blockId}` });
    }
  }
  for (const styleAttr of innerHtml.matchAll(/\sstyle\s*=\s*["']([^"']*)["']/gi)) {
    cssSources.push(styleAttr[1]!);
  }

  const allCss = cssSources.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  // Generated CSS may not choose container units. The platform's insertion transform does,
  // and marks that output so reopening it in Source/AI edit uses the exact same validator.
  const platformFluidized = /\bdata-hf-fluidized\b/i.test(innerHtml)
    || /<div\s+style=["']position:absolute;inset:0;container-type:size;["']>/i.test(innerHtml);
  const typeTokens = declaredTypeTokens(allCss, platformFluidized);
  const forbidden = FORBIDDEN_LENGTH_UNIT.exec(allCss);
  if (forbidden) {
    issues.push({
      code: 'non-px-length-unit',
      message: `CSS length unit "${forbidden[2]}" is unstable on the fixed canvas — use resolved type tokens or px; percentages are allowed only for relative placement and sizing`,
    });
  }
  const containerUnit = CONTAINER_LENGTH_UNIT.exec(allCss);
  if (containerUnit && !platformFluidized) {
    issues.push({
      code: 'non-px-length-unit',
      message: `CSS length unit "${containerUnit[2]}" belongs to Studio's internal fluidization step — generated source must use px or percentages`,
    });
  }
  if (hasFontShorthand(allCss)) {
    issues.push({
      code: 'non-px-length-unit',
      message: 'font shorthand obscures the resolved text size — declare font-family, font-weight, line-height and font-size separately',
    });
  }
  const invalidTypeTokens = new Set<string>();
  for (const { name, value } of typeTokenDeclarations(allCss)) {
    const resolved = typeTokens.get(name);
    if (!resolved) {
      invalidTypeTokens.add(name);
      issues.push({
        code: 'non-px-length-unit',
        message: `typography token ${name} must resolve directly to px, received "${value.slice(0, 40)}"`,
      });
      break;
    }
    if (resolved.kind === 'px' && resolved.value < BLOCK_MIN_READABLE_FONT_PX) {
      invalidTypeTokens.add(name);
      issues.push({
        code: 'too-small-font-size',
        message: `typography token ${name} resolves to ${resolved.value}px; Motion Graphic text must be at least ${BLOCK_MIN_READABLE_FONT_PX}px on the authored canvas`,
      });
      break;
    }
  }
  for (const value of explicitFontSizeValues(allCss)) {
    const semantic = SEMANTIC_FONT_SIZE.exec(value);
    if (semantic && invalidTypeTokens.has(semantic[1]!.toLowerCase())) continue;
    const resolved = resolveFontSize(value, typeTokens, platformFluidized);
    if (!resolved) {
      issues.push({
        code: 'non-px-length-unit',
        message: `font-size must be explicit px or var(--type-*) declared to px in this component, received "${value.slice(0, 40)}"`,
      });
      break;
    }
    if (resolved.kind === 'px' && resolved.value < BLOCK_MIN_READABLE_FONT_PX) {
      issues.push({
        code: 'too-small-font-size',
        message: `font-size "${value.slice(0, 40)}" resolves to ${resolved.value}px; Motion Graphic text must be at least ${BLOCK_MIN_READABLE_FONT_PX}px on the authored canvas`,
      });
      break;
    }
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
