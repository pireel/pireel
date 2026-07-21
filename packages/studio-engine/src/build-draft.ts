/**
 * 自动分镜 —— **分镜(lay_out)阶段**。plan(场景化 storyboard) + 口播分句 + 画面分析 → Composition 的**结构**:
 * 视频轨分镜切片(只切**视觉状态变化点**:取景变化 ∪ 源画面硬切,场景边界不自动成刀)
 * + 取景(corner/split/punch 腾位)+ **待配图占位块**。
 *
 * 关键(2026-06 场景重写):plan 已把句子归并成场景,每个场景带一个**设计图形 brief**。这里:
 *  - 分镜 = 场景起点(语义切点) ∪ 源画面真实切点(cuts);无场景则退回按句切。
 *  - 每个场景(非录屏)落一个**待配图占位**(slots.spec = 组件+brief+真实数据),配图步逐个 compose 成设计图形。
 *  - **设计图形为主**;字幕/花字(逐句动效字)是主题取舍(theme.captions,general 默认关),仅 emphasis 关键词可选叠。
 */

import { wordsFromText } from './caption-fx';
import {
  type Block,
  type Composition,
  type ShotTreatment,
  type VideoShot,
  captionBlock,
  emptyComposition,
  freeTrack,
  mediaBlock,
  shotId,
  shotsFromSentences,
  treatmentVacancyBox,
} from './composition';
import { t } from './i18n';
import { getTheme } from './theme';
import type { DraftPlan, Framing, GraphicComponent, GraphicSize, Scene, SceneGraphic } from './plan';
import { type AsrSegment, captionBlocksFromAsr } from './build-blocks';
import type { VisualTimeline } from './visual-types';

export type Box = { x: number; y: number; w: number; h: number };
type VisSeg = VisualTimeline['segments'][number];
/**
 * full/punch 时图形落点的**兜底**固定框:下半安全区,底边到 y=0.84 为止,不侵入字幕禁区
 * (visual.ts CAPTION_RESERVE 固定预留底部 16%)。有几何数据时优先 graphicBoxFromGeometry。
 */
const FULL_GRAPHIC_BOX: Box = { x: 0.07, y: 0.46, w: 0.86, h: 0.38 };
/** 图形占位最短时长(秒):被标题挤到比这还短就不值得出图,直接跳过。 */
const MIN_GRAPHIC_SEC = 0.8;
/** 取景最短停留(秒):比这短的场景不取景(推近/缩角一闪而过读作闪烁)。提示词里的
 *  "HOLD ≥1s" 只约束 LLM 规划,这里是布局层的硬兜底;用户手动剪的不受此限(渲染层照常执行)。 */
const MIN_FRAMING_HOLD_SEC = 1;
/** 邻近切点合并阈值(秒),兼**自动分镜最短片段长度**:画面切点贴着已留切点时丢弃
 *  (语义优先)——切点间距 ≥ 此值,自动分镜不再产出 <1s 的碎镜。 */
export const MIN_CUT_GAP_SEC = 1;

const intersects = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * full/punch 场景的图形落点:**几何安全区驱动**——取窗内主导段(与场景重叠最久的段)的
 * 最大空矩形(rects 已按段扣除人脸/字幕带,从大到小),再做:边距内缩 → 底部钳到字幕禁区
 * (y+h ≤ 0.84)→ 尺寸下限(摆不下像样图形的跳过)→ **跨段人脸硬避让**(场景横跨多段时,
 * 主导段的空区可能压到别段的脸)。全部不合格 → 退固定框。
 */
export function graphicBoxFromGeometry(visual: VisualTimeline | undefined, from: number, to: number): Box {
  const segs = (visual?.segments ?? []).filter((s) => s.end > from + 0.05 && s.start < to - 0.05);
  const withGeom = segs.filter((s) => s.geom?.rects?.length);
  if (!withGeom.length) return FULL_GRAPHIC_BOX;
  const overlap = (s: { start: number; end: number }) => Math.min(s.end, to) - Math.max(s.start, from);
  const dominant = withGeom.reduce((a, b) => (overlap(b) > overlap(a) ? b : a));
  const faces = segs.map((s) => s.geom?.face).filter((f): f is Box => !!f);
  return pickGraphicBox(dominant.geom!.rects, faces);
}

