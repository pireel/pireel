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

import type { RenderCtx, RenderResult } from "./contract";
import { metricSchema, renderMetric } from "./components/metric";
import { calloutSchema, renderCallout } from "./components/callout";
import { lowerThirdSchema, renderLowerThird } from "./components/lower-third";
import { kpiSchema, renderKpi } from "./components/kpi";
import { comparisonSchema, renderComparison } from "./components/comparison";
import { chartSchema, renderChart } from "./components/chart";
import { stepsSchema, renderSteps } from "./components/steps";
import { titleSchema, renderTitle } from "./components/title";
import { codeSchema, renderCode } from "./components/code";

export type { RenderCtx, RenderResult } from "./contract";
export { THEME_TOKENS, type ThemeToken, esc } from "./contract";
export {
  defineSchema,
  en,
  num,
  bool,
  text,
  reqText,
  color,
  rows,
  shownWhen,
  type PropsOf,
  type Schema,
  type Field,
} from "./schema";
export { typeScale, fitDown, isCjk, type TypeScale } from "./sizing";
export * as motion from "./motion";
export { catalogText, surfaceText, type CatalogDef } from "./catalog";
export {
  SURFACE_FIELDS,
  SURFACE_SWATCHES,
  surfaceCss,
  radiusCss,
  hasPanel,
  type SurfaceProps,
} from "./surface";
export {
  metricSchema,
  renderMetric,
  type MetricProps,
} from "./components/metric";
export {
  calloutSchema,
  renderCallout,
  type CalloutProps,
} from "./components/callout";
export {
  lowerThirdSchema,
  renderLowerThird,
  type LowerThirdProps,
} from "./components/lower-third";
export { kpiSchema, renderKpi, type KpiProps } from "./components/kpi";
export {
  comparisonSchema,
  renderComparison,
  type ComparisonProps,
} from "./components/comparison";
export { chartSchema, renderChart, type ChartProps } from "./components/chart";
export { stepsSchema, renderSteps, type StepsProps } from "./components/steps";
export { titleSchema, renderTitle, type TitleProps } from "./components/title";
export { codeSchema, renderCode, type CodeProps } from "./components/code";

