/**
 * Studio composition 模型 —— 核心层:类型 + 分镜/时长几何 + 模板注册表 + 共享文本工具。
 *
 * 结构 = 连续视频(轨0)+ 多轨叠加块。**块只存数据**:`{ templateId, slots, 时间, 轨 }`;
 * 具体 HTML/动画由【模板注册表】+【主题(CSS 变量)】在 assemble 时动态渲染。好处:
 *  - 加模板 = 往注册表加一条;换主题 = 改 var,不动块。
 *  - plan/agent 可枚举模板 + 槽位 schema,声明式选模板填槽(预设 only,保美感)。
 *  - 块是数据 → 可重渲、可校验、可序列化(存项目/版本)。
 *  - agent 自由写 HTML 走 'custom' 模板(slots = {innerHtml,timelineBody}),保留灵活性。
 *
 * 分层(对外入口一律 './composition' barrel,别直接 import 本文件):
 *   composition-core(本文件,无兄弟依赖) ← templates(渲染实现+注册,import 副作用)
 *   ← assemble(拼完整文档) / block-factory(块构造器)
 *
 * 约定:data-start/duration = 全局秒;块内 GSAP 时间轴用局部时间(0=块起点),assemble 注册到
 * window.__timelines[block.id];模板选择器一律 #blockId 作用域。
 */

import type { ThemeId } from './theme';
import { type Clip, editedDuration, spans } from './trim';
import { DEFAULT_CAPTION_PRESET, getCaptionPreset } from './caption-presets';

export type BlockKind = 'caption' | 'title' | 'stat' | 'list' | 'transition' | 'custom' | 'media';

/** 块槽位数据(各模板自定义键)。文本存原文(未转义),render 内部 escape。 */
export type Slots = Record<string, unknown>;

/** 归一子区域([0..1],原点左上)。Block.box / 取景空区 / 安全区落点共用,别再各处内联重声明。 */
export interface NormBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 素材位内容(slots.media / 面板插入 / 素材选择共用的最小形状)。 */
export interface MediaRef {
  type: 'image' | 'video';
  url: string;
}

export interface Block {
  id: string;
  /** 模板 id(注册表键)。'custom' = agent 自由写的 HTML。 */
  templateId: string;
  slots: Slots;
  /** 全局起点 / 时长(秒)。 */
  startSec: number;
  durationSec: number;
  /** 轨道:0 留给视频;叠加块 >=1,越大越上层。 */
  trackIndex: number;
  /** 放置子区域(归一 [0..1],原点左上)。缺省 = 满画布(inset:0)。给安全区落点用。
   *  有 contentBox 时 box 退化为**裁切窗口**(overflow:hidden 的取景框)。 */
  box?: NormBox;
  /** 内容布局矩形(归一,画布坐标):拖边/角裁切时内容锚定画布不动的载体 ——
   *  box 缩了内容不重排,只是窗口变小把内容裁掉。缺省 = 与 box 重合(未裁切)。
   *  整块平移时两者一起挪(见 workbench shiftBox)。 */
  contentBox?: NormBox;
  /** autofit 缩放系数(<1):内容溢出 box 时由预览实测算出,assembleHtml 给 #blockId 套 transform:scale,
   *  预览与导出同源。缺省/≈1 = 不缩。来自 sample-composition 的 measureFit → workbench applyFits。 */
  fitScale?: number;
  /** 组件底板背景(CSS color):容器垫实底 + 覆写本块 --panel/--paper。缺省 = 透明叠在画面上。 */
  bg?: string;
  /** 组件边框颜色(CSS color):容器描 3px 实线(box 块带圆角)。缺省 = 无边框。 */
  border?: string;
  /** 组件整体透明度(0–1):容器 opacity。缺省/1 = 不透明。 */
  opacity?: number;
  /** 圆角(comp px):最外层容器 border-radius(box 块 overflow:hidden 一并裁圆内容)。缺省/0 = 直角。 */
  radius?: number;
  /** 整体旋转(度,-180–180):最外层容器 transform:rotate,绕中心。缺省/0 = 不转。 */
  rotation?: number;
  /** 内容视觉缩放系数(字号一起变),由角柄等比缩放写入:窗口(box)×k、内容层
   *  (contentBox)布局尺寸不变只挪中心、scale ×k 三者同步,零重排。渲染为内容层的
   *  CSS scale **属性**,不影响布局也不进 transform 串 —— 与 autofit 的 transform、
   *  拖动的 translate 三条通道互不覆写。缺省 = 1。 */
  scale?: number;
  /** 相对人像抠片层的块级覆盖:'front'=压在人像上,'behind'=垫在人像后。
   *  缺省 = 跟全局 personFx.personFront(人物置顶时全部块在人后)。抠像管线没开时无效。 */
  personLayer?: 'front' | 'behind';
  /** 给用户看的标签。 */
  label?: string;
}

