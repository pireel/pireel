/**
 * 一键成片初稿 —— 规划阶段(口播稿 + 画面 → **场景化分镜 storyboard**)。
 *
 * 2026-06 重写:从「逐句演法」改成「**LLM 统筹分场景**」。agent 读全稿(+画面提示)把句子
 * **归并成 N 个场景**,每个场景 = 句子区间(= 语义驱动的分镜切点)+ 取景 + 一个**设计图形 brief**
 * (从完整组件词汇里选:数字/对比/流程/结构/KPI/图表/时间轴/循环/callout/列表/标题 + 从稿里抠的真实数据)。
 * **设计图形为主**(绝大多数场景都有),字幕/花字默认关、纯可选。build-draft 据场景切镜 + 落待配图占位。
 */

import { PLAN_SYSTEM, PLAN_SYSTEM_TOOLS, planWithActiveTheme } from './prompts';

interface ChatCapable {
  chat: (i: {
    system?: string;
    prompt: string;
    hint?: { quality?: 'high' | 'standard' | 'cheap'; provider?: string; provider_model_id?: string };
  }) => Promise<{ text: string }>;
}

/** 取景:镜头怎么取(给设计图形腾位)。build-draft 结合画面把它落成具体 ShotTreatment。 */
export type Framing = 'full' | 'punch-in' | 'corner' | 'split';
export const FRAMINGS: Framing[] = ['full', 'punch-in', 'corner', 'split'];

/** 设计图形组件类型(对齐 compose.ts BLOCK_SYSTEM 的组件词汇)。 */
export type GraphicComponent =
  | 'metric'
  | 'comparison'
  | 'pipeline'
  | 'structure'
  | 'kpi'
  | 'chart'
  | 'timeline'
  | 'loop'
  | 'callout'
  | 'list'
  | 'title';
export const GRAPHIC_COMPONENTS: GraphicComponent[] = [
  'metric',
  'comparison',
  'pipeline',
  'structure',
  'kpi',
  'chart',
  'timeline',
  'loop',
  'callout',
  'list',
  'title',
];

/** 图形体量档(LLM 按叙事权重选):badge=过场小签 · card=常规(默认)· banner=通栏横带 · poster=主角时刻。
 *  build-draft 按档在几何安全区内裁实际落框——治「所有图形一个尺寸」。 */
export type GraphicSize = 'badge' | 'card' | 'banner' | 'poster';
export const GRAPHIC_SIZES: GraphicSize[] = ['badge', 'card', 'banner', 'poster'];

/** 一个场景要出的设计图形:选组件 + 设计简报 + 从口播里抠的真实数据。 */
export interface SceneGraphic {
  component: GraphicComponent;
  /** 中文:这个片段展示什么、怎么排版(焦点组件 + 结构)。 */
  brief: string;
  /** 真实数字 / 要点 / 关键词(从这几句里逐字抠,逗号或换行分隔)。 */
  data?: string;
  /** 体量档(缺省 card)。 */
  size?: GraphicSize;
}

/** 场景 = 一组连续句子归并成的一个分镜单元。 */
export interface Scene {
  /** 覆盖的句子 index 区间(含两端)。 */
  from: number;
  to: number;
  framing: Framing;
  /** 该场景的设计图形(设计图形为主,绝大多数场景都有;纯过渡句/录屏可空)。 */
  graphic?: SceneGraphic;
  /** 可选:该场景叠的口播关键词(仅主题开字幕时 build-draft 会铺)。 */
  emphasis?: string[];
}

export interface DraftPlan {
  title?: { text: string; sub?: string; durationSec: number };
  scenes: Scene[];
  outro?: { text: string; sub?: string; durationSec: number };
  /** 插入段自己的场景(平权分镜:布局按它切镜/取景/落占位)。缺省 = 插入段整段一拍。 */
  inserts?: InsertPlan[];
}

export interface PlanSentence {
  index: number;
  text: string;
  start: number;
  end: number;
}

/** 每句的画面提示(来自画面分析):内容类型 + 哪侧安全。 */
export interface PlanVisual {
  index: number;
  content: string; // talkinghead | screen | broll | slide | other
  safe: string; // left | right | top | bottom | full | none
}