/** rects→选框核心(主源与插入段共用):边距内缩 → 底部字幕禁区钳制(y+h ≤ 0.84)→
 *  尺寸下限(w≥0.42/h≥0.2,摆不下像样图形的跳过)→ 人脸硬避让 → 全不合格退兜底框。 */
export function pickGraphicBox(rects: Box[], faces: Box[], fallback: Box = FULL_GRAPHIC_BOX): Box {
  const M = 0.03; // 边距内缩:空矩形常贴画框,图形不贴边
  for (const r of rects) {
    const x = r.x + M;
    const y = r.y + M;
    const w = r.w - M * 2;
    const h = Math.min(r.h - M * 2, 0.84 - y); // 字幕禁区钳制
    if (w < 0.42 || h < 0.2) continue; // 摆不下像样的图形
    const box = { x, y, w, h };
    if (faces.some((f) => intersects(box, f))) continue;
    return box;
  }
  return fallback;
}

/** 体量档 → 在安全基底 rect 内裁实际落框(plan 定档、几何定基底,互不越权):
 *  poster=整块基底 · card=宽度用满、高度钳到 0.42 垂直居中(split 的整列留给 poster)·
 *  banner=通栏横带垂直居中 · badge=左上角小签。治「所有图形都是同一个兜底框」。 */
export function graphicBoxForSize(base: Box, size: GraphicSize | undefined): Box {
  switch (size) {
    case 'poster':
      return base;
    case 'banner': {
      const h = Math.min(base.h, 0.18);
      return { x: base.x, y: base.y + (base.h - h) / 2, w: base.w, h };
    }
    case 'badge': {
      const w = Math.min(base.w, 0.46);
      const h = Math.min(base.h, 0.18);
      return { x: base.x, y: base.y, w, h };
    }
    default: {
      const h = Math.min(base.h, 0.42);
      return { x: base.x, y: base.y + (base.h - h) / 2, w: base.w, h };
    }
  }
}

/** 配图的底况提示(给 compose 决定「要不要卡面」用,不再一刀切):
 *  corner/split 空区 = 纯色页面底(视频缩到一边),卡面可选、鼓励开放版式;
 *  full/punch = 实拍活动底,必须有分离手段(卡/scrim/强字面处理)。 */
function backdropNote(treatment: ShotTreatment, vis: VisSeg | null): string {
  if (treatment !== 'full' && treatment !== 'punch-in') {
    return 'BACKDROP: flat theme page — the video is shrunk aside; your box sits on the solid page color, NOT on footage. A filled card is OPTIONAL here; open editorial composition directly on the page is welcome.';
  }
  const d = vis?.label.desc ? ` Scene behind: ${vis.label.desc}.` : '';
  const t = vis?.label.hasText ? ' The footage already carries burned-in text — keep the fragment visually quiet and clearly separated.' : '';
  return `BACKDROP: live moving footage behind your box.${d}${t} Default to direct composition on the footage — high-contrast ink, strong type, NO filled background; use a card/scrim only for dense structured content (multi-row data / chart / table).`;
}

/** 切点合并:语义切点(取景变化点)全保留;画面切点距任一已留切点 < MIN_CUT_GAP_SEC 则丢弃。 */
export function mergeCuts(semantic: number[], visualCuts: number[]): { start: number }[] {
  const kept = [...semantic].sort((a, b) => a - b);
  for (const c of [...visualCuts].sort((a, b) => a - b)) {
    if (kept.some((k) => Math.abs(k - c) < MIN_CUT_GAP_SEC)) continue;
    kept.push(c);
  }
  return kept.sort((a, b) => a - b).map((start) => ({ start }));
}