export interface StudioVideo {
  url: string;
  durationSec: number;
}

/** 镜头处理 —— 口播视频在某段内怎么取景(缩到角落腾位给图文 / 放大强调 / 半切 / 全屏)。
 *  split-l/-r = 半切:视频占左/右半,另一半留给 hyperframes 的块(partnerBlockId)。 */
export type ShotTreatment = 'full' | 'punch-in' | 'corner-br' | 'corner-tl' | 'split-l' | 'split-r';

/**
 * 视频轨上的一个分镜=一个**片段(clip)**:保留源视频 [srcStart, srcEnd) 这段。
 * 成片(edited)时间轴 = 各片段源区间首尾相接(被剪掉的源区间在成片里不存在)。
 * 见 trim.ts 的映射/增删改查。
 * 分镜边界没有转场语义:同一条口播素材的切片之间就是跳切(jump cut),
 * 视觉变化由取景(treatment)承担;真要转场效果用组件轨的 transition 块。
 */
export interface VideoShot extends Clip {
  id: string;
  srcStart: number;
  srcEnd: number;
  /** 多源主轨:有值 = 外部插入片段(srcStart/srcEnd 是**这个文件自己**的时间,不指主视频)。
   *  缺省 = 主视频切片。**平权**(主视频只是先加载的源):取景/抠像/音频/字幕/分割裁剪删除
   *  对插入段一律成立(取景统一打 #vidEl 画布、抠像按段的源喂 MODNet、字幕各源各自转写映射;
   *  trim.ts 的成片数学只看长度,外源段天然成立)。别按早期"v1 恒全屏静音"的旧约束加守卫。 */
  src?: string;
  /** 本地插入段的 fileSig(src 是会话级 blob URL,刷新即死):草稿恢复按它从 OPFS
   *  本地视频库取回 File 重建 src。远端 URL 的插入段没有这个字段。 */
  srcSig?: string;
  /** 取景恒作用整镜(一镜=一取景):要"只放大前几秒"就把镜剪开——split 是唯一的时间切分原语,
   *  不在 shot 之内再造私有时间轴(treatmentLenSec 松回模型已删,关键帧序列与剪开等价)。 */
  treatment: ShotTreatment;
  /** 半切/缩角时,另一半/背后放哪个 block(hyperframes 层)。仅作链接,块自身独立渲染。 */
  partnerBlockId?: string;
  /** 本镜开启智能抠像(逐段生效,用户定的:开关只对选中段生效,不做全局/自动补跑)。
   *  开启时父层对本段预算 mask;人像效果(personFx)只在开了抠像的段起作用。 */
  personMatte?: boolean;
  /** 取景大小 0–100(无单位,主流剪辑器口径):放大=变焦幅度,缩角=小窗大小,半切=视频占宽。
   *  缺省 = 各类型的 TREAT_SIZE_DEFAULT(与旧常量等效)。'full' 无此概念。 */
  treatSize?: number;
  /** 镜级画面调色(1=中性,只存偏离中性的字段;整镜生效,切点即换不做过渡)。
   *  预览=#vidEl 的 CSS filter,导出=ctx.filter,同一 shotFilterCss 口径双端同源。 */
  filter?: ShotFilter;
  /** 本镜**入点**的转场(与上一镜的内容切换,不是遮罩):区域以切点为中心左右对称。
   *  prevId 锚死前一镜——任一邻镜被删/换(id 不再相邻),转场自动失效(cutTransitions
   *  过滤,不需要在每条剪辑路径上清理)。时长上限 MAX_TRANSITION_SEC,再被两侧镜长夹。 */
  transIn?: CutTransition;
}