/** 多源主轨的插入片段(规划上下文):atSec=主源时间锚点(插在哪个主源切点),
 *  text=该段口播内容(没有则空)。带 sentences(**该片段自己的源时钟**)时,句子经
 *  unifiedPlanRows 交织进统一叙事流平权参与规划;没有句子(无口播/没转写)则维持
 *  整段一拍(prompt 标记行,场景绕开)。 */
export interface PlanInsert {
  atSec: number;
  durationSec: number;
  text: string;
  /** 该插入段自己的分句(index 从 0 起,start/end 是**这个片段源文件**的秒)。 */
  sentences?: { index: number; start: number; end: number; text: string }[];
}

/** 插入段自己的场景规划(clip = 插入段枚举的 1 起序号,与 insertPlanContexts 顺序一致)。
 *  注意:这是**装配层的分解产物**——LLM 面对的是统一叙事流(unifiedPlanRows),
 *  不感知这个结构;分解在 assemblePlan 里按行来源自动做。 */
export interface InsertPlan {
  clip: number;
  scenes: Scene[];
}

/** 统一叙事流的一行:主叙述句或插入段句,按成片叙事顺序排列。规划的索引空间
 *  就是这份行号(0 起连续)——LLM 整体读、整体切场景;local 记回各来源自己的
 *  句子索引,装配层据此把全局场景分解回 主/各插入段。 */
export interface PlanRow {
  /** 'main' | 插入段序号(1 起)。 */
  src: 'main' | number;
  /** 该来源自己的句子索引。 */
  local: number;
  /** 该来源**自己时钟**的秒(跨来源不连续,pacing 只在同源行内比)。 */
  start: number;
  end: number;
  text: string;
}

/** 主叙述句 + 插入段句 → 统一叙事流(按锚点交织)。插入的语义就是"叙事中间的
 *  一拍",导演必须整体读——这里是唯一的交织点,所有生产/装配方共用防漂移。
 *  无句子的插入段不占行(在 prompt 里以标记行呈现,场景绕开它)。 */
export function unifiedPlanRows(sentences: PlanSentence[], inserts?: PlanInsert[]): PlanRow[] {
  const rows: PlanRow[] = [];
  const main = [...sentences].sort((a, b) => a.start - b.start);
  const pending = (inserts ?? []).map((c, k) => ({ c, k })).filter((x) => !!x.c.sentences?.length);
  const flushBefore = (t: number) => {
    while (pending.length && pending[0]!.c.atSec <= t + 0.05) {
      const { c, k } = pending.shift()!;
      for (const r of c.sentences!) rows.push({ src: k + 1, local: r.index, start: r.start, end: r.end, text: r.text });
    }
  };
  for (const m of main) {
    flushBefore(m.start); // 锚点=前最近主源段末:主句起点越过锚点前先落插入段行
    rows.push({ src: 'main', local: m.index, start: m.start, end: m.end, text: m.text });
  }
  flushBefore(Infinity);
  return rows;
}

/** 规划提示词(核心约束 + 输出契约)装配在 prompts/index.ts,正文在 prompts/plan-*.md。 */
export { PLAN_SYSTEM, PLAN_SYSTEM_TOOLS };

