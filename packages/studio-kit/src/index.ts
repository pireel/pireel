/**
 * Studio Kit — typed motion-graphics components for video overlays.
 *
 * JSON in, animated HTML out:
 *
 *   import { render, components } from '@pireel/studio-kit';
 *
 *   const { html, timeline } = render('metric', 'b1',
 *     { value: '47%', label: 'conversion lift', trend: 'up' },
 *     { box: { w: 900, h: 620 }, canvas: { w: 1080, h: 1920 } });
 *
 * `components.metric.jsonSchema` is the structured-output contract to hand an
 * LLM; whatever comes back goes straight into `render` — parsing never throws,
 * malformed fields degrade to designed defaults.
 */

import type { RenderCtx, RenderResult } from './contract';
import { renderBlueprint, type Blueprint } from './blueprint';
import { surfaceCss, type SurfaceProps } from './surface';
import { typeScale } from './sizing';
import { metricSchema, renderMetric } from './components/metric';
import { calloutSchema, renderCallout } from './components/callout';
import { lowerThirdSchema, renderLowerThird } from './components/lower-third';
import { kpiSchema, renderKpi } from './components/kpi';
import { comparisonSchema, renderComparison } from './components/comparison';
import { chartSchema, renderChart } from './components/chart';
import { stepsSchema, renderSteps } from './components/steps';
import { titleSchema, renderTitle } from './components/title';

export type { RenderCtx, RenderResult } from './contract';
export { THEME_TOKENS, type ThemeToken, esc } from './contract';
export { defineSchema, en, num, bool, text, reqText, color, rows, shownWhen, type PropsOf, type Schema, type Field } from './schema';
export { typeScale, fitDown, isCjk, type TypeScale } from './sizing';
export * as motion from './motion';
export { renderBlueprint, type Blueprint, type MotionStep } from './blueprint';
export { themeVars, themeBlueprints, type Theme, type Palette } from './theme';
export { themes } from './themes/index';
export { SURFACE_FIELDS, SURFACE_SWATCHES, surfaceCss, radiusCss, hasPanel, type SurfaceProps } from './surface';
export { metricSchema, renderMetric, type MetricProps } from './components/metric';
export { calloutSchema, renderCallout, type CalloutProps } from './components/callout';
export { lowerThirdSchema, renderLowerThird, type LowerThirdProps } from './components/lower-third';
export { kpiSchema, renderKpi, type KpiProps } from './components/kpi';
export { comparisonSchema, renderComparison, type ComparisonProps } from './components/comparison';
export { chartSchema, renderChart, type ChartProps } from './components/chart';
export { stepsSchema, renderSteps, type StepsProps } from './components/steps';
export { titleSchema, renderTitle, type TitleProps } from './components/title';

export interface ComponentDef {
  /** JSON Schema (draft 2020-12) — the LLM/tool contract for this component's props. */
  jsonSchema: Record<string, unknown>;
  /** All-defaults props (required fields take their placeholder). */
  defaults: Record<string, unknown>;
  /** One-line purpose, for building component-catalog prompts. */
  summary: string;
  render: (id: string, props: unknown, ctx: RenderCtx) => RenderResult;
  /** Schema gate — used when a blueprint stages the component instead of a built-in variant. */
  parse?: (props: unknown) => Record<string, unknown>;
}

/** The component registry. Additions are minor versions; renames/removals are never —
 *  props stored years ago must keep rendering. */
export const components = {
  metric: {
    jsonSchema: metricSchema.jsonSchema,
    defaults: metricSchema.defaults,
    summary: 'One headline number with kicker, note and trend — hero-number, split-editorial or badge staging.',
    render: renderMetric,
    parse: metricSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  callout: {
    jsonSchema: calloutSchema.jsonSchema,
    defaults: calloutSchema.defaults,
    summary: 'A spoken punchline set as type — poster keyword, pull-quote or verdict stamp.',
    render: renderCallout,
    parse: calloutSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  lowerThird: {
    jsonSchema: lowerThirdSchema.jsonSchema,
    defaults: lowerThirdSchema.defaults,
    summary: 'Broadcast-style title+subtitle strip with an accent device — six display styles, entrance and exit choreographed.',
    render: renderLowerThird,
    parse: lowerThirdSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  kpi: {
    jsonSchema: kpiSchema.jsonSchema,
    defaults: kpiSchema.defaults,
    summary: '2–4 numbers that belong together — hairline grid or one horizontal strip, counted up.',
    render: renderKpi,
    parse: kpiSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  comparison: {
    jsonSchema: comparisonSchema.jsonSchema,
    defaults: comparisonSchema.defaults,
    summary: 'A vs B with a stance — split columns with a VS chip, or a typographic showdown; the winner takes the accent.',
    render: renderComparison,
    parse: comparisonSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  chart: {
    jsonSchema: chartSchema.jsonSchema,
    defaults: chartSchema.defaults,
    summary: 'A hand-built chart from real data — ranking bars, rising columns or a share donut, one accented series.',
    render: renderChart,
    parse: chartSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  steps: {
    jsonSchema: stepsSchema.jsonSchema,
    defaults: stepsSchema.defaults,
    summary: 'An ordered sequence revealed at presenter rhythm — numbered list, pipeline nodes or a timeline spine.',
    render: renderSteps,
    parse: stepsSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  title: {
    jsonSchema: titleSchema.jsonSchema,
    defaults: titleSchema.defaults,
    summary: 'Opener / chapter / closer card — hero statement, indexed section marker, or outro with a CTA chip.',
    render: renderTitle,
    parse: titleSchema.parse as (p: unknown) => Record<string, unknown>,
  },
} satisfies Record<string, ComponentDef>;

export type ComponentId = keyof typeof components;

/** Render one component. Unknown ids throw (a host bug, not bad model output —
 *  gate model output with `isComponentId` first). */
export function render(component: ComponentId | (string & {}), id: string, props: unknown, ctx: RenderCtx): RenderResult {
  const def = (components as Record<string, ComponentDef>)[component];
  if (!def) throw new Error(`studio-kit: unknown component "${component}"`);
  const bp = ctx.blueprint as Blueprint | undefined;
  if (bp && bp.component === component && typeof bp.html === 'string') {
    // Theme staging: props are still parsed by the component's own schema (so a blueprint can
    // never receive a value the component wouldn't accept), then arranged by the blueprint.
    const parsed = def.parse ? def.parse(props) : (props as Record<string, unknown>);
    const p = parsed as unknown as SurfaceProps;
    const s = typeScale(ctx);
    const surface = 'surface' in parsed ? surfaceCss(p, s) : '';
    const out = renderBlueprint(bp, id, parsed as Record<string, unknown>, s, surface);
    return { html: out.html, timeline: out.timeline };
  }
  return def.render(id, props, ctx);
}

export function isComponentId(v: unknown): v is ComponentId {
  return typeof v === 'string' && v in components;
}