/** 切点转场:两镜内容的交接效果。效果集 = gl-transitions gallery 十选(id 对齐上游着色器名,
 *  GLSL 本体在 transition-gl.ts,预览/导出/面板同一 WebGL 合成器)。 */
export type CutTransitionEffect =
  | 'fade'
  | 'fadeblack'
  | 'directional'
  | 'directionalwipe'
  | 'circleopen'
  | 'windowslice'
  | 'crosszoom'
  | 'rotatescale'
  | 'glitch'
  | 'dreamy';
/** push/slide 的运动方向(B 的行进方向;up=向上进,即从底边入画)。 */
export type TransitionDirection = 'up' | 'down' | 'left' | 'right';
export interface CutTransition {
  prevId: string;
  effect: CutTransitionEffect;
  /** 总时长(秒,左右各一半);≤ MAX_TRANSITION_SEC,且每侧不超过邻镜长度。 */
  durationSec: number;
  /** 仅 push/slide 有意义;缺省 'left'。 */
  direction?: TransitionDirection;
}
export const MAX_TRANSITION_SEC = 4;
export const CUT_TRANSITION_EFFECTS: { id: CutTransitionEffect; name: string }[] = [
  { id: 'fade', name: '叠化' },
  { id: 'fadeblack', name: '渐黑' },
  { id: 'directional', name: '推移' },
  { id: 'directionalwipe', name: '划开' },
  { id: 'circleopen', name: '圆形' },
  { id: 'windowslice', name: '百叶窗' },
  { id: 'crosszoom', name: '变焦' },
  { id: 'rotatescale', name: '旋转' },
  { id: 'glitch', name: '故障' },
  { id: 'dreamy', name: '波浪' },
];
/** 带方向的效果(面板据此显示方向按钮)。 */
export const DIRECTIONAL_TRANSITIONS: ReadonlySet<CutTransitionEffect> = new Set(['directional', 'directionalwipe']);

/** 有效切点转场表(成片时间):prevId 必须仍是紧邻前镜(删/剪走任一侧即失效),
 *  half 被两侧镜长夹(转场不越镜)。预览 shim / 导出 / 时间轴同一口径。 */
export function cutTransitions(
  shots: VideoShot[],
): { cut: number; shotId: string; effect: CutTransitionEffect; half: number; dir: TransitionDirection }[] {
  const sp = spans(shots);
  const out: { cut: number; shotId: string; effect: CutTransitionEffect; half: number; dir: TransitionDirection }[] = [];
  for (let i = 1; i < sp.length; i++) {
    const s = sp[i]!.clip as VideoShot;
    const prev = sp[i - 1]!.clip as VideoShot;
    const tr = s.transIn;
    if (!tr || tr.prevId !== prev.id) continue;
    const lenPrev = sp[i - 1]!.editedEnd - sp[i - 1]!.editedStart;
    const lenSelf = sp[i]!.editedEnd - sp[i]!.editedStart;
    const half = Math.min(Math.max(0.1, Math.min(MAX_TRANSITION_SEC, tr.durationSec) / 2), lenPrev, lenSelf);
    out.push({ cut: sp[i]!.editedStart, shotId: s.id, effect: tr.effect, half: Math.round(half * 100) / 100, dir: tr.direction ?? 'left' });
  }
  return out;
}

/** 分割点是否落在某个转场覆盖区内(区内禁分割——先移除转场)。 */
export function splitBlockedByTransition(shots: VideoShot[], atSec: number): boolean {
  return cutTransitions(shots).some((tr) => Math.abs(atSec - tr.cut) < tr.half - 1e-3);
}

/** 画面调色三参(数值系数,1=不动;undefined 视同 1)。 */
export interface ShotFilter {
  brightness?: number;
  contrast?: number;
  saturate?: number;
}

/** ShotFilter → CSS/canvas filter 串('none'=中性)。亮度/对比夹在 [0.2, 3](黑屏/爆白没有
 *  正当用途);饱和允许到 0(黑白片是正当需求)。 */