export function buildPlanPrompt(args: {
  sentences: PlanSentence[];
  videoDurationSec: number;
  topic?: string;
  visuals?: PlanVisual[];
  inserts?: PlanInsert[];
}): string {
  const vmap = new Map((args.visuals ?? []).map((v) => [v.index, v]));
  // 统一叙事流:主句与插入段句按锚点交织成**一份稿子**——插入的语义就是叙事中间的
  // 一拍,LLM 必须整体读、整体切场景(分开各排各的索引会让它失去叙事上下文,踩过)。
  const rows = unifiedPlanRows(args.sentences, args.inserts);
  const hasClips = rows.some((r) => r.src !== 'main');
  // 无句子的插入段:不占行号,以标记行插在锚点处(场景绕开它;它是自己的无声一拍)
  const silent = (args.inserts ?? []).map((c, k) => ({ c, k })).filter((x) => !x.c.sentences?.length);
  const lineFor = (r: PlanRow, g: number) => {
    const v = r.src === 'main' ? vmap.get(r.local) : undefined;
    const hint = v ? `  [frame:${v.content} · safe:${v.safe}]` : '';
    const tag = r.src === 'main' ? '' : `[clip #${r.src}] `;
    return `${g}. ${tag}[${r.start.toFixed(1)}-${r.end.toFixed(1)}] ${r.text}${hint}`;
  };
  const printed: string[] = [];
  {
    const pendingSilent = [...silent];
    let lastMainEnd = 0;
    rows.forEach((r, g) => {
      if (r.src === 'main') {
        while (pendingSilent.length && pendingSilent[0]!.c.atSec <= r.start + 0.05) {
          const { c, k } = pendingSilent.shift()!;
          printed.push(`--- [clip #${k + 1}] ${c.durationSec.toFixed(1)}s inserted footage, no speech — its own silent beat; no scene or graphic covers it ---`);
        }
        lastMainEnd = r.end;
      }
      printed.push(lineFor(r, g));
    });
    for (const { c, k } of pendingSilent) {
      void lastMainEnd;
      printed.push(`--- [clip #${k + 1}] ${c.durationSec.toFixed(1)}s inserted footage, no speech — its own silent beat; no scene or graphic covers it ---`);
    }
  }
  return [
    args.topic ? `Topic hint: ${args.topic}` : '',
    `Video duration: ${args.videoDurationSec.toFixed(1)}s. The FULL script in narrative order (row. [start-end] text, with picture hints where available):`,
    printed.join('\n'),
    hasClips || silent.length
      ? `INSERTED CLIPS: rows tagged [clip #k] are spliced-in footage — part of the SAME narrative, planned together with everything around them (their graphics/framing come from their own words, with full context of the surrounding story). Their timestamps are the clip's OWN clock (they restart; compare times only within one source). HARD RULE: a scene must never mix [clip #k] rows with narration rows, or rows of two different clips — the footage changes at the boundary, so end the scene there and start a new one. Untagged "---" marker lines are silent clips: their footage stays untouched; no scene or graphic covers them.`
      : '',
    `Segment these row indices into scenes and produce the scene plan (cover every row exactly once, in order).`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function coerceGraphic(g: unknown): SceneGraphic | undefined {
  if (!g || typeof g !== 'object') return undefined;
  const o = g as Record<string, unknown>;
  const component = GRAPHIC_COMPONENTS.includes(o.component as GraphicComponent)
    ? (o.component as GraphicComponent)
    : 'callout';
  const brief = typeof o.brief === 'string' ? o.brief.trim() : '';
  if (!brief) return undefined; // 没简报的图形没意义
  const data = typeof o.data === 'string' && o.data.trim() ? o.data.trim() : undefined;
  const size = GRAPHIC_SIZES.includes(o.size as GraphicSize) ? (o.size as GraphicSize) : undefined;
  return { component, brief, ...(data ? { data } : {}), ...(size ? { size } : {}) };
}

function coerceScene(s: unknown, sentenceCount: number): Scene | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  let from = Number(o.from);
  if (!Number.isInteger(from)) return null;
  let to = Number(o.to);
  if (!Number.isInteger(to)) to = from;
  from = Math.max(0, Math.min(sentenceCount - 1, from));
  to = Math.max(from, Math.min(sentenceCount - 1, to));
  const framing = FRAMINGS.includes(o.framing as Framing) ? (o.framing as Framing) : 'full';
  const emphasis = Array.isArray(o.emphasis) ? (o.emphasis as unknown[]).map(String).filter(Boolean).slice(0, 2) : [];
  const graphic = coerceGraphic(o.graphic);
  return { from, to, framing, ...(graphic ? { graphic } : {}), ...(emphasis.length ? { emphasis } : {}) };
}

/* ============================ 容错 JSON(截断/尾逗号抢救) ============================ */

/** 扫描配平:返回补齐用的闭合序列;结构坏(错配/截在字符串里)返回 null。 */
function bracketBalance(s: string): string | null {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\') {
      if (inStr) esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}') {
      if (stack.pop() !== '{') return null;
    } else if (ch === ']') {
      if (stack.pop() !== '[') return null;
    }
  }
  if (inStr) return null;
  return stack
    .reverse()
    .map((c) => (c === '{' ? '}' : ']'))
    .join('');
}