/** 分镜:摆结构 + 待配图占位(不出设计图形)。配图步把占位逐个 compose 成设计图形。 */
export function layoutFromPlan(
  plan: DraftPlan,
  opts: {
    video: { url: string; durationSec: number; width?: number; height?: number };
    sentences: AsrSegment[];
    cuts?: number[];
    visual?: VisualTimeline;
  },
): Composition {
  const c = emptyComposition();
  c.theme = 'general';
  c.video = { url: opts.video.url, durationSec: opts.video.durationSec };
  if (opts.video.width && opts.video.height) {
    c.width = opts.video.width;
    c.height = opts.video.height;
  }
  const captions = getTheme(c.theme).captions; // 主题定要不要逐句花字/字幕(general=false)
  const end = opts.video.durationSec;
  const sents = opts.sentences;
  const blocks: Block[] = [];
  // 轨=图层:落块时对已铺的块找空轨(同轨同窗的 chip 会互相叠住)。模板默认轨作起始偏好。
  const put = (b: Block) => blocks.push({ ...b, trackIndex: freeTrack(blocks, b.startSec, b.durationSec, b.trackIndex) });
  const treatments: { from: number; to: number; treatment: ShotTreatment }[] = [];

  const sStart = (i: number) => sents[Math.max(0, Math.min(sents.length - 1, i))]?.start ?? 0;
  const sEnd = (i: number) => sents[Math.max(0, Math.min(sents.length - 1, i))]?.end ?? end;

  // 开场标题 → 占位(配图设计成开场卡)
  if (plan.title) {
    put(
      placeholder(titleInstruction(plan.title.text, plan.title.sub, 'opening title card (开场标题卡)'), { x: 0.08, y: 0.3, w: 0.84, h: 0.4 }, 0, plan.title.durationSec, plan.title.text),
    );
  }

  const scenes = plan.scenes ?? [];
  for (const scene of scenes) {
    const start = sStart(scene.from);
    const stop = sEnd(scene.to);
    const mid = (start + stop) / 2;
    const vis = opts.visual ? visualAt(opts.visual, mid) : null;
    const screen = !!vis && (vis.label.content === 'screen' || vis.label.content === 'slide');

    // 取景:录屏不缩;否则按 framing(角/半的方向由人物所在侧定)。
    // 按**场景区间**记(不是单点)——场景内若有源切点会切成多个 shot,要让整段都保持取景,
    // 否则中途弹回全屏、而图形还挂着就会盖脸。
    // 硬约束(克制要求在布局层兜底,提示词只管 LLM 那头):场景 < 1s 不取景。
    const raw = screen ? 'full' : framingToTreatment(scene.framing, vis);
    const treatment = stop - start >= MIN_FRAMING_HOLD_SEC ? raw : 'full';

    // 设计图形占位(录屏场景不盖图形;主题图形为主)。分镜边界不做转场(跳切),
    // corner/split 的取景本身就是 0.5s 平滑过渡,无需再叠转场块。
    // 起点避开开场标题卡(同轨同区域,叠显会糊):推迟到 max(场景起点, 标题结束),剩得太短就跳过。
    let placedGraphic = false;
    if (scene.graphic && !screen) {
      const titleEnd = plan.title?.durationSec ?? 0;
      const gStart = Math.max(start, titleEnd);
      const gDur = stop - gStart;
      if (gDur >= MIN_GRAPHIC_SEC) {
        // corner/split 用取景腾出的空区;full/punch 用几何安全区驱动的落点(无几何数据退固定框)。
        // 安全基底之内再按 plan 的体量档裁实际落框——大小由叙事权重定,不再千篇一律。
        const vac = treatmentVacancyBox(treatment);
        const base = vac ?? graphicBoxFromGeometry(opts.visual, start, stop);
        const box = graphicBoxForSize(base, scene.graphic.size);
        put(placeholder(graphicInstruction(scene.graphic, backdropNote(treatment, vis)), box, gStart, gDur, graphicGist(scene.graphic)));
        placedGraphic = true;
      }
    }
    // corner/split 是给图形腾位的:图形真落下了才保留,否则回 full——不再出现
    // 「人缩到一边、空区却什么都没有」(规划没给图 / 占位被时长下限跳过 都走这条)。
    // punch-in 是强调不是腾位,无图也成立。
    const needsGraphic = treatment !== 'full' && treatment !== 'punch-in';
    if (treatment !== 'full' && (!needsGraphic || placedGraphic)) treatments.push({ from: start, to: stop, treatment });

    // 可选叠字:仅主题开字幕 + 场景给了关键词
    if (captions && scene.emphasis?.length) {
      put(keywordBlock(scene.emphasis.join(' '), start, Math.min(stop, start + 1.4)));
    }
  }

  // 主题开字幕时,按口播稿铺字幕(独立于场景;长句拆段见 captionBlocksFromAsr)。
  // preset 只是初始形态,全局花字样式一设即覆盖。句级字幕是专属一层(全局花字样式按
  // isSentenceCaption 管),相邻句偶有毫秒重叠,不走 put() 找空轨——被 bump 到别的行反而乱。
  if (captions) blocks.push(...captionBlocksFromAsr(sents, { preset: 'ln-clean', yPct: 93 }));

  // 结尾 CTA → 占位
  if (plan.outro) {
    put(
      placeholder(titleInstruction(plan.outro.text, plan.outro.sub, 'closing CTA card (结尾 CTA 卡)'), { x: 0.08, y: 0.32, w: 0.84, h: 0.36 }, Math.max(0, end - plan.outro.durationSec), plan.outro.durationSec, plan.outro.text),
    );
  }

  c.blocks = blocks;
  // 分镜 = **视觉状态变化点**:取景变化点(相邻同取景先合并) ∪ 源画面真实切点。
  // 场景(语义节奏)只是配图单元,不再自动在视频轨上切一刀——口播画面本身不变时,
  // 章节感由叠加图形承载,把视频剁开只会碎(用户观察定的);想细分有 split_shot。
  // 邻近切点合并(取景优先),防碎镜挤满时间轴。
  // 句间呼吸缝桥接:取景区间按场景句子区间记,相邻句之间有停顿——不桥接的话缝里会
  // 切出零点几秒的 full 碎镜,播放时「缩角→闪一下全屏→半切」(用户报的闪烁)。
  // 缝归前一个取景,切换发生在下一状态自己的起点;缝 ≥ 阈值视为真有全屏内容
  // (整场 full 场景至少一句长),不桥接。
  const BRIDGE_GAP_SEC = 1.5;
  const sorted = [...treatments].sort((a, b) => a.from - b.from).map((t) => ({ ...t }));
  for (let i = 0; i + 1 < sorted.length; i++) {
    const gap = sorted[i + 1]!.from - sorted[i]!.to;
    if (gap > 0 && gap < BRIDGE_GAP_SEC) sorted[i]!.to = sorted[i + 1]!.from;
  }
  const coalesced: typeof treatments = [];
  for (const t of sorted) {
    const prev = coalesced[coalesced.length - 1];
    if (prev && prev.treatment === t.treatment && t.from - prev.to < 0.05) prev.to = Math.max(prev.to, t.to);
    else coalesced.push(t);
  }
  const semantic = coalesced.flatMap((t) => [t.from, t.to]);
  // 画面切点:只保留**内容真变**的(口播→录屏/b-roll 等),同内容的 jump cut 不进分镜
  // ——取景方向按场景中点定,碎刀只会把时间轴剁散;首尾 1s 内的切点丢弃(防碎头碎尾)。
  const visualCuts = contentCuts(opts.visual, opts.cuts ?? []).filter((t) => t > MIN_CUT_GAP_SEC && t < end - MIN_CUT_GAP_SEC);
  const baseShots = shotsFromSentences(mergeCuts(semantic, visualCuts), end);
  c.shots = applyTreatments(baseShots, coalesced);
  return c;
}