export function shotFilterCss(f?: ShotFilter): string {
  if (!f) return 'none';
  const clamp = (x: number, lo: number) => Math.min(3, Math.max(lo, Math.round(x * 100) / 100));
  const parts: string[] = [];
  if (f.brightness != null && f.brightness !== 1) parts.push(`brightness(${clamp(f.brightness, 0.2)})`);
  if (f.contrast != null && f.contrast !== 1) parts.push(`contrast(${clamp(f.contrast, 0.2)})`);
  if (f.saturate != null && f.saturate !== 1) parts.push(`saturate(${clamp(f.saturate, 0)})`);
  return parts.length ? parts.join(' ') : 'none';
}

export const SHOT_TREATMENTS: { id: ShotTreatment; name: string }[] = [
  { id: 'full', name: '无' },
  { id: 'punch-in', name: '放大' },
  { id: 'corner-br', name: '缩右下' },
  { id: 'corner-tl', name: '缩左上' },
  { id: 'split-l', name: '左半' },
  { id: 'split-r', name: '右半' },
];

/** 全局花字样式(Vids Captions 式):预设/位置/缩放一处调、全片句级花字统一生效。
 *  只作用于**无 box** 的 caption 块(句级字幕层);带 box 的花字(关键词重击等)是独立定位的
 *  强调组件,不受全局样式管。缺省(undefined)= 各块按自身 slots 渲染(草稿构建时的主题取舍)。 */
export interface CaptionStyle {
  /** 视觉预设 id(caption-presets 注册表;mode 逐词强调/整句字幕也由预设定)。 */
  preset: string;
  /** 垂直位置:花字底边距画布顶部的 %(高度口径)。 */
  yPct: number;
  /** 水平位置:花字行中心距画布左缘的 %(宽度口径)。缺省 50 = 居中。 */
  xPct?: number;
  /** 框宽:字幕行允许的最大宽度(画布宽 %)。**拆段口径由它和字号实时推**(框窄了每段字少)。
   *  缺省 56 ≈ 40px 字号下一行 13 个 CJK 字。 */
  wPct?: number;
  /** 整体缩放系数(1 = 预设原始字号)。 */
  scale: number;
  /** 字幕框高(画布高 %):框底=yPct 锚。**字号不动,底板跟着框走**——渲染时落到
   *  .cap-line 的 min-height,文字在框内垂直居中(无底板的预设只是占位变高)。
   *  缺省/0 = 贴字幕行实高。 */
  hPct?: number;
  /** 译文行(双语第二行)的独立位置/字号:与主行互不依赖,画布上单独拖拽/缩放。
   *  缺省 = 贴主行正下方、0.6× 主行字号(跟随主行移动)。yPct=行顶距画布顶 %,
   *  xPct=行中心距左缘 %,scale=字号系数(与主行 scale 同口径,1=预设原始字号)。
   *  lang=UI 面选过的目标语言(面板 chip 选中态 + 新插入片段自动补翻用)。 */
  sub?: { yPct?: number; xPct?: number; wPct?: number; scale?: number; hPct?: number; lang?: string };
}

export interface Composition {
  width: number;
  height: number;
  /** 预设主题 id —— 定全片配色/字体/发光,模板用 var(--x) 取。 */
  theme: ThemeId;
  video: StudioVideo | null;
  blocks: Block[];
  /** 视频轨分镜切片(每片一种取景)。空/缺省 = 整条全屏。 */
  shots?: VideoShot[];
  /** 从画面底色派生的调色板(覆盖 #root 颜色 vars,叠在主题默认之后)。来自画面分析。 */
  palette?: Record<string, string>;
  /** 全局花字样式,见 CaptionStyle。assemble 时覆盖句级花字的 effect/yPct/scale。 */
  captionStyle?: CaptionStyle;
  /** 挂载的 frame 主题包 id(挂载时与 palette 一起落文档):compose 请求带上它,
   *  服务端把该 frame 的设计语言注进 ACTIVE THEME(覆盖通用审美,工程契约不动)。 */
  frameId?: string;
  /** 人像效果全局样式(工具栏「人像」面板):人物置顶/羽化/描边/换背景。
   *  只在开了抠像(VideoShot.personMatte)的分镜段起作用;缺省 = 全默认。 */
  personFx?: PersonFx;
}