/** 截断修复:从尾部逐个回退到最近的 }/],配平剩余括号再试 parse——
 *  长稿输出被 max_tokens 截断时,丢掉不完整的尾部、保住前面完整的场景。 */
function repairTruncatedJson(raw: string): string | null {
  for (let end = raw.length; end > 0; ) {
    const cut = Math.max(raw.lastIndexOf('}', end - 1), raw.lastIndexOf(']', end - 1));
    if (cut < 0) return null;
    const head = raw.slice(0, cut + 1);
    const closers = bracketBalance(head);
    if (closers != null) {
      const candidate = head + closers;
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        /* 回退到更早的闭合点 */
      }
    }
    end = cut;
  }
  return null;
}

/** 容错抽 plan JSON:围栏(允许没闭合)→ 直接 parse → 去尾逗号 → 截断修复。失败返回 {}。 */
export function extractPlanJson(text: string): Record<string, unknown> {
  const fenced = /```json\s*([\s\S]*?)(?:```|$)/i.exec(text);
  let raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf('{');
  if (start < 0) return {};
  raw = raw.slice(start);
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* 继续 */
  }
  // 常见小毛病:尾逗号
  const noTrailing = raw.replace(/,\s*([}\]])/g, '$1');
  try {
    return JSON.parse(noTrailing) as Record<string, unknown>;
  } catch {
    /* 继续 */
  }
  const repaired = repairTruncatedJson(noTrailing);
  if (repaired) {
    try {
      return JSON.parse(repaired) as Record<string, unknown>;
    } catch {
      /* 落空 */
    }
  }
  return {};
}

/** rowsOrCount:统一叙事流行(生产路径,分解回主/插入段)或纯句数(遗留/回灌:
 *  存储态 plan 已是分解后形状,scenes 即主叙述本地索引,inserts 原样收编)。 */
export function parsePlan(text: string, rowsOrCount: PlanRow[] | number): DraftPlan {
  const o = extractPlanJson(text);
  return assemblePlan(
    {
      scenes: Array.isArray(o.scenes) ? (o.scenes as unknown[]) : [],
      title: o.title,
      outro: o.outro,
      inserts: Array.isArray(o.inserts) ? (o.inserts as unknown[]) : [],
    },
    rowsOrCount,
  );
}

/** 存储态 plan 的 inserts 原样收编(云端回灌重解析:装配层早已分解过,shape 校验即可)。 */
function coerceInsertPlans(raw: unknown[]): InsertPlan[] {
  const out: InsertPlan[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const clip = Number(o.clip);
    if (!Number.isInteger(clip) || clip < 1) continue;
    const scenes = (Array.isArray(o.scenes) ? o.scenes : [])
      .map((s) => coerceScene(s, 10_000))
      .filter((s): s is Scene => !!s)
      .sort((a, b) => a.from - b.from);
    if (scenes.length && !out.some((x) => x.clip === clip)) out.push({ clip, scenes });
  }
  return out;
}

/** 由零散 pieces(JSON 解析产物 / 工具环逐个发射的场景)组装 DraftPlan:逐个 coerce +
 *  排序 + 覆盖归一(被吞场景丢弃、gap 归前、尾部延伸)+ title/outro 兜底默认。 */