/** 画面切点内容过滤:切点两侧段的 content 标签不同(口播↔录屏/b-roll/幻灯)才保留。
 *  同内容的 jump cut(创作者口播常态,每句剪一刀)不进分镜——对取景/渲染毫无影响,
 *  只会把分镜条剁碎(用户观察定的)。无画面语义数据 / 对不上段边界时保守保留。 */
export function contentCuts(visual: VisualTimeline | undefined, cuts: number[]): number[] {
  const segs = visual?.segments ?? [];
  if (!segs.length) return cuts;
  return cuts.filter((c) => {
    const before = segs.find((s) => Math.abs(s.end - c) < 0.15);
    const after = segs.find((s) => Math.abs(s.start - c) < 0.15);
    if (!before || !after) return true;
    return before.label.content !== after.label.content;
  });
}

/* ============================ 取景 / 落点 ============================ */

/** Framing → 具体 ShotTreatment(角/半的方向跟人物所在侧,把人留在原侧、图形腾另一侧)。 */
function framingToTreatment(framing: Framing, vis: VisSeg | null): ShotTreatment {
  switch (framing) {
    case 'punch-in':
      return 'punch-in';
    case 'corner':
      return vis?.label.person === 'left' ? 'corner-tl' : 'corner-br';
    case 'split':
      return vis?.label.person === 'left' ? 'split-l' : 'split-r';
    default:
      return 'full';
  }
}