/** 人像效果配置(全局样式;抠没抠像逐段定,见 VideoShot.personMatte)。
 *  预览端实时合成;导出链路暂不支持(换背景层导出时隐藏,退回原画面)。
 *  数值一律 0–100 无单位(主流剪辑器口径),assemble 按画布分辨率换算成 px。 */
export interface PersonFx {
  /** 人物置顶:人像盖在所有组件上(文字穿人)。缺省 = 组件在人物前(常规叠加)。 */
  personFront?: boolean;
  /** mask 边缘羽化强度 0–100(0 = 硬边)。缺省 0。 */
  feather?: number;
  /** 人像描边:样式卡(实线/虚线)+ 粗细 0–100 + 透明度 0–1。缺省 = 无。 */
  stroke?: { style: 'solid' | 'dashed'; width: number; color: string; opacity?: number };
  /** 背景替换:纯色或图片(素材库 URL);缺省 = 不换。 */
  bg?: { type: 'color'; color: string } | { type: 'image'; url: string };
}

export function emptyComposition(): Composition {
  return { width: 1080, height: 1920, theme: 'general', video: null, blocks: [], shots: [] };
}

let _shotUid = 0;
export function shotId(): string {
  _shotUid += 1;
  return `shot${_shotUid}_${Math.floor(performance.now())}`;
}

/** 按分镜(句)自动切片:每句起点切一刀 → 覆盖 [0,视频末] 的连续片段,默认全屏取景。 */
export function shotsFromSentences(sentences: { start: number }[], videoDurationSec: number): VideoShot[] {
  const cuts = [...new Set(sentences.map((s) => Math.max(0, Math.round(s.start * 10) / 10)))].sort((a, b) => a - b);
  if (!cuts.length || cuts[0]! > 0) cuts.unshift(0); // 首段从 0 起
  const shots: VideoShot[] = [];
  for (let i = 0; i < cuts.length; i++) {
    const srcStart = cuts[i]!;
    const srcEnd = i + 1 < cuts.length ? cuts[i + 1]! : videoDurationSec;
    if (srcEnd - srcStart < 0.05) continue; // 跳过过短片段
    shots.push({ id: shotId(), srcStart, srcEnd, treatment: 'full' });
  }
  return shots;
}

/** 取景大小(0–100)的各类型默认值 —— 旧硬编码常量的反解,缺省行为不变。 */
export const TREAT_SIZE_DEFAULT: Record<ShotTreatment, number> = {
  full: 0,
  'punch-in': 18,
  'corner-br': 35,
  'corner-tl': 35,
  'split-l': 50,
  'split-r': 50,
};

/** 取景大小 0–100 → 视频 scale:放大 1.05–2.0,缩角 0.2–0.6,半切 0.3–0.7。 */
function treatScale(tr: ShotTreatment, size?: number): number {
  const v = Math.max(0, Math.min(100, size ?? TREAT_SIZE_DEFAULT[tr])) / 100;
  if (tr === 'punch-in') return 1.05 + v * 0.95;
  if (tr === 'corner-br' || tr === 'corner-tl') return 0.2 + v * 0.4;
  if (tr === 'split-l' || tr === 'split-r') return 0.3 + v * 0.4;
  return 1;
}

/** 镜头取景 → GSAP transform 变量对象(transform-only,合成层、scrub 安全、与导出同源)。
 *  缩角贴角留 2% 边距,半切贴边;位移随 scale 联动(xPercent = (1-s)/2 口径)。
 *  导出:大小滑杆拖动中,父层用它直发 hf:shotVars 给预览实时 set(零 setState,松手才提交)。 */