export function assemblePlan(
  pieces: { scenes: unknown[]; title?: unknown; outro?: unknown; inserts?: unknown[] },
  rowsOrCount: PlanRow[] | number,
): DraftPlan {
  const rows = typeof rowsOrCount === 'number' ? null : rowsOrCount;
  const sentenceCount = rows ? rows.length : (rowsOrCount as number);
  const parsed = pieces.scenes
    .map((s) => coerceScene(s, sentenceCount))
    .filter((s): s is Scene => !!s)
    .sort((a, b) => a.from - b.from);

  // 归一:顺序覆盖,每个 index 恰好属一个场景(cover every sentence exactly once)。
  //  · 被前面场景完全吞掉(s.to < cursor)→ 整场丢弃:graphic.data 是从原句区间抠的,平移会挂到错误句子上
  //  · 部分重叠 → 只 clamp 起点
  //  · 中段 gap → 并入前一个场景(延长 prev.to);开头 gap → 并入第一个场景(from=0)
  //  · 尾部没覆盖 → 最后一场延伸到末尾
  const scenes: Scene[] = [];
  let cursor = 0;
  for (const s of parsed) {
    if (cursor > sentenceCount - 1) break;
    if (s.to < cursor) continue; // 完全被吞 → 丢弃
    let from = Math.max(cursor, s.from);
    const to = Math.max(from, Math.min(sentenceCount - 1, s.to));
    if (from > cursor) {
      if (scenes.length) scenes[scenes.length - 1]!.to = from - 1;
      else from = 0;
    }
    scenes.push({ ...s, from, to });
    cursor = to + 1;
  }
  if (scenes.length && cursor <= sentenceCount - 1) scenes[scenes.length - 1]!.to = sentenceCount - 1;

  // 分解:统一叙事流(全局行号)→ 主叙述场景(main 本地索引)+ 各插入段场景(段内索引)。
  // 覆盖归一在全局做完了;这里只按**源界拆分**(LLM 违规跨源/归一补 gap 造成的跨界,
  // 首片保留 graphic/framing,后续片回 full 无图——图形 brief 属于原场景的主体内容)+
  // 索引重映射。无 rows(遗留/回灌)= scenes 即主叙述,inserts 原样收编。
  let mainScenes: Scene[] = scenes;
  let insertPlans: InsertPlan[] = coerceInsertPlans(pieces.inserts ?? []);
  if (rows) {
    mainScenes = [];
    const byClip = new Map<number, Scene[]>();
    for (const sc of scenes) {
      let a = sc.from;
      let first = true;
      while (a <= sc.to) {
        const src = rows[a]!.src;
        let b = a;
        while (b + 1 <= sc.to && rows[b + 1]!.src === src) b += 1;
        const piece: Scene = first
          ? { ...sc, from: rows[a]!.local, to: rows[b]!.local }
          : { from: rows[a]!.local, to: rows[b]!.local, framing: 'full' };
        if (src === 'main') mainScenes.push(piece);
        else byClip.set(src, [...(byClip.get(src) ?? []), piece]);
        first = false;
        a = b + 1;
      }
    }
    insertPlans = [...byClip.entries()].map(([clip, sc]) => ({ clip, scenes: sc })).sort((x, y) => x.clip - y.clip);
  }
  const plan: DraftPlan = { scenes: mainScenes, ...(insertPlans.length ? { inserts: insertPlans } : {}) };
  const tt = pieces.title as Record<string, unknown> | undefined;
  if (tt && typeof tt === 'object' && typeof tt.text === 'string' && tt.text.trim()) {
    plan.title = {
      text: String(tt.text),
      ...(typeof tt.sub === 'string' && tt.sub ? { sub: String(tt.sub) } : {}),
      durationSec: Number(tt.durationSec) > 0 ? Number(tt.durationSec) : 2.5,
    };
  }
  const oo = pieces.outro as Record<string, unknown> | undefined;
  if (oo && typeof oo === 'object' && typeof oo.text === 'string' && oo.text.trim()) {
    plan.outro = {
      text: String(oo.text),
      ...(typeof oo.sub === 'string' && oo.sub ? { sub: String(oo.sub) } : {}),
      durationSec: Number(oo.durationSec) > 0 ? Number(oo.durationSec) : 2,
    };
  }
  return plan;
}

export async function planDraft(
  models: ChatCapable,
  args: {
    sentences: PlanSentence[];
    videoDurationSec: number;
    topic?: string;
    visuals?: PlanVisual[];
    /** 当前主题简报(themeForLlm 产物)→ 让规划的调性/取色落在预设内。 */
    theme?: string;
    hint?: { quality?: 'high' | 'standard' | 'cheap'; provider?: string; provider_model_id?: string };
  },
): Promise<DraftPlan> {
  const system = planWithActiveTheme(PLAN_SYSTEM, args.theme);
  const r = await models.chat({ system, prompt: buildPlanPrompt(args), hint: args.hint ?? { quality: 'high' } });
  return parsePlan(r.text, args.sentences.length);
}
