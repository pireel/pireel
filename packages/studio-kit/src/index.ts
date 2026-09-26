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
import { STYLE_FIELDS, groupOf } from "./groups";
import type { Field } from "./schema";
import { metricSchema, renderMetric } from "./components/metric";
import { calloutSchema, renderCallout } from "./components/callout";
import { lowerThirdSchema, renderLowerThird } from "./components/lower-third";
import { kpiSchema, renderKpi } from "./components/kpi";
import { comparisonSchema, renderComparison } from "./components/comparison";
import { chartSchema, renderChart } from "./components/chart";
import { stepsSchema, renderSteps } from "./components/steps";
import { titleSchema, renderTitle } from "./components/title";
import { codeSchema, renderCode } from "./components/code";
import { ctaSchema, renderCta } from "./components/cta";
import { countdownSchema, renderCountdown } from "./components/countdown";
import { offerSchema, renderOffer } from "./components/offer";
import { checklistSchema, renderChecklist } from "./components/checklist";
import { qaSchema, renderQa } from "./components/qa";
import { locationSchema, renderLocation } from "./components/location";
import { rankingSchema, renderRanking } from "./components/ranking";
import { mythFactSchema, renderMythFact } from "./components/myth-fact";
import { particleTitleSchema, renderParticleTitle } from "./components/particle-title";

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
export { PROPERTY_GROUPS, STYLE_FIELDS, groupOf, type PropertyGroup } from "./groups";
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
export { ctaSchema, renderCta, type CtaProps } from "./components/cta";
export { countdownSchema, renderCountdown, type CountdownProps } from "./components/countdown";
export { offerSchema, renderOffer, type OfferProps } from "./components/offer";
export { checklistSchema, renderChecklist, type ChecklistProps } from "./components/checklist";
export { qaSchema, renderQa, type QaProps } from "./components/qa";
export { locationSchema, renderLocation, type LocationProps } from "./components/location";
export { rankingSchema, renderRanking, type RankingProps } from "./components/ranking";
export { mythFactSchema, renderMythFact, type MythFactProps } from "./components/myth-fact";
export { particleTitleSchema, renderParticleTitle, type ParticleTitleProps } from "./components/particle-title";

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
const componentDefs = {
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
  cta: {
    jsonSchema: ctaSchema.jsonSchema,
    defaults: ctaSchema.defaults,
    summary:
      "The closing ask — a follow button that gets pressed, or an arrow-led action line.",
    searchTerms: [
      "cta",
      "call to action",
      "follow",
      "subscribe",
      "like",
      "comment",
      "link in bio",
      "关注",
      "点赞",
      "订阅",
      "评论",
      "行动号召",
      "下期预告",
      "领取",
    ],
    render: renderCta,
    parse: ctaSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  countdown: {
    jsonSchema: countdownSchema.jsonSchema,
    defaults: countdownSchema.defaults,
    summary:
      "A number counting down to the moment — digits in a draining ring or slammed alone, paced across the block.",
    searchTerms: [
      "countdown",
      "timer",
      "seconds",
      "count",
      "hurry",
      "倒计时",
      "计时",
      "秒",
      "倒数",
      "限时",
    ],
    render: renderCountdown,
    parse: countdownSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  offer: {
    jsonSchema: offerSchema.jsonSchema,
    defaults: offerSchema.defaults,
    summary:
      "A price drop — old price struck, new price lands big, perk stamped on; or one strip.",
    searchTerms: [
      "offer",
      "price",
      "discount",
      "deal",
      "sale",
      "promo",
      "coupon",
      "价格",
      "优惠",
      "折扣",
      "原价",
      "现价",
      "限时",
      "直播间",
      "赠品",
    ],
    render: renderOffer,
    parse: offerSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  checklist: {
    jsonSchema: checklistSchema.jsonSchema,
    defaults: checklistSchema.defaults,
    summary:
      "Items that tick off (or get crossed out) as the speaker names them.",
    searchTerms: [
      "checklist",
      "checks",
      "todo",
      "to-do",
      "list",
      "tick",
      "requirements",
      "清单",
      "检查",
      "打勾",
      "要点",
      "待办",
      "注意事项",
    ],
    render: renderChecklist,
    parse: checklistSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  qa: {
    jsonSchema: qaSchema.jsonSchema,
    defaults: qaSchema.defaults,
    summary:
      "A question answered on screen — Q/A tags with the answer landing big, or the answer taking the block.",
    searchTerms: [
      "q&a",
      "question",
      "answer",
      "faq",
      "ask",
      "问答",
      "问题",
      "回答",
      "答疑",
      "提问",
    ],
    render: renderQa,
    parse: qaSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  location: {
    jsonSchema: locationSchema.jsonSchema,
    defaults: locationSchema.defaults,
    summary:
      "Where we are — a dropped map pin beside the place name, or a compact one-line tag.",
    searchTerms: [
      "location",
      "place",
      "city",
      "address",
      "venue",
      "map",
      "pin",
      "地点",
      "位置",
      "城市",
      "地址",
      "定位",
      "来到",
    ],
    render: renderLocation,
    parse: locationSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  ranking: {
    jsonSchema: rankingSchema.jsonSchema,
    defaults: rankingSchema.defaults,
    summary:
      "A top-N counted down to the winner, or shown as a podium.",
    searchTerms: [
      "ranking",
      "top",
      "best",
      "list",
      "winner",
      "leaderboard",
      "podium",
      "排行",
      "排名",
      "榜单",
      "前三",
      "第一名",
      "推荐",
    ],
    render: renderRanking,
    parse: rankingSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  mythFact: {
    jsonSchema: mythFactSchema.jsonSchema,
    defaults: mythFactSchema.defaults,
    summary:
      "A common belief corrected — the myth is struck out and the fact rises, or both side by side.",
    searchTerms: [
      "myth",
      "fact",
      "misconception",
      "truth",
      "wrong",
      "actually",
      "误区",
      "真相",
      "谣言",
      "其实",
      "误解",
      "纠正",
    ],
    render: renderMythFact,
    parse: mythFactSchema.parse as (p: unknown) => Record<string, unknown>,
  },
  particleTitle: {
    jsonSchema: particleTitleSchema.jsonSchema,
    defaults: particleTitleSchema.defaults,
    summary:
      "A short title that assembles out of particles (WebGL), then resolves into crisp type — an opener or a big reveal.",
    searchTerms: [
      "particle",
      "particles",
      "reveal",
      "opener",
      "intro",
      "title",
      "logo",
      "粒子",
      "开场",
      "片头",
      "揭晓",
      "标题",
    ],
    render: renderParticleTitle,
    parse: particleTitleSchema.parse as (p: unknown) => Record<string, unknown>,
  },
} satisfies Record<string, ComponentDef>;

/** Every component with the shared property model applied: the style group joins its contract and
 *  each property carries its group (`x-group`) for editors. Rendering is unchanged — the host
 *  applies style around the component. */
function withSharedGroups<T extends Record<string, ComponentDef>>(defs: T): T {
  const styleProps = Object.fromEntries(Object.entries(STYLE_FIELDS).map(([k, f]) => [k, f.jsonSchema]));
  const styleDefaults = Object.fromEntries(Object.entries(STYLE_FIELDS).map(([k, f]) => [k, f.fallback]));
  const parseStyle = (input: unknown) => {
    const src = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
    return Object.fromEntries(Object.entries(STYLE_FIELDS).map(([k, f]) => {
      const c = (f as Field<unknown>).coerce(src[k]);
      return [k, c !== undefined ? c : f.fallback];
    }));
  };
  return Object.fromEntries(Object.entries(defs).map(([id, def]) => {
    const own = (def.jsonSchema.properties ?? {}) as Record<string, Record<string, unknown>>;
    const properties = Object.fromEntries(
      Object.entries({ ...own, ...styleProps }).map(([k, f]) => [k, { ...f, "x-group": groupOf(k, f) }]),
    );
    return [id, {
      ...def,
      jsonSchema: { ...def.jsonSchema, properties },
      defaults: { ...def.defaults, ...styleDefaults },
      ...(def.parse ? { parse: (p: unknown) => ({ ...def.parse!(p), ...parseStyle(p) }) } : {}),
    }];
  })) as unknown as T;
}

export const components = withSharedGroups(componentDefs);

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
