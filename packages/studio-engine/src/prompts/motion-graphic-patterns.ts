/**
 * Open Motion Graphic capability map + query-time pattern retrieval.
 *
 * The map teaches breadth without becoming an enum. Detailed recipes are
 * retrieved only for the current moment, so the free-form designer gets enough
 * structural help without every prompt anchoring on the same small catalogue.
 */

import type { BlockEdit, ComposeContext } from "../compose";

export const MOTION_GRAPHIC_CAPABILITY_MAP = `MOTION GRAPHIC CAPABILITY MAP — OPEN, NOT EXHAUSTIVE
Choose a visual form from the communicative job and available evidence. The families below are landmarks,
not an allowlist, renderer ids, quotas, or a demand to use one of each. Combine, extend, or invent a more
specific form when that communicates the scene better.

- TYPE & EMPHASIS: kinetic words, quote/pull-quote, verdict, chapter, list, definition, question/answer.
- NUMBER & COMPARISON: one number, KPI group, A/B or versus, before/after, pros/cons, ranking, score/progress.
- DATA & CHANGE: bars/columns, line/area, donut/share, scatter, heatmap, waterfall, funnel, gauge, table.
- PROCESS & RELATION: steps, timeline, workflow, flowchart, cycle, causal chain, hierarchy/tree, matrix/quadrant,
  roadmap, network, system map.
- DEVICE & INTERFACE: authentic phone/app capture, real browser/webpage capture, desktop window, terminal,
  code editor, supplied product UI, notification, chat or feed behavior.
- REAL SOURCE & PLACE: document, article/headline, post/comment, screenshot, map/route, image evidence,
  annotation, magnifier or tracked callout.
- IDENTITY & NAVIGATION: lower third, source label, chapter marker, logo sting, CTA, status/progress indicator.
- SPATIAL & MEDIA: split screen, picture-in-picture, product stage, image sequence, contact sheet, reveal/mask,
  transition plate or a content-specific visual metaphor.

The same job can take many forms. A comparison may be split footage, a typographic showdown, two product
plates, a slope chart, or a before/after reveal. A process may be a path through real footage rather than a
diagram. Prefer the form that makes THIS evidence easiest to understand in the active visual direction.`;

export interface MotionGraphicPattern {
  id: string;
  terms: readonly string[];
  guidance: string;
}