export function shotTransformVars(tr: ShotTreatment, size?: number): { scale: number; xPercent: number; yPercent: number; borderRadius: number } {
  const s = treatScale(tr, size);
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  const edge = r3(((1 - s) / 2) * 100);
  const corner = r3(((1 - s) / 2 - 0.02) * 100);
  switch (tr) {
    case 'punch-in':
      return { scale: r3(s), xPercent: 0, yPercent: 0, borderRadius: 0 };
    case 'corner-br':
      return { scale: r3(s), xPercent: corner, yPercent: corner, borderRadius: 54 };
    case 'corner-tl':
      return { scale: r3(s), xPercent: -corner, yPercent: -corner, borderRadius: 54 };
    case 'split-l':
      return { scale: r3(s), xPercent: -edge, yPercent: 0, borderRadius: 24 };
    case 'split-r':
      return { scale: r3(s), xPercent: edge, yPercent: 0, borderRadius: 24 };
    default:
      return { scale: 1, xPercent: 0, yPercent: 0, borderRadius: 0 };
  }
}

function shotVars(tr: ShotTreatment, size?: number): string {
  const v = shotTransformVars(tr, size);
  return `{ scale: ${n(v.scale)}, xPercent: ${n(v.xPercent)}, yPercent: ${n(v.yPercent)}, borderRadius: ${n(v.borderRadius)} }`;
}

/**
 * 取景腾出的「空区」归一盒子(给半切/缩角的另一半 = partner block 落点)。
 * full/punch-in 占满或放大 → 无空区返回 null。坐标留了边距,不贴边。
 */
export function treatmentVacancyBox(tr: ShotTreatment, size?: number): NormBox | null {
  const s = treatScale(tr, size);
  switch (tr) {
    case 'corner-br': // 视频缩右下 → 空出上半大块(高度随小窗大小联动)
      return { x: 0.06, y: 0.1, w: 0.88, h: Math.max(0.2, 0.86 - s - 0.06) };
    case 'corner-tl': // 视频缩左上 → 空出下半大块
      return { x: 0.06, y: Math.min(0.7, s + 0.06), w: 0.88, h: Math.max(0.2, 0.86 - s - 0.06) };
    case 'split-l': // 视频占左半 → 空出右半(宽度随占宽联动)
      return { x: Math.min(0.72, s + 0.02), y: 0.12, w: Math.max(0.2, 1 - s - 0.08), h: 0.76 };
    case 'split-r': // 视频占右半 → 空出左半
      return { x: 0.06, y: 0.12, w: Math.max(0.2, 1 - s - 0.08), h: 0.76 };
    default:
      return null;
  }
}

/**
 * 视频取景时间轴体(关键帧模型,按**成片时间**):
 *  1) 每镜起点一个取景关键帧(取景恒作用整镜,一镜=一取景)。
 *  2) 连续相同取景(类型+大小都同)去重——分割出的同取景相邻碎段是一个状态,不补冗余 tween。
 * 设了就执行,**没有最短停留合并**(用户定的):"取景别停不足 1s"是给 LLM 分镜时的
 * 克制要求(见 prompts/plan.ts FRAMING),用户手动剪出来的碎镜取景照常执行。
 * 注册到 __timelines['vid']。
 */
export function videoFrameKeyframes(shots: VideoShot[]): { at: number; tr: ShotTreatment; size?: number }[] {
  const sp = spans(shots);
  if (sp.length === 0) return [];

  // canvas 渲染模式:视频轨是**一块画布**,所有段(含其它源的插入段)的取景统一打在它身上
  const keys: { at: number; tr: ShotTreatment; size?: number }[] = [];
  for (const { clip, editedStart } of sp) {
    keys.push({ at: editedStart, tr: clip.treatment, size: (clip as VideoShot).treatSize });
  }
  const final: typeof keys = [];
  for (const k of keys) {
    const prev = final[final.length - 1];
    if (!prev || prev.tr !== k.tr || (prev.size ?? -1) !== (k.size ?? -1)) final.push(k);
  }
  return final;
}