/* ============================ 待配图占位 ============================ */

/** 占位 = media 块(编辑态显占位)+ slots.spec(给配图步的中文指令)。配图把它 compose 成设计图形后替换。 */
function placeholder(spec: string, box: Box, startSec: number, durationSec: number, gist: string): Block {
  const b = mediaBlock({ startSec, durationSec: Math.max(0.8, durationSec), box, trackIndex: 2, label: gist.slice(0, 16) || t('待配图') });
  b.slots = { spec };
  return b;
}

/** 是不是待配图占位块。 */
export function isPlaceholder(b: Block): boolean {
  return b.templateId === 'media' && typeof (b.slots as { spec?: unknown }).spec === 'string';
}
/** 取占位块的配图指令。 */
export function placeholderSpec(b: Block): string {
  return String((b.slots as { spec?: unknown }).spec ?? '');
}

/** 插入片段窗口内剔掉**主源场景**的配图占位:那些占位的 brief 来自主源口播,顺移后
 *  滑进插入窗就是张冠李戴。插入段自己的配图走 insertedClipPlaceholder(平权:按它
 *  自己的内容配),不是不配。windows=成片时间窗;只剔占位,其它块(字幕/标题)不动。 */
export function dropPlaceholdersInWindows(blocks: Block[], windows: { start: number; end: number }[]): Block[] {
  if (!windows.length) return blocks;
  return blocks.filter((b) => {
    if (!isPlaceholder(b)) return true;
    const s = b.startSec;
    const e = b.startSec + b.durationSec;
    return !windows.some((w) => s < w.end - 0.05 && e > w.start + 0.05);
  });
}

/** 插入片段的配图占位(**平权,用户定的**:插入段与主源一样,按自己的口播内容配图)。
 *  layout = 插入段自己的几何分析结果(MediaPipe 免费遍,见 visual.insertedClipSafeZone →
 *  pickGraphicBox);缺省(拿不到 File/分析失败)仍退 FULL_GRAPHIC_BOX 兜底。
 *  spec 让 compose 按内容自选组件(add_block 同款自由度),并带 BACKDROP 行——插入段
 *  永远是实拍活动底(措辞对齐 backdropNote 的 full/punch 分支)。无声/过短不出占位——
 *  没有数据支撑的图形是装饰,宁缺。 */
export function insertedClipPlaceholder(
  win: { start: number; end: number },
  speech: string,
  layout?: { box: Box; hasFace?: boolean },
): Block | null {
  const dur = win.end - win.start;
  const text = speech.trim();
  if (!text || dur < MIN_GRAPHIC_SEC + 0.4) return null;
  const face = layout?.hasFace
    ? ' A face was detected in this clip — the given box already avoids it; keep everything inside the box.'
    : '';
  const backdrop = `BACKDROP: live moving footage behind your box (inserted real-life clip). Default to direct composition on the footage — high-contrast ink, strong type, NO filled background; use a card/scrim only for dense structured content (multi-row data / chart / table).${face}`;
  // 首尾各留 0.2s:配图不顶着插入段切点进出
  return placeholder(
    `按这段插入片段的口播内容配一个设计图形(组件按内容自选:大数字/对比/流程/要点等;数据从原话里逐字抠,别编):「${text.slice(0, 200)}」\n${backdrop}`,
    layout?.box ?? FULL_GRAPHIC_BOX,
    Math.round((win.start + 0.2) * 10) / 10,
    Math.round(Math.max(MIN_GRAPHIC_SEC, dur - 0.4) * 10) / 10,
    text.slice(0, 12),
  );
}