export const MOTION_GRAPHIC_PATTERNS: readonly MotionGraphicPattern[] = [
  {
    id: "comparison",
    terms: ["compare", "comparison", "versus", "vs", "对比", "比较", "优劣"],
    guidance:
      "Comparison: choose the relation first—A/B, winner, trade-off, or delta. Use split plates, aligned rows, a typographic showdown, or a slope relation; keep both sides commensurable and make the conclusion visible.",
  },
  {
    id: "before-after",
    terms: [
      "before after",
      "before/after",
      "transformation",
      "前后",
      "改造前",
      "改造后",
      "变化前后",
    ],
    guidance:
      "Before/after: preserve the same scale and viewpoint. Reveal by wipe, matched cut, slider, or paired plates; label states directly and do not imply a transformation the evidence does not prove.",
  },
  {
    id: "code-editor",
    terms: [
      "code",
      "source code",
      "snippet",
      "programming",
      "diff",
      "pull request",
      "代码",
      "源码",
      "代码片段",
      "编程",
      "代码高亮",
      "代码改动",
    ],
    guidance:
      "Code/editor: choose motion by what the viewer must notice—typing for authorship, a red/green diff or morph for a change, one-line highlight for explanation, and an eased scroll for locating a target in a long file. Use exact supplied source verbatim when correctness matters; name the target line or changed hunk explicitly. Keep syntax type readable, dim context rather than removing it, settle on the result, and hold. Never use fake code texture or flashy motion to carry an explanation.",
  },
  {
    id: "terminal",
    terms: [
      "terminal",
      "command line",
      "cli",
      "shell",
      "console",
      "终端",
      "命令行",
      "控制台",
    ],
    guidance:
      "Terminal: show only the commands and output needed to prove the action. Type or reveal in meaningful groups, distinguish command from result, and end on a stable success/error state rather than endless typing.",
  },
  {
    id: "phone-source",
    terms: [
      "phone",
      "mobile",
      "app",
      "iphone",
      "android",
      "手机",
      "移动端",
      "应用",
      "app界面",
    ],
    guidance:
      "Phone/app source: use supplied or captured real interface pixels as the content plane. A minimal device edge may establish scale, but never invent a fake app screen, fake controls, or decorative pseudo-UI. Crop for legibility and animate one truthful scroll, tap, swipe, state change, or notification only when it carries the point. If no authentic source is available, ask for it or use a clearly abstract concept diagram rather than fabricating product evidence.",
  },
  {
    id: "browser-source",
    terms: [
      "browser",
      "website",
      "web page",
      "webpage",
      "url",
      "浏览器",
      "网页",
      "网站",
    ],
    guidance:
      "Browser/webpage source: use a real capture and retain only enough authentic chrome and page context to establish the source, then zoom, scroll, highlight, or extract one truthful detail. Never redraw a fake website or fill a browser shell with placeholder UI.",
  },
  {
    id: "document-source",
    terms: [
      "document",
      "article",
      "paper",
      "report",
      "news",
      "headline",
      "文档",
      "文章",
      "论文",
      "报告",
      "新闻",
      "标题",
    ],
    guidance:
      "Document/article: preserve the authentic page as evidence. Establish the source, crop into one passage, highlight or annotate it, and retain source/date context when credibility depends on it.",
  },
  {
    id: "social-source",
    terms: [
      "post",
      "comment",
      "tweet",
      "social",
      "feed",
      "chat",
      "message",
      "帖子",
      "评论",
      "社交",
      "聊天",
      "消息",
    ],
    guidance:
      "Post/chat/feed: preserve recognizable source structure and exact wording; reveal the relevant message or comment in context, not as a generic social card. Use reply/thread relationships only when they matter.",
  },
  {
    id: "map-route",
    terms: [
      "map",
      "route",
      "location",
      "place",
      "journey",
      "地图",
      "路线",
      "地点",
      "位置",
      "行程",
    ],
    guidance:
      "Map/route: use a real map capture or verified geographic source, establish start/end and scale, then draw one route or focus transition over that source. Labels and boundaries must stay factual. When factual geography is unavailable, use an explicitly schematic route diagram with no invented coastlines, streets, landmarks, or pseudo-map styling.",
  },
  {
    id: "annotation",
    terms: [
      "annotate",
      "callout",
      "point out",
      "highlight detail",
      "标注",
      "指出",
      "高亮",
      "细节",
    ],
    guidance:
      "Annotation: keep the underlying image/source visible. Use one tracked bracket, line, circle, magnifier, or local label tied to an observed feature; enter, hold, and clear without covering the evidence.",
  },
  {
    id: "bars-columns",
    terms: [
      "bar chart",
      "column chart",
      "ranking",
      "bars",
      "柱状图",
      "条形图",
      "排名",
    ],
    guidance:
      "Bars/columns: use a shared zero baseline, direct labels, proportional lengths/heights and one emphasized series. Reveal in the reading order that makes the ranking or delta obvious.",
  },
  {
    id: "line-area",
    terms: [
      "line chart",
      "area chart",
      "trend over time",
      "time series",
      "折线图",
      "面积图",
      "趋势",
      "时间序列",
    ],
    guidance:
      "Line/area: use time or another continuous axis honestly, draw the path in sequence, label decisive points directly and avoid decorative smoothing that changes the apparent data.",
  },
  {
    id: "donut-share",
    terms: [
      "donut",
      "pie chart",
      "share",
      "composition",
      "占比",
      "环形图",
      "饼图",
      "构成",
    ],
    guidance:
      "Share/donut: use only for parts of a whole with a verified total. Limit segments, label them directly, animate toward the final proportions and hold long enough to compare.",
  },
  {
    id: "scatter",
    terms: [
      "scatter",
      "correlation",
      "distribution",
      "quadrant data",
      "散点图",
      "相关性",
      "分布",
    ],
    guidance:
      "Scatter/distribution: preserve axes and scale, introduce the field before highlighting the cluster/outlier, and state correlation cautiously rather than implying causation.",
  },
  {
    id: "heatmap",
    terms: ["heatmap", "calendar heatmap", "intensity", "热力图", "密度图"],
    guidance:
      "Heatmap: define what color intensity means, keep cells comparable, reveal the pattern by row/region/time and isolate the meaningful hotspot without rainbow decoration.",
  },
  {
    id: "waterfall",
    terms: [
      "waterfall chart",
      "contribution",
      "bridge chart",
      "瀑布图",
      "增减项",
      "贡献",
    ],
    guidance:
      "Waterfall: start from a real baseline, reveal positive and negative contributions in causal/order sequence, and land on the reconciled final value.",
  },
  {
    id: "funnel",
    terms: [
      "funnel",
      "conversion stages",
      "drop off",
      "漏斗",
      "转化阶段",
      "流失",
    ],
    guidance:
      "Funnel: show ordered stages with real counts/rates, preserve proportional meaning where possible, and emphasize the actual drop-off or constraint rather than drawing a decorative narrowing shape.",
  },
  {
    id: "progress-gauge",
    terms: [
      "progress",
      "gauge",
      "completion",
      "score",
      "进度",
      "仪表",
      "完成度",
      "评分",
    ],
    guidance:
      "Progress/gauge: establish the target or scale, animate one bounded measure to the verified result, then hold. Avoid automotive dials when a direct bar/ring communicates more honestly.",
  },
  {
    id: "table-matrix",
    terms: [
      "table",
      "matrix",
      "quadrant",
      "grid comparison",
      "表格",
      "矩阵",
      "象限",
    ],
    guidance:
      "Table/matrix: keep rows/columns few and directly labeled. Reveal the organizing dimensions first, then entries, then one conclusion; do not miniaturize a spreadsheet.",
  },
  {
    id: "steps",
    terms: ["steps", "sequence", "how to", "步骤", "顺序", "教程"],
    guidance:
      "Steps: use 2–6 concise stages, reveal one at a time with the active step emphasized, preserve dependencies, and distribute timing across the full spoken thought.",
  },
  {
    id: "timeline",
    terms: [
      "timeline",
      "history",
      "milestone",
      "chronology",
      "时间轴",
      "历史",
      "里程碑",
    ],
    guidance:
      "Timeline: keep a truthful time axis, group events at meaningful intervals, reveal chronologically and use scale changes or chapter breaks when spacing is non-uniform.",
  },
  {
    id: "flowchart",
    terms: [
      "flowchart",
      "decision tree",
      "branch",
      "if then",
      "流程图",
      "决策树",
      "分支",
      "条件",
    ],
    guidance:
      "Flowchart/decision: use a clear entry, explicit conditions, directional connectors and a visible terminal state. Reveal the active route, dim alternatives, and avoid crossing lines or unlabeled arrows.",
  },
  {
    id: "cycle-loop",
    terms: [
      "cycle",
      "loop",
      "flywheel",
      "feedback loop",
      "循环",
      "闭环",
      "飞轮",
      "反馈",
    ],
    guidance:
      "Cycle/loop: use only when the end genuinely feeds the beginning. Establish the nodes, draw the directional relation, complete one pass, then hold the whole system.",
  },
  {
    id: "causal-chain",
    terms: [
      "cause",
      "effect",
      "causal",
      "because",
      "leads to",
      "因果",
      "导致",
      "所以",
    ],
    guidance:
      "Causal chain: separate evidence from inference, show one directional relation at a time, and do not convert mere sequence or correlation into causation.",
  },
  {
    id: "hierarchy-tree",
    terms: [
      "hierarchy",
      "tree",
      "taxonomy",
      "organization",
      "层级",
      "树状",
      "分类",
      "组织结构",
    ],
    guidance:
      "Hierarchy/tree: establish the root and grouping rule first, expand branches progressively, keep sibling levels aligned and stop before labels become unreadably small.",
  },
  {
    id: "roadmap",
    terms: [
      "roadmap",
      "phases",
      "plan",
      "future path",
      "路线图",
      "阶段",
      "规划",
    ],
    guidance:
      "Roadmap: separate time, dependency and priority. Use a path, lanes or phased horizon that reflects the real plan; reveal commitments and uncertainty distinctly.",
  },
  {
    id: "network-system",
    terms: [
      "network",
      "system map",
      "ecosystem",
      "connections",
      "网络",
      "系统图",
      "生态",
      "关系网",
    ],
    guidance:
      "Network/system map: limit visible nodes to those needed for the claim, encode different relation types consistently, reveal clusters before cross-links, and highlight one path or dependency as the payoff.",
  },
  {
    id: "split-screen",
    terms: [
      "split screen",
      "side by side",
      "multiple views",
      "分屏",
      "并排",
      "多画面",
    ],
    guidance:
      "Split screen: each plane must answer the other—comparison, simultaneous action, source plus result, or speaker plus evidence. Keep one dominant plane and synchronize the meaningful event.",
  },
  {
    id: "contact-sheet",
    terms: [
      "contact sheet",
      "gallery",
      "montage wall",
      "multiple images",
      "图片墙",
      "画廊",
      "多图",
      "素材墙",
    ],
    guidance:
      "Image/contact sheet: use a consistent crop logic and sequence images by meaning, not filename. Bring one image forward as the proof/payoff instead of leaving an equal-weight wall.",
  },
  {
    id: "logo-sting",
    terms: [
      "logo",
      "brand reveal",
      "ident",
      "logo animation",
      "品牌",
      "标志",
      "片头标",
    ],
    guidance:
      "Logo sting: derive entrance from the active direction, preserve the mark exactly, complete the lockup, remove scaffolding and hold the clean logo. Do not distort or redraw it.",
  },
];