export interface ComponentDef {
  /** JSON Schema (draft 2020-12) — the LLM/tool contract for this component's props. */
  jsonSchema: Record<string, unknown>;
  /** All-defaults props (required fields take their placeholder). */
  defaults: Record<string, unknown>;
  /** One-line purpose, for building component-catalog prompts. */
  summary: string;
  /** Compact bilingual retrieval vocabulary. This is index metadata, never copied wholesale into
   * a generation prompt; adding a component requires declaring how natural-language requests find it. */
  searchTerms: readonly string[];
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
    summary:
      "One headline number with kicker, note and trend — hero-number, split-editorial or badge staging.",
    searchTerms: [
      "metric",
      "number",
      "statistic",
      "percentage",
      "rate",
      "growth",
      "score",
      "数据",
      "数字",
      "大数字",
      "百分比",
      "比率",
      "增长",
      "指标",
    ],
    render: renderMetric,
    parse: metricSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  callout: {
    jsonSchema: calloutSchema.jsonSchema,
    defaults: calloutSchema.defaults,
    summary:
      "A spoken punchline set as type — poster keyword, pull-quote or verdict stamp.",
    searchTerms: [
      "callout",
      "quote",
      "keyword",
      "statement",
      "verdict",
      "insight",
      "warning",
      "punchline",
      "观点",
      "金句",
      "关键词",
      "结论",
      "洞察",
      "警告",
      "强调",
    ],
    render: renderCallout,
    parse: calloutSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  lowerThird: {
    jsonSchema: lowerThirdSchema.jsonSchema,
    defaults: lowerThirdSchema.defaults,
    summary:
      "Broadcast-style title+subtitle strip with an accent device — six display styles, entrance and exit choreographed.",
    searchTerms: [
      "lower third",
      "name",
      "identity",
      "speaker",
      "person",
      "job title",
      "byline",
      "姓名",
      "人名",
      "人物",
      "身份",
      "职位",
      "署名",
      "下三分之一",
    ],
    render: renderLowerThird,
    parse: lowerThirdSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  kpi: {
    jsonSchema: kpiSchema.jsonSchema,
    defaults: kpiSchema.defaults,
    summary:
      "2–4 numbers that belong together — hairline grid or one horizontal strip, counted up.",
    searchTerms: [
      "kpi",
      "metrics",
      "dashboard",
      "statistics",
      "multiple numbers",
      "data group",
      "指标组",
      "多指标",
      "多个数字",
      "数据组",
      "仪表盘",
    ],
    render: renderKpi,
    parse: kpiSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  comparison: {
    jsonSchema: comparisonSchema.jsonSchema,
    defaults: comparisonSchema.defaults,
    summary:
      "A vs B with a stance — split columns with a VS chip, or a typographic showdown; the winner takes the accent.",
    searchTerms: [
      "comparison",
      "compare",
      "versus",
      "vs",
      "before after",
      "pros cons",
      "对比",
      "比较",
      "左右对比",
      "优劣",
      "方案对比",
      "前后对比",
    ],
    render: renderComparison,
    parse: comparisonSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  chart: {
    jsonSchema: chartSchema.jsonSchema,
    defaults: chartSchema.defaults,
    summary:
      "A hand-built chart from real data — ranking bars, rising columns or a share donut, one accented series.",
    searchTerms: [
      "chart",
      "graph",
      "bar chart",
      "column chart",
      "donut",
      "ranking",
      "trend",
      "data visualization",
      "图表",
      "柱状图",
      "条形图",
      "环形图",
      "排名",
      "趋势",
      "数据可视化",
    ],
    render: renderChart,
    parse: chartSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  steps: {
    jsonSchema: stepsSchema.jsonSchema,
    defaults: stepsSchema.defaults,
    summary:
      "An ordered sequence revealed at presenter rhythm — numbered list, pipeline nodes or a timeline spine.",
    searchTerms: [
      "steps",
      "process",
      "timeline",
      "sequence",
      "list",
      "workflow",
      "roadmap",
      "步骤",
      "流程",
      "时间轴",
      "顺序",
      "列表",
      "工作流",
      "路线图",
    ],
    render: renderSteps,
    parse: stepsSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  title: {
    jsonSchema: titleSchema.jsonSchema,
    defaults: titleSchema.defaults,
    summary:
      "Opener / chapter / closer card — hero statement, indexed section marker, or outro with a CTA chip.",
    searchTerms: [
      "title",
      "opener",
      "chapter",
      "section",
      "closer",
      "outro",
      "headline",
      "cta",
      "标题",
      "开场",
      "章节",
      "章节页",
      "结尾",
      "片尾",
      "行动号召",
    ],
    render: renderTitle,
    parse: titleSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  code: {
    jsonSchema: codeSchema.jsonSchema,
    defaults: codeSchema.defaults,
    summary:
      "Exact source code staged as typing, a red/green diff, one-line focus, or an eased scroll to a target line.",
    searchTerms: [
      "code",
      "source code",
      "snippet",
      "diff",
      "pull request",
      "typing code",
      "highlight line",
      "代码",
      "源码",
      "代码片段",
      "代码高亮",
      "代码改动",
      "差异",
      "编程",
    ],
    render: renderCode,
    parse: codeSchema.parse as (p: unknown) => Record<string, unknown>,
  },
} satisfies Record<string, ComponentDef>;

export type ComponentId = keyof typeof components;

/** Render one component. Unknown ids throw (a host bug, not bad model output —
 *  gate model output with `isComponentId` first). */
export function render(
  component: ComponentId | (string & {}),
  id: string,
  props: unknown,
  ctx: RenderCtx,
): RenderResult {
  const def = (components as Record<string, ComponentDef>)[component];
  if (!def) throw new Error(`studio-kit: unknown component "${component}"`);
  return def.render(id, props, ctx);
}

export function isComponentId(v: unknown): v is ComponentId {
  return typeof v === "string" && v in components;
}