/** 插入段平权分镜:按 plan 给这个插入段的 scenes(**该片段自己的句子索引**)把整段
 *  切成多镜 + 取景 + 逐场景配图占位。与主源 layoutFromPlan 同一套克制约束
 *  (<1s 不取景、corner/split 无图回 full、图形短于下限跳过)。返回 null = 场景/句子
 *  对不上(调用方退回整段一拍 + 整窗占位的旧路径)。
 *  人物侧没有逐段画面分析,用几何安全区反推:图形安全区在左 → 人在右(corner-br/split-r)。 */
export function layoutInsertWindow(args: {
  /** 该插入段的成片时间窗。 */
  win: { start: number; end: number };
  /** 原整段插入 shot(src/srcStart/srcEnd 为该片段自己的源时钟)。 */
  clip: VideoShot;
  /** 该片段窗内分句(自己的源时钟,index 与 plan 的 clip 场景索引同域)。 */
  sentences: { index: number; start: number; end: number; text: string }[];
  scenes: Scene[];
  layout?: { box: Box; hasFace?: boolean };
}): { shots: VideoShot[]; blocks: Block[] } | null {
  const { win, clip, sentences, scenes, layout } = args;
  if (!scenes.length || !sentences.length) return null;
  const clamp = (t: number) => Math.max(clip.srcStart, Math.min(clip.srcEnd, t));
  const sAt = (i: number) => sentences[Math.max(0, Math.min(sentences.length - 1, i))]!;
  // 人物侧:几何安全区(图形落点)在左半 → 人在右;缺几何按人居右兜底(corner-br 惯例)
  const personLeft = layout ? layout.box.x + layout.box.w / 2 >= 0.5 : false;
  const toTreatment = (f: Framing): ShotTreatment => {
    switch (f) {
      case 'punch-in':
        return 'punch-in';
      case 'corner':
        return personLeft ? 'corner-tl' : 'corner-br';
      case 'split':
        return personLeft ? 'split-l' : 'split-r';
      default:
        return 'full';
    }
  };
  const face = layout?.hasFace ? ' A face was detected in this clip — the given box already avoids it; keep everything inside the box.' : '';
  const backdrop = `BACKDROP: live moving footage behind your box (inserted real-life clip). Default to direct composition on the footage — high-contrast ink, strong type, NO filled background; use a card/scrim only for dense structured content (multi-row data / chart / table).${face}`;

  const blocks: Block[] = [];
  const treatments: { from: number; to: number; treatment: ShotTreatment }[] = []; // clip 源时钟
  for (const scene of scenes) {
    const a = clamp(sAt(scene.from).start);
    const b = clamp(sAt(scene.to).end);
    if (b - a < 0.2) continue;
    const raw = toTreatment(scene.framing);
    const treatment = b - a >= MIN_FRAMING_HOLD_SEC ? raw : 'full';
    let placedGraphic = false;
    if (scene.graphic) {
      const es = win.start + (a - clip.srcStart) + 0.2; // 首留 0.2s:不顶着切点进出
      const ee = Math.min(win.end, win.start + (b - clip.srcStart)) - 0.2;
      if (ee - es >= MIN_GRAPHIC_SEC) {
        const vac = treatmentVacancyBox(treatment);
        const box = graphicBoxForSize(vac ?? layout?.box ?? FULL_GRAPHIC_BOX, scene.graphic.size);
        blocks.push(placeholder(graphicInstruction(scene.graphic, backdrop), box, Math.round(es * 10) / 10, Math.round((ee - es) * 10) / 10, graphicGist(scene.graphic)));
        placedGraphic = true;
      }
    }
    const needsGraphic = treatment !== 'full' && treatment !== 'punch-in';
    if (treatment !== 'full' && (!needsGraphic || placedGraphic)) treatments.push({ from: a, to: b, treatment });
  }

  // 相邻同取景合并 → 切点 = 取景状态变化点(与主源同思路:场景语义不自动成刀,取景才成刀)
  const sorted = [...treatments].sort((x, y) => x.from - y.from);
  const coalesced: typeof treatments = [];
  for (const t of sorted) {
    const prev = coalesced[coalesced.length - 1];
    if (prev && prev.treatment === t.treatment && t.from - prev.to < 0.05) prev.to = Math.max(prev.to, t.to);
    else coalesced.push(t);
  }
  const bounds = [...new Set([clip.srcStart, ...coalesced.flatMap((t) => [t.from, t.to]).map((t) => Math.round(t * 10) / 10), clip.srcEnd])]
    .filter((t) => t >= clip.srcStart - 1e-3 && t <= clip.srcEnd + 1e-3)
    .sort((x, y) => x - y);
  const shots: VideoShot[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const a = bounds[i]!;
    const b = bounds[i + 1]!;
    if (b - a < 0.05) continue;
    const mid = (a + b) / 2;
    const t = coalesced.find((x) => mid >= x.from && mid < x.to)?.treatment ?? 'full';
    shots.push({ ...clip, id: shotId(), srcStart: a, srcEnd: b, treatment: t });
  }
  if (!shots.length) return null;
  return { shots, blocks };
}