export function videoFrameTimelineBody(shots: VideoShot[]): string {
  const sp = spans(shots);
  if (sp.length === 0) return '';
  const total = sp[sp.length - 1]!.editedEnd;
  const final = videoFrameKeyframes(shots);
  if (!final.length) return '';

  const lines: string[] = [`tl.set('#vidEl', ${shotVars(final[0]!.tr, final[0]!.size)}, 0);`];
  for (let i = 1; i < final.length; i++) {
    const gap = (final[i + 1]?.at ?? total) - final[i]!.at;
    const dur = Math.max(0.2, Math.min(0.5, gap - 0.05));
    lines.push(`tl.to('#vidEl', Object.assign({ duration: ${n(dur)}, ease: 'power2.inOut' }, ${shotVars(final[i]!.tr, final[i]!.size)}), ${n(final[i]!.at)});`);
  }
  // 调色关键帧(与取景独立去重):跳切语义——切点即换(set),不做过渡 tween。
  // 全片无调色 = 一行不出;有则含中性段的 'none' 复位,否则前镜的滤镜会漏到后镜。
  if (sp.some(({ clip }) => shotFilterCss((clip as VideoShot).filter) !== 'none')) {
    let prevCss: string | null = null;
    for (const { clip, editedStart } of sp) {
      const css = shotFilterCss((clip as VideoShot).filter);
      if (css === prevCss) continue;
      prevCss = css;
      lines.push(`tl.set('#vidEl', { filter: '${css}' }, ${n(editedStart)});`);
    }
  }
  return lines.join('\n');
}

/** 成片(edited)时长:有分镜片段则 = Σ 片段源长度,否则原视频时长;再取与块末端的最大。 */
export function editedVideoDuration(comp: Composition): number {
  return comp.shots && comp.shots.length ? editedDuration(comp.shots) : (comp.video?.durationSec ?? 0);
}

export function totalDuration(comp: Composition): number {
  let max = editedVideoDuration(comp);
  for (const b of comp.blocks) if (b.startSec + b.durationSec > max) max = b.startSec + b.durationSec;
  return Math.max(0.1, max);
}

/** 轨道数(含视频轨 0)。 */
export function trackCount(comp: Composition): number {
  let max = comp.video ? 0 : -1;
  for (const b of comp.blocks) if (b.trackIndex > max) max = b.trackIndex;
  return max + 1;
}

/** 找一条在 [startSec, startSec+durationSec) 窗内空闲的组件轨(≥1):从 preferred 起向上,
 *  返回第一条与已有块无时间重叠的轨号。插入新组件时用它——轨是图层不是分类,同轨同窗的
 *  chip 在时间轴上会互相叠住点不到;轨号越大越靠上,行数由 trackCount 动态长。 */
export function freeTrack(blocks: Block[], startSec: number, durationSec: number, preferred = 2): number {
  const end = startSec + durationSec;
  for (let t = Math.max(1, preferred); ; t++) {
    const clash = blocks.some((b) => b.trackIndex === t && b.startSec < end - 1e-3 && b.startSec + b.durationSec > startSec + 1e-3);
    if (!clash) return t;
  }
}

/** 数字/百分比序列化(templates/assemble 共用,保持产出字符串稳定)。 */
export const n = (x: number) => (Math.round(x * 1000) / 1000).toString();
export const pct = (v: number) => `${n(v * 100)}%`;

/* ============================ 模板注册表 ============================ */

export interface SlotSpec {
  type: 'text' | 'text[]' | 'words' | 'image' | 'enum';
  label: string;
  required?: boolean;
  options?: string[];
}

export interface Rendered {
  innerHtml: string;
  timelineBody: string;
}

export interface Template {
  id: string;
  name: string;
  kind: BlockKind;
  defaultTrackIndex: number;
  /** 槽位 schema —— 给 plan/agent/UI 知道这个模板能填什么。 */
  slots: Record<string, SlotSpec>;
  /** slots(含数据) + blockId(+块成片起点,内嵌 media 的 data-start 用;+块时长,出场动效定位用) → 渲染产物。选择器须 #blockId 作用域。 */
  render(slots: Slots, blockId: string, startSec?: number, durationSec?: number): Rendered;
}

const REGISTRY = new Map<string, Template>();
export function registerTemplate(t: Template): void {
  REGISTRY.set(t.id, t);
}
export function getTemplate(id: string): Template {
  return REGISTRY.get(id) ?? REGISTRY.get('custom')!;
}
export function listTemplates(): Template[] {
  return [...REGISTRY.values()];
}

