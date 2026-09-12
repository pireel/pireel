/**
 * Static lint of block output (pure function) — LLM-generated innerHtml/timelineBody
 * gets one pass before entering composition: the renderer scopes and recovers styles;
 * CSS diagnostics are advisory. Script tags are an injection
 * surface, non-deterministic APIs break per-frame rendering, and a missing data-edit
 * handle disables double-click-to-edit.
 * Only a blocking contract failure may request one targeted model repair. Visual advice
 * never triggers regeneration; the preview is the authority for final appearance.
 */

import { compileComponentStyles } from './component-styles';
import { artPresetTextScale, BLOCK_MIN_READABLE_FONT_PX } from './block-typography';
import { componentPropsRequirement, componentPropsUsage, hasComponentPropsManifest, parseComponentProps } from './component-props';

export interface BlockLintIssue {
  code:
    | 'empty-content'
    | 'css-recovery'
    | 'non-px-length-unit'
    | 'too-small-font-size'
    | 'script-tag'
    | 'nondeterministic'
    | 'no-data-edit'
    | 'props-invalid'
    | 'props-unused'
    | 'props-missing';
  message: string;
}

/** Admission gates protect the executable/document contract. Typography and editable-property
 * advice is non-blocking and must never spend another model call merely to silence a warning. */
export const HARD_LINT_CODES: ReadonlySet<string> = new Set([
  'empty-content',
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

export function lintBlock(args: { blockId: string; innerHtml: string; timelineBody: string; propsSchema?: string; requireProps?: boolean; boxPx?: { w: number; h: number } }): BlockLintIssue[] {
  const { blockId, innerHtml, timelineBody, propsSchema } = args;
  const issues: BlockLintIssue[] = [];
  const textScale = artPresetTextScale(innerHtml, args.boxPx);

  const contentMarkup = innerHtml
    .replace(/<!--([\s\S]*?)-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');
  const visibleText = contentMarkup.replace(/<[^>]+>/g, '').replace(/&nbsp;|\s+/gi, '');
  const hasVisualContent = /<(?:svg|img|picture|video|canvas|path|circle|ellipse|rect|line|polyline|polygon)\b/i.test(contentMarkup);
  if (!visibleText && !hasVisualContent) {
    issues.push({ code: 'empty-content', message: 'generated block has no visible text or visual structure' });
  }

  if (/<script\b/i.test(innerHtml)) {
    issues.push({ code: 'script-tag', message: 'innerHtml must not contain <script> — the runtime loads nothing beyond GSAP (no external libraries, canvas/WebGL or iframes); animation belongs in the timeline body, visuals in markup/CSS/SVG' });
  }

  const cssSources: string[] = [];
  for (const warning of compileComponentStyles(innerHtml, blockId).warnings) issues.push({ code: 'css-recovery', message: warning });
  for (const styleMatch of innerHtml.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) cssSources.push(styleMatch[1]!);
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
    if (resolved.kind === 'px' && resolved.value * textScale < BLOCK_MIN_READABLE_FONT_PX) {
      invalidTypeTokens.add(name);
      issues.push({
        code: 'too-small-font-size',
        message: `typography token ${name} resolves to ${Math.round(resolved.value * textScale * 100) / 100}px on screen; Motion Graphic text must be at least ${BLOCK_MIN_READABLE_FONT_PX}px on the authored canvas`,
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
    if (resolved.kind === 'px' && resolved.value * textScale < BLOCK_MIN_READABLE_FONT_PX) {
      issues.push({
        code: 'too-small-font-size',
        message: `font-size "${value.slice(0, 40)}" resolves to ${Math.round(resolved.value * textScale * 100) / 100}px on screen; Motion Graphic text must be at least ${BLOCK_MIN_READABLE_FONT_PX}px on the authored canvas`,
      });
      break;
    }
  }

  if (/\b(setTimeout|setInterval|requestAnimationFrame|Date\.now|Math\.random)\b/.test(timelineBody)) {
    issues.push({ code: 'nondeterministic', message: 'timeline body must be deterministic — no timers / Date.now / Math.random / rAF' });
  }

  // Editable properties (only judged when the component declares a properties schema — the ```json
  // fence, stored in slots.propsSchema). A broken schema renders as "no properties" and is reported
  // for the fix round; a value the model wrote itself (--p-* / data-p-* inside the markup) shadows the
  // container's and defeats every override. The generation gate makes properties mandatory (a bespoke
  // component without a schema cannot be tuned in the inspector); everything already on the timeline is
  // judged only when it declares one.
  if (args.requireProps) {
    const missing = componentPropsRequirement(propsSchema);
    if (missing) issues.push({ code: 'props-missing', message: missing });
  }
  if (hasComponentPropsManifest(propsSchema)) {
    const { specs, issues: schemaIssues } = parseComponentProps(propsSchema);
    for (const issue of schemaIssues) issues.push({ code: 'props-invalid', message: `properties schema: ${issue}` });
    const usage = componentPropsUsage(innerHtml, specs);
    for (const own of usage.ownDeclarations) {
      issues.push({ code: 'props-invalid', message: `${own} must not be written inside the markup — Studio sets every declared property on #${blockId}; consume it with var(--p-<key>) / #${blockId}[data-p-<key>="v"]` });
    }
    for (const key of usage.unused) issues.push({ code: 'props-unused', message: `the properties schema declares "${key}" but the markup never reads var(--p-${key}) or [data-p-${key}]` });
  }

  // visible text with no data-edit handle → double-click in-place editing breaks
  const textish = visibleText;
  if (textish.length >= 8 && !/data-edit=/.test(innerHtml)) {
    issues.push({ code: 'no-data-edit', message: 'visible text must carry data-edit="<unique-key>" handles for in-place editing' });
  }

  return issues;
}
