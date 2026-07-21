'use client';

/**
 * 专业多轨时间轴(Google Vids 取向)。
 *
 * 轨0=口播视频:底铺缩率图(filmstrip),上叠分镜切片(各自镜头取景;边界=跳切,无转场语义)。
 *   轨≥1=叠加组件(花字/标题/数字/列表/转场…):每块
 *   带类型图标+标签(选中显时间范围),整块可拖移、两端可裁剪、点选进右侧对话。
 *   左 gutter 每轨配类型图标;顶部缩放条(放大/缩小/适应);标尺主次刻度;播放头可拖。
 *
 * 所有 x 都相对内容层 contentRef 量;吸附到 整秒/分镜切点/其它块边/播放头。
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Film, Loader2, Plus } from 'lucide-react';
import {
  type Block,
  type BlockKind,
  type Composition,
  SHOT_TREATMENTS,
  blockKind,
  blockPreviewDoc,
  cutTransitions,
  editedVideoDuration,
  MAX_TRANSITION_SEC,
  totalDuration,
  isSentenceCaption,
} from '@pireel/studio-engine/composition';
import { spans as clipSpans } from '@pireel/studio-engine/trim';
import { injectPreviewRuntime } from './sample-composition';
import { KIND_META } from './kind-meta';
import { t } from './i18n';
import { playhead, usePlayheadT } from './playhead';
import type { FilmstripFrame } from './media';

const PREVIEW_W = 108; // hover 组件小预览宽

const ROW_H = 30; // 叠加轨(组件/字幕)行高:紧凑省空间(用户定的)
const SCENE_H = 78; // 轨0=场景栏,加高放场景卡
const SCENE_PAD_T = 12; // 场景卡距轨上缘的空隙(同主流剪辑器):从空隙起拖=框选,从卡面起拖=重排;上侧大一点好命中
const SCENE_PAD_B = 8; // 场景卡距轨下缘的空隙
const ROW_GAP = 6;
const RULER_H = 24;
const GUTTER = 40;
const CAP_LANE = -1; // 「字幕轴」哨兵轨号:只读、不可拖排、不进 z 重排、不参与框选;真轨号恒 ≥0
const EDGE_PAD = 12; // gutter 与内容层之间的呼吸位:首块选中环(ring-2 外扩)+ 首切点「+」半圆(10px)不被 sticky gutter 盖掉
const SHOT_GAP = 2; // 分镜卡之间的细缝(从卡右缘扣,左缘保持时间精确)
export const MIN_PPS = 2; // 最小缩放:~2px/秒,可看到分钟级(1 分钟≈120px,刻度走分钟)
export const MAX_PPS = 260;
export const DEFAULT_PPS = 78;
const MIN_DUR = 0.3;
const SNAP_PX = 7;

/** 源时间锚定的胶片开窗(同主流剪辑器):第 k 格恒覆盖源时间 [k,k+1)×tileDur,取与窗口
 *  [srcStart,srcEnd) 相交的格。首格 left 可为负(由卡的 overflow-hidden 裁掉)——
 *  分割在 2.5 格处:前段是 2.5 格,后段从第 2.5 格中间接续,后段贴片永不重采样。 */
function stripTiles(strip: FilmstripFrame[], srcStart: number, srcEnd: number, tileDur: number, pps: number): { left: number; url: string }[] {
  if (!strip.length || tileDur <= 0 || srcEnd <= srcStart) return [];
  const tiles: { left: number; url: string }[] = [];
  for (let k = Math.floor(srcStart / tileDur); k * tileDur < srcEnd; k++) {
    const srcT = (k + 0.5) * tileDur;
    let url = strip[0]!.url;
    let bd = Infinity;
    for (const f of strip) {
      const d = Math.abs(f.t - srcT);
      if (d < bd) {
        bd = d;
        url = f.url;
      }
    }
    tiles.push({ left: (k * tileDur - srcStart) * pps, url });
  }
  return tiles;
}

/** 时间轴 chip 的品类底色(基础 label/icon/dot 在共享 kind-meta.ts)。 */
const KIND_CHIP: Record<BlockKind, { chip: string; chipSel: string }> = {
  caption: { chip: 'bg-rose-500/15 ring-rose-400/30 hover:bg-rose-500/25', chipSel: 'bg-rose-500/30 ring-2 ring-rose-400' },
  title: { chip: 'bg-amber-500/15 ring-amber-400/30 hover:bg-amber-500/25', chipSel: 'bg-amber-500/30 ring-2 ring-amber-400' },
  stat: { chip: 'bg-emerald-500/15 ring-emerald-400/30 hover:bg-emerald-500/25', chipSel: 'bg-emerald-500/30 ring-2 ring-emerald-400' },
  list: { chip: 'bg-sky-500/15 ring-sky-400/30 hover:bg-sky-500/25', chipSel: 'bg-sky-500/30 ring-2 ring-sky-400' },
  transition: { chip: 'bg-violet-500/15 ring-violet-400/30 hover:bg-violet-500/25', chipSel: 'bg-violet-500/30 ring-2 ring-violet-400' },
  media: { chip: 'bg-teal-500/15 ring-teal-400/30 hover:bg-teal-500/25', chipSel: 'bg-teal-500/30 ring-2 ring-teal-400' },
  custom: { chip: 'bg-slate-400/15 ring-slate-300/30 hover:bg-slate-400/25', chipSel: 'bg-slate-400/30 ring-2 ring-slate-400' },
};
const TREATMENT_NAME: Record<string, string> = Object.fromEntries(SHOT_TREATMENTS.map((t) => [t.id, t.name]));

/** 播放头光标:订阅 playhead store —— 播放中 60fps 只重渲这一个小组件,不动整个时间轴。
 *  横移必须走 transform:改 left 每帧触发 layout + layout-shift,和引擎 rAF 抢主线程,
 *  转场窗口内就是肉眼可见的顿挫(用户 Performance 面板对出来的)。 */
function PlayheadCursor({ pps }: { pps: number }) {
  const t = usePlayheadT();
  return (
    <div className="pointer-events-none absolute top-0 bottom-0 left-0 z-30 will-change-transform" style={{ transform: `translateX(${t * pps}px)` }}>
      <div className="absolute top-0 bottom-0 -left-px w-0.5 bg-rose" />
      {/* 头标:下指箭头(border 三角,底边 8px 与线同轴) */}
      <div className="absolute top-0 -left-[4px] h-0 w-0 border-x-4 border-t-[6px] border-x-transparent border-t-rose drop-shadow" />
    </div>
  );
}

/** 播放头所在场景的高亮环(选中态另有 indigo 环,由场景卡自己画)。 */
function ActiveSceneRing({
  sceneSpans,
  pps,
  selectedShotIds,
}: {
  sceneSpans: { shot: { id: string }; start: number; end: number }[];
  pps: number;
  selectedShotIds: Set<string>;
}) {
  const t = usePlayheadT();
  const active = sceneSpans.find((sp) => t >= sp.start - 1e-3 && t < sp.end - 1e-3);
  // 选中的镜(含多选集所有成员)已有 accent 选中环,播放头白环让位,不叠双环
  if (!active || selectedShotIds.has(active.shot.id)) return null;
  const lastEnd = sceneSpans.length ? sceneSpans[sceneSpans.length - 1]!.end : 0;
  const gapR = active.end < lastEnd - 1e-3 ? SHOT_GAP : 0; // 与场景卡同口径:细缝从右缘扣
  return (
    <div
      className="pointer-events-none absolute top-3 bottom-2 left-0 z-10 rounded ring-2 ring-white/70 will-change-transform"
      // 横移走 transform:切点上的环跳变若走 left 会记 layout-shift + 整轴重排,恰好砸在转场峰值那一帧
      style={{ transform: `translateX(${active.start * pps}px)`, width: Math.max(8, (active.end - active.start) * pps - gapR) }}
    />
  );
}

/** 自适应标尺步长:让每格 ≥ ~64px。 */
function rulerStep(pps: number): number {
  const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  for (const s of steps) if (s * pps >= 64) return s;
  return 1200;
}