/** 把一个块渲染成 innerHtml + timelineBody(经注册表 + 模板)。 */
export function renderBlock(block: Block): Rendered {
  return getTemplate(block.templateId).render(block.slots, block.id, block.startSec, block.durationSec);
}

/** 块的语义类型(来自其模板)。 */
export function blockKind(block: Block): BlockKind {
  return getTemplate(block.templateId).kind;
}

/** 句级花字 = 无 box 的 caption 块(全局样式的作用对象);带 box 的是独立定位的强调花字。 */
export function isSentenceCaption(block: Block): boolean {
  return blockKind(block) === 'caption' && !block.box;
}

/** 当前生效的全局花字样式:显式设置优先,否则从第一个句级花字的 slots 推(给面板选中态
 *  和画布手柄一个稳定初值),片里还没有花字则取默认。 */
/** 字幕框宽缺省(画布宽 %):≈ 40px 字号下一行 13 个 CJK 字。 */
export const DEFAULT_CAPTION_WIDTH_PCT = 56;

export function resolveCaptionStyle(comp: Composition): CaptionStyle {
  if (comp.captionStyle) return { xPct: 50, wPct: DEFAULT_CAPTION_WIDTH_PCT, ...comp.captionStyle };
  const first = comp.blocks.find(isSentenceCaption);
  const preset = typeof first?.slots.preset === 'string' ? (first.slots.preset as string) : DEFAULT_CAPTION_PRESET;
  const yPct = typeof first?.slots.yPct === 'number' ? (first.slots.yPct as number) : 88;
  return { preset, yPct, xPct: 50, wPct: DEFAULT_CAPTION_WIDTH_PCT, scale: 1 };
}

/** 译文行(双语第二行)的完整样式——**CaptionStyle 同形**,主行的手柄/渲染/量测口径
 *  原样复用(选中框、移动 live、改宽 ghost、分词拆行全一套逻辑)。sub 未设的量从主行
 *  派生:行底锚 = 主行底 + 0.2 主字号间隙 + 译文行实高(即"贴主行正下方"的解析式),
 *  字号 0.6× 主行,x/框宽跟主行。 */
export function resolveSubCaptionStyle(comp: Composition): CaptionStyle {
  const m = resolveCaptionStyle(comp);
  const p = getCaptionPreset(m.preset);
  const sub = m.sub ?? {};
  const scale = sub.scale ?? m.scale * 0.6;
  const mainFs = Math.max(10, Math.round(p.size * m.scale));
  const subFs = Math.max(9, Math.round(p.size * scale));
  const padY = p.bg ? Math.round(subFs * 0.18) * 2 : 0;
  const derivedY = m.yPct + ((mainFs * 0.2 + subFs * 1.35 + padY) / (comp.height || 1920)) * 100;
  return {
    preset: m.preset,
    yPct: Math.min(99, sub.yPct ?? Math.round(derivedY * 10) / 10),
    xPct: sub.xPct ?? m.xPct ?? 50,
    wPct: sub.wPct ?? m.wPct ?? DEFAULT_CAPTION_WIDTH_PCT,
    scale,
    ...(sub.hPct ? { hPct: sub.hPct } : {}),
  };
}

/* ============================ 基础 ============================ */

export interface FxWord {
  text: string;
  start: number;
  end: number;
  emphasis?: boolean;
}

let _uid = 0;
export function blockId(prefix = 'b'): string {
  _uid += 1;
  return `${prefix}${_uid}_${Math.floor(performance.now())}`;
}

export function span2(words: FxWord[]): { start: number; end: number; dur: number } {
  const start = words[0]?.start ?? 0;
  let end = 0;
  for (const w of words) if (w.end > end) end = w.end;
  end += 0.3;
  return { start, end, dur: Math.max(0.3, end - start) };
}

export const str = (v: unknown, d = '') => (typeof v === 'string' ? v : d);
export const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
export const wordsOf = (v: unknown): FxWord[] => (Array.isArray(v) ? (v as FxWord[]) : []);

/* ============================ 安全 ============================ */

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function escapeAttr(s: string): string {
  return escapeHtml(s);
}