export const MAX_MOTION_GRAPHIC_PATTERNS = 4;

export interface MotionGraphicPatternRetrievalInput {
  instruction: string;
  block?: Pick<BlockEdit, "label">;
  context?: Pick<ComposeContext, "beats">;
  limit?: number;
}

function normalized(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}%％]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function queryFor(input: MotionGraphicPatternRetrievalInput): string {
  return [
    input.instruction,
    input.block?.label ?? "",
    ...(input.context?.beats?.slice(0, 8).map((beat) => beat.text) ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 1000);
}

function scorePattern(pattern: MotionGraphicPattern, query: string): number {
  const q = normalized(query);
  const compact = q.replace(/\s+/g, "");
  let score = 0;
  for (const term of pattern.terms) {
    const normalizedTerm = normalized(term);
    const termCompact = normalizedTerm.replace(/\s+/g, "");
    const cjk = /\p{Script=Han}/u.test(normalizedTerm);
    if (cjk ? compact.includes(termCompact) : q.includes(normalizedTerm)) {
      score += 20 + Math.min(12, [...termCompact].length);
    }
  }
  return score;
}

export function retrieveMotionGraphicPatterns(
  input: MotionGraphicPatternRetrievalInput,
): string[] {
  const limit = Math.min(
    Math.max(Math.round(input.limit ?? MAX_MOTION_GRAPHIC_PATTERNS), 1),
    MAX_MOTION_GRAPHIC_PATTERNS,
  );
  const query = queryFor(input);
  return MOTION_GRAPHIC_PATTERNS.map((pattern) => ({
    id: pattern.id,
    score: scorePattern(pattern, query),
  }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((entry) => entry.id);
}

export function motionGraphicPatternSection(
  patternIds: readonly string[],
): string {
  const selected = patternIds
    .map((id) => MOTION_GRAPHIC_PATTERNS.find((pattern) => pattern.id === id))
    .filter((pattern): pattern is MotionGraphicPattern => pattern != null);
  if (!selected.length) {
    return `MOMENT-SPECIFIC FORM REFERENCES
No close reference was retrieved. Derive a content-specific structure from the evidence, active visual direction,
and Motion Graphic capability map. Do not fall back to a generic card merely because no named pattern matched.`;
  }
  return `MOMENT-SPECIFIC FORM REFERENCES — RETRIEVED, NOT REQUIRED OUTPUT TYPES
Use these as structural help for this moment. They are not renderer ids or an allowlist; combine, transform, or
ignore them when another form communicates the evidence better. The active visual direction owns appearance.
${selected.map((pattern) => `- ${pattern.id}: ${pattern.guidance}`).join("\n")}`;
}