/** 刻度标签:≥60s 显示 mm:ss,否则 Xs。 */
function fmtTick(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

interface StudioTimelineProps {
  comp: Composition;
  /** 播放中:播放头越出视口时自动滚动跟随(用户手动滚则停,直到下次播放)。 */
  playing: boolean;
  /** 定位信号:每次自增 = 把时间轴滚动居中到当前播放头(点走带时间读数触发)。 */
  locateSignal: number;
  /** 分镜多选集(⌘点选/框选):高亮 + 批量删除 + 播放头环让位。单选=单组件集。 */
  selectedShotIds: Set<string>;
  /** 组件多选集(⌘点选/框选,可跨多条组件轨):高亮 + 批量删除。单选=单组件集。 */
  selectedBlockIds: Set<string>;
  filmstrip?: FilmstripFrame[];
  /** 缩放(px/秒)受控:值与 setter 都来自走带的滑块。 */
  pps: number;
  onPps: React.Dispatch<React.SetStateAction<number>>;
  onSeek: (t: number) => void;
  /** hover 预览:把中央播放器 seek 到该时间(不动播放头);null=还原到播放头。 */
  onScrub: (t: number | null) => void;
  onSelect: (id: string | null) => void;
  /** 点选分镜。additive=⌘/Ctrl 多选(进/出多选集)。 */
  onSelectShot: (id: string, additive?: boolean) => void;
  /** 框选:鼠标在场景轨**上下空隙**起拖出矩形(同主流剪辑器;从卡面起拖=重排),命中的分镜 id 一次性设为多选集。 */
  onBoxSelectShots: (ids: string[]) => void;
  /** 场景卡拖动重排(从卡面起拖,同主流剪辑器):把片段序列里第 from 个挪到第 to 位(splice 语义)。 */
  onReorderShot?: (from: number, to: number) => void;
  /** 块跨轨移动(chip 纵向拖进另一条组件轨行):改 trackIndex=改 z(NLE 惯例)。
   *  空轨自然消失——轨道行从块派生,搬空即collapse,无需显式清除。 */
  onMoveBlockTrack?: (id: string, trackIndex: number) => void;
  /** 块拖进行间空隙=掰出新轨(同主流剪辑器):slot=新轨在叠加轨自上而下显示序里的插入位(0..N)。
   *  workbench 端整表重编 z(与 gutter 拖行重排同口径,z=1 恒归字幕层)。 */
  onMoveBlockNewTrack?: (id: string, slot: number) => void;
  /** 点选组件。additive=⌘/Ctrl 多选(进/出多选集,不动播放头)。 */
  onSelectBlock: (id: string, additive?: boolean) => void;
  /** 框选组件:在组件轨空白拖出矩形(可跨多轨),命中的块 id 一次性设为多选集。 */
  onBoxSelectBlocks: (ids: string[]) => void;
  /** 点空白处:取消一切选中(组件 + 分镜)。 */
  onDeselectAll: () => void;
  /** 分镜左下角取景 tag:直接打开取景设置面板(点分镜本体只选中不开面板)。 */
  onOpenShotSettings: (id: string) => void;
  /** 设置某镜取景方式（全屏/放大/缩角/半切）；取景恒作用整镜 */
  onMoveBlock: (id: string, newStartSec: number) => void;
  onResizeBlock: (id: string, newStartSec: number, newDurationSec: number) => void;
  /** 叠加轨重排(gutter 拖行):传新的自上而下轨号序,workbench 重编 z。 */
  onReorderTracks: (topToBottom: number[]) => void;
  /** 面板素材正在拖动(上传/生图/生视频的卡片拖出):时间轴变成 drop 区。
   *  落点分流:主轨(缩率图/场景卡行)= 插入片段(图片=5s 静态帧;2026-07-17 用户
   *  定的,把"视频拖入主轨已砍"翻案回来);其余区域 = 图片插画中画素材块,视频不响应。 */
  assetDragging?: boolean;
  /** 拖动素材的类型。落区规则:图片=主轨(5s 静帧片段)+叠加区(画中画);
   *  视频=只主轨(整段片段);组件=只叠加区(落点时刻插入,与图片同权)。 */
  assetDragKind?: 'image' | 'video' | 'element' | null;
  /** 素材(图片)落到时间轴非主轨区:报落点时间(秒),workbench 在该时刻插素材块。 */
  onDropAsset?: (t: number) => void;
  /** 素材落到主轨:按插入片段处理(视频=整段插入,图片=5s 静态帧),workbench 拉字节走 insertClipCore。 */
  onDropAssetClip?: (t: number) => void;
  /** 外部插入段的缩率图(shotId → 帧,t=片段自己的源时间)。 */
  clipStrips?: Record<string, FilmstripFrame[]>;
  /** 分镜边界「+」:在该成片时刻插入本地视频(workbench 弹文件选择→上传→插主轨)。 */
  onInsertClipAt?: (t: number) => void;
  /** 分镜边界转场热区:点击在统一浮窗里选转场效果(cutSec=该边界的成片时刻)。 */
  onOpenTransition?: (cutSec: number, anchor: DOMRect) => void;
  /** 转场区域两侧柄拖动(左右对称):提交新总时长(秒,≤4)。 */
  onResizeTransition?: (shotId: string, durationSec: number) => void;
  /** 外部片段插入进行中(下载/上传/读时长):在该成片时刻画「插入中」徽标,别让用户以为没生效。 */
  clipPendingAt?: number | null;
}

/** memo:回调 props 由工作台经 useStableCallbacks 稳定身份;工作台里与时间轴无关的
 *  状态变化(导出进度/面板切换/生成态)不再整树重渲这棵大组件。comp 变仍然照常渲。 */
export const StudioTimeline = memo(StudioTimelineImpl);

function StudioTimelineImpl({
  comp,
  playing,
  locateSignal,
  selectedShotIds,
  selectedBlockIds,
  filmstrip,
  pps,
  onPps,
  onSeek,
  onScrub,
  onSelect,
  onSelectShot,
  onBoxSelectShots,
  onReorderShot,
  onMoveBlockTrack,
  onMoveBlockNewTrack,
  onSelectBlock,
  onBoxSelectBlocks,
  onDeselectAll,
  onOpenShotSettings,
  onMoveBlock,
  onResizeBlock,
  onReorderTracks,
  assetDragging,
  assetDragKind,
  onDropAsset,
  onDropAssetClip,
  onInsertClipAt,
  onOpenTransition,
  onResizeTransition,
  clipPendingAt,
  clipStrips,
}: StudioTimelineProps) {
  const dur = totalDuration(comp);
  const videoDur = comp.video ? editedVideoDuration(comp) : 0; // 成片视频时长(缩率图/场景轨宽)
  const shots = useMemo(() => comp.shots ?? [], [comp.shots]);
  // 场景在**成片**时间轴的区间(片段源区间首尾相接)
  const sceneSpans = useMemo(() => clipSpans(shots).map((sp) => ({ shot: sp.clip, start: sp.editedStart, end: sp.editedEnd })), [shots]);
  // 缩率图方格(同主流剪辑器):正方形贴片(格宽=格高,object-cover 裁),网格锚在**源时间**上——
  // 每张卡只是对连续胶片"开窗"(stripTiles),分割/裁剪后各段接续原胶片,永不重排后段
  const thumbW = SCENE_H - SCENE_PAD_T - SCENE_PAD_B;
  const tileDur = thumbW / pps; // 一格覆盖的源时长
  const filmTiles = useMemo(() => stripTiles(filmstrip ?? [], 0, videoDur, tileDur, pps), [filmstrip, videoDur, tileDur, pps]);

  const [hover, setHover] = useState<{ block: Block; left: number; top: number } | null>(null); // hover 组件小预览
  const [guide, setGuide] = useState<number | null>(null); // 拖动时的吸附对齐参考线(秒)
  const [dropHint, setDropHint] = useState<{ t: number; clip: boolean } | null>(null); // 素材拖入时的插入点标线(clip=悬在主轨,落点=插入片段)
  const [hoverBounds, setHoverBounds] = useState<{ l: number; r: number } | null>(null); // hover 分镜卡:两端出「+」插本地视频
  const [trDrag, setTrDrag] = useState<{ cut: number; half: number } | null>(null); // 转场柄拖动中的实时半宽(对称)
  const [marquee, setMarquee] = useState<{ l: number; r: number } | null>(null); // 场景轨框选矩形(内容坐标 px)
  const laneRef = useRef<HTMLDivElement | null>(null); // 场景轨 DOM(内容坐标基准,随滚动移动)
  const marqueeDraggedRef = useRef(false); // 本次指针按下是否已成框选拖拽(用于抑制随后的分镜点选)
  const [blockMarquee, setBlockMarquee] = useState<{ l: number; r: number; t: number; b: number } | null>(null); // 组件轨框选矩形(tracksRef 坐标 px,含 y 好跨轨)
  const tracksRef = useRef<HTMLDivElement | null>(null); // 轨道背景区 DOM(组件框选的坐标基准)
  const blockMarqueeDraggedRef = useRef(false); // 组件框选是否已成拖拽(抑制随后的组件点选)
  const marqueeRafRef = useRef(0); // 框选期间的 rAF(边缘自动滚动 + 每帧重算矩形)
  const [hoverT, setHoverT] = useState<number | null>(null); // hover 时间(中央预览跳到此帧 + 画 hover 竖线)
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draggingRef = useRef(false); // 拖动中:让 hover-seek 让路(避免双重 seek)
  const hoverRaf = useRef(0); // hover rAF 合并
  const hoverXRef = useRef(0); // 最新 hover 屏幕 x
  // hover-scrub 驻留武装:进时间轴 ≥160ms 且真移动过 ≥6px 才开始跟手 seek 中央预览。
  // 光标从组件轨划去舞台「路过」时间轴、或选中控制条出现顶得布局位移,都不该让画面跳一下。
  const scrubEnterRef = useRef<{ x: number; y: number; ts: number } | null>(null);
  const scrubArmedRef = useRef(false);

  const openHover = (block: Block, el: HTMLElement) => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      setHover({ block, left: r.left, top: r.top });
    }, 220);
  };
  const closeHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setHover(null);
  };
  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);
  const hoverDoc = useMemo(() => (hover ? injectPreviewRuntime(blockPreviewDoc(comp, hover.block, { ground: 'checker' })) : ''), [hover, comp]);
  const previewScale = PREVIEW_W / comp.width;
  const previewH = Math.round(comp.height * previewScale);

  const W = Math.max(320, dur * pps);
  const x = useCallback((s: number) => s * pps, [pps]);

  // 吸附点:整秒 + 分镜切点(起+末) + 其它块两端。播放头每帧变,不进 memo,snap 时实时从 store 取。
  const snapPoints = useMemo(() => {
    const pts: number[] = [];
    for (let s = 0; s <= dur; s += 1) pts.push(s);
    for (const sp of sceneSpans) {
      pts.push(sp.start);
      pts.push(sp.end);
    }
    for (const b of comp.blocks) {
      pts.push(b.startSec);
      pts.push(b.startSec + b.durationSec);
    }
    return pts;
  }, [dur, sceneSpans, comp.blocks]);
  const snap = useCallback(
    (sec: number, exclude?: number[]) => {
      const tol = SNAP_PX / pps;
      let best = sec;
      let bestD = tol;
      let hit: number | null = null;
      for (const p of [...snapPoints, playhead.get()]) {
        if (exclude?.some((e) => Math.abs(e - p) < 1e-3)) continue;
        const d = Math.abs(p - sec);
        if (d < bestD) {
          bestD = d;
          best = p;
          hit = p;
        }
      }
      setGuide(hit); // 命中吸附点 → 亮对齐参考线
      return Math.round(best * 100) / 100;
    },
    [snapPoints, pps],
  );

  // 内容层左缘(随滚动变),拖动时每帧重算
  const contentLeft = () => contentRef.current?.getBoundingClientRect().left ?? 0;
  const secAt = (clientX: number) => Math.max(0, Math.min(dur, (clientX - contentLeft()) / pps));
  /** 框选通用引擎(场景轨 / 组件轨共用):锚点取内容坐标(base 随滚动移动,x0/y0 是内容坐标恒定),
   *  末点每帧按 base 的**实时** rect 重算 → 一路支持边缘自动滚动;指针停在边缘不动也靠 rAF 持续滚。
   *  baseRef=坐标基准 DOM;draggedRef=本次是否成拖拽;onDrag=画矩形;onCommit=命中判定;onClick=纯点击(未拖)。 */
  const startMarquee = (
    e: React.PointerEvent,
    baseRef: React.MutableRefObject<HTMLDivElement | null>,
    draggedRef: React.MutableRefObject<boolean>,
    onDrag: (x0: number, y0: number, x1: number, y1: number) => void,
    onCommit: (x0: number, y0: number, x1: number, y1: number) => void,
    onEnd: () => void,
    onClick?: (clientX: number) => void,
  ) => {
    if (e.button !== 0) return;
    const base = baseRef.current;
    if (!base) return;
    const rect0 = base.getBoundingClientRect();
    const x0 = e.clientX - rect0.left; // 内容坐标:滚动不改它(base 移动但内容点固定)
    const y0 = e.clientY - rect0.top;
    draggedRef.current = false;
    let lastX = e.clientX;
    let lastY = e.clientY;
    let px1 = NaN;
    let py1 = NaN;
    const EDGE = 44; // 视口边缘触发自动滚的宽度(px)
    const frame = () => {
      const sc = scrollRef.current;
      if (sc) {
        const sr = sc.getBoundingClientRect();
        let dx = 0;
        if (lastX < sr.left + EDGE) dx = -Math.ceil(((sr.left + EDGE - lastX) / EDGE) * 20);
        else if (lastX > sr.right - EDGE) dx = Math.ceil(((lastX - (sr.right - EDGE)) / EDGE) * 20);
        if (dx) sc.scrollLeft += dx; // 命中边缘:持续横滚(base 随之左右移,末点重算即扩到新区)
      }
      const r = base.getBoundingClientRect(); // 实时 rect(含滚动量)
      const x1 = lastX - r.left;
      const y1 = lastY - r.top;
      if (!draggedRef.current && (Math.abs(x1 - x0) > 4 || Math.abs(y1 - y0) > 4)) draggedRef.current = true;
      if (draggedRef.current && (x1 !== px1 || y1 !== py1)) {
        px1 = x1;
        py1 = y1;
        onDrag(x0, y0, x1, y1); // 只在矩形真变了才 setState(边缘滚动时每帧变,静止不变)
      }
      marqueeRafRef.current = requestAnimationFrame(frame);
    };
    marqueeRafRef.current = requestAnimationFrame(frame);
    const move = (ev: PointerEvent) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
    };
    const up = () => {
      cancelAnimationFrame(marqueeRafRef.current);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const r = base.getBoundingClientRect();
      const x1 = lastX - r.left;
      const y1 = lastY - r.top;
      if (draggedRef.current) onCommit(x0, y0, x1, y1);
      else onClick?.(lastX);
      onEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  /** 场景轨框选:从轨**上下空隙**(或末卡右侧空白)起拖出矩形,命中的分镜一次性入多选集。
   *  卡面按下被卡自己拦下走重排(startShotDrag),两套手势按起点分流,同主流剪辑器。 */
  const onLanePointerDown = (e: React.PointerEvent) => {
    startMarquee(
      e,
      laneRef,
      marqueeDraggedRef,
      (x0, _y0, x1) => setMarquee({ l: Math.min(x0, x1), r: Math.max(x0, x1) }),
      (x0, _y0, x1) => {
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        onBoxSelectShots(sceneSpans.filter(({ start, end }) => x(start) < hi && x(end) > lo).map(({ shot }) => shot.id));
      },
      () => setMarquee(null),
    );
  };
  // 图片/视频/组件拖动都让时间轴当 drop 区;落区按类型分(见 assetDragKind 注释)
  const dropActive = !!assetDragging && !!assetDragKind;
  /** 落点/悬停是否在主轨(缩率图/场景卡行)——决定"插入片段"还是"落点插块"。 */
  const onMainTrack = (e: { target: EventTarget | null }) => !!(e.target as Element | null)?.closest?.('[data-main-track]');
  /** 该类型允许落在这个区吗:主轨收图片/视频(片段化),叠加区收图片/组件(块)。 */
  const dropAllowed = (clip: boolean) => (clip ? assetDragKind !== 'element' : assetDragKind !== 'video');
  // 拖动结束(松手在时间轴外/取消)标线要收
  useEffect(() => {
    if (!assetDragging) setDropHint(null);
  }, [assetDragging]);

  // 通用指针拖动(返回是否真的拖了 → 区分点选/拖拽)。pointermove 用 rAF 合并到每帧一次,
  // 避免每个事件都 seek 视频(解码贵)造成卡顿;draggingRef 让 hover-seek 拖动中让路。
  const drag = (e: React.PointerEvent, onMove: (clientX: number, clientY: number) => void, onUp?: (moved: boolean) => void) => {
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); // 出窗口也持续收 move/up
    } catch {
      /* 靠 buttons 兜底 */
    }
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    let lastX = e.clientX;
    let lastY = e.clientY;
    let raf = 0;
    draggingRef.current = true;
    const flush = () => {
      raf = 0;
      if (moved) onMove(lastX, lastY);
    };
    const mv = (ev: PointerEvent) => {
      if (ev.buttons === 0) { up(); return; } // 错过 pointerup:立即收尾,不跟裸移动
      if (Math.abs(ev.clientX - sx) > 3 || Math.abs(ev.clientY - sy) > 3) moved = true; // 纯纵向(跨轨)也算拖
      lastX = ev.clientX;
      lastY = ev.clientY;
      if (moved && !raf) raf = requestAnimationFrame(flush);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (raf) cancelAnimationFrame(raf);
      setGuide(null); // 拖动结束收起参考线
      draggingRef.current = false;
      onUp?.(moved);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // ⌘滚轮缩放(缩放值受控于走带滑块)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      onPps((p) => Math.max(MIN_PPS, Math.min(MAX_PPS, p * (ev.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onPps]);

  // 播放时自动滚动跟随播放头:越出视口就 paging 滚过去(播放头落到可见内容左侧 ~10%,留出提前量)。
  // 用户播放中手动滚动 → 停跟随,直到下次播放重新开启(followRef 在 playing 上升沿复位)。
  const followRef = useRef(true);
  const progScrollUntilRef = useRef(0); // 程序化滚动的时间窗:窗内的 scroll 事件不算用户操作
  /** 滚动使播放头落到可见内容宽度的 leadFrac 处(0.1=左侧留提前量跟随;0.5=居中定位)。 */
  const scrollToPlayhead = useCallback(
    (leadFrac: number) => {
      const el = scrollRef.current;
      const content = contentRef.current;
      if (!el || !content) return;
      // 内容层左缘在滚动坐标系的 x(用 rect 算不依赖 offsetParent)
      const contentX = content.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      const px = contentX + playhead.get() * pps;
      const target = px - GUTTER - (el.clientWidth - GUTTER) * leadFrac;
      progScrollUntilRef.current = performance.now() + 150;
      el.scrollLeft = Math.max(0, target);
    },
    [pps],
  );
  useEffect(() => {
    if (playing) followRef.current = true; // 播放开始:重启跟随
  }, [playing]);
  useEffect(() => {
    if (!playing) return;
    let lastCheck = 0;
    const follow = () => {
      if (!followRef.current) return;
      // 出视口判定 4Hz 足够:playhead 每帧都发,这里每帧 getBoundingClientRect 就是
      // 每帧强制同步 layout,和引擎 rAF 抢主线程(转场顿挫的帮凶之一)
      const now = performance.now();
      if (now - lastCheck < 250) return;
      lastCheck = now;
      const el = scrollRef.current;
      const content = contentRef.current;
      if (!el || !content) return;
      const contentX = content.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      const px = contentX + playhead.get() * pps;
      const visLeft = el.scrollLeft + GUTTER; // 左侧被 sticky gutter 盖住,可见内容从 +GUTTER 起
      const visRight = el.scrollLeft + el.clientWidth;
      if (px < visLeft || px > visRight - 8) scrollToPlayhead(0.1);
    };
    const unsub = playhead.subscribe(follow);
    follow(); // 起播即校正一次
    return unsub;
  }, [playing, pps, scrollToPlayhead]);
  // 点走带时间读数 → 居中定位到播放头(自增 locateSignal 触发;跳过首次挂载)
  const scrollToPlayheadRef = useRef(scrollToPlayhead);
  scrollToPlayheadRef.current = scrollToPlayhead;
  const firstLocateRef = useRef(true);
  useEffect(() => {
    if (firstLocateRef.current) {
      firstLocateRef.current = false;
      return;
    }
    scrollToPlayheadRef.current(0.5);
  }, [locateSignal]);
  const lastScrollLeftRef = useRef(0);
  const onScrollFollow = () => {
    const el = scrollRef.current;
    if (!el) return;
    const moved = el.scrollLeft !== lastScrollLeftRef.current; // 只认横向滚动(竖向切轨不算)
    lastScrollLeftRef.current = el.scrollLeft;
    if (performance.now() < progScrollUntilRef.current) return; // 程序化滚动,忽略
    if (playing && moved) followRef.current = false; // 播放中的用户横向手动滚动 → 停跟随
  };

  // 每轨代表性 kind(取该轨第一个块);轨0=视频
  const trackKind = (track: number): BlockKind | 'video' => {
    if (track === 0) return 'video';
    const b = comp.blocks.find((bk) => bk.trackIndex === track);
    return b ? blockKind(b) : 'custom';
  };

  const step = rulerStep(pps);
  const ticks = Math.floor(dur / step) + 1;

  // 轨0 = 场景栏(有视频时加高);per-track 高度/偏移。
  // **显示序 ≠ 轨号序**:叠加轨按 z 降序排(NLE 惯例,上面的行盖住下面的行),
  // 字幕(轨1,z 最低)自然落在最底;gutter 拖行重排 = 重编 z(onReorderTracks)。
  const sceneRail = !!comp.video;
  const H0 = sceneRail ? SCENE_H : ROW_H;
  // 只给真有非字幕块的轨开行:句级字幕不进时间轴(纯计算产物),空轨也不再渲染空行
  const overlayTracks = useMemo(() => {
    const set = new Set<number>();
    for (const b of comp.blocks) if (b.trackIndex > 0 && !isSentenceCaption(b)) set.add(b.trackIndex);
    return [...set].sort((a, b) => b - a);
  }, [comp.blocks]);
  // 句级字幕单独一条只读「字幕轴」(跟转写走,不可拖/裁,编辑入口在字幕面板),恒排在最底
  const captionBlocks = useMemo(
    () => comp.blocks.filter(isSentenceCaption).sort((a, b) => a.startSec - b.startSec),
    [comp.blocks],
  );
  const hasCaptions = captionBlocks.length > 0;
  const displayTracks = useMemo(
    () => (hasCaptions ? [0, ...overlayTracks, CAP_LANE] : [0, ...overlayTracks]),
    [overlayTracks, hasCaptions],
  );
  const dispIdx = useMemo(() => new Map(displayTracks.map((tk, i) => [tk, i])), [displayTracks]);
  const rowH = (track: number) => (track === 0 ? H0 : ROW_H);
  const rowTop = (track: number) => {
    const di = dispIdx.get(track) ?? 0;
    return di === 0 ? 0 : H0 + ROW_GAP + (di - 1) * (ROW_H + ROW_GAP);
  };
  const slotTop = (slot: number) => (slot === 0 ? 0 : H0 + ROW_GAP + (slot - 1) * (ROW_H + ROW_GAP));
  const tracksH = slotTop(displayTracks.length - 1) + (displayTracks.length > 1 ? ROW_H : H0);

  /** 组件轨框选:在组件轨空白拖出矩形(可跨多条轨),命中的组件块一次性入多选集。
   *  坐标基准 tracksRef;x 与 x(start)、y 与 rowTop 同域。纯点击=取消选中 + 播放头到点击处。 */
  const onOverlayPointerDown = (e: React.PointerEvent) => {
    startMarquee(
      e,
      tracksRef,
      blockMarqueeDraggedRef,
      (x0, y0, x1, y1) => setBlockMarquee({ l: Math.min(x0, x1), r: Math.max(x0, x1), t: Math.min(y0, y1), b: Math.max(y0, y1) }),
      (x0, y0, x1, y1) => {
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        const top = Math.min(y0, y1);
        const bot = Math.max(y0, y1);
        const hit = comp.blocks
          .filter((b) => b.trackIndex > 0 && !isSentenceCaption(b))
          .filter((b) => {
            const bl = x(b.startSec);
            const br = x(b.startSec + b.durationSec);
            const bt = rowTop(b.trackIndex) + 4;
            const bb = bt + (ROW_H - 8);
            return bl < hi && br > lo && bt < bot && bb > top; // 时间轴 x 与 轨道 y 双向相交
          })
          .map((b) => b.id);
        onBoxSelectBlocks(hit);
      },
      () => setBlockMarquee(null),
      (clientX) => {
        onSelect(null);
        onSeek(secAt(clientX));
      },
    );
  };

  // gutter 拖行重排:被拖行 translateY 跟手,目标槽画插入线,松手提交新显示序
  const [trackDrag, setTrackDrag] = useState<{ track: number; fromSlot: number; toSlot: number; dy: number } | null>(null);
  const trackDragRef = useRef(trackDrag);
  trackDragRef.current = trackDrag;
  const startTrackDrag = (e: React.PointerEvent, track: number) => {
    if (overlayTracks.length <= 1) return; // 只有一条叠加轨,没得排(字幕轴不算)
    e.preventDefault();
    const fromSlot = dispIdx.get(track)!;
    const sy = e.clientY;
    const mv = (ev: PointerEvent) => {
      if (ev.buttons === 0) { up(); return; }
      const dy = ev.clientY - sy;
      // 上界钳到最后一条真叠加轨(=overlayTracks.length),字幕轴那一格不接受落点
      const toSlot = Math.max(1, Math.min(overlayTracks.length, fromSlot + Math.round(dy / (ROW_H + ROW_GAP))));
      setTrackDrag({ track, fromSlot, toSlot, dy });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const td = trackDragRef.current;
      setTrackDrag(null);
      if (td && td.toSlot !== td.fromSlot) {
        const order = overlayTracks.slice(); // 叠加轨自上而下(不含字幕轴)
        const [moved] = order.splice(td.fromSlot - 1, 1);
        order.splice(td.toSlot - 1, 0, moved!);
        onReorderTracks(order);
      }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // 场景卡拖动重排(同主流剪辑器):从**卡面**起拖=调顺序,从轨上下空隙起拖=框选(onLanePointerDown)。
  // 被拖卡 translateX 跟手,目标缝画插入线,松手提交新序;<4px 不算拖,放行点选。
  // rAF 循环与框选引擎同款:贴视口边缘持续自动横滚,位移按内容坐标算(滚动不跑偏)。
  const [shotDrag, setShotDrag] = useState<{ from: number; to: number; dx: number } | null>(null);
  const shotDragRef = useRef(shotDrag);
  shotDragRef.current = shotDrag;
  const shotDragMovedRef = useRef(false); // 本次按下是否已成拖拽(抑制随后的点选)
  const startShotDrag = (e: React.PointerEvent, from: number) => {
    if (e.button !== 0 || !onReorderShot || sceneSpans.length <= 1) return;
    e.preventDefault();
    const x0 = e.clientX - contentLeft(); // 内容坐标起点(滚动不改它)
    const mid0 = (x(sceneSpans[from]!.start) + x(sceneSpans[from]!.end)) / 2;
    const mids = sceneSpans.map((sp) => (x(sp.start) + x(sp.end)) / 2);
    shotDragMovedRef.current = false;
    let lastX = e.clientX;
    let raf = 0;
    const frame = () => {
      const sc = scrollRef.current;
      if (sc && shotDragMovedRef.current) {
        const sr = sc.getBoundingClientRect();
        const EDGE = 44;
        let d = 0;
        if (lastX < sr.left + EDGE) d = -Math.ceil(((sr.left + EDGE - lastX) / EDGE) * 20);
        else if (lastX > sr.right - EDGE) d = Math.ceil(((lastX - (sr.right - EDGE)) / EDGE) * 20);
        if (d) sc.scrollLeft += d;
      }
      const dx = lastX - contentLeft() - x0;
      if (shotDragMovedRef.current || Math.abs(dx) > 4) {
        shotDragMovedRef.current = true;
        draggingRef.current = true; // hover-seek 让路
        // 目标位 = 被拖卡中心压过几张别的卡的中点(即移除自己后的插入下标,恰是 splice 语义)
        let to = 0;
        for (let j = 0; j < mids.length; j++) if (j !== from && mid0 + dx > mids[j]!) to += 1;
        const cur = shotDragRef.current;
        if (!cur || cur.dx !== dx || cur.to !== to) setShotDrag({ from, to, dx });
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const mv = (ev: PointerEvent) => {
      if (ev.buttons === 0) {
        up();
        return;
      }
      lastX = ev.clientX;
    };
    const up = () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      draggingRef.current = false;
      const sd = shotDragRef.current;
      setShotDrag(null);
      if (sd && shotDragMovedRef.current && sd.to !== sd.from) onReorderShot(sd.from, sd.to);
      // click 在 pointerup 后同步派发,旗标先留给它抑制点选;松手在卡外没有 click,下一拍兜底复位
      setTimeout(() => {
        shotDragMovedRef.current = false;
      }, 0);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // 块跨轨拖移:拖动中指针落进组件轨行核心带=吸行(to),落进行间空隙=掰新轨(gap=插入位,
  // 画横向插入线);横向照旧实时挪,松手提交。to/gap 恒只设其一。
  const [blockTrackDrag, setBlockTrackDrag] = useState<{ id: string; to: number | null; gap: number | null } | null>(null);
  const blockTrackDragRef = useRef(blockTrackDrag);
  blockTrackDragRef.current = blockTrackDrag;

  return (
    <div className="border-line bg-panel flex max-h-96 min-h-0 flex-col border-t">
      {/* 滚动区(缩放控制已移到上方走带工具栏)。面板素材拖入时整块变 drop 区:
          落点横坐标经 secAt(含滚动/缩放)换算成时间,workbench 在该时刻插素材块 */}
      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-auto ${dropActive ? 'ring-accent/60 ring-2 ring-inset' : ''}`}
        onScroll={onScrollFollow}
        onDragOver={
          dropActive
            ? (e) => {
                e.preventDefault();
                const clip = onMainTrack(e);
                // 类型不许落这个区:不给标线也不给落点(别画假承诺)
                if (!dropAllowed(clip)) {
                  e.dataTransfer.dropEffect = 'none';
                  setDropHint(null);
                  return;
                }
                e.dataTransfer.dropEffect = 'copy';
                // 插入点标线跟光标(0.1s 量化防抖);主轨落点=插入片段(真插会吸附分割点)
                setDropHint({ t: Math.round(secAt(e.clientX) * 10) / 10, clip });
              }
            : undefined
        }
        onDragLeave={
          dropActive
            ? (e) => {
                // dragleave 会从子组件冒泡(拖过场景卡就触发):只有真离开容器才清标线
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) setDropHint(null);
              }
            : undefined
        }
        onDrop={
          dropActive
            ? (e) => {
                e.preventDefault();
                setDropHint(null);
                const clip = onMainTrack(e);
                if (!dropAllowed(clip)) return;
                if (clip) onDropAssetClip?.(secAt(e.clientX));
                else onDropAsset?.(secAt(e.clientX));
              }
            : undefined
        }
      >
        <div className="flex" style={{ minWidth: GUTTER + EDGE_PAD * 2 + W }}>
          {/* 左:轨标签(图标 + 名)。sticky 固定列,z 要压过所有滚动内容(取景徽标 z-30/
              播放头 z-30/框选·「+」z-40),否则横滚时内容滑到它下面却盖在图标上 */}
          <div className="bg-panel sticky left-0 z-50 shrink-0" style={{ width: GUTTER }}>
            <div className="border-line border-b" style={{ height: RULER_H }} />
            <div style={{ paddingTop: 0 }}>
              {displayTracks.map((track) => {
                const k = trackKind(track);
                const meta =
                  track === CAP_LANE
                    ? KIND_META.caption
                    : k === 'video'
                      ? { label: sceneRail ? t('场景') : t('视频'), icon: Film, dot: 'text-accent' }
                      : KIND_META[k];
                const Icon = meta.icon;
                const dragging = trackDrag?.track === track;
                return (
                  <div
                    key={track}
                    onPointerDown={track > 0 ? (e) => startTrackDrag(e, track) : undefined}
                    title={track > 0 ? t('拖动调整轨道层级(上面的盖住下面的)') : undefined}
                    className={`flex items-center gap-1.5 px-2.5 text-[11px] ${track > 0 ? 'cursor-grab active:cursor-grabbing' : ''} ${dragging ? 'bg-panel-2 relative z-10 rounded' : ''}`}
                    style={{ height: rowH(track), marginTop: track === 0 ? 0 : ROW_GAP, transform: dragging ? `translateY(${trackDrag!.dy}px)` : undefined }}
                  >
                    <Icon size={13} className={meta.dot} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* 呼吸位:首块选中环往左出血 2px,没有它会钻到 sticky gutter 底下被截断(右侧同理,见尾部 spacer) */}
          <div className="shrink-0" style={{ width: EDGE_PAD }} />

          {/* 右:标尺 + 轨道 + 播放头 */}
          <div
            ref={contentRef}
            className="relative select-none"
            style={{ width: W }}
            onClick={() => {
              // 点空白 = 取消一切选中。交互组件(分镜/chip/刻度/按钮)各自 stopPropagation,
              // 冒泡到这里的就是背景。框选拖拽收尾不当点选(浏览器一般不发 click,加个保险)。
              if (marqueeDraggedRef.current || blockMarqueeDraggedRef.current) {
                marqueeDraggedRef.current = false;
                blockMarqueeDraggedRef.current = false;
                return;
              }
              onDeselectAll();
            }}
            onMouseMove={(e) => {
              if (draggingRef.current) return; // 拖动中由 onSeek 负责,别再 hover-seek
              hoverXRef.current = e.clientX;
              if (!scrubArmedRef.current) {
                const a = scrubEnterRef.current;
                if (!a) scrubEnterRef.current = { x: e.clientX, y: e.clientY, ts: performance.now() };
                else if (performance.now() - a.ts >= 160 && Math.hypot(e.clientX - a.x, e.clientY - a.y) >= 6) scrubArmedRef.current = true;
              }
              if (!hoverRaf.current)
                hoverRaf.current = requestAnimationFrame(() => {
                  hoverRaf.current = 0;
                  const tt = secAt(hoverXRef.current);
                  setHoverT(tt); // hover 竖线即时反馈
                  if (scrubArmedRef.current) onScrub(tt); // 武装后才跟手:每帧最多一次,中央预览跳帧
                });
            }}
            onMouseLeave={() => {
              if (hoverRaf.current) {
                cancelAnimationFrame(hoverRaf.current);
                hoverRaf.current = 0;
              }
              const armed = scrubArmedRef.current;
              scrubEnterRef.current = null;
              scrubArmedRef.current = false;
              setHoverT(null);
              if (armed) onScrub(null); // 还原到播放头(没武装过就没动过预览,不用还原)
            }}
          >
            {/* 标尺(点/拖 seek)+ 主次刻度 */}
            <div
              className="border-line text-ink-4 relative cursor-ew-resize select-none border-b text-[9px]"
              style={{ height: RULER_H }}
              onClick={(e) => e.stopPropagation()} // 拖刻度 seek 不取消选中
              onPointerDown={(e) => {
                onSeek(secAt(e.clientX));
                drag(e, (cx) => onSeek(secAt(cx)));
              }}
            >
              {Array.from({ length: ticks }, (_, i) => {
                const s = i * step;
                return (
                  <div key={i} className="absolute bottom-0 top-0" style={{ left: x(s) }}>
                    <div className="bg-line absolute bottom-0 left-0 w-px" style={{ height: 6 }} />
                    <span className="text-ink-4 absolute left-1 top-0.5 tabular-nums">{fmtTick(s)}</span>
                    {/* 次刻度(半格) */}
                    {x(step) >= 40 && <div className="bg-line/60 absolute bottom-0 w-px" style={{ left: x(step) / 2, height: 3 }} />}
                  </div>
                );
              })}
            </div>

            {/* 轨道背景区(承载所有行) */}
            <div ref={tracksRef} className="relative" style={{ height: tracksH }}>
              {/* 行底纹 */}
              {displayTracks.map((track) => (
                <div
                  key={`bg${track}`}
                  data-track-row
                  className="bg-panel-2/40 absolute left-0 right-0 rounded"
                  style={{ top: rowTop(track), height: rowH(track) }}
                  onPointerDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    // 组件轨(track>0)空白:起框选(拖=框选,点=取消选中+定位);轨0=场景栏交给 laneRef
                    if (track > 0) onOverlayPointerDown(e);
                    else {
                      onSelect(null);
                      onSeek(secAt(e.clientX));
                    }
                  }}
                />
              ))}
              {/* 组件轨框选矩形(可跨多条轨,含 y 边界) */}
              {blockMarquee && (
                <div
                  className="pointer-events-none absolute z-40 rounded-sm border border-sky-400 bg-sky-400/15"
                  style={{ left: blockMarquee.l, top: blockMarquee.t, width: Math.max(1, blockMarquee.r - blockMarquee.l), height: Math.max(1, blockMarquee.b - blockMarquee.t) }}
                />
              )}
              {/* 轨道重排插入线(gutter 拖行时) */}
              {trackDrag && trackDrag.toSlot !== trackDrag.fromSlot && (
                <div
                  className="bg-accent/90 pointer-events-none absolute left-0 right-0 z-40 h-0.5 rounded"
                  style={{ top: slotTop(trackDrag.toSlot) - (trackDrag.toSlot > trackDrag.fromSlot ? -ROW_H - 2 : 4) }}
                />
              )}

              {/* 轨0=场景栏:缩率图底 + 场景卡(分镜切片)。hover 分镜卡 → 两端出「+」插本地视频 */}
              {comp.video && (
                <div ref={laneRef} data-main-track onPointerDown={onLanePointerDown} className="absolute left-0 right-0" style={{ top: 0, height: H0 }} onMouseLeave={() => setHoverBounds(null)}>
                  {/* 缩率图底铺(固定每格宽,取最近源帧;同云剪辑)。有分镜卡时不铺——
                      缩率图进卡内裁切,否则连续底图从卡的透明圆角处漏出来,圆角/细缝都看不见 */}
                  {sceneSpans.length === 0 && (
                    <div className="bg-ink/10 pointer-events-none absolute top-3 bottom-2 left-0 overflow-hidden rounded ring-1 ring-white/10" style={{ width: x(videoDur) }}>
                      {filmTiles.map((tl, i) => (
                        // max-w-none:preflight 的 img max-width:100% 以容器为基,窄卡会把贴片压瘦露缝(三处贴片同理)
                        <img key={i} data-film-tile src={tl.url} alt="" loading="lazy" decoding="async" draggable={false} className="max-w-none absolute inset-y-0 h-full object-cover" style={{ left: tl.left, width: thumbW }} />
                      ))}
                      {(filmstrip ?? []).length === 0 && <div className="h-full w-full bg-gradient-to-r from-accent/20 to-accent/8" />}
                    </div>
                  )}
                  {/* 场景卡(分镜片段,半透明透出缩率图):序号 + 当前场景高亮 + 取景标 */}
                  {/* 播放头所在场景的高亮环:单独订阅播放头,播放中不再整表重渲 */}
                  <ActiveSceneRing sceneSpans={sceneSpans} pps={pps} selectedShotIds={selectedShotIds} />
                  {marquee && (
                    <div
                      className="pointer-events-none absolute top-3 bottom-2 z-40 rounded-sm border border-sky-400 bg-sky-400/15"
                      style={{ left: marquee.l, width: Math.max(1, marquee.r - marquee.l) }}
                    />
                  )}
                  {/* 重排目标缝的插入线:to<from 画在目标卡左缘,to>from 画在目标卡右缘(splice 语义) */}
                  {shotDrag && shotDrag.to !== shotDrag.from && (
                    <div
                      className="bg-accent pointer-events-none absolute top-3 bottom-2 z-50 w-1 -translate-x-1/2 rounded-full shadow"
                      style={{ left: shotDrag.to < shotDrag.from ? x(sceneSpans[shotDrag.to]!.start) : x(sceneSpans[shotDrag.to]!.end) }}
                    />
                  )}
                  {sceneSpans.map(({ shot, start, end }, i) => {
                    const sel = selectedShotIds.has(shot.id);
                    const shotLen = end - start;
                    const gapR = i < sceneSpans.length - 1 ? SHOT_GAP : 0; // 细缝从卡右缘扣,左缘保持时间精确
                    const w = Math.max(8, x(shotLen) - gapR);
                    const hasTreatment = shot.treatment !== 'full';
                    const dragged = shotDrag?.from === i; // 本卡正被拖动重排
                    return (
                      <div key={shot.id}>
                        <button
                          type="button"
                          // 从卡面按下=进重排通道(stopPropagation 拦掉轨面框选;上下空隙才是框选入口,同主流剪辑器)
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            startShotDrag(e, i);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (shotDragMovedRef.current) {
                              shotDragMovedRef.current = false; // 这是重排拖拽的收尾,不当点选
                              return;
                            }
                            if (marqueeDraggedRef.current) {
                              marqueeDraggedRef.current = false; // 这是框选拖拽的收尾,不当点选
                              return;
                            }
                            const additive = e.metaKey || e.ctrlKey;
                            if (!additive) onSeek(secAt(e.clientX)); // 单选=选中+播放头到点击位置;多选不跳播放头
                            onSelectShot(shot.id, additive);
                          }}
                          onDoubleClick={(e) => e.stopPropagation()}
                          onMouseEnter={() => {
                            if (draggingRef.current) return; // 重排/裁剪拖动扫过别的卡:不弹边界「+」
                            setHoverBounds({ l: start, r: end });
                          }}
                          title={t('场景 {n} · 镜头:{name}', { n: i + 1, name: t(TREATMENT_NAME[shot.treatment] ?? shot.treatment) })}
                          className={`bg-ink/10 absolute top-3 bottom-2 overflow-hidden rounded text-left ${
                            dragged ? 'shadow-xl ring-2 ring-accent brightness-110' : sel ? 'transition ring-2 ring-accent/70' : 'transition ring-1 ring-white/10 hover:ring-accent/40'
                          }`}
                          style={{ left: x(start), width: w, ...(dragged ? { transform: `translateX(${shotDrag!.dx}px)`, zIndex: 45 } : {}) }}
                        >
                          {/* 缩率图(卡内裁切:圆角/细缝由卡的 overflow-hidden 生效)。
                              外部插入段:主 filmstrip 是主视频的帧,贴上去就是错的 —— 铺它自己抽的帧
                              (clipStrips,t=片段源时间;还没抽出来先垫专属底色) */}
                          {shot.src ? (
                            <div className="pointer-events-none absolute inset-0">
                              {(() => {
                                const strip = (shot.src ? clipStrips?.[shot.src] : null) ?? [];
                                if (!strip.length) return <div className="absolute inset-0 bg-gradient-to-r from-sky-500/35 to-sky-500/15" />;
                                return stripTiles(strip, shot.srcStart, shot.srcEnd, tileDur, pps).map((tl, ti) => (
                                  <img key={ti} data-film-tile src={tl.url} alt="" loading="lazy" decoding="async" draggable={false} className="max-w-none absolute inset-y-0 h-full object-cover" style={{ left: tl.left, width: thumbW }} />
                                ));
                              })()}
                            </div>
                          ) : (
                            <>
                              {stripTiles(filmstrip ?? [], shot.srcStart, shot.srcEnd, tileDur, pps).map((tl, ti) => (
                                <img key={ti} data-film-tile src={tl.url} alt="" loading="lazy" decoding="async" draggable={false} className="max-w-none pointer-events-none absolute inset-y-0 h-full object-cover" style={{ left: tl.left, width: thumbW }} />
                              ))}
                              {(filmstrip ?? []).length === 0 && <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent/20 to-accent/8" />}
                            </>
                          )}
                          {/* 序号 */}
                          <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[9px] font-semibold leading-[14px] text-white">{i + 1}</span>
                        </button>

                        {/* 取景徽标(每镜):点击选中分镜 → 右侧取景面板(样式卡)打开。坐在场景卡左下角。
                            取景恒作用整镜(一镜=一取景,要局部就剪开),设了就执行——没有"停留不足合并"
                            (那是给 LLM 分镜时的克制要求,用户手动剪的不管)。 */}
                        <div className="absolute z-30" style={{ left: x(start) + 3, bottom: SCENE_PAD_B + 1 }}>
                          <button
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenShotSettings(shot.id);
                            }}
                            title={t('取景:{name}', { name: t(TREATMENT_NAME[shot.treatment] ?? shot.treatment) })}
                            className={`cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-medium leading-[14px] shadow ${
                              hasTreatment ? 'bg-accent/90 text-white' : 'bg-black/55 text-white/80 hover:text-white'
                            }`}
                          >
                            {hasTreatment ? t(TREATMENT_NAME[shot.treatment] ?? shot.treatment) : t('取景')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {/* 切点转场(内容级,挂在主轴上):没设=窄带添加入口;设了=以切点为中心的
                      对称区域(主题色),两侧柄左右对称拖时长(拖一边另一边镜像跟,总长≤4s)。
                      z-30 在场景卡之上、hover「+」(z-40)之下 */}
                  {onOpenTransition &&
                    (() => {
                      const trs = cutTransitions(shots);
                      return sceneSpans.slice(0, -1).map(({ end }, i) => {
                        const tr = trs.find((t2) => Math.abs(t2.cut - end) < 0.05);
                        if (!tr) {
                          return (
                            <button
                              key={`tr-${i}`}
                              type="button"
                              title={t('添加转场')}
                              aria-label={t('添加转场')}
                              onMouseEnter={() => {
                                if (draggingRef.current) return; // 拖动中不抢 hover-scrub
                                // 悬停转场位=明确意图:立即武装 hover-scrub,中央预览直接跳到切点帧
                                scrubArmedRef.current = true;
                                setHoverT(end);
                                onScrub(end);
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenTransition(end, e.currentTarget.getBoundingClientRect());
                              }}
                              className="absolute top-3 bottom-2 z-30 flex w-3.5 -translate-x-1/2 cursor-pointer items-center justify-center rounded-sm bg-black/40 text-white/75 transition hover:bg-black/65 hover:text-white"
                              style={{ left: x(end) }}
                            >
                              <ArrowLeftRight size={10} />
                            </button>
                          );
                        }
                        // 拖动中的实时半宽(本地态);柄夹在 [0.1, min(2, 两侧镜长)]
                        const lenPrev = sceneSpans[i]!.end - sceneSpans[i]!.start;
                        const lenSelf = sceneSpans[i + 1]!.end - sceneSpans[i + 1]!.start;
                        const maxHalf = Math.min(MAX_TRANSITION_SEC / 2, lenPrev, lenSelf);
                        const half = trDrag && Math.abs(trDrag.cut - end) < 0.05 ? trDrag.half : tr.half;
                        const handle = (side: -1 | 1) => (
                          <div
                            role="none"
                            title={t('拖动调时长(左右对称)')}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              drag(
                                e,
                                (cx) => setTrDrag({ cut: end, half: Math.min(maxHalf, Math.max(0.1, Math.abs(secAt(cx) - end))) }),
                                (moved) => {
                                  setTrDrag((cur) => {
                                    if (moved && cur) onResizeTransition?.(tr.shotId, Math.round(cur.half * 2 * 100) / 100);
                                    return null;
                                  });
                                },
                              );
                            }}
                            className="bg-accent absolute top-0 bottom-0 w-1.5 cursor-ew-resize rounded-full opacity-80 hover:opacity-100"
                            style={side < 0 ? { left: -3 } : { right: -3 }}
                          />
                        );
                        return (
                          <div
                            key={`tr-${i}`}
                            className="absolute top-3 bottom-2 z-30"
                            style={{ left: x(end - half), width: Math.max(10, x(half * 2)) }}
                            onMouseEnter={(e) => {
                              if (draggingRef.current) return; // 拖动中不抢 hover-scrub
                              // 悬停转场区=明确意图:立即武装,预览跳到光标时刻(后续 mousemove 冒泡跟手)
                              scrubArmedRef.current = true;
                              const tt = secAt(e.clientX);
                              setHoverT(tt);
                              onScrub(tt);
                            }}
                          >
                            <button
                              type="button"
                              title={t('转场 · {sec}s(点击修改)', { sec: (half * 2).toFixed(1) })}
                              aria-label={t('修改转场')}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenTransition(end, e.currentTarget.getBoundingClientRect());
                              }}
                              className="bg-accent/30 ring-accent/70 hover:bg-accent/40 absolute inset-0 flex cursor-pointer items-center justify-center rounded-sm ring-1 transition"
                            >
                              <span className="bg-accent flex h-4 w-4 items-center justify-center rounded-full text-white shadow">
                                <ArrowLeftRight size={9} />
                              </span>
                            </button>
                            {handle(-1)}
                            {handle(1)}
                          </div>
                        );
                      });
                    })()}
                  {/* hover 分镜的前后边界「+」:点击在该分割点插入本地视频(上传→插主轨) */}
                  {hoverBounds && onInsertClipAt && !assetDragging && clipPendingAt == null &&
                    [hoverBounds.l, hoverBounds.r].map((b, bi) => (
                      <button
                        key={bi}
                        type="button"
                        title={t('在此插入本地视频')}
                        aria-label={t('在此插入本地视频')}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          onInsertClipAt(b);
                        }}
                        className="bg-accent absolute top-1/2 z-40 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-white shadow hover:brightness-110"
                        style={{ left: x(b) }}
                      >
                        <Plus size={12} />
                      </button>
                    ))}
                </div>
              )}

              {/* 叠加组件 chip:类型图标 + 标签 + 选中显时间;整块拖移 + 两端裁剪 */}
              {comp.blocks.map((b) => {
                const track = b.trackIndex;
                const sel = selectedBlockIds.has(b.id);
                const k = blockKind(b);
                const meta = { ...KIND_META[k], ...KIND_CHIP[k] };
                const Icon = meta.icon;
                const left = x(b.startSec);
                const width = Math.max(16, x(b.durationSec));
                // 句级字幕不进时间轴:字幕是口播稿的纯计算产物(编辑入口=口播稿面板/花字面板),
                // 时间轴上摆一排跟着转写走、不可拖不可裁的 chip 只是噪音
                if (isSentenceCaption(b)) return null;
                // 跨轨拖移中:chip 吸到目标行渲染;命中行间空隙则骑在插入线上(松手才真改 trackIndex)
                const btd = blockTrackDrag?.id === b.id ? blockTrackDrag : null;
                const crossing = !!btd && (btd.gap != null || btd.to !== track);
                const top = btd?.gap != null ? slotTop(1 + btd.gap) - ROW_GAP / 2 - (ROW_H - 8) / 2 : rowTop(btd?.to ?? track) + 4;
                return (
                  <div
                    key={b.id}
                    title={b.label}
                    className={`group absolute overflow-hidden rounded-md ring-1 ${crossing ? 'z-40 shadow-lg ring-2 brightness-110' : 'transition'} ${sel ? meta.chipSel : meta.chip}`}
                    style={{ left, width, top, height: ROW_H - 8 }}
                    onClick={(e) => e.stopPropagation()} // chip 经 pointer 选中,阻断冒泡免被背景取消
                    onMouseEnter={(e) => openHover(b, e.currentTarget)}
                    onMouseLeave={closeHover}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      closeHover();
                      onSelect(b.id); // 定位已由单击完成(点哪停哪),双击不再另跳块起点
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      closeHover();
                      const additive = e.metaKey || e.ctrlKey; // ⌘/Ctrl 多选
                      const at = secAt(e.clientX); // 按下处的时间:点选时播放头就停在这
                      const grab = at - b.startSec;
                      drag(
                        e,
                        (cx, cy) => {
                          if (additive) return;
                          onMoveBlock(b.id, snap(Math.max(0, secAt(cx) - grab), [b.startSec, b.startSec + b.durationSec]));
                          // 纵向:行核心带=吸行;行间空隙(含场景轨下沿/字幕轴两侧)=掰新轨插入位
                          if (!onMoveBlockTrack) return;
                          const base = tracksRef.current?.getBoundingClientRect();
                          if (!base) return;
                          const y = cy - base.top;
                          let to: number | null = null;
                          for (const tk of overlayTracks) {
                            if (y >= rowTop(tk) + 4 && y <= rowTop(tk) + ROW_H - 4) {
                              to = tk;
                              break;
                            }
                          }
                          if (to != null || !onMoveBlockNewTrack) {
                            // 没命中行核心带又不支持掰新轨:保持上次命中的行
                            const prev = blockTrackDragRef.current?.id === b.id ? blockTrackDragRef.current : null;
                            setBlockTrackDrag({ id: b.id, to: to ?? prev?.to ?? track, gap: null });
                          } else {
                            let g = 0; // 插入位=数过几条行核心带
                            for (const tk of overlayTracks) if (y > rowTop(tk) + ROW_H - 4) g += 1;
                            setBlockTrackDrag({ id: b.id, to: null, gap: g });
                          }
                        },
                        (moved) => {
                          const td = blockTrackDragRef.current;
                          setBlockTrackDrag(null);
                          if (moved) {
                            if (td?.id === b.id) {
                              if (td.gap != null) onMoveBlockNewTrack?.(b.id, td.gap);
                              else if (td.to != null && td.to !== track) onMoveBlockTrack?.(b.id, td.to);
                            }
                            return;
                          }
                          if (additive) {
                            onSelectBlock(b.id, true); // 进/出多选集,不动播放头
                            return;
                          }
                          // 点选 = 选中 + 播放头定位到点击的具体位置(舞台直接看到这一刻)
                          onSeek(at);
                          onSelectBlock(b.id, false);
                        },
                      );
                    }}
                  >
                    <div className="pointer-events-none flex h-full items-center gap-1 px-2">
                      <Icon size={11} className={`${meta.dot} shrink-0`} />
                      <span className="text-ink truncate text-[10px] font-medium">{b.label || t(meta.label)}</span>
                      {sel && width > 92 && (
                        <span className="text-ink-3 ml-auto shrink-0 font-mono text-[9px] tabular-nums">
                          {b.startSec.toFixed(1)}–{(b.startSec + b.durationSec).toFixed(1)}
                        </span>
                      )}
                    </div>
                    {/* 左裁剪 */}
                    <span
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const end = b.startSec + b.durationSec;
                        drag(e, (cx) => {
                          const ns = Math.max(0, Math.min(end - MIN_DUR, snap(secAt(cx), [b.startSec])));
                          onResizeBlock(b.id, ns, end - ns);
                        });
                      }}
                      className={`absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l ${sel ? 'bg-white/50' : 'bg-white/0 group-hover:bg-white/40'}`}
                    />
                    {/* 右裁剪 */}
                    <span
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        drag(e, (cx) => {
                          const ne = Math.max(b.startSec + MIN_DUR, snap(secAt(cx), [b.startSec + b.durationSec]));
                          onResizeBlock(b.id, b.startSec, ne - b.startSec);
                        });
                      }}
                      className={`absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r ${sel ? 'bg-white/50' : 'bg-white/0 group-hover:bg-white/40'}`}
                    />
                  </div>
                );
              })}

              {/* 掰新轨的横向插入线(块拖进行间空隙时):骑在两行之间的缝隙正中 */}
              {blockTrackDrag?.gap != null && (
                <div
                  className="bg-accent pointer-events-none absolute left-0 z-40 h-0.5 rounded-full shadow"
                  style={{ top: slotTop(1 + blockTrackDrag.gap) - ROW_GAP / 2 - 1, width: x(dur) }}
                />
              )}

              {/* 字幕轴:句级字幕只读 chip(跟转写走,不可拖/裁;点=播放头跳到点击处,编辑入口在字幕面板) */}
              {hasCaptions &&
                captionBlocks.map((b) => (
                  <div
                    key={b.id}
                    title={b.label || t('字幕')}
                    className="absolute overflow-hidden rounded-md bg-rose-500/12 ring-1 ring-rose-400/25 transition hover:bg-rose-500/20"
                    style={{ left: x(b.startSec), width: Math.max(10, x(b.durationSec)), top: rowTop(CAP_LANE) + 4, height: ROW_H - 8 }}
                    onClick={(e) => {
                      e.stopPropagation(); // 只读:点=跳播放头到点击处,不选中/不取消选中
                      onSeek(secAt(e.clientX));
                    }}
                  >
                    <div className="pointer-events-none flex h-full items-center px-2">
                      <span className="text-ink-2 truncate text-[10px]">{b.label || t('字幕')}</span>
                    </div>
                  </div>
                ))}

              {/* 吸附对齐参考线(拖动命中切点/整秒/邻块边/播放头时) */}
              {guide != null && (
                <div className="pointer-events-none absolute top-0 bottom-0 z-40" style={{ left: x(guide) }}>
                  <div className="absolute top-0 bottom-0 w-px bg-accent/90" style={{ boxShadow: '0 0 6px rgba(63,75,232,0.55)' }} />
                  <div className="absolute -top-0.5 left-1 rounded bg-accent px-1 font-mono text-[9px] leading-[13px] text-white">{guide.toFixed(2)}s</div>
                </div>
              )}

              {/* 素材拖入的插入点标线:跟光标 —— 所见即所插;悬在主轨=插入片段口径 */}
              {dropActive && dropHint != null && (
                <div className="pointer-events-none absolute top-0 bottom-0 z-40" style={{ left: x(dropHint.t) }}>
                  <div className="bg-accent absolute top-0 bottom-0 w-0.5 -translate-x-1/2" style={{ boxShadow: '0 0 8px rgba(63,75,232,0.7)' }} />
                  <div className="bg-accent absolute -top-0.5 left-1.5 rounded px-1 text-[9px] leading-[13px] whitespace-nowrap text-white">
                    {dropHint.clip ? t('插入片段({mode})· {sec}s', { mode: assetDragKind === 'image' ? t('5s 静帧') : t('整段'), sec: dropHint.t.toFixed(1) }) : t('插入到 {sec}s', { sec: dropHint.t.toFixed(1) })}
                  </div>
                </div>
              )}

              {/* 外部片段插入进行中(下载/上传/读时长):落点处亮徽标,别让人以为拖了没反应 */}
              {clipPendingAt != null && (
                <div className="pointer-events-none absolute z-40 -translate-x-1/2" style={{ left: x(clipPendingAt), top: 8 }}>
                  <span className="inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white">
                    <Loader2 size={10} className="animate-spin" /> {t('插入中…')}
                  </span>
                </div>
              )}

            </div>

            {/* hover 竖线(贯穿标尺+轨道;中央预览同步跳到该帧) */}
            {hoverT != null && <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-white/35" style={{ left: x(hoverT) }} />}

            {/* 播放头:贯穿标尺+轨道,亮线 + 顶部圆点(订阅播放头 store,每帧只这一个组件动)。
                空工程不画——空轨道上悬一根红线像坏了 */}
            {(comp.video || comp.blocks.length > 0) && <PlayheadCursor pps={pps} />}
          </div>

          {/* 右侧呼吸位:末块选中环的出血不被滚动容器右缘截断 */}
          <div className="shrink-0" style={{ width: EDGE_PAD }} />
        </div>
      </div>


      {/* hover 组件小预览(固定屏幕坐标,浮在 chip 上方) */}
      {hover && (
        <div
          className="border-line bg-panel pointer-events-none fixed z-50 overflow-hidden rounded-lg border shadow-2xl"
          style={{
            left: Math.max(8, Math.min(hover.left, (typeof window !== 'undefined' ? window.innerWidth : 9999) - PREVIEW_W - 8 - 2)),
            top: hover.top - previewH - 10,
            width: PREVIEW_W + 2,
          }}
        >
          <div
            className="relative"
            style={{
              width: PREVIEW_W,
              height: previewH,
              // 透明区棋盘格(屏幕像素;与 block-preview-card 同款,画进缩放文档会糊)
              backgroundColor: '#ffffff',
              backgroundImage:
                'linear-gradient(45deg,#d7dbe0 25%,transparent 25%,transparent 75%,#d7dbe0 75%),linear-gradient(45deg,#d7dbe0 25%,transparent 25%,transparent 75%,#d7dbe0 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0,8px 8px',
            }}
          >
            <iframe
              title="element-preview"
              srcDoc={hoverDoc}
              sandbox="allow-scripts"
              style={{
                position: 'absolute',
                left: Math.round(PREVIEW_W * 0.07),
                top: Math.round(previewH * 0.07),
                width: comp.width,
                height: comp.height,
                border: 0,
                transform: `scale(${previewScale * 0.86})`,
                transformOrigin: 'top left',
              }}
            />
          </div>
          <div className="text-ink-3 truncate px-2 py-1 text-[10px]">{hover.block.label || blockKind(hover.block)}</div>
        </div>
      )}
    </div>
  );
}