const COMPONENT_LABEL: Record<GraphicComponent, string> = {
  metric: '大数字卡',
  comparison: '对比',
  pipeline: '流程图',
  structure: '结构图',
  kpi: 'KPI 网格',
  chart: '图表',
  timeline: '时间轴',
  loop: '循环图',
  callout: '标语 callout',
  list: '要点列表',
  title: '标题卡',
};

const SIZE_INTENT: Record<GraphicSize, string> = {
  badge: 'compact badge — one fact, minimal chrome, no filler',
  card: 'standard mid-size fragment',
  banner: 'full-width strip — lay the content out horizontally',
  poster: 'HERO moment — use the whole given box at editorial scale (oversized focal element, generous negative space)',
};

/** SceneGraphic → 配图指令。机器生成的指令用英文(与 system 同语言,模型跟随更稳);
 *  brief/data 原样内嵌(跟口播稿语言),画面内可见文本语言由 BLOCK_SYSTEM 的 LANGUAGE 规则钉住。
 *  backdrop = 底况提示(空区纯色底/实拍活动底),交给 compose 决定要不要卡面。 */
function graphicInstruction(g: SceneGraphic, backdrop?: string): string {
  const data = g.data ? `\nREAL DATA (use these values verbatim from the script; do NOT invent numbers): ${g.data}` : '';
  const size = `\nSIZE INTENT: ${SIZE_INTENT[g.size ?? 'card']}.`;
  const bd = backdrop ? `\n${backdrop}` : '';
  return `Create ONE designed graphic fragment — component: ${g.component} (${COMPONENT_LABEL[g.component]}). Not a subtitle, not plain styled text; it needs real structure. Design brief: ${g.brief}${data}${size}${bd}`;
}

/** 占位块标签用的简短文案。 */
function graphicGist(g: SceneGraphic): string {
  return (g.data || g.brief).slice(0, 16);
}

function titleInstruction(text: string, sub: string | undefined, role: string): string {
  return `Create a ${role}: “${text}”${sub ? ` with a sub-line “${sub}”` : ''}. Centered or editorial layout, on-theme. Keep the given text verbatim (it is already in the script's language).`;
}

/* ============================ 花字(主题开时) ============================ */

/** 关键词 pop:口播里的关键词,大字砸入,放上方。仅 theme.captions 时用。 */
function keywordBlock(kw: string, start: number, end: number): Block {
  const words = wordsFromText(kw, start, Math.min(end, start + 1.2));
  const b = captionBlock({ effect: 'kinetic-slam', words, label: kw, trackIndex: 2 });
  b.box = { x: 0.1, y: 0.18, w: 0.8, h: 0.34 };
  return b;
}

/** 把场景取景区间套到落在其中的每个 shot(按 shot 中点判归属)——场景内多 shot 全程保持取景。 */
function applyTreatments(shots: VideoShot[], treatments: { from: number; to: number; treatment: ShotTreatment }[]): VideoShot[] {
  return shots.map((s) => {
    const mid = (s.srcStart + s.srcEnd) / 2;
    const tr = treatments.find((t) => mid >= t.from - 0.01 && mid < t.to + 0.01);
    return tr ? { ...s, treatment: tr.treatment } : s;
  });
}

/** 找覆盖时刻 t 的视觉段(没有就用最后一段)。 */
function visualAt(v: VisualTimeline, t: number): VisSeg | null {
  return v.segments.find((s) => t >= s.start - 0.01 && t < s.end + 0.01) ?? v.segments.at(-1) ?? null;
}
