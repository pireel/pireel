'use client';

/**
 * Hyperframes 工作台 —— 拆块版编辑态(纯浏览器,零服务端)。
 *
 * 模型 = 连续口播视频(轨0)+ 多轨叠加块(花字/标题/转场)。每块是 Hyperframes 嵌套 composition
 * 片段;assemble 拼成完整 HTML 喂 <iframe srcdoc> 实时渲染。
 *  · 导入口播视频 + 一键 ASR → 每句生成一段高亮花字块(分镜)。
 *  · 多层时间轴:点块选中,右侧对话改"这一块"(per-block,便宜精准)。
 *  · 导出走服务端 headless Chrome(同一份 assemble HTML,WYSIWYG,待接入)。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from 'use-intl';
import { Play, Pause, FileVideo, Code2, Loader2, Wand2, ScrollText, Sparkles, Upload, FlaskConical, ScanFace, MessageSquare, Image as ImageIcon, Captions as CaptionsIcon, ChevronsLeft, ChevronsRight, Minus, Plus, Download, X, GripVertical, Trash2, Palette, RefreshCw, Save, SendToBack, BringToFront, ChevronUp, ChevronDown, UserRound, Frame, Undo2, Redo2, RotateCw, Squircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@pireel/ui/tooltip';

import { toast } from '@pireel/ui/toast';
import { studioLocale, t } from './i18n';
import { framePack } from '@pireel/studio-frames/locales';
import {
  type Block,
  type CaptionStyle,
  type Composition,
  type MediaRef,
  type CutTransitionEffect,
  type TransitionDirection,
  type ShotFilter,
  type ShotTreatment,
  type PersonFx,
  type VideoShot,
  SHOT_TREATMENTS,
  STUDIO_FONTS_HREF,
  CAPTION_PRESETS,
  assembleHtml,
  blockBgCss,
  captionLineSegments,
  customHasSurface,
  blockId,
  blockKind,
  videoFrameTimelineBody,
  emptyComposition,
  freeTrack,
  getCaptionPreset,
  isSentenceCaption,
  mediaBlock,
  newBlock,
  renderBlock,
  resolveCaptionStyle,
  resolveSubCaptionStyle,
  shotFilterCss,
  shotId,
  shotTransformVars,
  DIRECTIONAL_TRANSITIONS,
  MAX_TRANSITION_SEC,
  cutTransitions,
  splitBlockedByTransition,
  totalDuration,
  treatmentVacancyBox,
} from '@pireel/studio-engine/composition';
import { getTheme, themeVarsCss } from '@pireel/studio-engine/theme';
import { deleteClipById, removeEditedInterval, removeEditedRange, removeSrcRanges, restoreSrcRange, spans as clipSpans, splitAtEdited, srcToEditedLoose, trimLeftAtEdited, trimRightAtEdited } from '@pireel/studio-engine/trim';
import { parseBlockResponse } from '@pireel/studio-engine/compose';
import { imageThumb, imgSourceBase } from '@pireel/ui/image-url';
import { HARD_LINT_CODES, lintBlock } from '@pireel/studio-engine/block-lint';
import { clearToolProgress, setToolProgress } from './tool-progress';
import { injectPreviewRuntime } from './sample-composition';
import { playhead, usePlayheadT } from './playhead';
import { type AsrSegment, captionBlocksFromAsr } from '@pireel/studio-engine/build-blocks';
import { type Box as GraphicBox, dropPlaceholdersInWindows, insertedClipPlaceholder, isPlaceholder, layoutFromPlan, layoutInsertWindow, pickGraphicBox, placeholderSpec } from '@pireel/studio-engine/build-draft';
import { type FilmstripFrame, extractFilmstrip, fileSig, probeVideoFile, uploadImageFile, uploadVideoFile } from './media';
import { loadLocalVideo, saveLocalVideo } from './local-media';
import { VideoTrackEngine } from './video-track-engine';
import { type BakeSpec, type BakedWindow, bakeTransitionWindow, decodeBake } from './transition-bake';
import { type DraftPlan, type PlanInsert, parsePlan , unifiedPlanRows } from '@pireel/studio-engine/plan';
import { beatsForWindow as beatsForWindowPure, inNarrationSource, insertPlanContexts, mappedCaptionSegs as relayMappedCaptionSegs, relayCaptionLayer as relayCaptionLayerPure } from '@pireel/studio-engine/captions-relay';
import { studioProviders } from '@pireel/studio-engine/providers';
import { StudioTimeline, DEFAULT_PPS, MIN_PPS, MAX_PPS } from './studio-timeline';
import { type AttachedFrame, StudioChat, type StudioChatHandle, type StudioElementRef } from './studio-chat';
import { ElementSourceEditor, type SourceDraft } from './element-source-editor';
import { useStableCallbacks } from './use-stable-callbacks';
import { startPointerDrag } from './drag-shell';
import {
  type StudioDraft,
  cacheProjectLocally,
  chatKeyFor,
  loadDraft,
  readChatThreads,
  saveCoverThumb,
  setProjectVersion,
  useDraftAutosave,
} from './use-draft-persist';
import type { StudioProjectDto } from '@pireel/studio-engine/project-dto';
import { useGenerationLock } from './use-generation-lock';
import { useDraftPipeline } from './use-draft-pipeline';
import { useStudioExport } from './use-export';
import { DEFAULT_RENDER_OPTS, type ExportRenderOpts, captureCompositionFrame } from './client-export';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@pireel/ui/dialog';
import { GenChatPanel, type GenElementResult } from './gen-chat-panel';
import { wordsFromText } from '@pireel/studio-engine/caption-fx';
import { AssetsPanel, type GenType, type PanelDragAsset } from './assets-panel';
import { addElementEntry } from './element-history';
import { type ScriptCut, ScriptPanel } from './script-panel';
import { CaptionsPanel } from './captions-panel';
import { FramePanel } from './frame-panel';
import { PersonFxPanel, type MatteState } from './person-fx-panel';
import { ShotTreatmentPanel } from './shot-treatment-panel';
import { TransitionPanel } from './transition-panel';
import { MediaAnimPanel } from './media-anim-panel';
import { type MatteFrame, MATTE_FPS, computeMatteTrack } from './person-matte';
import { type FrameCatalogItem, useFrameCatalog } from './use-frame-catalog';
import { StudioBootOverlay } from './studio-boot';
import { confirm } from '@pireel/ui/confirm';
import { type ChatSituation, type StudioToolResult, STUDIO_TOOL_MAP, buildSituation } from '@pireel/studio-engine/prompts';
import { useAgentBridge } from './use-agent-bridge';
import { type VisualLabel, type VisualPrep, type VisualTimeline, analyzeVisual, clearVisualCache, finishVisualAnalysis, insertedClipSafeZone, prepareVisualAnalysis } from './visual';
import { type SafeZone, detectFrameAt, geomNote } from './geometry';

/** frame 内容包的 personFx 推荐(kebab 字符串表)→ 运行时 PersonFx。 */
function personFxFromFrame(m: Record<string, string>): PersonFx {
  const num = (v: string | undefined): number | null => {
    const n = Number(v);
    return v != null && Number.isFinite(n) ? n : null;
  };
  const width = num(m['stroke-width']);
  return {
    ...(m['person-front'] === 'true' ? { personFront: true } : {}),
    ...(num(m['feather']) != null ? { feather: num(m['feather'])! } : {}),
    ...(width != null && width > 0
      ? {
          stroke: {
            style: m['stroke-style'] === 'dashed' ? ('dashed' as const) : ('solid' as const),
            width,
            color: m['stroke-color'] ?? '#FFFFFF',
            opacity: num(m['stroke-opacity']) ?? 1,
          },
        }
      : {}),
  };
}

const PREVIEW_FALLBACK_W = 320; // 测到父尺寸前的兜底宽
const UNDO_CAP = 20; // undo 快照栈上限(每份=整个 Composition,含 custom 块 HTML)
// ⚠️ 测试期临时:配图固定只配前 N 张省 LLM 调用,其余占位保留 —— **上线前删掉**。
// 放顶层就是为了别埋在 400 行工具分支里被悄悄带上线。
const GRAPHICS_TEST_CAP = 10;

/** 工具面板种类(单实例互替,停靠素材栏整列):生成 / 智能剪口播 / 人像 / 取景 / 源码 / 素材动效 / 转场 / 字幕。 */
type FloatKind = 'gen' | 'script' | 'person' | 'shot' | 'code' | 'anim' | 'transition' | 'captions';

/**
 * 画布尺寸归一:**宽度恒定锚到 1080(固定参照)**,高度按视频宽高比推。
 * 关键:px 字号是按 1080 宽画布标定的,所以画布宽必须固定 —— 否则同一句「200px」在不同分辨率视频里
 * 占画面比例不同(偏差 = 1080/实际宽)。不裁剪、不变形(video 用 object-fit:cover 填),整体等比缩放。
 */
const REF_WIDTH = 1080;
function normalizeDims(w: number, h: number): { width: number; height: number } {
  if (!w || !h) return { width: REF_WIDTH, height: 1920 };
  return { width: REF_WIDTH, height: Math.round((REF_WIDTH * h) / w) };
}

/** 某镜在成片时间轴上的区间(起点+时长)。 */
function shotSpan(c: Composition, sid: string): { editedStart: number; shotLen: number } | null {
  const shots = c.shots ?? [];
  const shot = shots.find((s) => s.id === sid);
  if (!shot) return null;
  const sp = clipSpans(shots).find((x) => x.clip.id === sid);
  const editedStart = sp?.editedStart ?? 0;
  const shotLen = sp ? sp.editedEnd - sp.editedStart : Math.max(0.1, shot.srcEnd - shot.srcStart);
  return { editedStart, shotLen };
}

/**
 * 取景有空区(半切/缩角)且该镜**已有** partner 块时:把它对齐到新空区盒 + 整镜区间。
 * **只更新不创建**(「另一半放什么」入口已砍,partner 只可能来自历史链接):
 * 无空区(full/放大)原样返回——保留已有 partner 块与链接,不自动删(免误删用户填的内容)。
 */
function syncVacancyPartner(c: Composition, sid: string): Composition {
  const shots = c.shots ?? [];
  const shot = shots.find((s) => s.id === sid);
  if (!shot) return c;
  const vac = treatmentVacancyBox(shot.treatment, shot.treatSize);
  if (!vac) return c;
  const existing = shot.partnerBlockId ? c.blocks.find((b) => b.id === shot.partnerBlockId) : null;
  if (!existing) return c;
  const span = shotSpan(c, sid)!;
  return {
    ...c,
    blocks: c.blocks.map((b) => (b.id === existing.id ? { ...b, box: vac, startSec: span.editedStart, durationSec: Math.max(0.3, span.shotLen) } : b)),
  };
}

/** 浮动条上的「圆角」控件(排版组件 / 素材卡共用)。旋转另走底部旋转手柄,不在这。
 *  滑杆实时:onRadius 边拖边预览(父层直改 iframe border-radius),松手一并落 Block。 */
function CardShapeControls({ block, onRadius }: { block: Block; onRadius: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const radius = Math.round(block.radius ?? 0);
  return (
    <span ref={ref} className="relative inline-flex">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={t('圆角')}
            className={`rounded p-1 ${open ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink'}`}
          >
            <Squircle size={13} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{t('圆角')}</TooltipContent>
      </Tooltip>
      {open && (
        <div className="border-line bg-panel absolute left-1/2 top-full z-50 mt-1.5 flex -translate-x-1/2 items-center gap-1.5 rounded-lg border px-2.5 py-2 shadow-xl">
          <span className="text-ink-4 w-8 shrink-0 text-[10px]">{t('圆角')}</span>
          <input type="range" min={0} max={120} step={2} value={radius} onChange={(e) => onRadius(Number(e.target.value))} className="zoom-range w-32" aria-label={t('圆角')} />
          <span className="text-ink-3 w-9 shrink-0 text-right font-mono text-[10px] tabular-nums">{radius}px</span>
        </div>
      )}
    </span>
  );
}

export function HyperframesWorkbench({ projectId, agentView = false }: { projectId: string; agentView?: boolean }) {
  const locale = useLocale(); // note/回复语言跟 UI locale(画面内文本另由口播稿语言定)
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const starter = useMemo(() => emptyComposition(), []);
  const [comp, _setComp] = useState<Composition>(starter);
  // setComp 包装:同步写 compRef —— agent 工具/流水线在**同一 tick 连续多次**读改 composition 时
  // (React 18 批处理下 state/普通 ref 都要等 re-render 才新),compRef 始终是最新值,后写不吞前写。
  const compRef = useRef<Composition>(starter);
  const setComp = useCallback((action: React.SetStateAction<Composition>) => {
    const next = typeof action === 'function' ? (action as (c: Composition) => Composition)(compRef.current) : action;
    compRef.current = next;
    _setComp(next);
  }, []);
  // 组件选中:selectedId = 主选(锚点,浮动条/面板只对单块生效);selectedBlockIds = 全量多选集
  // (⌘点选/框选,批量删除用)。setSelectedId 包成 setter:所有既有单选点自动把多选集归一到
  // {id}/空,不用逐处改;多选手势(toggleBlockSelect/selectBlocksBox)直设两者。
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => new Set());
  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIdRaw(id);
    setSelectedBlockIds(id ? new Set([id]) : new Set());
  }, []);
  const selectedBlockIdsRef = useRef<Set<string>>(selectedBlockIds);
  selectedBlockIdsRef.current = selectedBlockIds;
  // 分镜选中:selectedShotId = 主选(锚点,取景/抠像面板只对单镜生效);selectedShotIds = 全量
  // 多选集(⌘点选/框选,批量删除用)。setSelectedShotId 包成 setter:所有既有单选调用点
  // 自动把多选集归一到 {id}/空,不用逐处改;多选手势走专用函数直设两者。
  const [selectedShotId, setSelectedShotIdRaw] = useState<string | null>(null);
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(() => new Set());
  const setSelectedShotId = useCallback((id: string | null) => {
    setSelectedShotIdRaw(id);
    setSelectedShotIds(id ? new Set([id]) : new Set());
  }, []);
  const selectedShotIdsRef = useRef<Set<string>>(selectedShotIds);
  selectedShotIdsRef.current = selectedShotIds;
  /** ⌘/Ctrl 点选:切换某镜进/出多选集,锚点跟到最后交互的镜。 */
  const toggleShotSelect = useCallback((id: string) => {
    setSelectedId(null);
    setSelectedShotIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedShotIdRaw(next.has(id) ? id : (next.values().next().value ?? null));
      return next;
    });
  }, []);
  /** 框选:把命中的镜设为多选集(空命中=清空选择),锚点取第一个。 */
  const selectShotsBox = useCallback((ids: string[]) => {
    setSelectedId(null);
    setSelectedShotIds(new Set(ids));
    setSelectedShotIdRaw(ids[0] ?? null);
  }, []);
  /** ⌘/Ctrl 点选组件:切换某块进/出多选集(与分镜多选对称;多选态无单主选,面板让位)。 */
  const toggleBlockSelect = useCallback(
    (id: string) => {
      setSelectedShotId(null);
      setSelectedIdRaw((cur) => {
        // 从单选态首次 ⌘点另一块:把原主选一并纳入多选集
        if (cur && cur !== id) setSelectedBlockIds((prev) => new Set(prev).add(cur));
        return null;
      });
      setSelectedBlockIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [setSelectedShotId],
  );
  /** 框选组件:把命中的块设为多选集(可跨多条组件轨;空命中=清空)。 */
  const selectBlocksBox = useCallback(
    (ids: string[]) => {
      setSelectedShotId(null);
      setSelectedIdRaw(null);
      setSelectedBlockIds(new Set(ids));
    },
    [setSelectedShotId],
  );
  // 时间轴 hover 预览跳到了选中组件时间窗外 → 编辑框跟着画面藏起来(不然边框钉在一帧不相干的画面上)
  const [scrubHideSel, setScrubHideSel] = useState(false);
  // 体拖中心吸附参考线:常驻 DOM 直切 display —— 拖动路径零 setState。
  // (之前走 state,拖过中线附近每次翻转都整树重渲一把,就是"拖着拖着卡一下"的来源)
  const guideVRef = useRef<HTMLDivElement | null>(null); // 垂直中线
  const guideHRef = useRef<HTMLDivElement | null>(null); // 水平中线
  const setGuideVis = useCallback((cx: boolean, cy: boolean) => {
    if (guideVRef.current) guideVRef.current.style.display = cx ? 'block' : 'none';
    if (guideHRef.current) guideHRef.current.style.display = cy ? 'block' : 'none';
  }, []);
  // 体拖/手柄拖进行中(护罩挂载 + 空块动作层让路)。选中框**不再让路**:统一成字幕手柄的
  // ghost 语义 —— 基准实线原地不动,虚线 ghost 跟手,内容不实时改,松手一次提交
  const [bodyDragging, setBodyDragging] = useState(false);
  // 就地改字回显:iframe 'edit' 消息改的字,活跃文档本来就是最新——该块 slots-only 提交
  // 可跳过重建(重建纯属回显浪费还闪一次)。记块 id,补丁分类命中时消费
  const iframeEditEchoRef = useRef<Set<string>>(new Set());
  // 后台缓冲切换待决:就地补丁只打**活跃**文档,切换待决时打了会被换进来的一代盖掉——
  // 此窗口内补丁通道让路,退回整文档重建(重建拼的是最新 comp,恒正确)
  const pendingSwitchRef = useRef(false);
  // 整文档重建进行中(写后台缓冲→握手→切换):舞台角落出「画面更新中」指示,统一覆盖
  // 手动插入/AI 生成落块/挂主题等一切结构性变更(用户报插入后到显示的空窗没反馈)
  const [rebuilding, setRebuilding] = useState(false);
  // 刚插入组件的落点骨架(归一坐标):重建落定前在组件将出现的位置画虚线框+spinner
  const [pendingInsert, setPendingInsert] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // 拖动 ghost 虚线框:常驻 DOM 直改 style(零 setState,同吸附参考线);入参归一 box
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const setGhostRect = useCallback((g: { x: number; y: number; w: number; h: number } | null) => {
    const el = ghostRef.current;
    if (!el) return;
    const sr = stageBoxRef.current?.getBoundingClientRect();
    if (!g || !sr) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.style.left = `${g.x * sr.width}px`;
    el.style.top = `${g.y * sr.height}px`;
    el.style.width = `${g.w * sr.width}px`;
    el.style.height = `${g.h * sr.height}px`;
  }, []);
  // 父层手柄拖动期间的全屏护罩光标(护罩见 stage 渲染处):按拖动类型给对应 resize 光标
  const dragCursorRef = useRef('default');
  const [bgOpen, setBgOpen] = useState(false); // 浮动条上的背景色弹出盘
  // custom 块内点中的图片 slot(预览桥上报序号+归一矩形):贴着图片位置出图片专属工具条。
  // 只在 blockId === 当前选中块时渲染,选中一走即自然失效,不用追着每条选中路径清
  const [imgSel, setImgSel] = useState<{ blockId: string; index: number; rect: { x: number; y: number; w: number; h: number } } | null>(null);
  // 素材块 loading 两阶段:upload=文件上传中;swap=已落库,等重建+CDN 图装载完成的缓冲切换
  // (插入/换图后画面数秒不变的已知窗口,给个「加载中」而不是死寂)。徽标复用「生成中」样式
  const [mediaBusy, setMediaBusy] = useState<Record<string, 'upload' | 'swap'>>({});
  const setMediaBusyPhase = useCallback((id: string, phase: 'upload' | 'swap' | null) => {
    setMediaBusy((m) => {
      const next = { ...m };
      if (phase) next[id] = phase;
      else delete next[id];
      return next;
    });
    // swap 阶段 20s 兜底:切换若一直不来(离线/装载失败),徽标不能永挂
    if (phase === 'swap') {
      setTimeout(() => setMediaBusy((m) => (m[id] === 'swap' ? Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)) : m)), 20000);
    }
  }, []);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const stageBoxRef = useRef<HTMLDivElement | null>(null); // 舞台画布层(boxW×boxH):旋转手柄算组件中心用
  const rotateOverlayRef = useRef<HTMLDivElement | null>(null); // 选中框根:旋转拖动期间直改它 transform(手柄跟手,零重渲)
  const rotateLabelRef = useRef<HTMLSpanElement | null>(null); // 旋转手柄旁的角度数字:拖动期间直改 textContent
  const [tSec, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  // 调试仪表组(分析/人脸/源码)只对管理员开放:普通用户不渲染入口
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { role?: string } | null) => setIsAdmin(b?.role === 'admin'))
      .catch(() => {});
  }, []);
  // 右侧面板分类(竖排 toolbar 选):对话 / 图片 / 视频 / 组件 / 上传 / 花字 / frame(code=选中组件的源码下钻态)
  const [codeBlockId, setCodeBlockId] = useState<string | null>(null); // 源码编辑器看的是哪个块
  const [codeLoop, setCodeLoop] = useState(false); // 源码编辑器「循环预览」开关
  const [panelW, setPanelW] = useState(342); // 右侧面板宽度(所有面板统一,左缘拖调,320–760)
  const loopRangeRef = useRef<{ start: number; end: number } | null>(null); // 循环窗(成片时间);clock 上报越界即跳回
  const codeOrigRef = useRef<{ id: string; templateId: string; slots: Block['slots'] } | null>(null); // 打开源码时的基线;关闭未应用则还原
  const codeDraftRef = useRef<SourceDraft | null>(null); // 最后一次投舞台的未提交草稿(还原前确认当前内容仍是它,别覆盖 chat 等旁路改动)
  // 生成锁(genIds/markGenerating/genLockToast)—— 见 use-generation-lock.ts
  const { genIds, genIdsRef, markGenerating, genLockToast } = useGenerationLock();
  const [visual, setVisual] = useState<VisualTimeline | null>(null);
  const [plan, setPlan] = useState<DraftPlan | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  // 草稿恢复:打开时读一次(之后的自动保存会覆盖 storage,但 offer 拿的是快照)
  const [draftOffer, setDraftOffer] = useState<StudioDraft | null>(() => (typeof window === 'undefined' ? null : loadDraft(projectId)));
  const pendingRestoreRef = useRef<StudioDraft | null>(null); // 已恢复块、等着接回原视频
  const [chatEpoch, setChatEpoch] = useState(0); // 采纳云端会话后 +1,remount StudioChat 重读本地缓存
  const [chatRev, setChatRev] = useState(0); // 会话线程落盘计数:触发同步上云
  const bumpChatRev = useCallback(() => setChatRev((v) => v + 1), []); // 稳定引用(StudioChat 是 memo)
  const conflictWarnedRef = useRef(false);
  const [busyImport, setBusyImport] = useState(false);
  const [asrSentences, setAsrSentences] = useState<AsrSegment[] | null>(null);
  /** 插入源的转写(键=shot.src,句子时间=该源文件自己的时间轴)。开字幕/开智能剪面板时全源转写。 */
  const [clipAsr, setClipAsr] = useState<Record<string, AsrSegment[]>>({});
  const [filmstrip, setFilmstrip] = useState<FilmstripFrame[]>([]);
  const [pps, setPps] = useState(DEFAULT_PPS); // 时间轴缩放(px/秒),走带滑块控制
  const [locateSignal, setLocateSignal] = useState(0); // 自增 = 时间轴滚动定位到播放头(点时间读数)
  const [capTransBusy, setCapTransBusy] = useState(false); // 双语翻译进行中(字幕面板)
  const [libTab, setLibTab] = useState<'assets' | 'frames'>('assets'); // 素材栏 tab(素材/主题)
  const [libCollapsed, setLibCollapsed] = useState(false); // 素材栏收起(窄条+展开钮;内容 hidden 保状态)
  // 对话区(左侧)开合:对话可关腾画面;预览区右上角「对话」按钮只在对话不可见时出现
  // agent 视图默认收起:对话主体在外部 agent(Codex)那边,右侧内置对话只占画面
  const [panelOpen, setPanelOpen] = useState(!agentView);
  // 工具面板(生成/智能剪口播/人像/取景/源码/动效/转场):**停靠进素材栏列全区**
  // (用户定的:不是新增 tab,是整列占用;素材栏收着就先展开,因面板而展开的关完收回)。
  // **单实例**——开另一个直接替换当前的(setFloatWin 统一走离场结算)。
  const [floatWin, setFloatWinRaw] = useState<FloatKind | null>(null);
  const floatWinRef = useRef<FloatKind | null>(null);
  const [genType, setGenType] = useState<GenType>('image'); // 生成面板内的当前 tab
  const [genRefreshTick, setGenRefreshTick] = useState(0);
  /** 素材栏是"为了停靠面板才自动展开"的——面板关掉后要收回去(用户自己展开的不动)。 */
  const libAutoExpandedRef = useRef(false);
  const [area, setArea] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [showGeom, setShowGeom] = useState(false); // 调试:预览上叠人脸/安全区几何,核对算法
  const [liveGeom, setLiveGeom] = useState<SafeZone | null>(null); // 实时单帧检测(拖到哪测哪帧)

  const duration = totalDuration(comp);
  const hasContent = !!comp.video || comp.blocks.length > 0; // 空画布(无视频无块)不算可播
  // 预览框:保持画布比例,尽量占满父容器(实测父尺寸 → 等比缩放)
  const fit =
    area.w > 0 && area.h > 0
      ? Math.min(area.w / comp.width, area.h / comp.height)
      : PREVIEW_FALLBACK_W / comp.width;
  const fitRef = useRef(fit); // 消息处理器(挂一次)里换算 comp px → 舞台 px 用
  fitRef.current = fit;
  /** 浮动操作条定位 —— 唯一真源,拖动跟随(直改 DOM)与 React 渲染共用,两边数值恒等才不会跳。
   *  纯跟随不钳制(贴边停靠感已否);不被截断靠结构保证:toolbar 挂在舞台裁剪层外面。 */
  const toolbarXY = useCallback((box?: { x: number; y: number; w: number; h: number } | null) => {
    const W = compRef.current.width * fitRef.current;
    const H = compRef.current.height * fitRef.current;
    return { left: box ? (box.x + box.w / 2) * W : W / 2, top: box ? box.y * H - 40 : 8 };
  }, []);
  const boxW = Math.round(comp.width * fit);
  const boxH = Math.round(comp.height * fit);
  // 调试叠加:播放头所在画面段的几何(人脸/安全区),归一坐标直接 % 叠到预览(=整画布缩放)
  const geomSeg =
    showGeom && visual
      ? visual.segments.find((s) => tSec >= s.start - 0.01 && tSec < s.end + 0.01) ?? visual.segments.at(-1) ?? null
      : null;
  // 叠加用的几何:优先**实时单帧**(拖到哪测哪帧,准),没有则退**段聚合**
  const dbgGeom = showGeom ? liveGeom ?? geomSeg?.geom ?? null : null;
  // 预览文档**不烧 fitScale**(autofit 经 hf:fit 消息实时套用):否则每次实测回写都改文档 →
  // 重建 → 重载 → 再实测,测量在边界摆动时变成「隔几秒闪一次」的死循环。导出仍用完整 comp。
  //
  // 预览里的素材图**只喂 1280 缩略图直链**,不下几 MB 原图:大照片(手机原图)在 srcdoc 里
  // 下原图会 pending 半天,且每次结构性重建都重下一遍全部素材图 → 一堆 pending;缩略图秒开。
  // 导出仍走完整 comp 的原图(previewCompOf 只作用于预览文档)。视频不动(边下边播,不卡)。
  const previewCompOf = (c: Composition): Composition => ({
    ...c,
    blocks: c.blocks.map((b) => {
      const m = b.slots?.media as MediaRef | undefined;
      const previewUrl = m?.type === 'image' && m.url ? imageThumb(m.url, 'canvas') : null;
      if (!previewUrl && b.fitScale === undefined) return b;
      return {
        ...b,
        ...(b.fitScale !== undefined ? { fitScale: undefined } : {}),
        ...(previewUrl ? { slots: { ...b.slots, media: { ...m, url: previewUrl } } } : {}),
      };
    }),
  });
  // 调试面板的 assembled HTML 只在面板打开时构建(拖拽等高频 setComp 期间别每帧拼字符串)
  const assembled = useMemo(() => (showCode ? assembleHtml(previewCompOf(comp)) : ''), [comp, showCode]);

  // 测试口子:口播稿 + 画面分析的可读快照(也挂到 window.__studio 供 devtools 看)
  const debugText = useMemo(() => {
    const out: string[] = [`# 口播稿（${asrSentences?.length ?? 0} 句）`];
    (asrSentences ?? []).forEach((s, i) => out.push(`${i}. [${s.start.toFixed(1)}–${s.end.toFixed(1)}] ${s.text}`));
    out.push('', `# 画面分析（${visual?.segments.length ?? 0} 段 · 源切点 ${visual?.cuts.length ?? 0}）`);
    out.push(`几何遍(MediaPipe):${geomNote()}`);
    if (visual) out.push(`几何遍: ${visual.geomNote ?? '—'}`);
    const pct = (n: number) => Math.round(n * 100);
    const fmtRect = (r: { x: number; y: number; w: number; h: number }) => `(${pct(r.x)},${pct(r.y)} ${pct(r.w)}×${pct(r.h)})`;
    (visual?.segments ?? []).forEach((sg) => {
      out.push(
        `[${sg.start.toFixed(1)}–${sg.end.toFixed(1)}] ${sg.label.content} · 人:${sg.label.person} · 粗安全:${sg.label.safe} · ${sg.label.hasText ? '有烧字' : '无烧字'}${sg.label.desc ? ` · ${sg.label.desc}` : ''}`,
      );
      if (sg.geom) {
        out.push(
          `      安全区%: ${sg.geom.rects.map(fmtRect).join(' ') || '(无)'}` +
            `${sg.geom.face ? ` · 脸${fmtRect(sg.geom.face)}` : ''}${sg.geom.subject ? ` · 主体${fmtRect(sg.geom.subject)}` : ''}`,
        );
      }
    });
    if (plan?.scenes.length) {
      out.push('', `# 场景（${plan.scenes.length} 个）`);
      plan.scenes.forEach((s) => {
        const g = s.graphic ? ` · ${s.graphic.component}:${s.graphic.data ?? s.graphic.brief}` : '';
        const e = s.emphasis?.length ? ` · 强调:${s.emphasis.join(' ')}` : '';
        out.push(`[${s.from}-${s.to}] ${s.framing}${g}${e}`);
      });
    }
    return out.join('\n');
  }, [asrSentences, visual, plan]);
  useEffect(() => {
    (window as unknown as { __studio?: unknown }).__studio = { asr: asrSentences, visual, plan };
  }, [asrSentences, visual, plan]);
  // 预览双缓冲:comp 变更后新文档在**后台 iframe** 加载(注视频/seek/恢复选中)完毕才原子切换,
  // 旧画面显示到最后一刻 —— 消灭整页重载的白屏闪(配图连环完成时尤其明显)。
  const [bufs, setBufs] = useState<{ docs: [string, string]; active: 0 | 1 }>(() => ({
    docs: [injectPreviewRuntime(assembleHtml(starter)), ''],
    active: 0,
  }));
  const bufsRef = useRef(bufs);
  bufsRef.current = bufs;
  const iframesRef = useRef<(HTMLIFrameElement | null)[]>([null, null]);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const tRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const selectedShotIdRef = useRef<string | null>(null);
  selectedShotIdRef.current = selectedShotId;
  const playingRef = useRef(false);
  playingRef.current = playing;
  // 流水线工具异步执行时读/写最新状态(setState 异步,工具内连跑多步要靠 ref 取最新)
  const videoFileRef = useRef<File | null>(null);
  videoFileRef.current = videoFile;
  const asrRef = useRef<AsrSegment[] | null>(null);
  asrRef.current = asrSentences;
  const clipAsrRef = useRef<Record<string, AsrSegment[]>>({});
  clipAsrRef.current = clipAsr;
  const planRef = useRef<DraftPlan | null>(null);
  planRef.current = plan;
  const visualRef = useRef<VisualTimeline | null>(null);
  visualRef.current = visual;
  // BYO 画面分析(visual_brief/submit_visual):brief 备好的中间态等 agent 回标签
  const visualBriefRef = useRef<VisualPrep | null>(null);
  /** 画面分析结果落地(BYO 提交与缓存命中共用;与 stepVisual 的收尾同口径)。 */
  const applyVisualResult = (vis: VisualTimeline) => {
    visualRef.current = vis;
    setVisual(vis);
    // 底色派生调色板挂 composition;挂了 frame 时不覆盖(frame 是用户显式选的设计系统)
    if (vis.palette) setComp((c) => (c.frameId ? c : { ...c, palette: vis.palette }));
  };
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null); // 当前 blob: 预览 URL,换片/卸载时回收
  // 人像抠像:开关开启时全量预算的 mask 轨(源时间索引、webp 压缩存内存;换视频即失效)
  // 父层视频轨引擎(canvas 渲染模式):解码/时钟/音频常驻,帧推给 iframe 画布
  const videoEngineRef = useRef<VideoTrackEngine | null>(null);
  useEffect(() => {
    const eng = new VideoTrackEngine();
    videoEngineRef.current = eng;
    eng.onFrame = (frame, info, frame2) => {
      // 只推活跃缓冲(ImageBitmap 转移一次);后台缓冲亮相时由 bufs.active 效果 refresh 补帧
      // frame2 = 转场窗口内"另一侧"的影子帧(真双流:切点前=B 前摇,切点后=A 尾巴)
      const w = iframesRef.current[bufsRef.current.active]?.contentWindow;
      try {
        w?.postMessage(
          { type: 'hf:frame', frame, ...(frame2 ? { frame2 } : {}), t: info.t, elKey: info.elKey, srcT: info.srcT },
          '*',
          frame2 ? [frame, frame2] : [frame],
        );
      } catch {
        try {
          frame.close();
          frame2?.close();
        } catch {
          /* ignore */
        }
      }
    };
    eng.onTick = (t) => {
      if (!playingRef.current) return;
      tRef.current = t;
      playhead.set(t);
      postPreview({ type: 'hf:seekTimelines', t }); // 叠加层(GSAP/字幕)每帧对齐
    };
    // 转场预烧录 provider:切点 → 已解码帧组(bakesRef 由下方 effect 维护)
    eng.bakeProvider = (cut) => {
      for (const e of bakesRef.current.values()) {
        if (Math.abs(e.cut - cut) < 0.05 && e.bitmaps && e.baked) return { fps: e.baked.fps, half: e.half, frames: e.bitmaps };
      }
      return null;
    };
    eng.onEnded = () => {
      const D = eng.durationSec || totalDuration(compRef.current);
      tRef.current = D;
      playhead.set(D);
      setT(D);
      setPlaying(false);
    };
    return () => {
      eng.dispose();
      videoEngineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mask 轨按**源**分储(多源主轨:每个源文件一条,键='main' | shot.src):抠像哪段的源就抠哪个文件
  const matteTrackRef = useRef<Map<string, MatteFrame[]>>(new Map());
  const matteAbortRef = useRef<AbortController | null>(null);
  const [matteState, setMatteState] = useState<MatteState>({ status: 'idle', done: 0, total: 0 });
  const chatRef = useRef<StudioChatHandle | null>(null); // 给 chat 推"一键成片"四步进度
  // 导出(状态 + 提交/轮询/取消)—— 见 use-export.ts
  /** 本地插入段的 File(键=blob URL,分割两半共享同一 src 所以天然共享):与主视频同款
   *  "留在本地不上传"模式,预览经 hf:clipFile 注入、客户端导出直接取。刷新后 blob 失效,
   *  由 OPFS 本地库按 srcSig 复活(见草稿恢复)。 */
  const clipFilesRef = useRef<Map<string, File>>(new Map());
  /** 主视频的**生效 sig**:通常=fileSig(videoFile),云端取回时=原 sig(取回的 File
   *  名字/mtime 变了,fileSig 会漂——同步层/缓存 key 一律读这里,别直接算)。 */
  const videoSigRef = useRef<string | null>(null);
  /** 云端字节索引(context.media 的内存态):sig→R2 key。备份成功落这里,随下次云同步带上。 */
  const cloudMediaRef = useRef<{ video?: { sig: string; key: string }; clips?: Record<string, { key: string }> }>({});
  const [cloudMediaRev, setCloudMediaRev] = useState(0);
  /** 静默备份一个源视频到 R2(内容寻址,重复=秒传);成功记索引并触发一次云同步。 */
  const backupMediaToCloud = (file: File, sig: string, kind: 'video' | 'clip') => {
    void studioProviders().vault.backup(file, sig).then((r) => {
      if (!r) return; // 静默降级:本地照常,下次打开重试(幂等)
      if (kind === 'video') cloudMediaRef.current = { ...cloudMediaRef.current, video: { sig, key: r.key } };
      else cloudMediaRef.current = { ...cloudMediaRef.current, clips: { ...cloudMediaRef.current.clips, [sig]: { key: r.key } } };
      setCloudMediaRev((v) => v + 1);
    });
  };
  const { exporting, publishing, exportPct, exportVideo, cancelExport, resetExport } = useStudioExport({ compRef, videoFileRef, clipFilesRef });
  // agent 导出任务(export_video/track_export):合成+浏览器下载由 exportVideo 跑,这里只记任务态;
  // exportPct 镜像进 ref 给 runStudioTool 里的进度查询读(switch 闭包不吃 state)
  const agentExportRef = useRef<{ running: boolean; filename: string | null; error: string | null }>({ running: false, filename: null, error: null });
  const exportPctRef = useRef(0);
  exportPctRef.current = exportPct;
  // 导出弹窗:选项常驻(本次会话内记住上次的选择),确认才开跑
  const [exportOpen, setExportOpen] = useState(false);
  const [exportOpts, setExportOpts] = useState<ExportRenderOpts>(DEFAULT_RENDER_OPTS);

  // 引擎源同步:主视频 File 一变就换源(常驻元素只换 src,解码会话不随文档重建生灭)
  useEffect(() => {
    videoEngineRef.current?.setSource('main', videoFile ?? null);
    if (videoFile) videoEngineRef.current?.seek(tRef.current);
  }, [videoFile]);
  // 引擎段表 + 其它源:shots 一变(分割/裁剪/插入/删除)整表重喂;暂停态补推当前帧
  useEffect(() => {
    const eng = videoEngineRef.current;
    if (!eng) return;
    const shots = comp.video ? (comp.shots?.length ? comp.shots : [{ id: 'all', src: undefined, srcStart: 0, srcEnd: comp.video.durationSec, treatment: 'full' as const }]) : [];
    for (const s of shots) {
      if (!s.src) continue;
      const f = clipFilesRef.current.get(s.src);
      eng.setSource(s.src, f ?? (s.src.startsWith('blob:') ? null : s.src));
    }
    eng.setSegments(shots.map((s) => ({ key: s.src ?? 'main', elKey: s.src ? `clip_${s.id}` : 'main', srcStart: s.srcStart, srcEnd: s.srcEnd })));
    eng.setTransitions(cutTransitions(comp.shots ?? []).map((tr) => ({ cut: tr.cut, half: tr.half }))); // 影子解码的窗口表
    if (!playingRef.current) eng.refresh();
  }, [comp.video, comp.shots]);
  /** 转场预烧录缓存(Premiere「预渲染预览」同思路):后台烧成 webp 帧序列,临近窗口才解码
   *  成位图、路过即弃;签名含切点/时长/效果/方向/两侧源时间与文件指纹——任何相关编辑自动失效。
   *  烧录期间/烧不了(文件不在)播放自动落回影子解码路径。 */
  const bakesRef = useRef<Map<string, { sig: string; cut: number; half: number; baked: BakedWindow | null; bitmaps: ImageBitmap[] | null; decoding?: boolean }>>(new Map());
  const bakeGenRef = useRef(0);
  useEffect(() => {
    const gen = ++bakeGenRef.current;
    const c = comp;
    if (!c.video || !videoFile) return;
    const spans = clipSpans(ensureShots(c));
    const specs: (BakeSpec & { sig: string })[] = [];
    for (const tr of cutTransitions(c.shots ?? [])) {
      const iB = spans.findIndex((sp, i) => i >= 1 && Math.abs(sp.editedStart - tr.cut) < 0.05);
      if (iB < 1) continue;
      const A = spans[iB - 1]!.clip;
      const B = spans[iB]!.clip;
      const fileA = A.src ? clipFilesRef.current.get(A.src) : videoFile;
      const fileB = B.src ? clipFilesRef.current.get(B.src) : videoFile;
      if (!fileA || !fileB) continue;
      const sig = [tr.cut.toFixed(2), tr.half.toFixed(2), tr.effect, tr.dir, A.srcEnd.toFixed(3), B.srcStart.toFixed(3), fileSig(fileA), fileSig(fileB), c.width, c.height].join('|');
      specs.push({ sig, cut: tr.cut, half: tr.half, effect: tr.effect, dir: tr.dir, fileA, aEnd: A.srcEnd, fileB, bStart: B.srcStart, compW: c.width, compH: c.height });
    }
    const want = new Set(specs.map((sp) => sp.sig));
    for (const [sig, e] of bakesRef.current) {
      if (!want.has(sig)) {
        e.bitmaps?.forEach((b) => b.close());
        bakesRef.current.delete(sig);
      }
    }
    // 编辑停当 600ms 才开工;逐个串行烧(换代 gen 立即让路),不抢编辑期主线程
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const sp of specs) {
          if (bakeGenRef.current !== gen) return;
          if (bakesRef.current.get(sp.sig)?.baked) continue;
          const entry = { sig: sp.sig, cut: sp.cut, half: sp.half, baked: null as BakedWindow | null, bitmaps: null as ImageBitmap[] | null };
          bakesRef.current.set(sp.sig, entry);
          const baked = await bakeTransitionWindow(sp, () => bakeGenRef.current !== gen);
          if (bakeGenRef.current !== gen) return;
          if (baked && bakesRef.current.get(sp.sig) === entry) entry.baked = baked;
          else if (bakesRef.current.get(sp.sig) === entry) bakesRef.current.delete(sp.sig);
        }
      })();
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.shots, comp.video, videoFile, comp.width, comp.height]);
  // 临近解码 / 路过释放(播放头驱动,provider 同步读;解码 0.5× 位图,1s 转场 ≈ 60MB 瞬态)
  useEffect(() => {
    const tick = () => {
      const t = playhead.get();
      for (const e of bakesRef.current.values()) {
        if (!e.baked) continue;
        const near = t >= e.cut - e.half - 1.5 && t <= e.cut + e.half + 0.5;
        if (near && !e.bitmaps && !e.decoding) {
          e.decoding = true;
          void decodeBake(e.baked).then((bs) => {
            e.decoding = false;
            if (bakesRef.current.get(e.sig) === e && e.baked) e.bitmaps = bs;
            else bs.forEach((b) => b.close());
          });
        } else if (e.bitmaps && (t < e.cut - e.half - 3 || t > e.cut + e.half + 3)) {
          e.bitmaps.forEach((b) => b.close());
          e.bitmaps = null;
        }
      }
    };
    const unsub = playhead.subscribe(tick);
    return () => unsub();
  }, []);
  const filmstripGenRef = useRef(0); // 换片代数:旧片抽帧回调作废(extractFilmstrip 无 abort)
  const filmstripRef = useRef<FilmstripFrame[]>([]); // 镜像 filmstrip,卸载时回收帧 blob URL
  filmstripRef.current = filmstrip;
  // 预览里按住块身拖动:拖起时快照 box 基线,boxDrag 的 dx/dy(comp px)都相对基线换算
  const boxDragRef = useRef<{ id: string; box: { x: number; y: number; w: number; h: number } } | null>(null);
  const undoStackRef = useRef<Composition[]>([]); // chat 工具改动前的快照栈(undo 工具用;不覆盖手动拖拽)
  const redoStackRef = useRef<Composition[]>([]); // 撤销掉的状态;任何新编辑(pushUndoSnapshot)作废整条重做线

  // 卸载时回收 blob URL(原片 + 全部缩率帧)
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    filmstripRef.current.forEach((f) => URL.revokeObjectURL(f.url));
  }, []);

  // 预览控制:sandbox iframe(opaque origin)拿不到 contentWindow.__hfPreview,全走 postMessage 命令(发给当前活跃缓冲)
  const postPreview = useCallback((msg: Record<string, unknown>) => {
    try {
      iframesRef.current[bufsRef.current.active]?.contentWindow?.postMessage(msg, '*');
    } catch {
      /* iframe not ready */
    }
  }, []);
  const applyT = useCallback(
    (v: number) => {
      tRef.current = v;
      playhead.set(v);
      setT(v);
      postPreview({ type: 'hf:seek', t: v }); // 叠加层/画中画定位(视频帧归引擎)
      videoEngineRef.current?.seek(v);
    },
    [postPreview],
  );

  // 实测预览区可用尺寸 → 等比缩放占满(随窗口/面板变化)
  useEffect(() => {
    const el = previewAreaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setArea({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // composition 改 → 防抖重组,写进**后台缓冲**(加载完成后 onBufLoad 原子切换)。
  // 重组(assembleHtml 全量字符串拼装)放在防抖回调里:box 拖拽/就地改字这类每帧 setComp
  // 的操作,拖动期间零构建成本,松手 300ms 后才拼一次。
  // **花字纯位置(xPct/yPct)变更跳过重建**:hf:capStyle 已把 left/bottom 直改进活跃文档
  // (与重烤值恒等),重建只会白白重载视频。字号(scale)/框宽(wPct)/预设不能跳——
  // 拆段口径由框宽÷字号实时推,必须重建重新分段(即时通道先给手感,300ms 防抖后一次无缝换入)。
  const lastBuiltCompRef = useRef<Composition | null>(null);
  // 量宽字体就绪:父文档加载与预览文档**同一份**设计字体——字幕拆段的 canvas measureText
  // 在父文档量,父文档没这字体会退到系统字体,西文宽度和 iframe 真实渲染对不上(踩过:
  // 英文段量窄了溢出换行)。canvas 设 font 不触发字体下载,必须显式 fonts.load;就绪后
  // tick 一次强制重建(首次拆段可能是回退字体量的,要用真字体重算)。
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!document.querySelector('link[data-studio-fonts]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = STUDIO_FONTS_HREF;
      l.setAttribute('data-studio-fonts', '1');
      document.head.appendChild(l);
    }
    let alive = true;
    void Promise.all([
      document.fonts.load("700 40px 'Noto Sans SC'"),
      document.fonts.load("700 40px 'Noto Serif SC'"),
      document.fonts.load("600 40px 'IBM Plex Mono'"),
    ])
      .then(() => {
        if (alive) setFontsTick((t) => t + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const builtFontsTickRef = useRef(0);
  useEffect(() => {
    // captionStyle-only 提交(ghost 松手/A±)= 离散动作:**零防抖立即重建**(松手就该看到结果,
    // 用户定的;A± 连点的合并在 stepScale 自己做,不在这儿);300ms 长防抖只给 box 拖拽这类
    // 逐帧 setComp 流。字体就绪 tick = 结构性变更(重新量宽拆段),不走跳过。
    const fontsChanged = builtFontsTickRef.current !== fontsTick;
    const capOnly = sameExceptCapStyle(lastBuiltCompRef.current, comp);
    const framingOnly = shotFramingOnlyChange(lastBuiltCompRef.current, comp);
    const patchable = blockPatchableChange(lastBuiltCompRef.current, comp);
    const id = setTimeout(() => {
      builtFontsTickRef.current = fontsTick;
      if (!fontsChanged && themeMountOnlyChange(lastBuiltCompRef.current, comp)) {
        lastBuiltCompRef.current = comp;
        return;
      }
      if (!fontsChanged && capPosOnlyChange(lastBuiltCompRef.current, comp)) {
        lastBuiltCompRef.current = comp;
        return;
      }
      // 块级就地补丁通道:几何(拖移/缩放/旋转)/时间窗(时间轴拖块裁剪)/表观(bg/边框/圆角/
      // 透明度)/就地改字回显/纯删除 —— 终值一次打进活跃文档,跳过整文档重建
      // (重建=双缓冲切换=视频重载,"改一下闪一次"的来源)。切换待决时让路走重建(见 ref 注释)
      if (!fontsChanged && patchable && !pendingSwitchRef.current) {
        const echo = iframeEditEchoRef.current;
        // slots 变更必须全部是 iframe 就地改字的回显(活跃文档已是最新);别的来源(agent/
        // 面板/换图)改 slots,活跃文档是旧的,必须重建
        if (patchable.pairs.every((p) => !p.slots || echo.has(p.b.id))) {
          for (const p of patchable.pairs) {
            if (p.slots) echo.delete(p.b.id);
            if (p.geom) {
              const box = p.b.box!;
              const cb = p.b.contentBox ?? box;
              postPreview({
                type: 'hf:boxSize',
                blockId: p.b.id,
                x: box.x,
                y: box.y,
                w: box.w,
                h: box.h,
                cx: (cb.x - box.x) / box.w,
                cy: (cb.y - box.y) / box.h,
                cw: cb.w / box.w,
                ch: cb.h / box.h,
                s: p.b.scale ?? 1,
              });
              if (!Object.is(p.a.rotation, p.b.rotation)) postPreview({ type: 'hf:rotate', blockId: p.b.id, deg: p.b.rotation ?? 0 });
            }
            if (p.timing) postPreview({ type: 'hf:blockTiming', blockId: p.b.id, start: p.b.startSec, duration: p.b.durationSec });
            if (p.style) {
              const nb = p.b;
              const inner = String((nb.slots as { innerHtml?: unknown }).innerHtml ?? '');
              postPreview({
                type: 'hf:blockStyle',
                blockId: nb.id,
                bgCss: nb.bg ? blockBgCss(nb.bg, customHasSurface(nb.templateId, inner)) : '',
                border: nb.border ? `3px solid ${nb.border}` : null,
                // 圆角口径与 assemble 恒等:显式值优先,有底板/边框时给默认圆角
                radius: typeof nb.radius === 'number' && nb.radius > 0 ? `${nb.radius}px` : (nb.bg || nb.border) && nb.box ? 'var(--radius,24px)' : null,
                opacity: typeof nb.opacity === 'number' && nb.opacity < 0.995 ? Math.max(0.05, nb.opacity) : null,
              });
            }
          }
          for (const r of patchable.removed) postPreview({ type: 'hf:remove', id: r.id });
          if (patchable.pairs.some((p) => p.geom || p.style)) postPreview({ type: 'hf:measureFit' });
          lastBuiltCompRef.current = comp;
          return;
        }
      }
      if (!fontsChanged && framingOnly) {
        // 只有取景(treatment/treatSize)变:不重建文档(重建=视频画布空一帧,快速切卡会闪),
        // 就地换 vid 时间轴(与重建烤出的体完全同源),即时值已由 hf:shotVars 打上
        postPreview({ type: 'hf:vidTimeline', body: videoFrameTimelineBody(comp.shots ?? []) });
        lastBuiltCompRef.current = comp;
        return;
      }
      lastBuiltCompRef.current = comp;
      const doc = injectPreviewRuntime(assembleHtml(previewCompOf(comp)));
      if (doc !== bufsRef.current.docs[bufsRef.current.active]) {
        pendingSwitchRef.current = true; // 切换待决:补丁通道让路
        setRebuilding(true);
      }
      setBufs((s) => {
        if (s.docs[s.active] === doc) return s; // 与在显文档一致:不折腾
        const back = s.active === 0 ? 1 : 0;
        const docs = [...s.docs] as [string, string];
        docs[back] = doc;
        return { docs, active: s.active };
      });
    }, fontsChanged || capOnly || framingOnly || patchable ? 0 : 300);
    return () => clearTimeout(id);
  }, [comp, fontsTick]);

  // 待切换的后台缓冲:ping/pong 握手态。load 事件不可信 —— 清空旧缓冲(srcdoc='')的空载
  // 会迟到、字体阻塞会让半载文档先触发 load,曾把画面切给一个"聋文档":播放命令全部
  // 石沉大海(实录:缩放后连环双切换,play 发向 active 无任何时钟应答)。
  // 现在切换必须拿到目标文档运行时的活体应答(pong)才执行;聋文档最多让画面停留旧一代,
  // 并在 console 连环报警,绝不会吞掉播放。
  const switchPingRef = useRef<{ idx: 0 | 1; doc: string; nonce: string; timer: ReturnType<typeof setTimeout> | null; tries: number } | null>(null);
  const startSwitchPing = useCallback((idx: 0 | 1, doc: string) => {
    const prev = switchPingRef.current;
    if (prev?.timer) clearTimeout(prev.timer);
    const st = {
      idx,
      doc,
      nonce: `switch-${idx}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timer: null as ReturnType<typeof setTimeout> | null,
      tries: 0,
    };
    switchPingRef.current = st;
    const ping = () => {
      if (switchPingRef.current !== st) return;
      if (bufsRef.current.docs[idx] !== doc || bufsRef.current.active === idx) {
        switchPingRef.current = null; // 文档被更新一代替换 / 已是活跃缓冲:本次握手作废
        return;
      }
      st.tries++;
      if (st.tries > 1) console.warn('[studio] 后台缓冲未应答,重试 ping', { idx, tries: st.tries });
      try {
        iframesRef.current[idx]?.contentWindow?.postMessage({ type: 'hf:ping', nonce: st.nonce }, '*');
      } catch {
        /* not ready */
      }
      if (st.tries < 10) st.timer = setTimeout(ping, 1200);
      else {
        console.warn('[studio] 后台缓冲 10 次未应答,放弃切换(停留旧画面,等下一次重建)', { idx });
        switchPingRef.current = null;
        setRebuilding(false);
        setPendingInsert(null);
      }
    };
    ping();
  }, []);

  /** 某个缓冲加载完成:注视频/seek/恢复选中;是后台缓冲则发起 ping 握手(pong 到手才切换)。 */
  const onBufLoad = useCallback(
    (idx: 0 | 1) => {
      if (!bufsRef.current.docs[idx]) return; // 被清空的旧缓冲(srcdoc='')的空载,忽略
      const w = iframesRef.current[idx]?.contentWindow;
      const post = (msg: Record<string, unknown>) => {
        try {
          w?.postMessage(msg, '*');
        } catch {
          /* not ready */
        }
      };
      // canvas 渲染模式:视频帧由父层引擎推(hf:frame),不再向文档注入 File
      post({ type: 'hf:seek', t: tRef.current });
      post({ type: 'hf:selectBlock', blockId: selectedIdRef.current });
      // 强显机制已退役:选中块的可见性由"选中即挪播放头到落定时刻"保证(父层 selectedId
      // effect),装载 seek 到的播放头本身就是可见时刻,无需给新文档重放强显消息
      // fitScale 不在文档里 → 装载后把已知的 autofit 缩放推进去
      const fits: Record<string, number> = {};
      for (const b of compRef.current.blocks) if (b.fitScale && b.fitScale < 0.999) fits[b.id] = b.fitScale;
      if (Object.keys(fits).length) post({ type: 'hf:fit', fits });
      if (idx !== bufsRef.current.active) {
        startSwitchPing(idx, bufsRef.current.docs[idx]);
        return;
      }
      // 活跃缓冲自身的装载(首载/换片):播放中恢复播放
      if (playingRef.current) post({ type: 'hf:play', t: tRef.current });
    },
    [startSwitchPing],
  );

  // 预览内编辑桥:把某块某 slot 写回(支持 items.N 数组路径)。
  // custom 块(LLM 生成的组件)没有语义 slot —— key 是 innerHtml 里 [data-edit=key] 的文本,
  // 用 DOMParser 打补丁写回:双击就地改字零 token、即时生效,不用重新生成。
  const setSlot = useCallback(
    (blockId: string, key: string, value: string) => {
      if (genIdsRef.current.has(blockId)) {
        toast.info(t('组件正在生成，改动会被生成结果覆盖——等生成完成再改'));
        return;
      }
      setComp((c) => ({
        ...c,
        blocks: c.blocks.map((b) => {
          if (b.id !== blockId) return b;
          if (b.templateId === 'custom') {
            const inner = String((b.slots as { innerHtml?: unknown }).innerHtml ?? '');
            try {
              const doc = new DOMParser().parseFromString(`<div id="__hfw">${inner}</div>`, 'text/html');
              const host = doc.getElementById('__hfw');
              const target = host?.querySelector(`[data-edit="${CSS.escape(key)}"]`);
              if (!host || !target) return b;
              // 无实际变更 = 彻底 no-op:进入编辑态又原样退出不能触发重建/缓冲切换。
              // 注意不能拿 host.innerHTML 和原文比 —— DOMParser 序列化会归一属性/实体,
              // 没改字也会产生字符串差异;比语义(textContent)才准。
              if ((target.textContent ?? '') === value) return b;
              target.textContent = value;
              return { ...b, slots: { ...b.slots, innerHtml: host.innerHTML } };
            } catch {
              return b;
            }
          }
          if (key.includes('.')) {
            const [k, idxStr] = key.split('.');
            const idx = Number(idxStr);
            const arr = Array.isArray(b.slots[k!]) ? [...(b.slots[k!] as unknown[])] : [];
            if (arr[idx] === value) return b; // 无变更 no-op
            arr[idx] = value;
            return { ...b, slots: { ...b.slots, [k!]: arr } };
          }
          if (b.slots[key] === value) return b; // 无变更 no-op
          return { ...b, slots: { ...b.slots, [key]: value } };
        }),
      }));
    },
    [setComp, genIdsRef],
  );

  // 草稿自动保存(防抖 1s;空画布不写)
  // 首帧缩略(项目列表卡片封面):**直接从视频文件抓帧**——缩率轴瓦片只有 96px 宽,
  // 从它放大到多少都是糊的(用户反馈过)。960 宽 jpeg,retina 卡片(~440 CSS px)够锐。
  const coverThumbRef = useRef<string | null>(null);
  useEffect(() => {
    if (!videoFile) return;
    let alive = true;
    const url = URL.createObjectURL(videoFile);
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = url;
    void (async () => {
      try {
        await new Promise<void>((res, rej) => {
          v.onloadeddata = () => res();
          v.onerror = () => rej(new Error('load failed'));
          setTimeout(() => rej(new Error('load timeout')), 8000);
        });
        v.currentTime = 0.1;
        await new Promise<void>((res) => {
          v.onseeked = () => res();
          setTimeout(res, 1500); // 流式 webm seek 事件不可靠,超时就用当前帧
        });
        if (!v.videoWidth) return;
        const w = 960;
        const h = Math.max(2, Math.round((v.videoHeight / v.videoWidth) * w));
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d')!.drawImage(v, 0, 0, w, h);
        if (alive) {
          coverThumbRef.current = cv.toDataURL('image/jpeg', 0.8);
          // 直接补写进已存草稿:抓帧晚于防抖保存就绪,不补写的话没有下次编辑就一直缺封面
          saveCoverThumb(projectId, coverThumbRef.current);
        }
      } catch {
        /* 封面是增益,抓不到不挡保存 */
      } finally {
        URL.revokeObjectURL(url);
        v.removeAttribute('src');
      }
    })();
    return () => {
      alive = false;
    };
  }, [videoFile, projectId]);
  // 自动保存照跑(纯副作用:防抖写草稿);工具栏不再外显「项目/已存」时间
  useDraftAutosave(comp, videoFile ? (videoSigRef.current ?? fileSig(videoFile)) : null, projectId, coverThumbRef);

  // autofit:预览实测每块溢出 → 写回 Block.fitScale(给导出用),同时 hf:fit 推给活跃缓冲实时套用
  // (fitScale 不在预览文档里,写回不触发重建 —— 见 assembled 注释)
  const applyFits = useCallback(
    (fits: Record<string, number>) => {
      setComp((c) => {
        let changed = false;
        const blocks = c.blocks.map((b) => {
          const k = fits[b.id];
          if (typeof k !== 'number') return b;
          const next = k < 0.999 ? k : undefined; // ≈1 = 不缩(清掉旧值)
          const cur = b.fitScale ?? 1;
          if (Math.abs(cur - (next ?? 1)) < 0.02) return b; // 已稳定,防抖防循环
          changed = true;
          return { ...b, fitScale: next };
        });
        return changed ? { ...c, blocks } : c;
      });
      postPreview({ type: 'hf:fit', fits });
    },
    [setComp, postPreview],
  );

  /* ---------- 组件源码编辑器:舞台即实时预览;「应用」才提交,关闭/切走则还原 ---------- */
  const stopCodeLoop = () => {
    loopRangeRef.current = null;
    setCodeLoop(false);
  };
  /** 结算未提交草稿:还原到基线。仅当块的当前内容仍是我们最后投的草稿(没被 chat 等旁路改过)才动手。 */
  const revertCodeDraft = () => {
    const orig = codeOrigRef.current;
    const last = codeDraftRef.current;
    codeOrigRef.current = null;
    codeDraftRef.current = null;
    if (!orig || !last) return;
    const b = compRef.current.blocks.find((x) => x.id === orig.id);
    const s = b?.slots as { innerHtml?: unknown; timelineBody?: unknown } | undefined;
    if (!b || !s || s.innerHtml !== last.innerHtml || s.timelineBody !== last.timelineBody) return;
    setComp((cc) => ({
      ...cc,
      blocks: cc.blocks.map((x) => (x.id === orig.id ? { ...x, templateId: orig.templateId, slots: orig.slots } : x)),
    }));
  };
  /** 工具面板唯一入口:开/换/关都走这——离开源码先结算草稿,离开生成通知素材库重拉。
   *  停靠语义:面板占素材栏整列——收着就展开;因面板才展开的,关完自动收回。 */
  const setFloatWin = (next: FloatKind | null) => {
    const prev = floatWinRef.current;
    if (prev === next) return;
    if (prev === 'code') {
      revertCodeDraft();
      stopCodeLoop();
    }
    if (prev === 'gen') setGenRefreshTick((n) => n + 1);
    if (next && !prev && libCollapsed) {
      libAutoExpandedRef.current = true;
      setLibCollapsed(false);
    } else if (!next && libAutoExpandedRef.current) {
      libAutoExpandedRef.current = false;
      setLibCollapsed(true);
    }
    floatWinRef.current = next;
    setFloatWinRaw(next);
  };
  // 源码编辑器入口已下掉(2026-07-17 用户定的;改组件走「AI 改」/对话)。面板机制
  // (FloatKind 'code'/ElementSourceEditor/草稿结算)保留,将来要恢复入口:立基线
  // codeOrigRef + setCodeBlockId(id) + setFloatWin('code'),并把播放头定到稳定帧。
  /** 打开右侧对话区(右侧只剩对话;其余面板停靠素材栏)。 */
  const openChat = () => setPanelOpen(true);
  /** 开工具面板(停靠素材栏整列)。anchor 参数保留签名兼容各入口,停靠后不再用于定位;
   *  点外不关窗(停靠面板是常驻区,不是 popover)——开关切换在触发按钮自身。 */
  const openFloatAt = (kind: FloatKind, _anchor?: DOMRect | null) => {
    setFloatWin(kind);
  };
  // 人像面板依赖选中分镜(入口没选中就 disabled):开着时选中态没了 → 直接关掉
  useEffect(() => {
    if (floatWin === 'person' && !selectedShotId) setFloatWin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, selectedShotId]);
  // 取景浮窗不随选中自动打开(点分镜本体=只选中;开窗走分镜 tag/工具栏入口);取消选中时开着就关
  useEffect(() => {
    if (!selectedShotId && floatWin === 'shot') setFloatWin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShotId, floatWin]);
  /** 打开取景设置(分镜 tag / 工具栏入口):选中该分镜 + 开浮窗。 */
  const openShotSettings = (sid: string) => {
    selectShot(sid);
    setFloatWin('shot');
  };
  /** 转场浮窗锚定的切点(成片秒;时间轴边界热区点开)。 */
  const [transitionCut, setTransitionCut] = useState<number | null>(null);
  const openTransitionAt = (cutSec: number, anchor: DOMRect) => {
    setTransitionCut(cutSec);
    setSelectedId(null); // 转场即当前选中对象:Del 删转场,不误伤块/分镜
    setSelectedShotId(null);
    openFloatAt('transition', anchor);
  };
  /** 该切点设/换/删转场(内容级,挂后一镜 transIn、prevId 锚前一镜):一个切点至多一个;
   *  设了把播放头挪到转场区起点看效果。时长沿用已设值,默认 1s;方向仅 push/slide 存。 */
  const setCutTransition = (cutSec: number, effect: CutTransitionEffect | null, direction?: TransitionDirection) => {
    const sp = clipSpans(ensureShots(compRef.current));
    const i = sp.findIndex((s, idx) => idx >= 1 && Math.abs(s.editedStart - cutSec) < 0.05);
    if (i < 1) return;
    const prevId = sp[i - 1]!.clip.id;
    const selfId = sp[i]!.clip.id;
    setComp((c) => ({
      ...c,
      shots: (c.shots ?? []).map((s) => {
        if (s.id !== selfId) return s;
        const { transIn: _drop, ...rest } = s;
        if (!effect) return rest;
        const durationSec = Math.min(MAX_TRANSITION_SEC, s.transIn?.durationSec ?? 1);
        const dir = direction ?? s.transIn?.direction;
        return { ...rest, transIn: { prevId, effect, durationSec, ...(DIRECTIONAL_TRANSITIONS.has(effect) && dir ? { direction: dir } : {}) } };
      }),
    }));
    if (effect) {
      const prevDur = (sp[i]!.clip as VideoShot).transIn?.durationSec ?? 1;
      applyT(Math.max(0, cutSec - Math.min(prevDur, MAX_TRANSITION_SEC) / 2 - 0.2));
    }
  };
  /** 转场区域柄拖动提交:对称总时长(时间轴已按两侧镜长夹过,这里再夹上限)。 */
  const resizeCutTransition = (shotId: string, durationSec: number) =>
    setComp((c) => ({
      ...c,
      shots: (c.shots ?? []).map((s) =>
        s.id === shotId && s.transIn ? { ...s, transIn: { ...s.transIn, durationSec: Math.min(MAX_TRANSITION_SEC, Math.max(0.2, durationSec)) } } : s,
      ),
    }));
  // 切点因剪辑消失(不再是任何分镜边界)→ 转场浮窗自动关
  useEffect(() => {
    if (floatWin !== 'transition' || transitionCut == null) return;
    const bounds = clipSpans(comp.shots ?? []).map((sp) => sp.editedEnd);
    if (!bounds.slice(0, -1).some((b) => Math.abs(b - transitionCut) < 0.05)) setFloatWin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, transitionCut, comp.shots]);
  // 素材动效面板依赖「选中的已填充素材块」:选中一走/换成别的块 → 自动关回对话
  useEffect(() => {
    if (floatWin !== 'anim') return;
    const b = selectedId ? compRef.current.blocks.find((x) => x.id === selectedId) : null;
    const ok = b && blockKind(b) === 'media' && !!(b.slots.media as { url?: string } | undefined)?.url;
    if (!ok) setFloatWin(null);
  }, [floatWin, selectedId]);
  /** 素材块动效写回(入/出场/时长;enter 缺省 fade 与渲染端一致)。 */
  const setBlockAnim = (bid: string, patch: Partial<{ enter: string; exit: string; dur: number }>) =>
    setComp((c) => ({
      ...c,
      blocks: c.blocks.map((b) => (b.id === bid ? { ...b, slots: { ...b.slots, anim: { enter: 'fade', ...((b.slots.anim ?? {}) as object), ...patch } } } : b)),
    }));
  /** 草稿实时投舞台(编辑器已过 lint 硬错误关)。 */
  const handleCodeDraft = (id: string, draft: SourceDraft) => {
    if (genIdsRef.current.has(id)) return;
    codeDraftRef.current = draft;
    setComp((cc) => ({
      ...cc,
      blocks: cc.blocks.map((b) => (b.id === id ? { ...b, templateId: 'custom', slots: { innerHtml: draft.innerHtml, timelineBody: draft.timelineBody } } : b)),
    }));
  };
  /** 提交:写回 + 基线推进到应用后状态(此后关闭不再还原)。 */
  const handleCodeApply = (id: string, draft: SourceDraft) => {
    if (genIdsRef.current.has(id)) {
      toast.info(t('组件正在生成，完成后再应用'));
      return;
    }
    handleCodeDraft(id, draft);
    codeOrigRef.current = { id, templateId: 'custom', slots: { innerHtml: draft.innerHtml, timelineBody: draft.timelineBody } };
    codeDraftRef.current = null;
  };
  /** 编辑器内「AI 改」:以当前草稿为底稿走 compose(含 lint 修复闭环),期间持生成锁。 */
  const runCodeAi = async (b: Block, instruction: string, draft: SourceDraft, onNote: (n: string) => void): Promise<SourceDraft | null> => {
    markGenerating([b.id], true);
    try {
      const boxPx = b.box
        ? { w: Math.round(b.box.w * compRef.current.width), h: Math.round(b.box.h * compRef.current.height) }
        : undefined;
      const seed = {
        id: b.id,
        kind: 'custom',
        innerHtml: draft.innerHtml,
        timelineBody: draft.timelineBody,
        label: b.label,
        durationSec: b.durationSec,
        ...(boxPx ? { boxPx } : {}),
      };
      const parsed = await composeBlockChecked(seed, instruction, (acc) => onNote(noteOf(acc)));
      return { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('AI 修改失败'));
      return null;
    } finally {
      markGenerating([b.id], false);
    }
  };
  /** 「循环预览」:反复播放该组件的时间窗,调动画用。 */
  const toggleCodeLoop = (on: boolean) => {
    const b = codeBlockId ? compRef.current.blocks.find((x) => x.id === codeBlockId) : null;
    if (!on || !b) {
      stopCodeLoop();
      return;
    }
    const start = Math.max(0, b.startSec);
    const end = Math.min(totalDuration(compRef.current), b.startSec + b.durationSec);
    if (end - start < 0.2) return;
    loopRangeRef.current = { start, end };
    setCodeLoop(true);
    tRef.current = start;
    playhead.set(start);
    setT(start);
    if (playingRef.current) postPreview({ type: 'hf:play', t: start });
    else setPlaying(true); // 播放 effect 从 tRef 起播
  };

  // 监听 iframe 桥:select → 选中块;edit → 就地改写回 slot;fit → autofit 缩放系数;clock → 播放时钟
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      // 只认预览双缓冲(组件卡/hover 小预览跑同一套 runtime 也会 post,不能让它们改状态/伪造 edit)
      const fromActive = e.source === iframesRef.current[bufsRef.current.active]?.contentWindow;
      const fromBack = e.source === iframesRef.current[bufsRef.current.active === 0 ? 1 : 0]?.contentWindow;
      if (!fromActive && !fromBack) return;
      const d = e.data as { source?: string; type?: string; blockId?: string; key?: string; value?: string; fits?: Record<string, number>; t?: number; src?: string; dx?: number; dy?: number; snapX?: boolean; snapY?: boolean; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; nonce?: string; index?: number; el?: string; sub?: boolean; part?: string; rect?: { x: number; y: number; w: number; h: number } } | null;
      if (!d || d.source !== 'hf') return;
      // fit 两个缓冲都收(后台缓冲量的就是新内容);交互/位置只认活跃缓冲
      if (d.type === 'fit' && d.fits) {
        applyFits(d.fits);
        return;
      }
      // 花字行实测矩形(hf:measure 应答):选中框据此贴真实字幕区域
      if (d.type === 'measure' && fromActive && d.rect) {
        if (d.sub) setCapSubMeasure({ w: d.rect.w, h: d.rect.h, scale: resolveSubCaptionStyle(compRef.current).scale });
        else setCapMeasure({ w: d.rect.w, h: d.rect.h, scale: resolveCaptionStyle(compRef.current).scale });
        return;
      }
      // pong 两个缓冲都收:后台缓冲的切换握手应答 + 活跃缓冲的播放探针取证
      if (d.type === 'pong') {
        const st = switchPingRef.current;
        if (st && d.nonce === st.nonce && fromBack) {
          // 目标文档活体确认 → 稍候一拍(视频/字体落位)原子切换;旧缓冲停播并清空
          switchPingRef.current = null;
          if (st.timer) clearTimeout(st.timer);
          const { idx, doc } = st;
          setTimeout(() => {
            if (bufsRef.current.docs[idx] !== doc || bufsRef.current.active === idx) return;
            try {
              // teardown(内含 pause):旧文档立即释放媒体装载/解码器会话,不等 srcdoc 清空后的异步 GC
              iframesRef.current[bufsRef.current.active]?.contentWindow?.postMessage({ type: 'hf:teardown' }, '*');
            } catch {
              /* ignore */
            }
            pendingSwitchRef.current = false; // 切换落定:就地补丁通道恢复
            setRebuilding(false);
            setPendingInsert(null);
            console.info('[studio] buf switch', { to: idx, from: bufsRef.current.active });
            setBufs((s) => {
              if (s.docs[idx] !== doc) return s;
              const docs = [...s.docs] as [string, string];
              docs[s.active === idx ? (idx === 0 ? 1 : 0) : s.active] = '';
              return { docs, active: idx };
            });
            // 播放中被重组打断(如 AI 改块) → 新缓冲从当前播放头接着播,别冻在暂停帧
            if (playingRef.current) {
              const w = iframesRef.current[idx]?.contentWindow;
              try {
                w?.postMessage({ type: 'hf:seek', t: tRef.current }, '*');
                w?.postMessage({ type: 'hf:play', t: tRef.current }, '*');
              } catch {
                /* ignore */
              }
            }
          }, 120);
        }
        return;
      }
      // 人像抠片:iframe 按**源时间**要预算好的 mask(轨在开关开启时全量算好)。
      // 两个缓冲都答(后台缓冲预热时就开始要,切换瞬间人像不闪空);轨没就绪回 null,
      // iframe 侧退避重问。webp 按需解码成 ImageBitmap 转移过去,内存里只存压缩体。
      if (d.type === 'personMaskAt') {
        const src = e.source as Window | null;
        if (!src) return;
        const t = typeof d.t === 'number' ? d.t : 0;
        // 多源:iframe 报「哪个主轨元素 + 它源文件的时间」;按源取轨、按该源的分镜开关判段
        const elKey = typeof d.el === 'string' ? d.el : 'main';
        const shots = compRef.current.shots ?? [];
        let trackKey = 'main';
        let inOn = false;
        if (elKey === 'main') {
          inOn = shots.some((s) => !s.src && s.personMatte && t >= s.srcStart - 0.05 && t < s.srcEnd + 0.05);
        } else {
          const sh = shots.find((s) => `clip_${s.id}` === elKey);
          trackKey = sh?.src ?? '';
          inOn = !!sh?.personMatte && !!sh && t >= sh.srcStart - 0.05 && t < sh.srcEnd + 0.05;
        }
        const track = matteTrackRef.current.get(trackKey);
        if (!inOn || !track?.length) {
          try {
            src.postMessage({ type: 'hf:personMask', mask: null }, '*');
          } catch {
            /* ignore */
          }
          return;
        }
        let lo = 0;
        let hi = track.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (track[mid]!.t <= t) lo = mid;
          else hi = mid - 1;
        }
        const cand = track[lo]!;
        const next = track[lo + 1];
        const pick = next && Math.abs(next.t - t) < Math.abs(cand.t - t) ? next : cand;
        // 最近帧离得太远(这段开了抠像但还没预算完)也回空,不拿别段的 mask 顶
        if (Math.abs(pick.t - t) > 2 / MATTE_FPS) {
          try {
            src.postMessage({ type: 'hf:personMask', mask: null }, '*');
          } catch {
            /* ignore */
          }
          return;
        }
        createImageBitmap(pick.blob).then(
          (mask) => {
            try {
              src.postMessage({ type: 'hf:personMask', mask }, '*', [mask]);
            } catch {
              mask.close();
            }
          },
          () => {
            try {
              src.postMessage({ type: 'hf:personMask', mask: null }, '*');
            } catch {
              /* ignore */
            }
          },
        );
        return;
      }
      if (!fromActive) return;
      if (d.type === 'select') {
        // 播放中点到组件 = 想编辑它:先停播(点空白仍只取消选中,不打断播放)
        if (d.blockId && playingRef.current) setPlaying(false);
        setSelectedId(d.blockId ?? null);
        setCapSelPart(d.part === 'sub' ? 'sub' : 'main'); // 字幕分靶:主行/译文行各出各的手柄
        setImgSel(null); // 同一次点击若点中了图,紧随其后的 imgSel 消息会重新填上
        if (d.blockId) setSelectedShotId(null);
        else {
          // 点视频区(非块)= 选中播放头所在分镜(用户定的);没有分镜才是纯取消选中
          const c = compRef.current;
          const shots = c.shots ?? [];
          let cur: string | null = null;
          if (c.video && shots.length) {
            const now = tRef.current;
            for (const s of shots) {
              const sp = shotSpan(c, s.id);
              if (sp && now >= sp.editedStart - 1e-3 && now < sp.editedStart + sp.shotLen + 1e-3) {
                cur = s.id;
                break;
              }
            }
            cur ??= shots[shots.length - 1]!.id; // 播放头贴着末尾:算最后一段
          }
          setSelectedShotId(cur);
        }
      } else if (d.type === 'imgSel' && d.blockId && typeof d.index === 'number' && d.rect) {
        // 图片 slot 只对 custom 块(LLM 生成的组件)开放;素材位块的图走块级工具条
        const b = compRef.current.blocks.find((x) => x.id === d.blockId);
        if (b && b.templateId === 'custom' && !genIdsRef.current.has(b.id)) setImgSel({ blockId: d.blockId, index: d.index, rect: d.rect });
      } else if (d.type === 'edit' && d.blockId && d.key) {
        iframeEditEchoRef.current.add(d.blockId); // 就地改字:活跃文档已是最新,该块 slots 提交可跳重建
        setSlot(d.blockId, d.key, d.value ?? '');
      }
      else if (d.type === 'boxDragStart' && d.blockId) {
        // 拖动基线快照(移动本身在 iframe 里 translate,零 React 重渲;这里只记提交要用的起点)。
        // 生成中的块不提交(box 已快照给 worker,拖了也会被生成结果覆盖)。
        const b = compRef.current.blocks.find((x) => x.id === d.blockId);
        boxDragRef.current = b?.box && !genIdsRef.current.has(b.id) ? { id: b.id, box: b.box } : null;
        setImgSel(null); // 块一动,图片矩形就过期了 —— 收起图片工具条,点击再出
        setGuideVis(false, false); // 上一次拖动如被文档重建打断,参考线在这兜底清掉
        dragCursorRef.current = ''; // 体拖/grip 拖不挂护罩:capture 元素常驻(iframe 内块 / 浮动条 grip),事件不丢
        setBodyDragging(!!boxDragRef.current);
      } else if (d.type === 'boxDrag') {
        // 拖动过程零 setState:参考线/ghost/操作条全部直改 DOM(React 对未变的 style 属性不回写,
        // 不会被冲掉;提交后 React 用同一 toolbarXY 重算,数值恒等 → 零跳动零重渲)
        setGuideVis(!!d.snapX, !!d.snapY);
        if (boxDragRef.current && typeof d.dx === 'number' && typeof d.dy === 'number') {
          const st = boxDragRef.current;
          const c = compRef.current;
          const gx = st.box.x + d.dx / c.width;
          const gy = st.box.y + d.dy / c.height;
          setGhostRect({ x: gx, y: gy, w: st.box.w, h: st.box.h }); // 体拖 ghost:内容不动,虚线跟手
          if (toolbarRef.current) {
            const p = toolbarXY({ ...st.box, x: gx, y: gy });
            toolbarRef.current.style.left = `${p.left}px`;
            toolbarRef.current.style.top = `${p.top}px`;
          }
        }
      } else if (d.type === 'boxDragEnd') {
        // 一次性提交:基线 + iframe 报来的最终位移(已吸附)→ 整块平移(box 与 contentBox 一起挪)。
        // 不做边界钳制:组件允许拖出画布,出界部分由画布 overflow 截断(用户定的)
        const st = boxDragRef.current;
        if (st && st.id === d.blockId && typeof d.dx === 'number' && typeof d.dy === 'number') {
          const c = compRef.current;
          const dxf = d.dx / c.width;
          const dyf = d.dy / c.height;
          setComp((cc) => ({
            ...cc,
            blocks: cc.blocks.map((b) => (b.id === st.id ? shiftBox({ ...b, box: st.box }, dxf, dyf) : b)),
          }));
        }
        boxDragRef.current = null;
        setGuideVis(false, false);
        setGhostRect(null);
        setBodyDragging(false);
      } else if (d.type === 'playBlocked') {
        // 浏览器拒绝起播(autoplay 权限/解码问题):必须可见,这曾是"播放头走画面冻"的无声元凶
        console.warn('[studio] 视频起播被浏览器拒绝', d);
      } else if (d.type === 'key' && typeof d.key === 'string') {
        // iframe(独立焦点上下文)转发的快捷键 → 重放成 window keydown,走统一快捷键处理
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: d.key, shiftKey: !!d.shiftKey, metaKey: !!d.metaKey, ctrlKey: !!d.ctrlKey, altKey: !!d.altKey }),
        );
      }
      else if (d.type === 'clock' && typeof d.t === 'number') {
        // iframe 自驱上报的播放位置(canvas 化后父层是唯一时钟,此路仅源码编辑器循环预览还用)
        if (playingRef.current) {
          // 源码编辑器「循环预览」:越过组件时间窗末端 → 跳回起点重播(一次性命令,自驱继续)
          const lr = loopRangeRef.current;
          if (lr && d.t >= lr.end - 0.03) {
            tRef.current = lr.start;
            playhead.set(lr.start);
            postPreview({ type: 'hf:play', t: lr.start });
            return;
          }
          tRef.current = d.t;
          playhead.set(d.t);
        }
      } else if (d.type === 'ended') {
        const lr = loopRangeRef.current;
        if (lr && playingRef.current) {
          // 循环窗贴着成片末尾:ended 也当作循环点
          tRef.current = lr.start;
          playhead.set(lr.start);
          postPreview({ type: 'hf:play', t: lr.start });
          return;
        }
        const D = typeof d.t === 'number' ? d.t : totalDuration(compRef.current);
        tRef.current = D;
        playhead.set(D);
        setT(D);
        setPlaying(false);
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [setSlot, applyFits, postPreview, toolbarXY]);

  // 安全区调试:开关开着时,播放头一停就对**当前帧**实时跑一次检测(debounce;播放中频繁变 t 会自动跳过到停下)
  useEffect(() => {
    if (!showGeom || !videoFile) {
      setLiveGeom(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      void detectFrameAt(videoFile, tSec)
        .then((sz) => {
          if (!cancelled) setLiveGeom(sz);
        })
        .catch(() => {});
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [showGeom, videoFile, tSec]);

  /** 编辑态强显的块 id:组件/素材块选中时强制显示动画终态;字幕(有 capEdit 自己的强显)
   *  与转场(to-tween 基态=不可见,强显无意义)不参与 → null=按时间轴状态显示。 */
  const focusIdOf = useCallback((id: string | null) => {
    if (!id) return null;
    const b = compRef.current.blocks.find((x) => x.id === id);
    if (!b) return null;
    const k = blockKind(b);
    return k === 'caption' || k === 'transition' ? null : id;
  }, []);
  // 选中态变化(时间轴点选/画布点选/agent focus)→ 同步 iframe 高亮 + **选中即可见**:
  // 「选中=强显」机制已退役(2026-07-13 用户拍板根治)——运行时逆向重构"落定态"对生成
  // 代码的初态写法(tl.from 内联 / CSS 规则基态+tl.to / inline transform 组合,三连实录)
  // 是打不完的地鼠。改为:选中的块在当前播放头下还没入场落定/已出窗时,把播放头挪到它的
  // 落定时刻——画面=播放渲染的真实结果,任何动画写法零特判。块本来可见(画布上点它、
  // 播放头已在窗内落定段)不动播放头;字幕走 capEdit 独立机制;播放中不动。
  useEffect(() => {
    postPreview({ type: 'hf:selectBlock', blockId: selectedId });
    if (!selectedId || playingRef.current) return;
    if (!focusIdOf(selectedId)) return; // 字幕/转场不管
    const b = compRef.current.blocks.find((x) => x.id === selectedId);
    if (!b) return;
    const settle = Math.min(Math.max(0.45, b.durationSec * 0.2), Math.max(0.01, b.durationSec - 0.06)); // seekBlockSettled 同口径
    const t = tRef.current;
    if (t < b.startSec + settle - 1e-3 || t >= b.startSec + b.durationSec) applyT(b.startSec + settle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, bufs.active, postPreview, focusIdOf]);

  // 缓冲切换后:焦点若还挂在退休的后台缓冲上,键盘会喂给死文档(bridge 转发被 fromActive
  // 丢弃 → 快捷键集体失灵,实录:seek/空格全无反应)——移交给新活跃缓冲
  useEffect(() => {
    const act = iframesRef.current[bufs.active];
    const other = iframesRef.current[bufs.active === 0 ? 1 : 0];
    if (act && other && document.activeElement === other) act.focus();
    // 新文档的 #vidEl 画布是空的:切换完成立刻补推当前帧(播放中下一帧自然到)
    videoEngineRef.current?.refresh();
  }, [bufs.active]);

  // 缓冲切换完成 = 新素材已随新文档亮相 → 收掉所有「加载中」徽标(upload 阶段由各自流程收)
  useEffect(() => {
    setMediaBusy((m) => {
      const entries = Object.entries(m).filter(([, p]) => p !== 'swap');
      return entries.length === Object.keys(m).length ? m : Object.fromEntries(entries);
    });
  }, [bufs.active]);

  // 全局快捷键(剪辑工具肌肉记忆):Space 播放/暂停 · 方向键微调选中块版位(无选中块时
  // ←→ 步进播放头)· Delete/Backspace 删选中块或场景 · Escape 关源码面板/取消选中。
  // 光标在输入框/可编辑区时全部让路;不拦 Enter:焦点常落在工具栏按钮上,Enter 会
  // 「按钮触发 + 块被删」双动作,块莫名消失。removeBlock/deleteShot 等每渲染闭包经 keysRef 取最新。
  const keysRef = useRef<{ removeBlock: (id: string) => void; deleteBlocks: (ids: Set<string>) => void; deleteShot: (sid: string) => void; deleteShots: (ids: Set<string>) => void; closeCode: () => void; closeFloat: () => void; deleteTransition: () => void; undo: () => void; redo: () => void; floatWin: FloatKind | null }>({
    removeBlock: () => {},
    deleteBlocks: () => {},
    deleteShot: () => {},
    deleteShots: () => {},
    closeCode: () => {},
    closeFloat: () => {},
    deleteTransition: () => {},
    undo: () => {},
    redo: () => {},
    floatWin: null,
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === 'Escape') {
        if (typing) return;
        if (keysRef.current.floatWin === 'code') {
          keysRef.current.closeCode(); // 源码浮窗开着:先关它(未应用草稿还原),选中保留
          return;
        }
        if (keysRef.current.floatWin) {
          keysRef.current.closeFloat(); // 任何浮窗:Esc 先关窗,选中保留
          return;
        }
        setSelectedId(null);
        setSelectedShotId(null);
        return;
      }
      // ⌘Z/Ctrl+Z:撤销(有快照的操作——剪辑、口播稿剪切、删块、面板插入等);⇧⌘Z:重做
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) keysRef.current.redo();
        else keysRef.current.undo();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        // 焦点常落在按钮上,裸 Space 会再触发那个按钮 —— 统一劫持为播放/暂停
        const c = compRef.current;
        if (!c.video && c.blocks.length === 0) return;
        e.preventDefault();
        setPlaying((p) => !p);
        return;
      }
      if (e.key.startsWith('Arrow')) {
        const id = selectedIdRef.current;
        const b = id ? compRef.current.blocks.find((x) => x.id === id) : null;
        if (b?.box && !genIdsRef.current.has(b.id)) {
          // 微调选中块版位:5px/步,Shift=20px(comp px 口径)
          e.preventDefault();
          const step = e.shiftKey ? 20 : 5;
          const dx = (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0) * (step / compRef.current.width);
          const dy = (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0) * (step / compRef.current.height);
          if (!dx && !dy) return;
          setComp((c) => ({
            ...c,
            blocks: c.blocks.map((x) => (x.id === b.id && x.box ? shiftBox(x, dx, dy) : x)),
          }));
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          // 没有可微调的选中块:←→ 步进播放头(0.1s,Shift=1s);播放中先停(步进=想逐帧看)
          e.preventDefault();
          if (playingRef.current) setPlaying(false);
          const step = (e.shiftKey ? 1 : 0.1) * (e.key === 'ArrowLeft' ? -1 : 1);
          const D = totalDuration(compRef.current);
          applyT(Math.max(0, Math.min(D, tRef.current + step)));
        }
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (keysRef.current.floatWin === 'transition') {
        // 转场选中态(浮窗开着):删的是这个转场,不是分镜
        e.preventDefault();
        keysRef.current.deleteTransition();
        return;
      }
      const bids = selectedBlockIdsRef.current;
      if (bids.size > 1) {
        e.preventDefault();
        keysRef.current.deleteBlocks(bids); // 组件多选批量删
        return;
      }
      const id = selectedIdRef.current;
      if (id) {
        e.preventDefault();
        keysRef.current.removeBlock(id); // 统一守卫:生成中的块不让删
        return;
      }
      const ids = selectedShotIdsRef.current;
      if (ids.size) {
        e.preventDefault();
        keysRef.current.deleteShots(ids); // 多选批量;单个自动退化(统一守卫:至少保留一个场景)
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyT, setComp, setPlaying]);

  // 播放(canvas 渲染模式):**父层引擎是唯一时钟**——解码元素常驻父层,不随文档重建生灭,
  // 「解码僵尸/时钟冻结/命令丢失」整类看门狗随病根一起退役。iframe 只收两样东西:
  // hf:frame(视频帧画进 #vidEl 画布)+ hf:seekTimelines(叠加层逐帧对齐);
  // hf:play/hf:pause 仍发——文档里的画中画媒体照常起停(__parentClock 下不自驱时钟)。
  useEffect(() => {
    if (!playing) {
      videoEngineRef.current?.pause();
      postPreview({ type: 'hf:pause' });
      setT(tRef.current); // 停下:同步粗粒度 t(调试叠加/liveGeom 这类低频消费方)
      return;
    }
    // 在末尾再按播放 → 从头开始(不循环,但允许重播)
    if (tRef.current >= duration - 0.02) {
      tRef.current = 0;
      playhead.set(0);
      setT(0);
    }
    postPreview({ type: 'hf:play', t: tRef.current });
    videoEngineRef.current?.play(tRef.current);
  }, [playing, duration, postPreview]);

  /* ---------- 选本地视频(不上传,blob 预览)+ ASR ---------- */
  /** opts.asSig:云端取回的 File 名字/mtime 变了,fileSig 对不上原 sig——用原 sig 顶替,
   *  否则草稿接回判定失败会被当"新作品"整个冲掉(OPFS 落盘/云备份也统一用原 sig)。 */
  async function pickVideoFile(file: File, opts?: { asSig?: string }) {
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
      toast.error(t('请选择视频文件'));
      return;
    }
    const sig = opts?.asSig ?? fileSig(file);
    setBusyImport(true);
    try {
      const p = await probeVideoFile(file);
      const dims = normalizeDims(p.width, p.height);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setVideoFile(file);
      videoSigRef.current = sig;
      void saveLocalVideo(file, sig); // OPFS 本地库:刷新后草稿恢复自动接回,不用重选
      backupMediaToCloud(file, sig, 'video'); // 云端字节汇合点:换设备自动取回(重复=秒传)

      // 换片:清空流水线产物(否则工具会拿旧 plan/visual 跳过重算)
      setAsrSentences(null);
      setPlan(null);
      setVisual(null);
      asrRef.current = null;
      planRef.current = null;
      visualRef.current = null;
      resetExport();
      const dur = p.durationSec || 30;
      const pr = pendingRestoreRef.current;
      if (pr && pr.videoSig && sig === pr.videoSig) {
        // 草稿恢复:选回了同一个原片 —— 只接回视频,保留已恢复的 blocks/shots
        pendingRestoreRef.current = null;
        setComp((c) => ({ ...c, video: { url, durationSec: dur }, width: dims.width, height: dims.height }));
        toast.success(t('原视频已接回，草稿完整恢复'));
      } else {
        if (pr) pendingRestoreRef.current = null; // 选了别的片 = 放弃接回,按新作品走
        // 换片 = 新作品:shots/blocks/palette 全清(旧 shots 的源区间指旧片,残留会 seek 越界、场景栏错位)。
        // 初始给一个覆盖整条的分镜:没分割也能选中,取景/人像等按段能力不用区别对待(用户定的)
        setComp((c) => ({
          ...emptyComposition(),
          theme: c.theme,
          video: { url, durationSec: dur },
          width: dims.width,
          height: dims.height,
          shots: [{ id: shotId(), srcStart: 0, srcEnd: dur, treatment: 'full' as const }],
        }));
      }
      setSelectedId(null);
      setSelectedShotId(null);
      setCodeBlockId(null);
      setPlaying(false);
      tRef.current = 0;
      playhead.set(0);
      setT(0);
      toast.success(t('已读入 {w}×{h}', { w: dims.width, h: dims.height }) + (p.durationSec ? ` · ${p.durationSec.toFixed(1)}s` : '') + (p.hasAudio ? '' : t(' · 无音轨')));
      // 缩率图:回收旧帧 URL,按时长密度增量抽(边解码边浮现)。
      // extractFilmstrip 无 abort → 代数守卫:换片后旧片迟到的帧直接回收丢弃,不混进新 filmstrip。
      const gen = ++filmstripGenRef.current;
      setFilmstrip((prev) => {
        prev.forEach((f) => URL.revokeObjectURL(f.url));
        return [];
      });
      // 密度 ~1帧/秒(上限 600 ≈ 10 分钟不降密):此前 120 帧封顶,几分钟的素材帧距拉到
      // 2s+,hover 瓦片与预览"差 2 秒多"就是它;增量浮现,不挡交互
      void extractFilmstrip(file, dur, Math.min(600, Math.max(8, Math.round(dur))), (f) => {
        if (filmstripGenRef.current !== gen) {
          URL.revokeObjectURL(f.url);
          return;
        }
        setFilmstrip((prev) => [...prev, f].sort((a, b) => a.t - b.t));
      }).catch(() => {});
    } catch {
      toast.error(t('读取视频失败(换 mp4/mov 试试)'));
    } finally {
      setBusyImport(false);
    }
  }

  // 抽音频→上传→ASR(内存 + 按文件指纹持久缓存,同片只转一次)
  // 当前视频(供 build-draft 用):blob 预览 URL + 画布尺寸。用 ref 取最新。
  function currentVideo() {
    const c = compRef.current;
    return c.video ? { url: c.video.url, durationSec: c.video.durationSec, width: c.width, height: c.height } : null;
  }

  // 成片流水线三步(stepAsr/stepPlan/stepVisual,在飞去重)—— 见 use-draft-pipeline.ts
  // 插入片段的规划上下文:实现在 ensureClipTranscripts 定义之后落进 ref(那段依赖
  // matteFileForShot 等后置闭包);这里先给空实现,stepPlan 运行时读到的已是真身
  const insertedClipsForPlanRef = useRef<() => Promise<PlanInsert[]>>(() => Promise.resolve([]));
  const { stepAsr, stepPlan, stepVisual } = useDraftPipeline({
    videoFileRef,
    compRef,
    asrRef,
    planRef,
    visualRef,
    setAsrSentences,
    setPlan,
    setVisual,
    setComp,
    currentVideo,
    getInsertedClips: () => insertedClipsForPlanRef.current(),
  });

  // 调试口子:清画面分析缓存 + 重跑(同片默认秒回缓存,想重测分析点这个)
  async function rerunVisual() {
    if (!videoFile || !comp.video) {
      toast.error(t('先上传口播视频'));
      return;
    }
    clearVisualCache(videoSigRef.current ?? fileSig(videoFile));
    setVisual(null);
    toast.success(t('已清除缓存,重新分析画面…'));
    const vis = await analyzeVisual(videoFile, comp.video.durationSec).catch(() => null);
    setVisual(vis);
    toast.success(vis ? t('画面分析完成') : t('画面分析无结果'));
  }

  /* ---------- 对话(流式):选中块→改它;没选→AI 新建一个组件 ---------- */
  /** 复用 /api/studio/compose 生成/改一个 custom 块,返回模型原始文本(含 note + 围栏)。 */
  const composeBlockRaw = useCallback(
    async (
      seed: { id: string; kind: string; innerHtml: string; timelineBody: string; label?: string; boxPx?: { w: number; h: number }; durationSec?: number; beats?: { text: string; start: number; end: number }[]; neighbors?: string[] },
      instruction: string,
      onDelta?: (raw: string) => void,
    ): Promise<string> => {
      const script = asrSentences?.map((s) => s.text).join('') ?? ''; // 口播全文当上下文
      const context: { script?: string; beats?: { text: string; start: number; end: number }[]; neighbors?: string[] } = {};
      if (script) context.script = script;
      if (seed.beats?.length) context.beats = seed.beats; // 组件窗内口播句(本地时间)→ 精确卡点
      if (seed.neighbors?.length) context.neighbors = seed.neighbors; // 同片其它组件清单 → 反单调(换原型/对齐/动效)
      // 能力经 provider 走(开源拆分阶段2):托管壳=服务端 LLM+计费;OSS 壳可换实现或走 BYO
      return studioProviders().composer.composeStream(
        {
          block: { id: seed.id, kind: seed.kind, innerHtml: seed.innerHtml, timelineBody: seed.timelineBody, label: seed.label ?? '新组件', ...(seed.boxPx ? { boxPx: seed.boxPx } : {}), ...(seed.durationSec ? { durationSec: seed.durationSec } : {}) },
          instruction,
          theme: compRef.current.theme,
          ...(compRef.current.palette ? { palette: compRef.current.palette } : {}), // 底色派生色,让 LLM 用真实 accent
          ...(compRef.current.frameId ? { frameId: compRef.current.frameId } : {}), // frame 设计语言进 ACTIVE THEME
          lang: localeRef.current, // note(聊天里那句人话)用 UI 语言
          ...(Object.keys(context).length ? { context } : {}),
        },
        onDelta,
      );
    },
    [asrSentences],
  );

  /** 流式文本 → 卡片可见的 note(第一个代码围栏前的散文;契约 note-first,所以就是模型正在说的人话)。 */
  const noteOf = (raw: string): string => {
    const i = raw.indexOf('```');
    return (i === -1 ? raw : raw.slice(0, i)).trim().slice(0, 120);
  };

  /** 生成/修改一个块 + 静态检查闭环:不过关带 issue 让模型修一轮(以坏产物为底稿只修问题);
   *  硬错误(未作用域 CSS/script/非确定性)修完仍在 → 抛 —— 宁可留占位,坏 CSS 会污染整个文档。 */
  const composeBlockChecked = useCallback(
    async (
      seed: { id: string; kind: string; innerHtml: string; timelineBody: string; label?: string; boxPx?: { w: number; h: number }; durationSec?: number; beats?: { text: string; start: number; end: number }[]; neighbors?: string[] },
      instruction: string,
      onDelta?: (raw: string) => void,
    ): Promise<{ innerHtml: string; timelineBody: string; note: string }> => {
      const raw = await composeBlockRaw(seed, instruction, onDelta);
      let parsed = parseBlockResponse(raw, { innerHtml: seed.innerHtml, timelineBody: seed.timelineBody });
      let issues = lintBlock({ blockId: seed.id, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody });
      if (issues.length) {
        const fixSeed = { ...seed, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody };
        const fixInstruction = `Your previous output failed these checks — fix ONLY these problems, keep everything else identical:\n${issues.map((i) => `- ${i.message}`).join('\n')}`;
        const raw2 = await composeBlockRaw(fixSeed, fixInstruction, onDelta);
        parsed = parseBlockResponse(raw2, { innerHtml: fixSeed.innerHtml, timelineBody: fixSeed.timelineBody });
        issues = lintBlock({ blockId: seed.id, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody });
        const hard = issues.filter((i) => HARD_LINT_CODES.has(i.code));
        if (hard.length) throw new Error(t('生成的块没通过检查:{message}', { message: hard[0]!.message }));
        if (issues.length) console.warn('[studio] block lint soft issues', seed.id, issues);
      }
      return parsed;
    },
    [composeBlockRaw],
  );

  /** 删一个块(选中控制条/通用)。删的若是选中块则清选中。生成中的不让删(worker 回写会扑空,结果计数说谎)。
   *  先发 hf:remove 让画面即时消块——只走 setComp 要等 300ms 防抖重建+双缓冲切换,删除手感发粘。 */
  const removeBlock = (id: string) => {
    if (genLockToast(id)) return;
    postPreview({ type: 'hf:remove', id });
    setComp((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id) }));
    setSelectedIdRaw((s) => (s === id ? null : s));
    setSelectedBlockIds((cur) => {
      if (!cur.has(id)) return cur;
      const n = new Set(cur);
      n.delete(id);
      return n;
    });
  };

  /* ---------- 视频轨:分镜切片 + 镜头取景 ---------- */
  const selectShot = (id: string, additive = false) => {
    if (additive) {
      toggleShotSelect(id); // ⌘/Ctrl 点选:进/出多选集
      return;
    }
    setSelectedShotId(id);
    setSelectedId(null); // 一次只聚焦一个对象
  };
  const setShotTreatment = (sid: string, treatment: ShotTreatment) => {
    // 即时:同 hf:shotVars 实时通道直打取景变换(重建的关键帧终值与此一致,落地无跳变);
    // partner 空区/关键帧序列等结构性部分随后由防抖重建接上
    const cur = compRef.current.shots?.find((x) => x.id === sid);
    if (cur) postPreview({ type: 'hf:shotVars', vars: shotTransformVars(treatment, cur.treatSize) });
    setComp((c) => {
      const shots = (c.shots ?? []).map((s) => (s.id === sid ? { ...s, treatment } : s));
      return syncVacancyPartner({ ...c, shots }, sid);
    });
  };
  /** 取景大小(0–100,非 full 类型):视频缩放/占比随之联动,另一半空区同步挪。 */
  const setShotTreatSize = (sid: string, size: number) =>
    setComp((c) => {
      const shots = (c.shots ?? []).map((s) => (s.id === sid ? { ...s, treatSize: size } : s));
      return syncVacancyPartner({ ...c, shots }, sid);
    });
  /** 大小拖动中的实时预览:直发 hf:shotVars 给 iframe(零 setState,不走防抖重建);松手才 setShotTreatSize。
   *  canvas 渲染模式:所有段的取景都打在 #vidEl 画布上。 */
  const previewShotTreatSize = (sid: string, size: number) => {
    const s = compRef.current.shots?.find((x) => x.id === sid);
    if (s) postPreview({ type: 'hf:shotVars', vars: shotTransformVars(s.treatment, size) });
  };
  /** 镜级调色提交:filter 变化走取景同款快路(hf:vidTimeline 就地换体,调色关键帧在体内);
   *  播放头在本镜内时先直打即时值,别等换体那拍。全中性 = 字段整个摘掉。 */
  const setShotFilter = (sid: string, f: ShotFilter | null) => {
    const css = shotFilterCss(f ?? undefined);
    const sp = clipSpans(ensureShots(compRef.current)).find((x) => x.clip.id === sid);
    if (sp && tRef.current >= sp.editedStart - 1e-3 && tRef.current < sp.editedEnd) {
      postPreview({ type: 'hf:shotVars', vars: { filter: css } });
    }
    setComp((c) => ({
      ...c,
      shots: (c.shots ?? []).map((s) => {
        if (s.id !== sid) return s;
        const { filter: _drop, ...rest } = s;
        return css === 'none' ? rest : { ...rest, filter: f! };
      }),
    }));
  };
  /** 调色拖动中的实时预览(零 setState;松手才 setShotFilter 提交)。 */
  const previewShotFilter = (_sid: string, f: ShotFilter) => {
    postPreview({ type: 'hf:shotVars', vars: { filter: shotFilterCss(f) } });
  };

  /** 选了图片/视频 → 写进素材位块的 media slot。 */
  const setBlockMedia = (bid: string, media: MediaRef) =>
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === bid ? { ...b, slots: { ...b.slots, media } } : b)) }));
  /** 弹原生文件选择,拿一个文件。 */
  const pickFile = (accept: string): Promise<File | null> =>
    new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file';
      i.accept = accept;
      i.onchange = () => res(i.files?.[0] ?? null);
      i.click();
    });
  /** custom 块 innerHtml 里第 index 个 <img> 的 DOM 手术(换 src / 删除)——与 setSlot 改字同一套 DOMParser 补丁路数,零 LLM 即时生效。 */
  const patchCustomImg = (blockId: string, index: number, fn: (img: Element) => 'remove' | void) =>
    setComp((c) => ({
      ...c,
      blocks: c.blocks.map((b) => {
        if (b.id !== blockId || b.templateId !== 'custom') return b;
        const inner = String((b.slots as { innerHtml?: unknown }).innerHtml ?? '');
        try {
          const doc = new DOMParser().parseFromString(`<div id="__hfw">${inner}</div>`, 'text/html');
          const host = doc.getElementById('__hfw');
          const img = host?.querySelectorAll('img')[index];
          if (!host || !img) return b;
          if (fn(img) === 'remove') img.remove();
          return { ...b, slots: { ...b.slots, innerHtml: host.innerHTML } };
        } catch {
          return b;
        }
      }),
    }));
  /** 图片工具条「换图」:选文件→上传→只换 src,布局/动画原样(object-fit:cover 由生成契约兜底不破版)。 */
  const replaceCustomImg = async (blockId: string, index: number) => {
    const f = await pickFile('image/*');
    if (!f) return;
    setMediaBusyPhase(blockId, 'upload');
    try {
      const url = await uploadImageFile(f);
      patchCustomImg(blockId, index, (img) => {
        img.setAttribute('src', url);
        img.removeAttribute('srcset');
      });
      setMediaBusyPhase(blockId, 'swap');
    } catch (e) {
      setMediaBusyPhase(blockId, null);
      console.warn('[studio] replace slot image failed', e);
      toast.error(t('图片上传失败'));
    }
  };
  /** 素材块「替换」:同类型换内容(图换图/视频换视频),盒子/时间窗/动效原样。 */
  const replaceBlockMedia = async (bid: string) => {
    const b = compRef.current.blocks.find((x) => x.id === bid);
    const kind = (b?.slots.media as MediaRef | undefined)?.type === 'video' ? 'video' : 'image';
    const f = await pickFile(kind === 'image' ? 'image/*' : 'video/*');
    if (!f) return;
    setMediaBusyPhase(bid, 'upload');
    try {
      const url = kind === 'image' ? await uploadImageFile(f) : await uploadVideoFile(f);
      setBlockMedia(bid, { type: kind, url });
      setMediaBusyPhase(bid, 'swap');
      seekBlockSettled(bid);
    } catch (e) {
      setMediaBusyPhase(bid, null);
      console.warn('[studio] replace media failed', e);
      toast.error(kind === 'image' ? t('图片上传失败') : t('视频上传失败'));
    }
  };
  /* ---------------- 素材库 / 组件 / frame 面板的插入动作 ---------------- */

  const pushUndoSnapshot = () => {
    undoStackRef.current.push(compRef.current);
    if (undoStackRef.current.length > UNDO_CAP) undoStackRef.current.shift();
    redoStackRef.current = []; // 撤销后做了新编辑 → 老的重做线不再成立
  };
  /** 远端图片的自然宽高(拿不到回 null → 落默认占位,不挡插入)。 */
  const imageDims = (url: string): Promise<{ w: number; h: number } | null> =>
    new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im.naturalWidth > 0 && im.naturalHeight > 0 ? { w: im.naturalWidth, h: im.naturalHeight } : null);
      im.onerror = () => res(null);
      im.src = url;
    });
  /** 远端视频的自然宽高(metadata 够了,不下整片;拿不到回 null)。 */
  const videoDims = (url: string): Promise<{ w: number; h: number } | null> =>
    new Promise((res) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = () => res(v.videoWidth > 0 && v.videoHeight > 0 ? { w: v.videoWidth, h: v.videoHeight } : null);
      v.onerror = () => res(null);
      v.src = url;
    });
  /** 插入前先量宽高比(图/视频统一入口),好让加载占位区域一开始就是对的比例、不跳。
   *  图只量 400px 缩略图(比例一致、几百毫秒到手)——绝不为量比例去下几 MB 原图拖慢出占位;
   *  视频只读 metadata。1.5s 兜底:量不到(慢/跨域/坏源)就 null → 落默认盒,绝不把插入卡死。 */
  const mediaDims = (media: MediaRef): Promise<{ w: number; h: number } | null> =>
    Promise.race([
      media.type === 'video' ? videoDims(media.url) : imageDims(imageThumb(media.url, 'strip')),
      new Promise<null>((res) => setTimeout(() => res(null), 1500)),
    ]);
  /** 素材块占位盒:按自然宽高比定高(图/视频同口径,cover 即 contain,不裁不留黑),竖图收边不顶天;
   *  拿不到尺寸 → 0.72×0.4 兜底。center 缺省画布正中。 */
  const mediaBoxFor = (dims: { w: number; h: number } | null, center?: { x: number; y: number }) => {
    let w = 0.72;
    let h = 0.4;
    if (dims) {
      const c = compRef.current;
      h = w * (dims.h / dims.w) * (c.width / c.height);
      if (h > 0.62) {
        w = (w * 0.62) / h;
        h = 0.62;
      }
      h = Math.max(0.06, h);
    }
    const cx = center?.x ?? 0.5;
    const cy = center?.y ?? 0.5;
    return { x: Math.min(Math.max(cx - w / 2, 0.02), 1 - w - 0.02), y: Math.min(Math.max(cy - h / 2, 0.02), 1 - h - 0.02), w, h };
  };
  /** 面板选中素材 → 播放头处插一个素材位块(画中画),并选中方便马上拖位置/调时长。
   *  先量图/视频宽高比,再按比例落块——加载占位区域一开始就是对的尺寸,不会先默认盒再跳。
   *  knownDims:调用方已知自然宽高(如上传瀑布流已拿到)→ 直接用,免去量尺寸这一步。
   *  atSec:拖到时间轴时的落点时间(缺省=播放头)。 */
  const insertPanelMedia = async (media: MediaRef, label?: string, atSec?: number, knownDims?: { w: number; h: number }) => {
    const startSec = Math.max(0, Math.round((atSec ?? tRef.current) * 10) / 10);
    const dur = media.type === 'video' ? 5 : 3;
    const dims = knownDims ?? (await mediaDims(media)); // 有现成尺寸直接用,否则量(拿不到 1.5s 兜底 null → 默认盒)
    pushUndoSnapshot();
    const base = mediaBlock({
      startSec,
      durationSec: dur,
      box: mediaBoxFor(dims),
      trackIndex: freeTrack(compRef.current.blocks, startSec, dur),
      label: label || (media.type === 'video' ? t('视频素材') : t('配图')),
    });
    const b: Block = { ...base, slots: { media } };
    setComp((c) => ({ ...c, blocks: [...c.blocks, b] }));
    setMediaBusyPhase(b.id, 'swap'); // URL 已就绪,等重建+CDN 装载亮相
    setSelectedShotId(null);
    setSelectedId(b.id);
    // 停到入场动画之后:+0.01 停在 fade 起点,画面看着是半透明的
    if (!playing) applyT(Math.max(0, startSec + Math.min(0.45, Math.max(0.01, dur - 0.06))));
    toast.success(t('已插入画面，可拖动调整位置'));
  };
  /** 上传面板正在拖出的素材(拖动期间舞台盖接驳层;iframe 会吞 drop 事件)。dims:已知自然宽高,落块免量。 */
  const [dragAsset, setDragAsset] = useState<PanelDragAsset | null>(null);
  /** 选中花字的实测行矩形(hf:measure 应答;w/h 归一 + 量时的 scale)——选中框贴真实字幕区域,
   *  拖动中由样式增量推导,不重测(重测要等重建)。 */
  const [capMeasure, setCapMeasure] = useState<{ w: number; h: number; scale: number } | null>(null);
  const [capSubMeasure, setCapSubMeasure] = useState<{ w: number; h: number; scale: number } | null>(null); // 译文行实测(同 capMeasure 机制)
  const [capSelPart, setCapSelPart] = useState<'main' | 'sub'>('main'); // 字幕选中靶:点主行=main、点译文行=sub,手柄各是各的
  const selCapId = (() => {
    const b = selectedId ? comp.blocks.find((x) => x.id === selectedId) : null;
    return b && isSentenceCaption(b) ? b.id : null;
  })();
  useEffect(() => {
    if (!selCapId) {
      setCapMeasure(null);
      setCapSubMeasure(null);
      return;
    }
    postPreview({ type: 'hf:measure', id: selCapId });
    postPreview({ type: 'hf:measure', id: selCapId, sub: true }); // 译文行同测(没有译文时 iframe 找不到元素,自然无应答)
    // bufs.active 变化 = 重建切换完成要重量;captionStyle 变化 = 刚提交(活跃文档已被
    // hf:capStyle 直改成新字号)→ 立即重测,选中框不用等 300ms 重建才贴合(字号变大换行时
    // 线性估算不准,踩过"框变化有延迟")。框是全局样式手柄,不跟播放头/当前段跳
  }, [selCapId, bufs.active, comp.captionStyle, postPreview]);
  // 编辑态强显:字幕带 fade 入场,播放头常停在透明度极低的时刻——拖一个看不见的字幕没法调。
  // 选中字幕(且暂停)→ 当前段强制不透明(段序号按渲染同一口径 captionLineSegments 算);
  // 取消选中/播放 → 运行时重跑 seekTimelines 恢复时间轴真实状态
  useEffect(() => {
    if (!selCapId || playing) {
      postPreview({ type: 'hf:capEdit', id: null });
      return;
    }
    const b = comp.blocks.find((x) => x.id === selCapId);
    const words = (b?.slots.words ?? []) as { text: string; start: number; end: number }[];
    if (!b || !words.length) return;
    const cs = resolveCaptionStyle(comp);
    const segs = captionLineSegments(words, getCaptionPreset(cs.preset), cs.wPct ?? 56, cs.scale, comp.width);
    let idx = 0;
    for (let i = 0; i < segs.length; i++) {
      if (segs[i]![0]!.start <= tSec + 1e-3) idx = i;
      else break;
    }
    postPreview({ type: 'hf:capEdit', id: selCapId, seg: idx });
  }, [selCapId, playing, tSec, comp, bufs.active, postPreview]);
  /** 素材落到舞台:命中当前时刻在场的组件卡(media 块)= 填充;落空 = 以落点为中心新建组件卡。 */
  const handleAssetDrop = async (e: React.DragEvent) => {
    const a = dragAsset;
    setDragAsset(null);
    if (!a) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const tNow = tRef.current;
    const hit = compRef.current.blocks
      .filter((b) => b.box && blockKind(b) === 'media' && tNow >= b.startSec - 1e-3 && tNow < b.startSec + b.durationSec + 1e-3)
      .filter((b) => nx >= b.box!.x && nx <= b.box!.x + b.box!.w && ny >= b.box!.y && ny <= b.box!.y + b.box!.h)
      .sort((x, y) => y.trackIndex - x.trackIndex)[0];
    // 组件与图片同权拖放(用户定的统一):命中空组件卡=填充(经 elementTargetRef,
    // insertGeneratedElement 内部校验"空卡"才回填),落空=插入(自带布局,不吃落点坐标)
    if (a.type === 'element') {
      if (hit) {
        if (genLockToast(hit.id)) return;
        elementTargetRef.current = hit.id;
      }
      insertGeneratedElement(a.element, a.prompt);
      return;
    }
    if (hit) {
      if (genLockToast(hit.id)) return;
      pushUndoSnapshot();
      setBlockMedia(hit.id, { type: a.type, url: a.url });
      setMediaBusyPhase(hit.id, 'swap');
      setSelectedShotId(null);
      setSelectedId(hit.id);
      toast.success(t('已填入组件卡'));
      return;
    }
    // 同 insertPanelMedia:先量宽高比再按比例落块(落点为中心),加载占位区域一开始就对
    const startSec = Math.max(0, Math.round(tNow * 10) / 10);
    const dur = a.type === 'video' ? 5 : 3;
    const dims = a.dims ?? (await mediaDims({ type: a.type, url: a.url })); // 拖出时带了尺寸就免量
    pushUndoSnapshot();
    const base = mediaBlock({ startSec, durationSec: dur, box: mediaBoxFor(dims, { x: nx, y: ny }), trackIndex: freeTrack(compRef.current.blocks, startSec, dur), label: a.label });
    const nb: Block = { ...base, slots: { media: { type: a.type, url: a.url } } };
    setComp((c) => ({ ...c, blocks: [...c.blocks, nb] }));
    setMediaBusyPhase(nb.id, 'swap');
    setSelectedShotId(null);
    setSelectedId(nb.id);
    toast.success(t('已新建组件卡'));
  };
  /** 空组件块「上传」:选文件传成功后填进该块。 */
  const uploadIntoBlock = async (id: string) => {
    const f = await pickFile('image/*,video/*');
    if (!f) return;
    const kind = f.type.startsWith('video/') ? 'video' : 'image';
    setMediaBusyPhase(id, 'upload');
    try {
      const url = kind === 'image' ? await uploadImageFile(f) : await uploadVideoFile(f);
      setBlockMedia(id, { type: kind, url });
      setMediaBusyPhase(id, 'swap');
      setSelectedId(id);
      seekBlockSettled(id);
    } catch (e) {
      setMediaBusyPhase(id, null);
      console.warn('[studio] upload into block failed', e);
      toast.error(t('上传失败'));
    }
  };
  /** 播放头挪到某块入场动画结束后的稳定帧:停在入场半途的帧上,内容看着像"自带透明度"。 */
  const seekBlockSettled = (id: string) => {
    const b = compRef.current.blocks.find((x) => x.id === id);
    if (!b || playingRef.current) return;
    applyT(Math.max(0, b.startSec + Math.min(Math.max(0.45, b.durationSec * 0.2), Math.max(0.01, b.durationSec - 0.06))));
  };
  /** 空组件块「AI 生成」:打开生成弹层(组件 tab),产出插入时优先填进这个空块(elementTargetRef)。 */
  const elementTargetRef = useRef<string | null>(null);
  const aiFillBlock = (id: string) => {
    elementTargetRef.current = id;
    setGenType('element');
    setFloatWin('gen');
    toast.info(t('生成后点「插入」,会填进这张组件卡'));
  };
  /** 模板面板 → 播放头处插一个该模板的新块(默认槽位数据,插完改字)。 */
  const insertTemplateBlock = (templateId: string) => {
    pushUndoSnapshot();
    const startSec = Math.max(0, Math.round(tRef.current * 10) / 10);
    const base = newBlock(templateId, { startSec });
    const b = { ...base, trackIndex: freeTrack(compRef.current.blocks, base.startSec, base.durationSec, base.trackIndex) };
    setComp((c) => ({ ...c, blocks: [...c.blocks, b] }));
    setSelectedShotId(null);
    setSelectedId(b.id);
    if (!playing) applyT(Math.max(0, startSec + 0.01));
    toast.success(t('已插入「{label}」', { label: t(b.label ?? templateId) }));
  };
  /** 生成的视频 → 设为主视频。cdn 无 CORS 头,走 /api/media/fetch 同源代理拉字节。
   *  换主视频 = 新作品(pickVideoFile 清 shots/blocks)——有内容时先确认。 */
  const setMainVideoFromUrl = async (url: string) => {
    const c = compRef.current;
    if (c.video || c.blocks.length > 0) {
      const ok = await confirm({
        title: t('替换主视频？'),
        description: t('换主视频会开始一个新作品，当前的分镜和组件会被清空。'),
        confirmLabel: t('替换'),
        tone: 'danger',
      });
      if (!ok) return;
    }
    try {
      const r = await fetch(`/api/media/fetch?url=${encodeURIComponent(url)}`);
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      await pickVideoFile(new File([blob], 'generated.mp4', { type: blob.type || 'video/mp4' }));
    } catch (e) {
      console.warn('[studio] set main video failed', e);
      toast.error(t('替换主视频失败'));
    }
  };
  /** frame 面板「使用」→ 把 frame 以 tag 挂进对话(请求带 frameId 注入 playbook),切回对话。 */
  const useFrameInChat = (f: FrameCatalogItem) => {
    openChat();
    chatRef.current?.attachFrame({ id: f.id, title: f.title, icon: f.icon, iconKey: f.iconKey ?? null });
  };
  // frame 挂上(面板「使用」/ 对话 `/` 唤起)→ 把主题 palette 落到 comp:
  // compose 的 themeForLlm 吃 comp.palette 注 token 表,生成内容从此走该主题的色板/字体/圆角。
  // 摘掉 tag 不回滚 palette(作品色板是显式状态,想换回画面派生色重跑画面分析即可)。
  const frameCatalogRef = useRef<FrameCatalogItem[]>([]);
  frameCatalogRef.current = useFrameCatalog();
  // onFrameApplied 定义早于 setPersonFx/runMatteForShot 且 deps 为空 → 经 ref 取最新实例
  const setPersonFxRef = useRef<((fx: PersonFx | undefined) => void) | null>(null);
  const runMatteForShotRef = useRef<((s: VideoShot) => Promise<void>) | null>(null);
  const onFrameApplied = useCallback((af: AttachedFrame) => {
    const f = frameCatalogRef.current.find((x) => x.id === af.id);
    if (!f) return;
    // palette + frameId 一起落文档:palette 管 token 层,frameId 让 compose 拿到设计语言简报
    setComp((c) => ({ ...c, frameId: f.id, ...(f.palette ? { palette: f.palette } : {}) }));
    // 主题声明了人像推荐(贴纸主题:主体人抠出来加贴纸描边)→ 一起落 comp.personFx,
    // 并给播放头所在分镜开抠像(有限段、进度走人像面板;全片逐段开归人像面板)
    const fx = f.personFx ? personFxFromFrame(f.personFx) : null;
    if (fx) {
      setPersonFxRef.current?.(fx);
      const tNow = playhead.get();
      const sp = clipSpans(compRef.current.shots ?? []).find((x) => tNow >= x.editedStart && tNow < x.editedEnd) ?? clipSpans(compRef.current.shots ?? [])[0];
      const s = sp?.clip;
      if (s && !s.personMatte) {
        setComp((c) => ({ ...c, shots: (c.shots ?? []).map((x) => (x.id === s.id ? { ...x, personMatte: true } : x)) }));
        void runMatteForShotRef.current?.(s);
      }
      toast.success(t('已应用「{title}」主题——画面主体加上贴纸描边,生成的内容都走这套设计', { title: f.title }));
      return;
    }
    toast.success(t('已应用「{title}」主题——之后生成的内容都走这套设计', { title: f.title }));
  }, []);
  /** 全局花字样式(花字面板 + 画布手柄共用):patch 合到当前生效样式上,全片句级花字统一吃。 */
  const setCaptionStyle = useCallback((patch: Partial<CaptionStyle>) => {
    setComp((c) => ({ ...c, captionStyle: { ...resolveCaptionStyle(c), ...patch } }));
  }, []);
  /** 字幕重铺/映射:纯函数抽到 captions-relay(离线 MCP 执行器同源复用),这里薄包一层喂 ref。 */
  const mappedCaptionSegs = (shots: VideoShot[], narr: AsrSegment[] | null): AsrSegment[] => relayMappedCaptionSegs(shots, narr, clipAsrRef.current);
  const relayCaptionLayer = (blocks: Block[], shots: VideoShot[], segs: AsrSegment[] | null): Block[] =>
    relayCaptionLayerPure(blocks, shots, segs, clipAsrRef.current);
  /** 花字面板点样式卡:**每次都从口播稿重铺整层**(拆段/映射是确定性后处理,不该吃旧块——
   *  旧块可能是拆段算法改版前铺的;转写才是唯一事实源,词替换也记在那)。没转写先自动跑 ASR;
   *  没转写但有旧花字(载入的老草稿)退化为只换样式。 */
  const captionGenBusyRef = useRef(false);
  const [capGenBusy, setCapGenBusy] = useState(false); // 面板遮罩「字幕生成中」用(ref 只防重入不触发渲染)
  const applyCaptionPreset = async (preset: string) => {
    const has = compRef.current.blocks.some(isSentenceCaption);
    if (!compRef.current.video) {
      toast.error(t('先上传视频,再应用字幕样式'));
      return;
    }
    if (captionGenBusyRef.current) return;
    captionGenBusyRef.current = true;
    setCapGenBusy(true);
    try {
      // 没有转写就跑 ASR(fileSig 缓存命中=秒回)——**不许**因"已有花字"跳过重铺:
      // 旧块可能是拆段算法改版前铺的,不重铺分段永远不生效(踩过:载草稿后转写状态为空,
      // 走了"只换样式"退化路径,用户怎么点都看不到拆段)
      let segs = asrRef.current;
      if (!segs?.length) {
        toast.info(t('正在提取口播稿…'));
        segs = await stepAsr();
      }
      const caps = captionBlocksFromAsr(mappedCaptionSegs(ensureShots(compRef.current), segs ?? []));
      if (!caps.length) {
        toast.error(t('口播稿是空的,生成不了字幕'));
        return;
      }
      pushUndoSnapshot();
      setComp((c) => ({ ...c, blocks: [...c.blocks.filter((b) => !isSentenceCaption(b)), ...caps], captionStyle: { ...resolveCaptionStyle(c), preset } }));
      // 立刻让用户看到效果(与"选中即可见"同一价值观):播放头不在任何字幕窗内时,
      // 挪到第一条字幕——否则铺完画面纹丝不动,体感"点了没生效"(用户报过)
      if (!playingRef.current && caps.length) {
        const t = tRef.current;
        const within = caps.some((b) => t >= b.startSec && t < b.startSec + b.durationSec);
        if (!within) applyT(caps[0]!.startSec + Math.min(0.3, caps[0]!.durationSec / 2));
      }
      toast.success(has ? t('已按口播稿重铺字幕并应用样式') : t('已按口播稿铺了 {n} 条字幕', { n: caps.length }));
    } catch (e) {
      console.warn('[studio] apply caption preset failed', e);
      setCaptionStyle({ preset }); // 转写失败至少把样式换上
      toast.error(t('提取口播稿失败——样式已更新,但字幕没能重新生成'));
    } finally {
      captionGenBusyRef.current = false;
      setCapGenBusy(false);
    }
  };
  /** 花字面板「移除」:撤掉整层句级花字 + 清全局样式(带 undo 快照)。 */
  const removeCaptionLayer = () => {
    const ids = compRef.current.blocks.filter(isSentenceCaption).map((b) => b.id);
    if (!ids.length) return;
    pushUndoSnapshot();
    ids.forEach((id) => postPreview({ type: 'hf:remove', id }));
    setComp((c) => ({ ...c, blocks: c.blocks.filter((b) => !isSentenceCaption(b)), captionStyle: undefined }));
    setSelectedIdRaw((s) => (s && ids.includes(s) ? null : s));
    setSelectedBlockIds((cur) => {
      const n = new Set([...cur].filter((x) => !ids.includes(x)));
      return n.size === cur.size ? cur : n;
    });
    toast.success(t('已移除字幕'));
  };
  /* ---------------- 统一生成面板(图片/视频/组件一套 chat 交互) ---------------- */
  /** 独立生成一个组件(composeBlockChecked,不进片子;历史卡片上点「插入」才进)。 */
  const generateElementStandalone = async (prompt: string, base?: GenElementResult): Promise<GenElementResult> => {
    // 底稿迭代:选了「参考」的已生成组件作为现有实现进 seed,指令=在它基础上改
    const seed = base
      ? { id: blockId('ai'), kind: 'custom', innerHtml: base.innerHtml.replaceAll(base.seedId, 'SEED_'), timelineBody: base.timelineBody.replaceAll(base.seedId, 'SEED_'), label: base.label }
      : { id: blockId('ai'), kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: '新组件' };
    if (base) {
      seed.innerHtml = seed.innerHtml.replaceAll('SEED_', seed.id);
      seed.timelineBody = seed.timelineBody.replaceAll('SEED_', seed.id);
    }
    const instruction = base
      ? `在这个组件的现有实现基础上按要求修改(没提到的部分保持原样):${prompt}`
      : `新建一个叠加组件(标题/大数字/列表/花字等,按内容自己定):${prompt}`;
    const parsed = await composeBlockChecked(seed, instruction);
    return { seedId: seed.id, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody, label: prompt.slice(0, 12) };
  };
  /** 历史卡片「插入」:重作用域 id 后落到播放头(同一素材可插多次,选择器互不打架)。
   *  有待填的空组件块(aiFillBlock 记的 elementTargetRef)时优先填进去——保留其时间窗/box/轨。 */
  /** 组件插入前的本地整形(不等 LLM 返工),用户定的容器/文字分治语义:
   *  - **内部容器跟 box 实拿尺寸走**:顶层可见元素的宽高(及绝对定位偏移)绑成相对容器的 %,
   *    角柄等比、边柄单轴,容器变多少它变多少(不是 transform 整体缩放);
   *  - **文字再按结果尺寸调**:font-size/line-height 的 px 按插入时自然尺寸标定成
   *    min(cqw,cqh) 容器查询单位——字号 = 原值 × min(宽比,高比),纯 CSS,拖动中即时跟手,
   *    不拉伸字形;
   *  - 尺寸离谱的归一(超画布压回/过小放大)直接体现在 box 选择上,内容 %/cq 自动跟随。
   *  离屏按画布尺寸渲染量取(容器 id=seedId,组件 <style> 按 #seedId 作用域才生效);
   *  offset 几何免疫 transform(入场动画不污染)。量不出 → 原样 + 默认居中框;
   *  极端溢出仍有 autofit 兜底网。 */
  const normalizeElementForInsert = (el: GenElementResult, W: number, H: number, opts?: { fullFluid?: boolean }): { innerHtml: string; box: { x: number; y: number; w: number; h: number } } => {
    const fallback = { innerHtml: el.innerHtml, box: { x: 0.14, y: 0.3, w: 0.72, h: 0.4 } };
    try {
      const host = document.createElement('div');
      host.style.cssText = `position:fixed;left:-100000px;top:0;width:${W}px;height:${H}px;overflow:hidden;visibility:hidden;pointer-events:none;`;
      const root = document.createElement('div');
      root.id = el.seedId;
      root.style.cssText = 'position:absolute;inset:0;';
      root.innerHTML = el.innerHtml;
      host.appendChild(root);
      document.body.appendChild(host);
      try {
        const rectOf = (n: HTMLElement) => {
          let x = n.offsetLeft;
          let y = n.offsetTop;
          let p = n.offsetParent as HTMLElement | null;
          while (p && p !== host) {
            x += p.offsetLeft;
            y += p.offsetTop;
            p = p.offsetParent as HTMLElement | null;
          }
          return { x, y, w: n.offsetWidth, h: n.offsetHeight };
        };
        const tops: { node: HTMLElement; rect: { x: number; y: number; w: number; h: number } }[] = [];
        const walk = (node: HTMLElement, depth: number) => {
          for (const k of Array.from(node.children) as HTMLElement[]) {
            if (k.tagName === 'STYLE' || k.tagName === 'SCRIPT') continue;
            const w = k.offsetWidth;
            const h = k.offsetHeight;
            if (w < 2 || h < 2) continue;
            if (w > W * 0.92 && h > H * 0.92 && depth < 4) walk(k, depth + 1);
            else tops.push({ node: k, rect: rectOf(k) });
          }
        };
        walk(root, 0);
        if (!tops.length) return fallback;
        const x0 = Math.min(...tops.map((t2) => t2.rect.x));
        const y0 = Math.min(...tops.map((t2) => t2.rect.y));
        const x1 = Math.max(...tops.map((t2) => t2.rect.x + t2.rect.w));
        const y1 = Math.max(...tops.map((t2) => t2.rect.y + t2.rect.h));
        const nbW = x1 - x0;
        const nbH = y1 - y0;
        if (nbW < W * 0.03 || nbH < H * 0.02) return fallback; // 量出来小得离谱=不可信
        // 基本铺满画布的组件维持原布局语义(满画布 box,内容不动);fullFluid(主题整页组件)
        // 例外:整页也全量 cq 化——以设计尺寸为标定基准,盒缩到多小内容都等比跟
        const fullBleed = nbW > W * 0.95 && nbH > H * 0.95;
        if (fullBleed && !opts?.fullFluid) return { innerHtml: el.innerHtml, box: { x: 0, y: 0, w: 1, h: 1 } };
        const pad = fullBleed ? 0 : Math.min(W, H) * 0.025; // 呼吸位:字体误差/阴影余量
        const natW = fullBleed ? W : nbW + pad * 2; // 自然容器尺寸(=不归一时的 box px):% 与 cq 的标定基准
        const natH = fullBleed ? H : nbH + pad * 2;
        const pc = (v: number) => `${Math.round(v * 1000) / 10}%`;
        for (const { node, rect } of fullBleed ? [] : tops) {
          // 顶层可见元素:尺寸绑成相对容器的 % —— 容器(蓝框)变多少,它实拿尺寸变多少
          node.style.width = pc(rect.w / natW);
          node.style.height = pc(rect.h / natH);
          if (getComputedStyle(node).position === 'absolute') {
            // 绝对定位的顶层元素:偏移一并转 %;右/下锚清掉,避免与新 left/top 双约束拉伸
            node.style.left = pc((rect.x - x0 + pad) / natW);
            node.style.top = pc((rect.y - y0 + pad) / natH);
            node.style.right = 'auto';
            node.style.bottom = 'auto';
          }
        }
        // 全量流体化:CSS 上下文(<style> 与 style="")里所有 px 按自然尺寸标定成 min(cqw,cqh)。
        // box=自然尺寸时逐值恒等;四角等比拖 = 字号/内距/圆角/SVG 尺寸全体 ×k,骨架不散;
        // 单边拖宽 = min 取到不变的高比,字号内距不动、容器实拿宽度变宽、文本重排。
        // ≤2px 细线保留(hairline 缩成亚像素会糊);@container/@media 条件行保护(条件里不许 cq 单位)。
        const cq = (n: number) => `min(${Math.round((n / natW) * 100000) / 1000}cqw,${Math.round((n / natH) * 100000) / 1000}cqh)`;
        // 负 px(卡外贴饰的 right:-14px 这类):textual '-min(...)' 是非法 CSS,整条定位会被
        // 浏览器丢弃(Botanical 印章跌到左下的元凶);负值用 max(-a,-b) 与正值 min 缩放语义镜像
        const ncq = (n: number) => `max(${-(Math.round((n / natW) * 100000) / 1000)}cqw,${-(Math.round((n / natH) * 100000) / 1000)}cqh)`;
        const fluidCss = (css: string) => {
          const guards: string[] = [];
          return css
            .replace(/@(?:container|media|supports)[^{]*/g, (m) => {
              guards.push(m);
              return `@@HFG${guards.length - 1}@@`;
            })
            .replace(/(-?\d+(?:\.\d+)?)px/gi, (m, n: string) => {
              const v = parseFloat(n);
              if (Math.abs(v) <= 2) return m;
              return v > 0 ? cq(v) : ncq(-v);
            })
            .replace(/@@HFG(\d+)@@/g, (_m, i: string) => guards[Number(i)]!);
        };
        const html = root.innerHTML
          .replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, css: string) => `<style${attrs}>${fluidCss(css)}</style>`)
          .replace(/style="([^"]*)"/gi, (_m, css: string) => `style="${fluidCss(css)}"`);
        // 外包一层容器查询基准(container-type:size):cqw/cqh 恒相对组件容器而非画布
        const wrapped = `<div style="position:absolute;inset:0;container-type:size;">\n${html}\n</div>`;
        if (fullBleed) return { innerHtml: wrapped, box: { x: 0, y: 0, w: 1, h: 1 } };
        // 尺寸归一直接选 box:超画布压回主体尺度、小得看不清放大一档,内容 %/cq 自动跟随
        let k = 1;
        if (nbW > 0.88 * W || nbH > 0.8 * H) k = Math.min((0.78 * W) / nbW, (0.7 * H) / nbH);
        else if (nbW < 0.22 * W && nbH < 0.22 * H) k = Math.min((0.4 * W) / nbW, (0.35 * H) / nbH);
        k = Math.max(0.3, Math.min(2.5, k));
        const bw = Math.min(W, natW * k);
        const bh = Math.min(H, natH * k);
        const bx = Math.max(0, Math.min(W - bw, x0 + nbW / 2 - bw / 2)); // 同心放置,钳回画布
        const by = Math.max(0, Math.min(H - bh, y0 + nbH / 2 - bh / 2));
        const r4 = (v: number) => Math.round(v * 10000) / 10000;
        return { innerHtml: wrapped, box: { x: r4(bx / W), y: r4(by / H), w: r4(bw / W), h: r4(bh / H) } };
      } finally {
        host.remove();
      }
    } catch {
      return fallback;
    }
  };
  const insertGeneratedElement = (el: GenElementResult, prompt: string, atSec?: number) => {
    // 本地整形一次,两个分支共用:内部容器 %-绑定 + 字号 cq 化(回填进组件卡时内容也随卡的 box 自适应)
    const dW = el.designW ?? compRef.current.width;
    const dH = el.designH ?? compRef.current.height;
    const geom = normalizeElementForInsert(el, dW, dH, { fullFluid: !!(el.designW && el.designH) });
    if (el.designW && el.designH) {
      // 设计坐标 → 画布:先取画布内按设计宽高比的适配窗(与预览同一形态)。
      // 整页件(量出满幅)=整个适配窗;叠加件(量出自己的小盒)=把小盒映射进适配窗,
      // 选中框贴件本体而不是罩半屏
      const W = compRef.current.width;
      const H = compRef.current.height;
      const ar = el.designW / el.designH;
      let w = 0.96;
      let h = (W * w) / ar / H;
      if (h > 0.96) {
        h = 0.96;
        w = (H * h * ar) / W;
      }
      const win = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
      const full = geom.box.w > 0.98 && geom.box.h > 0.98;
      geom.box = full
        ? win
        : { x: win.x + geom.box.x * win.w, y: win.y + geom.box.y * win.h, w: geom.box.w * win.w, h: geom.box.h * win.h };
    }
    // 独立性烘焙:主题组件自带 data-hf-baked(主题 token 已随身);其余组件在此按当前
    // 主题快照 token 进块作用域——插入后换主题/改别的组件都不影响它(用户定的独立语义)
    if (!geom.innerHtml.includes('data-hf-baked')) {
      geom.innerHtml += `\n<style data-hf-baked>#${el.seedId}{${themeVarsCss(getTheme(compRef.current.theme), compRef.current.palette)}}</style>`;
    }
    const targetId = elementTargetRef.current;
    const tb = targetId ? compRef.current.blocks.find((b) => b.id === targetId) : null;
    const tbSlots = tb?.slots as { media?: { url?: string }; spec?: unknown } | undefined;
    if (tb && blockKind(tb) === 'media' && !tbSlots?.media?.url && typeof tbSlots?.spec !== 'string') {
      elementTargetRef.current = null;
      pushUndoSnapshot();
      setComp((c) => ({
        ...c,
        blocks: c.blocks.map((b) =>
          b.id === tb.id
            ? {
                ...b,
                templateId: 'custom',
                slots: { innerHtml: geom.innerHtml.replaceAll(el.seedId, tb.id), timelineBody: el.timelineBody.replaceAll(el.seedId, tb.id), ...(el.presetId ? { presetId: el.presetId } : {}) },
                label: el.label || prompt.slice(0, 12),
              }
            : b,
        ),
      }));
      setSelectedShotId(null);
      setSelectedId(tb.id);
      if (!playing) applyT(Math.max(0, tb.startSec + 0.01));
      toast.success(t('已填入组件卡'));
      return;
    }
    pushUndoSnapshot();
    const newId = blockId('cst');
    const at = Math.max(0, Math.round((atSec ?? tRef.current) * 100) / 100);
    // 落 box 才有选中框/拖移/缩放手柄(无 box 的块选不出边框,用户拖入画布后没法调)
    const nb: Block = {
      id: newId,
      templateId: 'custom',
      slots: { innerHtml: geom.innerHtml.replaceAll(el.seedId, newId), timelineBody: el.timelineBody.replaceAll(el.seedId, newId), ...(el.presetId ? { presetId: el.presetId } : {}) },
      startSec: at,
      durationSec: 3,
      trackIndex: freeTrack(compRef.current.blocks, at, 3),
      label: el.label || prompt.slice(0, 12),
      box: geom.box,
    };
    setComp((c) => ({ ...c, blocks: [...c.blocks, nb] }));
    if (nb.box) setPendingInsert(nb.box);
    setSelectedShotId(null);
    setSelectedId(newId);
    if (!playing) applyT(Math.max(0, nb.startSec + 0.01));
    toast.success(t('已插入组件'));
  };
  /** 层级:块间上/下移一层(trackIndex±1,DOM 序即叠层;0=视频,夹 [1,55])。 */
  const bumpBlockLayer = (b: Block, dir: 1 | -1) => {
    pushUndoSnapshot();
    setComp((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === b.id ? { ...x, trackIndex: Math.max(1, Math.min(55, x.trackIndex + dir)) } : x)) }));
  };
  /** 块级人像层覆盖:在人像上/垫到人像后互切(缺省跟全局 personFront,见 engine Block.personLayer)。 */
  const togglePersonLayer = (b: Block) => {
    pushUndoSnapshot();
    const behindNow = b.personLayer ? b.personLayer === 'behind' : !!compRef.current.personFx?.personFront;
    setComp((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === b.id ? { ...x, personLayer: behindNow ? 'front' : 'behind' } : x)) }));
  };
  /** 浮动条「存为组件」:画布上的 custom 块以当前样子存进素材库(快照拷贝,存后再改
   *  互不影响;seedId=块 id,插入端照常重作用域)。同一块重复存=覆盖同一条。 */
  const saveBlockAsElement = (b: Block) => {
    const slots = b.slots as { innerHtml?: string; timelineBody?: string };
    if (typeof slots.innerHtml !== 'string') return;
    // 快照语义:块身上已有烘焙 token(主题组件/此前插入时烤过)= 原样保存——**不许**
    // 剥旧烤新,否则存的时候受当前挂载主题污染(用户点名的链路错);只有没烤过的
    // (旧块/AI 直出)才补当前主题快照
    const baked = slots.innerHtml.includes('data-hf-baked')
      ? slots.innerHtml
      : `${slots.innerHtml}\n<style data-hf-baked>#${b.id}{${themeVarsCss(getTheme(compRef.current.theme), compRef.current.palette)}}</style>`;
    addElementEntry({
      id: `saved:${b.id}`,
      prompt: b.label || t('画布组件'),
      createdAt: Date.now(),
      element: { seedId: b.id, innerHtml: baked, timelineBody: slots.timelineBody ?? '', label: b.label || t('组件'), ...((b.slots as { presetId?: string }).presetId ? { presetId: (b.slots as { presetId?: string }).presetId } : {}) },
    });
    setGenRefreshTick((n) => n + 1); // 素材库重拉,立刻可见
    toast.success(t('已存为组件(素材库 · 组件)'));
  };
  /** 浮动条「同步内容」:把组件的 data-edit 文字槽按块时间窗的口播稿一键填充
   *  (预置组件文案=通用占位,拖入后靠这一步对上内容)。槽按 DOM 序以 index 认领
   *  (key 可能重复);文字替换只动 textContent,布局/动效原样。 */
  const [syncBusyId, setSyncBusyId] = useState<string | null>(null);
  const syncBlockContent = async (b: Block) => {
    const fill = studioProviders().syncFill;
    if (!fill || syncBusyId) return;
    const slots = b.slots as { innerHtml?: string };
    if (typeof slots.innerHtml !== 'string') return;
    const doc = new DOMParser().parseFromString(`<div id="__root">${slots.innerHtml}</div>`, 'text/html');
    const nodes = Array.from(doc.querySelectorAll('#__root [data-edit]'));
    const items = nodes.map((n, i) => ({ index: i, text: (n.textContent ?? '').trim() })).filter((x) => x.text);
    if (!items.length) {
      toast.error(t('这个组件没有可填充的文字槽'));
      return;
    }
    // 口播窗:成片时间与块窗重叠(±3s 呼吸位)的句子;一句都没有就取最近的两句。
    // 转写引用没水合(旧项目/上下文缺失)时退回**字幕块自身**取稿——画面上有字幕
    // 就必有稿,不能再报"没有口播稿"(用户踩过)。
    let segs = mappedCaptionSegs(ensureShots(compRef.current), asrRef.current);
    if (!segs.length) {
      segs = compRef.current.blocks
        .filter(isSentenceCaption)
        .map((cb) => ({ start: cb.startSec, end: cb.startSec + cb.durationSec, text: cb.label || '' }))
        .filter((x) => !!x.text) as typeof segs;
    }
    const s0 = b.startSec - 3;
    const s1 = b.startSec + b.durationSec + 3;
    let win = segs.filter((x) => x.end > s0 && x.start < s1);
    if (!win.length && segs.length) {
      const mid = b.startSec + b.durationSec / 2;
      win = [...segs].sort((a, c) => Math.abs((a.start + a.end) / 2 - mid) - Math.abs((c.start + c.end) / 2 - mid)).slice(0, 2);
    }
    if (!win.length) {
      toast.error(t('还没有口播稿——先提取口播(智能剪口播/字幕面板)再同步'));
      return;
    }
    setSyncBusyId(b.id);
    try {
      // 稿子带时间戳(句范围+词级时间):LLM 一次通过给「文案 + 该内容被讲到的时刻 at」
      // ——目的用通用语言描述在服务端 system 里,不枚举组件形态(用户定的)
      const script = win
        .map((x) => {
          const wl = x.words?.length ? `\n  words: ${x.words.map((w) => `${w.start.toFixed(2)}|${w.text}`).join(' ')}` : '';
          return `[${x.start.toFixed(2)}-${x.end.toFixed(2)}] ${x.text}${wl}`;
        })
        .join('\n');
      const curTlb = (b.slots as { timelineBody?: string }).timelineBody ?? '';
      const out = await fill(items, script, { html: slots.innerHtml, timeline: curTlb, id: b.id });
      const byIndex = new Map(out.items.map((x) => [x.index, x.text]));
      const byIndexAt = new Map(out.items.filter((x) => typeof x.at === 'number').map((x) => [x.index, x.at!]));
      // 组件=强参考(用户定的):LLM 可整体改结构(3 条列表按稿长成 4 条)。
      // html 过校验=整体替换;没给/不过=退回槽补丁(只换文字)
      let nextHtml: string;
      const okHtml =
        typeof out.html === 'string' &&
        out.html.includes('data-edit') &&
        out.html.includes(`#${b.id}`) && // 样式作用域必须还是本块 id(防串块/丢作用域)
        !/<script/i.test(out.html);
      if (okHtml) {
        nextHtml = out.html!;
      } else {
        nodes.forEach((n, i) => {
          const t = byIndex.get(i);
          if (t) n.textContent = t;
        });
        nextHtml = doc.querySelector('#__root')!.innerHTML;
      }
      // 同步时间轴①窗对齐:首选 LLM 给的 span(它剔除了与组件无关的前后句——此前用
      // "重叠窗 min/max"会把无关前段也圈进来,用户踩过);没给再落重叠窗口径
      const winLo = Math.min(...win.map((x) => x.start));
      const winHi = Math.max(...win.map((x) => x.end));
      const spanFrom = out.span ? Math.min(Math.max(out.span.from, winLo - 1), winHi) : winLo;
      const spanTo = out.span ? Math.max(Math.min(out.span.to, winHi + 1), spanFrom + 1) : winHi;
      const newStart = Math.max(0, Math.round(spanFrom * 100) / 100);
      const newDur = Math.max(1.5, Math.round((spanTo - newStart) * 100) / 100);
      // 同步时间轴②预置节拍:各段主槽新文案在口播词流里定位 → 登场时刻重建时间轴
      // (词级时间戳是我们的独门;找不到的段留给构建器默认节奏)
      // 同步时间轴②:LLM 看着组件真实 HTML 直接改写 timelineBody(通用——它读到什么
      // 选择器就瞄什么,不依赖预置类名;此前按 preset 枚举构建器被用户否了)。
      // 应用前 new Function 编译校验(语法坏=保留原时间轴,内容照样同步)。
      let nextTlb: string | null = null;
      if (out.timeline) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          new Function('tl', out.timeline);
          nextTlb = out.timeline;
        } catch {
          /* 编译不过:丢弃,保留原时间轴 */
        }
      }
      pushUndoSnapshot();
      setComp((c) => ({
        ...c,
        blocks: c.blocks.map((x) =>
          x.id === b.id
            ? { ...x, startSec: newStart, durationSec: newDur, slots: { ...x.slots, innerHtml: nextHtml, ...(nextTlb ? { timelineBody: nextTlb } : {}) } }
            : x,
        ),
      }));
      toast.success(nextTlb ? t('已同步内容与节奏(块已对齐这段口播)') : t('已同步内容并对齐口播(节奏未变:时间轴改写没通过校验)'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('同步失败,稍后再试'));
    } finally {
      setSyncBusyId(null);
    }
  };
  /** 历史卡片「@引用」:素材塞进右侧 agent 输入框(只填不发),切到对话接着说怎么用。 */
  const mentionAsset = (text: string) => {
    openChat();
    chatRef.current?.insertText(text);
  };

  // 时间轴拖块:移动(钳进 [0, dur])/ 两端裁剪。生成中的块不让动(时间窗已喂给 worker)
  const moveBlock = (id: string, startSec: number) => {
    if (genLockToast(id)) return;
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, startSec: Math.max(0, Math.round(startSec * 100) / 100) } : b)) }));
  };
  const resizeBlock = (id: string, startSec: number, durationSec: number) => {
    if (genLockToast(id)) return;
    setComp((c) => ({
      ...c,
      blocks: c.blocks.map((b) =>
        b.id === id ? { ...b, startSec: Math.max(0, Math.round(startSec * 100) / 100), durationSec: Math.max(0.3, Math.round(durationSec * 100) / 100) } : b,
      ),
    }));
  };
  // 确保有覆盖整条视频的片段(没分镜时给一个整段),供裁剪操作落手
  const ensureShots = (c: Composition): VideoShot[] =>
    c.shots && c.shots.length ? c.shots : c.video ? [{ id: shotId(), srcStart: 0, srcEnd: c.video.durationSec, treatment: 'full' as const }] : [];

  /** 读远端视频时长(仅 metadata)。流式 webm(MediaRecorder 产物)metadata 阶段
   *  duration=Infinity:seek 到超大值逼浏览器算出真实时长(经典解法),3s 兜底。
   *  刚上传完的 URL 可能撞 CDN 传播延迟(首拉 404):失败重试 2 次,间隔 1.2s。 */
  const videoDurationOf = async (url: string): Promise<number | null> => {
    for (let i = 0; i < 3; i++) {
      const d = await videoDurationOnce(url);
      if (d != null) return d;
      await new Promise((r) => setTimeout(r, 1200));
    }
    return null;
  };
  const videoDurationOnce = (url: string): Promise<number | null> =>
    new Promise((res) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      let settled = false;
      const done = (d: number | null) => {
        if (settled) return;
        settled = true;
        res(d);
      };
      const dur = () => (Number.isFinite(v.duration) && v.duration > 0.1 ? v.duration : null);
      v.onerror = () => done(null);
      v.onloadedmetadata = () => {
        if (dur() != null) return done(dur());
        v.ondurationchange = () => {
          if (dur() != null) done(dur());
        };
        v.currentTime = 1e7;
        setTimeout(() => done(dur()), 3000);
      };
      v.src = url;
    });
  /** 外部片段插入进行中(读时长/抽帧)的落点(成片秒):时间轴在该处亮「插入中」徽标。 */
  const [clipPending, setClipPending] = useState<number | null>(null);
  /** 外部插入段的缩率图(**src → 帧**,t=该源自己的源时间):主 filmstrip 只属于主视频,
   *  插入段按**源**抽一份、同源全部片段共享——分割/删除只是换区间,不重抽(按 shot.id 抽过
   *  一轮:分割右半是新 id,整条重抽,大文件上就是肉眼可见的缩率图重绘闪动)。 */
  const [clipStrips, setClipStrips] = useState<Record<string, FilmstripFrame[]>>({});
  const clipStripReqRef = useRef<Set<string>>(new Set()); // 已请求的源(含进行中),防重复抽
  useEffect(() => {
    const bySrc = new Map<string, number>(); // src → 覆盖到的最大源时间
    for (const s of comp.shots ?? []) if (s.src) bySrc.set(s.src, Math.max(bySrc.get(s.src) ?? 0, s.srcEnd));
    for (const [src, maxEnd] of bySrc) {
      if (clipStripReqRef.current.has(src)) continue;
      clipStripReqRef.current.add(src);
      const upTo = Math.max(0.5, maxEnd);
      void (async () => {
        try {
          let f: File;
          if (src.startsWith('blob:')) {
            const lf = clipFilesRef.current.get(src); // 本地模式:File 就在手上,零下载
            if (!lf) {
              clipStripReqRef.current.delete(src); // File 还没到位(恢复中):撤销占位,src 复活后重试
              return;
            }
            f = lf;
          } else {
            const r = await fetch(`/api/media/fetch?url=${encodeURIComponent(src)}`);
            if (!r.ok) throw new Error(String(r.status));
            const blob = await r.blob();
            f = new File([blob], 'clip.mp4', { type: blob.type || 'video/mp4' });
          }
          await extractFilmstrip(f, upTo, Math.min(60, Math.max(4, Math.round(upTo))), (fr) => {
            setClipStrips((m) => ({ ...m, [src]: [...(m[src] ?? []), fr].sort((a, b) => a.t - b.t) }));
          });
        } catch (e) {
          console.warn('[studio] clip filmstrip failed', e);
        }
      })();
    }
  }, [comp.shots]);
  /** 最近分割点(0 + 各镜末端)。 */
  const nearestShotBound = (shots: VideoShot[], t: number) => {
    let at = 0;
    let idx = 0;
    let best = Infinity;
    [0, ...clipSpans(shots).map((x) => x.editedEnd)].forEach((b, i) => {
      const d = Math.abs(b - t);
      if (d < best) {
        best = d;
        at = b;
        idx = i;
      }
    });
    return { at, idx };
  };
  /** 插入核心:外部片段落到最近分割点(平权片段:取景/抠像/音频/字幕与主源一致)。
   *  边界之后的叠加块整体右移 —— removeEditedInterval 的镜像。file=本地模式(blob url)。 */
  const insertClipCore = (url: string, clipDur: number, atWish: number, file?: File): string => {
    pushUndoSnapshot();
    // 叙事结构变了:旧规划作废。缓存的 plan 不知道有这一拍,命中缓存的 lay_out 会
    // 当它不存在(场景跨插入窗/占位张冠李戴),重规划才能把插入段当独立一拍对待。
    setPlan(null);
    planRef.current = null;
    const shots = ensureShots(compRef.current);
    const { at, idx } = nearestShotBound(shots, atWish);
    if (file) clipFilesRef.current.set(url, file);
    if (file) backupMediaToCloud(file, fileSig(file), 'clip'); // 插入源同样进云端字节汇合点
    const nb: VideoShot = { id: shotId(), src: url, ...(file ? { srcSig: fileSig(file) } : {}), srcStart: 0, srcEnd: clipDur, treatment: 'full' };
    setComp((c) => ({
      ...c,
      shots: [...shots.slice(0, idx), nb, ...shots.slice(idx)],
      blocks: c.blocks.map((b) => (b.startSec >= at - 1e-3 ? { ...b, startSec: b.startSec + clipDur } : b)),
    }));
    setSelectedId(null);
    setSelectedShotId(nb.id);
    applyT(at + Math.min(0.1, clipDur / 2));
    toast.success(t('已插入片段'));
    // 字幕/翻译已开着 → 新片段自动跟上(转写→重铺字幕;选过目标语言再自动补同语言译文)
    if (compRef.current.blocks.some(isSentenceCaption)) void autoCaptionNewClip(url, nb.id);
    return nb.id;
  };
  /** 新插入片段的字幕/翻译自动补全:增益性质,失败静默(面板/agent 仍可手动补)。 */
  const autoCaptionNewClip = async (src: string, insertedShotId: string) => {
    const relay = () => setComp((cur) => ({ ...cur, blocks: relayCaptionLayer(cur.blocks, ensureShots(cur), asrRef.current) }));
    // 插入已让成片时间整体移位/句子被切开:**先无条件重铺一次**(跨插入点的句子按新
    // 时间拆条)。静帧/静音片段没有可转写语音,到这一步字幕就已经正确——此前把重铺
    // 押在"新片段转写出句子"之后,静音片段一早 return,字幕整层停在旧时间上(用户报的)。
    try {
      relay();
    } catch {
      /* 同下:自动补全失败不打扰 */
    }
    try {
      await ensureClipTranscripts(); // 新源按需转写(缓存/失败黑名单内部处理)
      const segs = clipAsrRef.current[src];
      if (!segs?.length) return;
      relay(); // 新源句子进层
      // 面板选过目标语言 → 新片段自动补同语言译文(与手动翻译同一执行器落数据)
      const lang = resolveCaptionStyle(compRef.current).sub?.lang;
      const t = studioProviders().translate;
      if (lang && t) {
        const out = await t(segs.map((x, i) => ({ index: i, text: x.text })), lang);
        if (out.length) await runStudioTool('set_caption_translations', { shotId: insertedShotId, items: out });
      }
    } catch {
      /* 自动补全失败不打扰:字幕面板/agent 都能手动补 */
    }
  };
  /** 草稿恢复:本地插入段的 src 是死 blob——按 srcSig 从 OPFS 取回 File,重建 blob src。
   *  同 src 的分割两半共享一次取回;取不到的保持原样(卡面垫底色,预览黑段,不比之前更糟)。 */
  const recoverLocalClips = async (shots: VideoShot[]) => {
    const remap = new Map<string, string>(); // 旧 src → 新 blob src
    for (const s of shots) {
      if (!s.src || !s.srcSig || remap.has(s.src) || clipFilesRef.current.has(s.src)) continue;
      let f = await loadLocalVideo(s.srcSig);
      if (!f && cloudMediaRef.current.clips?.[s.srcSig]) f = await studioProviders().vault.fetch(s.srcSig); // 云端字节汇合点兜底
      if (!f) continue;
      void saveLocalVideo(f, s.srcSig); // 云端取回的落回本地库,下次秒开
      const url = URL.createObjectURL(f);
      clipFilesRef.current.set(url, f);
      remap.set(s.src, url);
    }
    if (remap.size) {
      setComp((c) => ({ ...c, shots: (c.shots ?? []).map((s) => (s.src && remap.has(s.src) ? { ...s, src: remap.get(s.src)! } : s)) }));
    }
    // 没找回的死链(blob src 且 File 不在):明说并指路重连——此前静默黑段,
    // 而主视频同情形有「重新导入」提示,插入段平权也该有自己的修复路径
    const dead = new Set(
      shots.map((s) => s.src).filter((src): src is string => !!src && src.startsWith('blob:') && !remap.has(src) && !clipFilesRef.current.has(src)),
    );
    if (dead.size) toast.error(t('{n} 个插入片段的源文件没找回(预览是黑段)——点选该片段,在取景面板里重新选择文件接回', { n: dead.size }));
  };

  /** 死链插入段重连:重新选文件接回(srcSig 校验是不是原文件;同源分割的几段一起接)。 */
  const reconnectClip = async (shotId: string) => {
    const s = (compRef.current.shots ?? []).find((x) => x.id === shotId);
    if (!s?.src) return;
    const f = await pickFile('video/*');
    if (!f) return;
    const sig = fileSig(f);
    if (s.srcSig && sig !== s.srcSig) {
      toast.error(t('这不是原来的那个文件(校验不一致)——换文件会改变画面,已取消。要换画面请删掉这段重新插入'));
      return;
    }
    backupMediaToCloud(f, sig, 'clip'); // 手动接回的同样进云端汇合点,下次换设备不再要人
    const url = URL.createObjectURL(f);
    clipFilesRef.current.set(url, f);
    void saveLocalVideo(f, sig).catch(() => {});
    const old = s.src;
    setComp((c) => ({ ...c, shots: (c.shots ?? []).map((x) => (x.src === old ? { ...x, src: url, srcSig: sig } : x)) }));
    toast.success(t('已接回插入片段'));
  };
  /** 图片 → 5 秒静态帧视频(用户定的默认口径):canvas 定格 + MediaBunny avc mp4,
   *  无音轨=静音片段。走视频形态而不是给 shot 造图片分支——裁剪/分割/取景/字幕/导出
   *  全链路零改动自动成立。30fps 全同帧,编码近零成本;尺寸夹 1920 内且取偶(avc 要求)。 */
  const STILL_CLIP_SEC = 5;
  const stillClipFromImage = async (blob: Blob, label?: string): Promise<File | null> => {
    try {
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
      const w = Math.max(2, Math.round((bmp.width * scale) / 2) * 2);
      const h = Math.max(2, Math.round((bmp.height * scale) / 2) * 2);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const { BufferTarget, CanvasSource, Mp4OutputFormat, Output } = await import('mediabunny');
      const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
      const source = new CanvasSource(canvas, { codec: 'avc', bitrate: 2_000_000 });
      output.addVideoTrack(source, { frameRate: 30 });
      await output.start();
      for (let i = 0; i < STILL_CLIP_SEC * 30; i++) await source.add(i / 30, 1 / 30);
      await output.finalize();
      const buf = (output.target as { buffer: ArrayBuffer | null }).buffer;
      if (!buf) return null;
      // 文件名带尺寸+标签:fileSig=name:size:0,纯 'still.mp4' 撞 size 就撞 sig(云备份/OPFS 串档)
      const name = `still-${w}x${h}-${(label || 'image').replace(/[^\w一-龥-]/g, '').slice(0, 24) || 'image'}.mp4`;
      return new File([buf], name, { type: 'video/mp4', lastModified: 0 });
    } catch (e) {
      console.warn('[studio] still clip encode failed', e);
      return null;
    }
  };
  /** 素材库图片/视频拖上主轨 = 插入片段(2026-07-17 用户定的,把"视频拖入主轨已砍"
   *  翻案回来——当年砍的是 OS 文件拖入,库素材有直链有缓存,体验成立)。字节先走素材
   *  直链(cdn CORS 已放行),失败 /api/media/fetch 同源代理;之后与「+」按钮同一条
   *  insertClipCore(OPFS/云备份/字幕自动跟上全复用)。 */
  const insertLibraryClipAt = async (a: MediaRef & { label?: string }, at: number) => {
    setClipPending(at);
    try {
      let blob: Blob | null = null;
      try {
        const r = await fetch(a.url);
        if (r.ok) blob = await r.blob();
      } catch {
        /* CORS/网络 → 代理兜底 */
      }
      if (!blob) {
        const r = await fetch(`/api/media/fetch?url=${encodeURIComponent(a.url)}`).catch(() => null);
        if (r?.ok) blob = await r.blob();
      }
      if (!blob) {
        toast.error(t('拉取素材失败,稍后再试'));
        return;
      }
      if (a.type === 'video') {
        const name = `clip-${(a.label || 'video').replace(/[^\w一-龥-]/g, '').slice(0, 24) || 'video'}.mp4`;
        const f = new File([blob], name, { type: blob.type || 'video/mp4', lastModified: 0 });
        const url = URL.createObjectURL(f);
        const dur = await videoDurationOf(url);
        if (!dur) {
          URL.revokeObjectURL(url);
          toast.error(t('读取视频时长失败(换 mp4/mov 试试)'));
          return;
        }
        void saveLocalVideo(f, fileSig(f)).catch(() => {});
        insertClipCore(url, Math.round(dur * 100) / 100, at, f);
      } else {
        const f = await stillClipFromImage(blob, a.label);
        if (!f) {
          toast.error(t('图片转片段失败'));
          return;
        }
        const url = URL.createObjectURL(f);
        void saveLocalVideo(f, fileSig(f)).catch(() => {});
        insertClipCore(url, STILL_CLIP_SEC, at, f);
      }
    } finally {
      setClipPending(null);
    }
  };
  /** 分镜边界「+」:选本地视频 → 在该分割点插入。与主视频一致**留在本地不上传**
   *  (用户定的;之前走上传还撞 200MB 直传上限)——blob 预览,File 经 hf:clipFile 注进 iframe。 */
  const insertLocalClipAt = async (at: number) => {
    const f = await pickFile('video/*');
    if (!f) return;
    setClipPending(at);
    try {
      const url = URL.createObjectURL(f);
      const dur = await videoDurationOf(url);
      if (!dur) {
        URL.revokeObjectURL(url);
        toast.error(t('读取视频时长失败(换 mp4/mov 试试)'));
        return;
      }
      void saveLocalVideo(f, fileSig(f)); // OPFS 本地库:草稿恢复按 srcSig 取回
      insertClipCore(url, Math.round(dur * 100) / 100, at, f);
    } finally {
      setClipPending(null);
    }
  };

  /** 口播稿面板的剪刀:删一批(源,源时间区间)(删句/删空白/删语气词共用,映射数学在
   *  trim.removeSrcRanges);按源分组各算各的(源时间轴独立),叠加块按删除发生顺序依次
   *  压缩;一次性 setComp(重建只闪一次)。 */
  const cutSrcRanges = (cuts: ScriptCut[], msg: string) => {
    const c0 = compRef.current;
    if (!c0.video || !cuts.length) return;
    pushUndoSnapshot();
    const groups = new Map<string | null, [number, number][]>();
    for (const it of cuts) groups.set(it.src, [...(groups.get(it.src) ?? []), it.range]);
    let shots = ensureShots(c0);
    let blocks = c0.blocks;
    let cut = 0;
    for (const [src, ranges] of groups) {
      const r = removeSrcRanges(shots, ranges, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }), (c) => (c.src ?? null) === src);
      cut += r.removed.reduce((a, [x, y]) => a + (y - x), 0);
      // 非字幕块按删除区间压缩;字幕层最后整层重算(字幕=转写的纯计算产物,词时间必须跟新剪辑)
      blocks = r.removed.reduce((bs, [a, b]) => removeEditedInterval(bs, a, b), blocks);
      shots = r.clips;
    }
    if (cut < 0.01) {
      toast.info(t('这些区间已经不在片子里了'));
      return;
    }
    blocks = relayCaptionLayer(blocks, shots, asrRef.current);
    setComp((c) => ({ ...c, shots, blocks }));
    setSelectedShotId(null);
    setSelectedId(null);
    const lastSp = clipSpans(shots);
    const newDur = lastSp.length ? lastSp[lastSp.length - 1]!.editedEnd : 0;
    applyT(Math.max(0, Math.min(tRef.current, Math.max(0, newDur - 0.05))));
    toast.success(t('{msg}(⌘Z 撤销)', { msg }));
  };
  /** 口播稿面板「恢复」:把删掉的(源,源区间)接回片子(缺口并回同源相邻镜或插新镜),
   *  恢复点之后的叠加块右移恢复的时长,保持与内容对齐。 */
  const restoreSrcRanges = (cuts: ScriptCut[], msg: string) => {
    const c0 = compRef.current;
    if (!c0.video || !cuts.length) return;
    pushUndoSnapshot();
    let shots = ensureShots(c0);
    let blocks = c0.blocks;
    let restored = 0;
    for (const { src, range: [s, e] } of cuts) {
      const before = shots;
      const inSrc = (c: VideoShot) => (c.src ?? null) === src;
      // 插入源整个不在片子里 = 没有锚点也没有 srcSig,恢复不了(面板只对在场源出词,理论到不了)
      if (src && !before.some(inSrc)) continue;
      const srcSig = src ? before.find((c) => c.src === src)?.srcSig : undefined;
      const durBefore = clipSpans(before).at(-1)?.editedEnd ?? 0;
      shots = restoreSrcRange(
        before,
        s,
        e,
        (a, b) => ({ id: shotId(), ...(src ? { src, ...(srcSig ? { srcSig } : {}) } : {}), srcStart: a, srcEnd: b, treatment: 'full' as const }),
        (c) => !c.partnerBlockId,
        inSrc,
      );
      if (shots === before) continue;
      const durAfter = clipSpans(shots).at(-1)?.editedEnd ?? 0;
      const len = durAfter - durBefore;
      if (len <= 0.01) continue;
      restored += len;
      // 恢复段的成片起点:新 shots 上 s 的落点(只认同源片段,不同源的秒数会数值撞车);其后的块整体右移
      const sp = clipSpans(shots).find((x) => inSrc(x.clip) && s >= x.clip.srcStart - 1e-3 && s < x.clip.srcEnd);
      const at = sp ? sp.editedStart + Math.max(0, s - sp.clip.srcStart) : 0;
      blocks = blocks.map((b) => (b.startSec >= at - 1e-3 ? { ...b, startSec: b.startSec + len } : b));
    }
    if (restored < 0.01) {
      toast.info(t('这段内容本来就在片子里'));
      return;
    }
    const relaid = relayCaptionLayer(blocks, shots, asrRef.current);
    setComp((c) => ({ ...c, shots, blocks: relaid }));
    setSelectedShotId(null);
    toast.success(t('{msg}(⌘Z 撤销)', { msg }));
  };
  /** 口播稿面板「替换词」:改转写(词+句文本),字幕层随之**整层重算**(字幕=转写的纯计算产物,
   *  改词可能改变段宽 → 分段边界会动,逐块补丁跟不上)。只改文字不动音频。src 定位是哪个源的稿。 */
  const replaceScriptWord = (src: string | null, si: number, word: { start: number; end: number }, text: string) => {
    const txt = text.trim();
    if (!txt) return;
    const isSame = (x: { start: number; end: number }) => Math.abs(x.start - word.start) < 1e-3 && Math.abs(x.end - word.end) < 1e-3;
    const patchSent = (s: AsrSegment): AsrSegment => {
      const words = (s.words?.length ? s.words : wordsFromText(s.text, s.start, s.end)).map((w) => (isSame(w) ? { ...w, text: txt } : w));
      return { ...s, words, text: words.map((w) => w.text).join('') };
    };
    if (src == null) {
      const prev = asrRef.current;
      if (!prev?.[si]) return;
      const next = [...prev];
      next[si] = patchSent(prev[si]!);
      setAsrSentences(next);
      asrRef.current = next; // 立刻镜像(状态镜像在下次渲染才写):下面的重算要读最新转写
    } else {
      const list = clipAsrRef.current[src];
      if (!list?.[si]) return;
      const next = { ...clipAsrRef.current, [src]: list.map((x, i) => (i === si ? patchSent(x) : x)) };
      setClipAsr(next);
      clipAsrRef.current = next;
    }
    setComp((c) => ({ ...c, blocks: relayCaptionLayer(c.blocks, ensureShots(c), asrRef.current) }));
    toast.success(t('已替换为「{text}」', { text: txt }));
  };
  /** 口播稿面板的「提取口播稿」(转圈防连点;错误吐 toast)。 */
  const [asrBusy, setAsrBusy] = useState(false);
  const asrBusyRef = useRef(false);
  const extractForScript = async () => {
    if (asrBusyRef.current) return;
    asrBusyRef.current = true;
    setAsrBusy(true);
    try {
      await stepAsr();
    } catch (e) {
      console.warn('[studio] extract asr failed', e);
      toast.error(t('提取口播稿失败'));
    } finally {
      asrBusyRef.current = false;
      setAsrBusy(false);
    }
  };
  // 打开口播稿面板即自动提取(不用再点按钮):fileSig 缓存命中秒回;没缓存跑一次 ASR。
  // 只在 asrSentences 还是 null(从没提取过)时触发——空数组=提取过但没内容,不重试打转
  useEffect(() => {
    if (floatWin !== 'script' || !comp.video || asrSentences != null) return;
    void extractForScript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, comp.video, asrSentences]);

  /** 剪开:在播放头把当前片段一分为二(内容不变)。先算后推快照——落在边界上没剪成时
   *  不许动 undo/redo 栈(清了重做线但不重渲染,按钮可用态会陈旧)。 */
  const splitAtPlayhead = () => {
    const c = compRef.current;
    if (!c.video) return;
    const shots = ensureShots(c);
    if (splitBlockedByTransition(shots, tRef.current)) {
      toast.error(t('转场覆盖区内不能分割——先移除转场'));
      return;
    }
    const r = splitAtEdited(shots, tRef.current, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }));
    if (r.clips === shots) return;
    pushUndoSnapshot();
    setComp((cur) => ({ ...cur, shots: r.clips }));
  };
  /** 左剪 / 右剪:剪掉当前片段播放头左/右侧的源footage,后面整体左移,字幕/演法块一并压缩。
   *  读 compRef(setComp wrapper 同步写)—— agent 同轮连发多个剪辑工具也不吞前一步。 */
  const trimAtPlayhead = (side: 'left' | 'right') => {
    const c = compRef.current;
    if (!c.video) return;
    const shots = ensureShots(c);
    const r = side === 'left' ? trimLeftAtEdited(shots, tRef.current) : trimRightAtEdited(shots, tRef.current);
    if (!r.removed) {
      toast.error(t('把播放头放到片段中间再剪'));
      return;
    }
    pushUndoSnapshot();
    setComp((cur) => ({ ...cur, shots: r.clips, blocks: removeEditedInterval(cur.blocks, r.removed![0], r.removed![1]) }));
    setSelectedShotId(null);
    applyT(r.removed[0]); // 播放头落到删点
  };
  /** 删除场景:移除该片段对应的源footage(后面左移,块压缩)。 */
  const deleteShot = (sid: string) => {
    const c = compRef.current;
    const shots = ensureShots(c);
    const r = deleteClipById(shots, sid);
    if (!r.removed) {
      toast.error(t('至少保留一个场景'));
      return;
    }
    pushUndoSnapshot();
    setComp((cur) => ({ ...cur, shots: r.clips, blocks: removeEditedInterval(cur.blocks, r.removed![0], r.removed![1]) }));
    setSelectedShotId(null);
    applyT(r.removed[0]);
  };
  /** 批量删除多个分镜(多选)。从成片末端往前逐个删——删靠后的镜不影响靠前镜的成片坐标,
   *  逐次 removeEditedInterval 压缩叠加块。至少保留一个场景;全选=拒删。 */
  const deleteShots = (ids: Set<string>) => {
    const c = compRef.current;
    let shots = ensureShots(c);
    const targets = clipSpans(shots)
      .filter((sp) => ids.has(sp.clip.id))
      .sort((a, b) => b.editedStart - a.editedStart); // 末端优先
    if (targets.length === 0) return;
    if (targets.length === 1) return deleteShot(targets[0]!.clip.id); // 退化成单删(复用守卫/落点)
    if (targets.length >= shots.length) {
      toast.error(t('至少保留一个场景'));
      return;
    }
    pushUndoSnapshot();
    let blocks = c.blocks;
    let firstStart = Infinity;
    for (const sp of targets) {
      const r = deleteClipById(shots, sp.clip.id);
      if (!r.removed) continue; // 触到"最后一镜"守卫:跳过
      shots = r.clips;
      blocks = removeEditedInterval(blocks, r.removed[0], r.removed[1]);
      firstStart = Math.min(firstStart, r.removed[0]);
    }
    setComp((cur) => ({ ...cur, shots, blocks }));
    setSelectedShotId(null);
    applyT(Number.isFinite(firstStart) ? firstStart : 0);
    toast.success(t('已删除 {n} 个场景', { n: targets.length }));
  };
  /** 批量删除多个组件块(⌘多选/框选)。字幕层(纯计算产物)与生成中的块跳过;一个 undo 快照。 */
  const deleteBlocks = (ids: Set<string>) => {
    const targets = compRef.current.blocks.filter((b) => ids.has(b.id) && !isSentenceCaption(b) && !genIdsRef.current.has(b.id));
    if (targets.length === 0) return;
    if (targets.length === 1) return removeBlock(targets[0]!.id); // 退化单删(复用即时消块/守卫)
    pushUndoSnapshot();
    const kill = new Set(targets.map((b) => b.id));
    for (const b of targets) postPreview({ type: 'hf:remove', id: b.id }); // 画面即时消块,不等防抖重建
    setComp((c) => ({ ...c, blocks: c.blocks.filter((b) => !kill.has(b.id)) }));
    setSelectedIdRaw(null);
    setSelectedBlockIds(new Set());
    toast.success(t('已删除 {n} 个组件', { n: targets.length }));
  };
  const selectedShot = comp.shots?.find((s) => s.id === selectedShotId) ?? null;

  // 快捷键上下文:这些是每渲染重建的闭包,keydown 监听器挂一次,经 ref 取最新
  /** ⌘Z 撤销:弹快照栈(与 agent undo 工具同一栈;守卫同款——生成中不许回滚)。 */
  const undoLast = () => {
    if (genIdsRef.current.size) {
      toast.error(t('有组件正在生成,等完成再撤销'));
      return;
    }
    const stack = undoStackRef.current;
    while (stack.length && stack[stack.length - 1] === compRef.current) stack.pop();
    const prev = stack.pop();
    if (!prev) {
      toast.info(t('没有可撤销的改动'));
      return;
    }
    redoStackRef.current.push(compRef.current);
    setComp(prev);
    setSelectedId(null);
    setSelectedShotId(null);
    toast.success(t('已撤销') + (stack.length ? t('(还可再撤 {n} 步)', { n: stack.length }) : ''));
  };
  /** ⇧⌘Z 重做:弹重做栈(只有撤销会喂它;新编辑作废整条线)。直推 undo 栈,不走 pushUndoSnapshot——那会清掉重做线。 */
  const redoLast = () => {
    if (genIdsRef.current.size) {
      toast.error(t('有组件正在生成,等完成再重做'));
      return;
    }
    const next = redoStackRef.current.pop();
    if (!next) {
      toast.info(t('没有可重做的改动'));
      return;
    }
    undoStackRef.current.push(compRef.current);
    if (undoStackRef.current.length > UNDO_CAP) undoStackRef.current.shift();
    setComp(next);
    setSelectedId(null);
    setSelectedShotId(null);
    toast.success(t('已重做') + (redoStackRef.current.length ? t('(还可再重做 {n} 步)', { n: redoStackRef.current.length }) : ''));
  };
  keysRef.current = {
    removeBlock,
    deleteBlocks,
    deleteShot,
    deleteShots,
    closeCode: () => setFloatWin(null),
    closeFloat: () => setFloatWin(null),
    deleteTransition: () => {
      if (transitionCut != null) setCutTransition(transitionCut, null);
      setFloatWin(null);
    },
    undo: undoLast,
    redo: redoLast,
    floatWin,
  };
  // 撤销/重做按钮可用态:栈是 ref,但每次栈变动都伴随 setComp 重渲染,渲染期直读没有滞后。
  // 栈顶与当前 comp 同引用的是无操作快照(undoLast 弹栈时会跳过),不算一步。
  const canUndo = (() => {
    const st = undoStackRef.current;
    let i = st.length - 1;
    while (i >= 0 && st[i] === comp) i--;
    return i >= 0;
  })();
  const canRedo = redoStackRef.current.length > 0;

  /** 组件底板背景。undefined = 透明(清掉底板)。 */
  const setBlockBg = (id: string, bg: string | undefined) =>
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, bg } : b)) }));
  /** 组件边框色。undefined = 无边框。 */
  const setBlockBorder = (id: string, border: string | undefined) =>
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, border } : b)) }));
  /** 组件透明度(0–1)。≈1 清掉(回缺省)。 */
  const setBlockOpacity = (id: string, v: number) =>
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, opacity: v >= 0.995 ? undefined : v } : b)) }));
  /** 组件圆角(comp px)。0 清掉(回直角/默认)。 */
  const setBlockRadius = (id: string, v: number) =>
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, radius: v > 0 ? v : undefined } : b)) }));
  /** 组件整体旋转(度)。0 清掉(回正)。 */
  const setBlockRotation = (id: string, v: number) =>
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, rotation: v ? v : undefined } : b)) }));
  /** 人像抠像全局配置(人像面板):undefined = 全默认。 */
  const setPersonFx = (fx: PersonFx | undefined) => {
    // 即时:羽化/描边/背景直发 hf:personFx 给抠像 shim(换算与 assemble 同口径);
    // 结构性开关(personFront 层序/首次装管线)由防抖重建接上
    const W = compRef.current.width;
    const featherPx = Math.round(((Math.max(0, Math.min(100, fx?.feather ?? 0)) / 100) * W) / 45 * 10) / 10;
    const strokePx = fx?.stroke && fx.stroke.width > 0 ? Math.max(1.2, ((Math.max(0, Math.min(100, fx.stroke.width)) / 100) * W) / 30) : 0;
    const bg = fx?.bg ? (fx.bg.type === 'color' ? fx.bg.color : `#000 center/cover no-repeat url('${fx.bg.url}')`) : null;
    postPreview({
      type: 'hf:personFx',
      feather: featherPx,
      strokeW: strokePx,
      strokeStyle: fx?.stroke?.style ?? 'solid',
      strokeColor: fx?.stroke?.color ?? '#ffffff',
      strokeAlpha: fx?.stroke?.opacity ?? 1,
      bg,
    });
    setComp((c) => ({ ...c, personFx: fx }));
  };
  setPersonFxRef.current = setPersonFx;
  /** 这段范围(某源)的 mask 是否已基本齐(≥80% 采样点有帧)——重开开关时不重复跑。 */
  const matteCovered = useCallback((key: string, from: number, to: number): boolean => {
    const track = matteTrackRef.current.get(key);
    if (!track?.length) return false;
    const expected = Math.max(1, Math.floor((to - from) * MATTE_FPS));
    let have = 0;
    for (const f of track) if (f.t >= from - 0.05 && f.t <= to + 0.05) have += 1;
    return have >= expected * 0.8;
  }, []);
  /** 预算一段 mask(进度回 matteState;结果按**该源**的文件时间并进对应轨,同段覆盖旧帧)。 */
  const runMatteBatch = useCallback(async (job: { key: string; file: File; upTo: number; from: number; to: number }) => {
    const { key, file, upTo, from, to } = job;
    matteAbortRef.current?.abort();
    const ab = new AbortController();
    matteAbortRef.current = ab;
    setMatteState({ status: 'running', done: 0, total: 1 });
    try {
      const arr = await computeMatteTrack(file, upTo, (done, total) => setMatteState({ status: 'running', done, total }), ab.signal, { from, to });
      if (ab.signal.aborted) return;
      if (arr?.length) {
        const eps = 0.001;
        const kept = (matteTrackRef.current.get(key) ?? []).filter((f) => f.t < from - eps || f.t > to + eps);
        const merged = [...kept, ...arr].sort((a, b) => a.t - b.t);
        matteTrackRef.current.set(key, merged);
        setMatteState({ status: 'ready', done: merged.length, total: merged.length });
      } else {
        setMatteState({ status: 'error', done: 0, total: 0 });
      }
    } catch (e) {
      console.warn('[studio] 人像抠像预算失败', e);
      if (!ab.signal.aborted) setMatteState({ status: 'error', done: 0, total: 0 });
    }
  }, []);
  /** 定位某镜的抠像源文件(平权:选中哪段就按那段的源抠):口播源=主视频 File;
   *  其它源=clipFilesRef(本地),远端 URL 现拉现存(顺带喂饱缩率图/导出)。 */
  const matteFileForShot = useCallback(async (s: VideoShot): Promise<{ key: string; file: File; upTo: number } | null> => {
    if (!s.src) {
      const f = videoFileRef.current;
      const dur = compRef.current.video?.durationSec;
      return f && dur ? { key: 'main', file: f, upTo: dur } : null;
    }
    let f = clipFilesRef.current.get(s.src) ?? null;
    if (!f && !s.src.startsWith('blob:')) {
      try {
        const r = await fetch(`/api/media/fetch?url=${encodeURIComponent(s.src)}`);
        if (r.ok) {
          f = new File([await r.blob()], 'clip.mp4', { type: 'video/mp4' });
          clipFilesRef.current.set(s.src, f);
        }
      } catch {
        /* fallthrough */
      }
    }
    return f ? { key: s.src, file: f, upTo: s.srcEnd } : null;
  }, []);
  /** 给某镜跑抠像(缺帧才跑;取不到源文件明确报错)。 */
  const runMatteForShot = useCallback(
    async (s: VideoShot) => {
      const src = await matteFileForShot(s);
      if (!src) {
        toast.error(t('取不到该片段的源文件,无法抠像'));
        setMatteState({ status: 'error', done: 0, total: 0 });
        return;
      }
      if (!matteCovered(src.key, s.srcStart, s.srcEnd)) await runMatteBatch({ key: src.key, file: src.file, upTo: src.upTo, from: s.srcStart, to: s.srcEnd });
    },
    [matteFileForShot, matteCovered, runMatteBatch],
  );
  runMatteForShotRef.current = runMatteForShot;
  /** 切换选中分镜的抠像开关(逐段生效,无自动补跑——开哪段算哪段;任意源的段都行)。 */
  const toggleShotMatte = useCallback(
    (on: boolean) => {
      const sid = selectedShotIdRef.current;
      if (!sid) return;
      setComp((c) => ({ ...c, shots: (c.shots ?? []).map((s) => (s.id === sid ? { ...s, personMatte: on || undefined } : s)) }));
      if (on) {
        const s = compRef.current.shots?.find((x) => x.id === sid);
        if (s) void runMatteForShot(s);
      }
    },
    [runMatteForShot],
  );
  // 插入源转写(政策:开了字幕=全源都该有字幕;打开智能剪面板=稿子要含全部片段)。
  // transcribeFile 按 fileSig 缓存,同 src 的分割两半共享一份;失败记黑名单不反复烧 ASR
  const clipAsrBusyRef = useRef<Set<string>>(new Set());
  const clipAsrFailRef = useRef<Set<string>>(new Set());
  const captionsOn = comp.blocks.some(isSentenceCaption);
  useEffect(() => {
    if (floatWin !== 'script' && !captionsOn) return;
    for (const shot of (comp.shots ?? []).filter((s) => s.src)) {
      const src = shot.src!;
      if (clipAsrRef.current[src] || clipAsrBusyRef.current.has(src) || clipAsrFailRef.current.has(src)) continue;
      clipAsrBusyRef.current.add(src);
      void (async () => {
        try {
          const got = await matteFileForShot(shot); // 同一套源文件定位:本地=clipFilesRef,远端现拉现存
          if (!got) {
            clipAsrFailRef.current.add(src);
            return;
          }
          const segs = await studioProviders().transcriber.transcribe(got.file);
          setClipAsr((m) => ({ ...m, [src]: segs }));
          clipAsrRef.current = { ...clipAsrRef.current, [src]: segs }; // 立刻镜像:下面的重铺要读到
          // 开着字幕层:这个源的字幕当场铺进去(字幕=转写的纯计算产物)
          if (segs.length && compRef.current.blocks.some(isSentenceCaption)) {
            setComp((c) => ({ ...c, blocks: relayCaptionLayer(c.blocks, ensureShots(c), asrRef.current) }));
          }
        } catch (e) {
          console.warn('[studio] clip transcribe failed', e);
          clipAsrFailRef.current.add(src); // 本次会话不再重试,避免反复打 ASR
        } finally {
          clipAsrBusyRef.current.delete(src);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, captionsOn, comp.shots]);
  // 换主视频:口播源的老轨作废,进行中的预算取消(其它源的轨随各自 src 键存续)
  useEffect(() => {
    return () => {
      matteAbortRef.current?.abort();
      matteTrackRef.current.delete('main');
      setMatteState({ status: 'idle', done: 0, total: 0 });
    };
  }, [videoFile]);
  // 边框快捷色:主题 accent 优先,白/黑兜底
  const borderSwatches: [string, string][] = (() => {
    const raw: [string, string][] = [];
    if (comp.palette?.accent) raw.push(['主题强调色', comp.palette.accent]);
    raw.push(['白', '#ffffff'], ['黑', '#101114']);
    const seen = new Set<string>();
    return raw.filter(([, v]) => !seen.has(v.toLowerCase()) && (seen.add(v.toLowerCase()), true));
  })();
  /** 边柄拉伸(与字幕行宽同口径,用户定的:改这一轴的盒子尺寸,内容铺满重排,不裁切、不锁比例):
   *  对边锚死;contentBox 归还成 = box(旧裁切语义已废,存量裁切块拖一下即还原满铺)。
   *  过程经 hf:boxSize 在 iframe 直改(零 React 重渲),松手一次性提交。 */
  const edgeDrag = (e: React.PointerEvent, blk: Block, side: 'l' | 'r' | 't' | 'b') => {
    if (!blk.box) return;
    const box0 = blk.box;
    const kf = fit || 1;
    const c = compRef.current;
    let g = { ...box0 };
    startPointerDrag(e, {
      onStart: () => {
        dragCursorRef.current = side === 'l' || side === 'r' ? 'ew-resize' : 'ns-resize';
        setBodyDragging(true);
      },
      onFrame: (px, py) => {
        const dx = px / (c.width * kf);
        const dy = py / (c.height * kf);
        g = { ...box0 };
        if (side === 'r') g.w = Math.max(0.04, box0.w + dx);
        else if (side === 'l') {
          g.w = Math.max(0.04, box0.w - dx);
          g.x = box0.x + box0.w - g.w;
        } else if (side === 'b') g.h = Math.max(0.03, box0.h + dy);
        else {
          g.h = Math.max(0.03, box0.h - dy);
          g.y = box0.y + box0.h - g.h;
        }
        setGhostRect(g); // ghost 跟手,内容不实时改(松手经免重建通道一次应用)
      },
      onEnd: () => {
        setBodyDragging(false);
        setGhostRect(null);
        const gg = g;
        setComp((cc) => ({
          ...cc,
          blocks: cc.blocks.map((b) => (b.id === blk.id && b.box ? { ...b, box: gg, contentBox: undefined } : b)),
        }));
      },
    });
  };
  /** 角柄缩放:对角锚死,过程经 hf:boxSize 在 iframe 直改(零 React 重渲),松手一次性提交。
   *  - 组件(custom)块:**盒子锁比例**(用户定的:四角=内部容器保持比例)。内容不做 transform
   *    缩放 —— 内部容器经插入时的 %-绑定实拿尺寸跟着 box 变,字号经 cq 单位随容器自动调;
   *  - 其余(media 等):自由缩放不锁比例,内容铺满重排(原口径)。 */
  const scaleDrag = (e: React.PointerEvent, blk: Block, sgnX: 1 | -1, sgnY: 1 | -1) => {
    if (!blk.box) return;
    const box0 = blk.box;
    const kf = fit || 1;
    const c = compRef.current;
    const uniform = blockKind(blk) === 'custom';
    let g = { ...box0 };
    startPointerDrag(e, {
      onStart: () => {
        dragCursorRef.current = sgnX * sgnY > 0 ? 'nwse-resize' : 'nesw-resize';
        setBodyDragging(true);
      },
      onFrame: (px, py) => {
        const dx = px / (c.width * kf);
        const dy = py / (c.height * kf);
        g = { ...box0 };
        if (uniform) {
          // 横轴主导的等比:k=新宽/旧宽,高同步 ×k(对角锚死)
          const w = Math.max(0.04, sgnX > 0 ? box0.w + dx : box0.w - dx);
          const k = w / box0.w;
          g.w = w;
          g.h = Math.max(0.03, box0.h * k);
          if (sgnX < 0) g.x = box0.x + box0.w - g.w;
          if (sgnY < 0) g.y = box0.y + box0.h - g.h;
        } else {
          if (sgnX > 0) g.w = Math.max(0.04, box0.w + dx);
          else {
            g.w = Math.max(0.04, box0.w - dx);
            g.x = box0.x + box0.w - g.w;
          }
          if (sgnY > 0) g.h = Math.max(0.03, box0.h + dy);
          else {
            g.h = Math.max(0.03, box0.h - dy);
            g.y = box0.y + box0.h - g.h;
          }
        }
        setGhostRect(g); // ghost 跟手,内容不实时改(松手经免重建通道一次应用)
      },
      onEnd: () => {
        setBodyDragging(false);
        setGhostRect(null);
        const gg = g;
        setComp((cc) => ({
          ...cc,
          blocks: cc.blocks.map((b) => (b.id === blk.id && b.box ? { ...b, box: gg, contentBox: undefined } : b)),
        }));
      },
    });
  };

  /** 浮动工具条的拖动手柄:父层 ghost 语义(同边/角柄)——虚线跟手 + 中心吸附参考线,
   *  内容不实时动,松手 shiftBox 一次提交(经免重建通道应用)。 */
  const gripDrag = (e: React.PointerEvent, gripBlockId: string) => {
    const blk = compRef.current.blocks.find((b) => b.id === gripBlockId);
    const box0 = blk?.box;
    if (!blk || !box0 || genIdsRef.current.has(blk.id)) return;
    const sr = stageBoxRef.current?.getBoundingClientRect();
    if (!sr) return;
    let dxn = 0;
    let dyn = 0;
    startPointerDrag(e, {
      onFrame: (dx, dy) => {
        dxn = dx / sr.width;
        dyn = dy / sr.height;
        // 中心吸附(同体拖口径:块中心贴画布中线 1.5% 内吸上)
        const cx = box0.x + box0.w / 2 + dxn;
        const cy = box0.y + box0.h / 2 + dyn;
        const snapX = Math.abs(cx - 0.5) < 0.015;
        const snapY = Math.abs(cy - 0.5) < 0.015;
        if (snapX) dxn = 0.5 - (box0.x + box0.w / 2);
        if (snapY) dyn = 0.5 - (box0.y + box0.h / 2);
        setGuideVis(snapX, snapY);
        setGhostRect({ x: box0.x + dxn, y: box0.y + dyn, w: box0.w, h: box0.h });
      },
      onEnd: () => {
        setGuideVis(false, false);
        setGhostRect(null);
        if (dxn || dyn) setComp((cc) => ({ ...cc, blocks: cc.blocks.map((b) => (b.id === blk.id ? shiftBox(b, dxn, dyn) : b)) }));
      },
    });
  };
  /** 底部旋转手柄:绕组件中心按指针角度旋转,实时经 hf:rotate 直改 iframe(零重渲),松手落 Block.rotation。
   *  Shift = 15° 吸附。 */
  const rotateDrag = (e: React.PointerEvent, block: Block) => {
    const box = block.box;
    const stage = stageBoxRef.current;
    if (!box || !stage) return;
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + (box.x + box.w / 2) * rect.width;
    const cy = rect.top + (box.y + box.h / 2) * rect.height;
    const base = block.rotation ?? 0;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    let deg = base;
    startPointerDrag(e, {
      onStart: () => {
        if (rotateLabelRef.current) rotateLabelRef.current.style.display = 'block'; // 起拖即显角度(从 0° 起也显)
      },
      onFrame: (_dx, _dy, ev) => {
        const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
        let d = base + ((a - a0) * 180) / Math.PI;
        if (ev.shiftKey) d = Math.round(d / 15) * 15;
        d = Math.round(d);
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        deg = d;
        postPreview({ type: 'hf:rotate', blockId: block.id, deg }); // iframe 里的卡片实时转
        if (rotateOverlayRef.current) rotateOverlayRef.current.style.transform = deg ? `rotate(${deg}deg)` : ''; // 选中框/手柄跟手转
        if (rotateLabelRef.current) {
          rotateLabelRef.current.textContent = `${deg}°`;
          rotateLabelRef.current.style.transform = deg ? `rotate(${-deg}deg)` : ''; // 反转抵消,数字保持正立
        }
      },
      onEnd: () => setBlockRotation(block.id, deg),
    });
  };
  // 背景快捷色:主题 palette 的纸底/面板优先(与 frame 同语言),白/黑兜底;同色去重。
  // 主题色默认带 90% 透明度——组件叠在视频上,纯不透明底会把画面整块糊死;要纯色走白/黑或自定义。
  const glass = (hex: string) => (/^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}e6` : hex);
  const bgSwatches = (() => {
    const raw: [string, string][] = [];
    if (comp.palette?.paper) raw.push(['主题纸底', glass(comp.palette.paper)]);
    if (comp.palette?.panel) raw.push(['主题面板', glass(comp.palette.panel)]);
    raw.push(['白', '#ffffff'], ['黑', '#101114']);
    const seen = new Set<string>();
    return raw.filter(([, v]) => !seen.has(v.toLowerCase()) && (seen.add(v.toLowerCase()), true));
  })();
  /* ---------- chat agent:可 @ 组件 + 请求上下文 + 客户端执行工具 ---------- */
  // 按**内容 key** memo(不是数组身份):box 拖拽等逐帧改 blocks 数组身份但 id/label/kind
  // 全没变——elements 身份不变,memo 的 StudioChat 才不会跟着逐帧重渲。
  const chatElemsKey = [
    comp.blocks.map((b) => `${b.id}${b.templateId}${b.label ?? ''}`).join(''),
    (comp.shots ?? []).map((s) => s.id).join(''),
  ].join('');
  const chatElements = useMemo<StudioElementRef[]>(
    () => [
      ...compRef.current.blocks.map((b) => ({ id: b.id, label: b.label?.slice(0, 16) || blockKind(b), kind: blockKind(b), isShot: false })),
      ...(compRef.current.shots ?? []).map((s, i) => ({ id: s.id, label: t('分镜 #{n}', { n: i + 1 }), kind: 'shot', isShot: true })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatElemsKey],
  );

  /** chat 发消息瞬间的局势(composition 快照/选中/播放头/流水线;挂消息 metadata)。
   *  口播稿不在这——稿子锚源时间不随剪辑变化,经 extract_asr 回执 / read_script
   *  一次性进信息流,不用每轮重发(prompt cache 友好)。 */
  const getChatBody = useCallback((): Record<string, unknown> => {
    const c = compRef.current;
    let sel: { id: string; type: 'block' | 'shot'; label?: string; kind?: string } | null = null;
    if (selectedIdRef.current) {
      const b = c.blocks.find((x) => x.id === selectedIdRef.current);
      if (b) sel = { id: b.id, type: 'block', label: b.label, kind: blockKind(b) };
    } else if (selectedShotIdRef.current) {
      const i = (c.shots ?? []).findIndex((s) => s.id === selectedShotIdRef.current);
      if (i >= 0) sel = { id: selectedShotIdRef.current, type: 'shot', label: `分镜 #${i + 1}`, kind: 'shot' };
    }
    return {
      composition: {
        durationSec: totalDuration(c),
        theme: c.theme,
        // 字幕层状态(开/关 + 当前预设/位置):让 agent 判断该 set 还是 remove、别重复开
        ...(c.blocks.some(isSentenceCaption)
          ? (() => {
              const cs = resolveCaptionStyle(c);
              return { captions: { preset: cs.preset, yPct: Math.round(cs.yPct) } };
            })()
          : {}),
        blocks: c.blocks.map((b) => ({
          id: b.id,
          label: b.label,
          kind: blockKind(b),
          startSec: b.startSec,
          durationSec: b.durationSec,
          ...(isPlaceholder(b) ? { placeholder: true } : {}),
        })),
        // 每镜带成片区间(cut_range/split/trim/add_block 的寻址时钟)+ 插入源短标
        // (同一插入源同一字母,两段不同外部片可分辨;主源不标)——治「agent 拿源秒当成片秒下刀」
        shots: (() => {
          const tag = new Map<string, string>();
          for (const s of c.shots ?? []) if (s.src && !tag.has(s.src)) tag.set(s.src, String.fromCharCode(65 + tag.size));
          return clipSpans(c.shots ?? []).map((sp, i) => ({
            id: sp.clip.id,
            index: i + 1,
            editedStart: sp.editedStart,
            editedEnd: sp.editedEnd,
            srcStart: sp.clip.srcStart,
            srcEnd: sp.clip.srcEnd,
            treatment: sp.clip.treatment,
            ...(sp.clip.src ? { source: tag.get(sp.clip.src) } : {}),
          }));
        })(),
      },
      selected: sel,
      playheadSec: tRef.current,
      // 流水线状态:agent 不盲目重跑、不声称有并不存在的转写
      pipeline: { asr: !!asrRef.current?.length, plan: !!planRef.current, visual: !!visualRef.current },
      // 主视频字节挂载态:项目应有视频(有分镜/有 sig)而字节未就绪 → 明告 agent
      // (handoff 刚开的标签页常处于 OPFS miss→云端取回窗口;数据面是全的)
      ...((videoSigRef.current || (c.shots ?? []).length) && !videoFileRef.current ? { videoBytesReady: false } : {}),
    };
  }, []);

  /** 口播稿 → 喂 agent 的文本:主源全部句子 + 每个插入源一节(各自源文件秒,
   *  标注归属的分镜 id)。机器面英文口径;extract_asr 回执与 read_script 共用。 */
  const transcriptForAgent = (): string => {
    const rd = (x: number) => Math.round(x * 10) / 10;
    const row = (s: AsrSegment, i: number) => `  ${i}. [${rd(s.start)}–${rd(s.end)}s] ${s.text}`;
    const parts: string[] = [];
    const main = asrRef.current ?? [];
    parts.push(`MAIN NARRATION (source-video seconds — never shift when the video is cut; shot src in→out uses the same clock):\n${main.map(row).join('\n')}`);
    const bySrc = new Map<string, string[]>();
    for (const s of compRef.current.shots ?? []) {
      if (!s.src) continue;
      bySrc.set(s.src, [...(bySrc.get(s.src) ?? []), s.id]);
    }
    for (const [src, ids] of bySrc) {
      const segs = clipAsrRef.current[src];
      const head = `INSERTED CLIP for shot(s) ${ids.map((x) => `@${x}`).join(', ')} (its OWN source seconds; does not map to the narration clock)`;
      if (!segs) parts.push(`${head}: (no transcript — transcription unavailable for this clip)`);
      else if (!segs.length) parts.push(`${head}: (no speech detected)`);
      else parts.push(`${head}:\n${segs.map(row).join('\n')}`);
    }
    const out = parts.join('\n');
    return out.length > 4000 ? `${out.slice(0, 4000)}\n…(truncated)` : out;
  };
  /** 插入源转写补齐(read_script 按需触发——政策:没开字幕时 LLM 用到才转写)。
   *  与面板转写 effect 共享 busy/fail 名单:失败不反复烧 ASR,在跑的等它跑完。 */
  const ensureClipTranscripts = async (): Promise<void> => {
    // 拉黑 + 明说(每个 src 只报一次:进黑名单后顶部 continue 不会再走到这)——
    // 只 console.warn 用户根本不知道插入段为什么没字幕
    const failClipAsr = (src: string) => {
      if (clipAsrFailRef.current.has(src)) return;
      clipAsrFailRef.current.add(src);
      toast.error(t('插入片段转写失败——这段将没有字幕和卡点'));
    };
    const srcs = [...new Set((compRef.current.shots ?? []).filter((s) => s.src).map((s) => s.src!))];
    for (const src of srcs) {
      if (clipAsrRef.current[src] || clipAsrFailRef.current.has(src)) continue;
      if (clipAsrBusyRef.current.has(src)) {
        const t0 = Date.now();
        while (clipAsrBusyRef.current.has(src) && Date.now() - t0 < 45000) await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      clipAsrBusyRef.current.add(src);
      try {
        const shot = (compRef.current.shots ?? []).find((s) => s.src === src)!;
        const got = await matteFileForShot(shot);
        if (!got) {
          failClipAsr(src);
          continue;
        }
        const segs = await studioProviders().transcriber.transcribe(got.file);
        setClipAsr((m) => ({ ...m, [src]: segs }));
        clipAsrRef.current = { ...clipAsrRef.current, [src]: segs };
      } catch (e) {
        console.warn('[studio] clip transcribe failed', e);
        failClipAsr(src);
      } finally {
        clipAsrBusyRef.current.delete(src);
      }
    }
  };

  // 插入片段 → 规划上下文:锚点=前最近主源段的 srcEnd(主源时间域,plan 的口径);
  // 文本=该插入窗口内的转写句子(同源分割两半共享整份转写,按窗过滤)
  insertedClipsForPlanRef.current = async () => {
    const shots = compRef.current.shots ?? [];
    if (!shots.some((s) => s.src)) return [];
    await ensureClipTranscripts(); // 按需转写(busy/失败名单内部处理,不反复烧 ASR)
    // 纯函数在 captions-relay(离线执行器同源):带 sentences=平权分镜的输入面
    return insertPlanContexts(shots, clipAsrRef.current);
  };

  /** 分镜草稿的上下文回填(lay_out 与 add_graphics 的「先分镜」共用一份,防两处漂移):
   *  1) 设计状态跨重建保留:frame(用户显式选的设计系统)> 画面派生 palette;花字全局样式;
   *  2) 多源主轨:插入片段是片子本体,不许被重排覆盖——按原成片位置插回最近边界、
   *     其后的块顺移(与手动插入同一套镜像逻辑),每个插入窗按**自己的口播**落配图占位
   *     (平权,用户定的;主源占位滑进窗内的剔掉,brief 张冠李戴);占位落点走插入段
   *     自己的几何分析(本地 File + MediaPipe,避人脸),拿不到/失败退固定兜底框。 */
  const restoreDraftContext = async (draft: Composition, vis: VisualTimeline | null): Promise<Composition> => {
    const keep = compRef.current;
    if (keep.frameId) {
      draft.frameId = keep.frameId;
      if (keep.palette) draft.palette = keep.palette;
    } else if (vis?.palette) {
      draft.palette = vis.palette;
    }
    if (keep.captionStyle) draft.captionStyle = keep.captionStyle;
    const inserted = clipSpans(keep.shots ?? []).filter((sp) => sp.clip.src);
    if (inserted.length && draft.shots?.length) {
      // 转写缓存可能是冷的(规划命中缓存时不会触发插入源转写)——插回前补齐,
      // 否则 speech 为空,插入段落不下自己的配图占位
      await ensureClipTranscripts();
      let shots2 = draft.shots;
      let blocks2 = draft.blocks;
      const planCtx = insertPlanContexts(keep.shots ?? [], clipAsrRef.current); // 与规划输入同一枚举(clip 序号=下标+1)
      const extraBlocks: Block[] = []; // 平权分镜产出的逐场景占位
      const insertWins: { start: number; end: number; speech: string; planned?: boolean; layout?: { box: GraphicBox; hasFace: boolean } }[] = [];
      for (const [k, sp] of inserted.entries()) {
        const bounds = [0, ...clipSpans(shots2).map((x) => x.editedEnd)];
        let idx = 0;
        let at = 0;
        let best = Infinity;
        bounds.forEach((b, i) => {
          const d = Math.abs(b - sp.editedStart);
          if (d < best) {
            best = d;
            at = b;
            idx = i;
          }
        });
        const len = sp.editedEnd - sp.editedStart;
        shots2 = [...shots2.slice(0, idx), sp.clip, ...shots2.slice(idx)];
        blocks2 = blocks2.map((b) => (b.startSec >= at - 1e-3 ? { ...b, startSec: b.startSec + len } : b));
        const speech = (clipAsrRef.current[sp.clip.src!] ?? [])
          .filter((x) => x.end > sp.clip.srcStart + 0.05 && x.start < sp.clip.srcEnd - 0.05)
          .map((x) => x.text)
          .join('');
        // 插入段几何落点(P1④ 多源平权):有本地 File 才跑(几帧 MediaPipe,免费且快;
        // 远端/死链不现拉,直接兜底)。失败/无 MediaPipe → undefined = 恒兜底框,绝不断分镜链路。
        let layout: { box: GraphicBox; hasFace: boolean } | undefined;
        try {
          const f = sp.clip.src ? clipFilesRef.current.get(sp.clip.src) : undefined;
          if (f) {
            const zone = await insertedClipSafeZone(f, sp.clip.srcStart, sp.clip.srcEnd);
            if (zone) layout = { box: pickGraphicBox(zone.rects, zone.face ? [zone.face] : []), hasFace: !!zone.face };
          }
        } catch {
          /* 几何分析失败 → 现状兜底(FULL_GRAPHIC_BOX) */
        }
        // 平权分镜:plan 给了这个插入段自己的 scenes(clip 序号=枚举下标+1)→ 按场景
        // 切镜+取景+逐场景占位;对不上(没规划/没句子/切不出镜)退回整段一拍旧路径
        const planned = planRef.current?.inserts?.find((x) => x.clip === k + 1);
        const sentences = planCtx[k]?.sentences;
        let sliced: { shots: VideoShot[]; blocks: Block[] } | null = null;
        if (planned?.scenes.length && sentences?.length) {
          sliced = layoutInsertWindow({ win: { start: at, end: at + len }, clip: sp.clip, sentences, scenes: planned.scenes, layout });
        }
        if (sliced) {
          shots2 = [...shots2.slice(0, idx), ...sliced.shots, ...shots2.slice(idx + 1)]; // 换掉刚插的整段
          extraBlocks.push(...sliced.blocks);
        }
        insertWins.push({ start: at, end: at + len, speech, ...(sliced ? { planned: true } : {}), ...(layout ? { layout } : {}) });
      }
      draft.shots = shots2;
      const insertPh = insertWins.filter((w) => !w.planned).map((w) => insertedClipPlaceholder(w, w.speech, w.layout)).filter((b): b is Block => !!b);
      draft.blocks = [...dropPlaceholdersInWindows(blocks2, insertWins), ...insertPh, ...extraBlocks];
    }
    return draft;
  };

  /** 占位/组件窗内的口播卡点(纯函数在 captions-relay,双端复用),薄包喂 ref。 */
  const beatsForWindow = (startSec: number, durationSec: number): { text: string; start: number; end: number }[] =>
    beatsForWindowPure(compRef.current.shots ?? [], asrRef.current, clipAsrRef.current, startSec, durationSec);
  /** 同片图形位清单(占位 + 已配 custom,时间序)——喂 compose 反单调。 */
  const graphicsRoster = (): { id: string; desc: string }[] => {
    const describeSlot = (b: Block) => {
      const comp = /component: ([a-z-]+)/.exec(placeholderSpec(b))?.[1];
      return `${comp ? `[${comp}] ` : ''}${b.label ?? ''}`.trim() || '(fragment)';
    };
    return compRef.current.blocks
      .filter((b) => isPlaceholder(b) || b.templateId === 'custom')
      .sort((a, b) => a.startSec - b.startSec)
      .map((b, i) => ({ id: b.id, desc: `${i + 1}. ${describeSlot(b)}` }));
  };
  /** roster → 某块视角的邻块清单(自己标 «THIS»);单块无邻居。 */
  const neighborsFrom = (roster: { id: string; desc: string }[], selfId: string): string[] | undefined =>
    roster.length > 1 ? roster.map((r) => (r.id === selfId ? `${r.desc}  «THIS»` : r.desc)) : undefined;

  /** 客户端执行一个工具调用:改 Composition 状态 / 调 compose 生成块。
   *  不 memo —— StudioChat 用 ref 持有最新引用,每帧重建保证读到最新 state/闭包。 */
  const runStudioTool = async (toolId: string, input: Record<string, unknown>): Promise<StudioToolResult> => {
      const c = compRef.current;
      const r1 = (x: unknown) => Math.round(Number(x) * 10) / 10;
      const findBlock = (id: unknown) => c.blocks.find((b) => b.id === id);
      const findShot = (id: unknown) => (c.shots ?? []).find((s) => s.id === id);
      const bname = (b: Block) => b.label?.slice(0, 10) || blockKind(b);
      // 流水线工具:把友好进度推给本工具的卡片(按 toolId 匹配),结束清掉
      const report = (text: string, frac?: number) => setToolProgress({ id: toolId, text, ...(frac != null ? { frac } : {}) });
      // 改动类工具先压 undo 快照(查询/定位/纯分析/撤销自身除外);cap 20
      const READONLY_TOOLS = new Set(['get_block', 'focus_element', 'undo', 'extract_asr', 'read_script', 'analyze_narration', 'analyze_visual', 'export_video', 'track_export']);
      // 生成锁:目标块正被配图/重写 worker 持有 → 拒绝改动(改了会被生成结果覆盖,或让生成拿着过期数据)
      if (!READONLY_TOOLS.has(toolId)) {
        const targetIds = [input.blockId, ...(Array.isArray(input.blockIds) ? (input.blockIds as unknown[]) : [])].filter(
          (x): x is string => typeof x === 'string',
        );
        const hit = targetIds.find((id) => genIdsRef.current.has(id));
        if (hit) {
          const b = findBlock(hit);
          return { ok: false, error: t('「{name}」正在生成中,等它完成再改', { name: b ? bname(b) : hit }) };
        }
      }
      if (!READONLY_TOOLS.has(toolId)) pushUndoSnapshot(); // 同一入口:agent 改动也作废重做线
      try {
        switch (toolId) {
          case 'extract_asr': {
            if (!videoFileRef.current) return { ok: false, error: t('先上传口播视频') };
            try {
              const segs = await stepAsr(report);
              if (!segs.length) return { ok: false, error: t('没有识别到人声,换条带口播的视频试试') };
              // 有插入片段时一并转写——给 agent 的稿子必须含插入段(否则一键成片的对话里
              // 它只见过主视频稿,answers「插入段说了什么」只能事后补读;用户踩过)
              if ((compRef.current.shots ?? []).some((s) => s.src)) await ensureClipTranscripts();
              // 全文随回执进信息流(一次注入,之后走缓存):局势快照里不带稿子
              return { ok: true, summary: t('已转写 {n} 句', { n: segs.length }), data: { transcript: transcriptForAgent() } };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'read_script': {
            if (!asrRef.current?.length) return { ok: false, error: t('还没有口播稿,先 extract_asr') };
            await ensureClipTranscripts(); // 插入源缺的按需转写(失败黑名单不反复烧 ASR)
            return { ok: true, summary: t('已读取口播稿'), data: { transcript: transcriptForAgent() } };
          }
          case 'analyze_narration': {
            if (!videoFileRef.current) return { ok: false, error: t('先上传口播视频') };
            try {
              const plan = await stepPlan(report);
              return { ok: true, summary: t('已规划 {n} 个场景', { n: plan.scenes?.length ?? 0 }) };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'analyze_visual': {
            if (!videoFileRef.current) return { ok: false, error: t('先上传口播视频') };
            try {
              const vis = await stepVisual(report);
              return vis
                ? { ok: true, summary: t('画面分析完成 · {segs} 段、源切点 {cuts}', { segs: vis.segments.length, cuts: vis.cuts.length }) }
                : { ok: false, error: t('画面没分析出结果(无视频轨 / MediaPipe 没加载)') };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'visual_brief': {
            // BYO 画面语义分析:免费部分(切点/抽帧/几何/底色)本地跑完,采样帧作为图片
            // 直接回给外部 agent 自己看——不烧自家 VLM。agent 看完 submit_visual 回标签。
            const vv = currentVideo();
            if (!videoFileRef.current || !vv) return { ok: false, error: t('先上传口播视频') };
            if (visualRef.current) {
              return { ok: true, summary: t('画面分析已就绪'), data: { status: 'done', segments: visualRef.current.segments.length, hint: 'visual analysis already available — no need to look/submit' } };
            }
            try {
              const r = await prepareVisualAnalysis(videoFileRef.current, vv.durationSec, (done, tot) => report(t('几何分析 {pct}%', { pct: tot ? Math.round((done / tot) * 100) : 0 }), tot ? done / tot : 0));
              if ('cached' in r) {
                applyVisualResult(r.cached);
                return { ok: true, summary: t('画面分析命中缓存'), data: { status: 'done', segments: r.cached.segments.length } };
              }
              visualBriefRef.current = r.prep;
              return {
                ok: true,
                summary: t('备好 {n} 帧采样', { n: r.prep.frames.length }),
                data: {
                  frames: r.prep.frames.map((f, i) => ({ index: i, at_sec: Math.round(f.timestamp * 10) / 10 })),
                  instruction:
                    'Look at each attached frame (index order matches `frames`) and label it, then call submit_visual with labels. Per frame: content = talkinghead|screen|broll|slide|other; person = left|center|right|none (where the speaker is); safe = left|right|top|bottom|full|none (largest empty region for graphics); has_text = burned-in text visible?; desc = one short English sentence.',
                },
                images: r.prep.frames.map((f) => ({ data: f.base64, mimeType: f.mime })),
              };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'submit_visual': {
            const prep = visualBriefRef.current;
            if (!prep) return { ok: false, error: t('先 visual_brief 拿采样帧(或画面分析已就绪,无需提交)') };
            const rawLabels = Array.isArray(input.labels) ? (input.labels as Record<string, unknown>[]) : [];
            const CONTENTS = new Set(['talkinghead', 'screen', 'broll', 'slide', 'other']);
            const PERSONS = new Set(['left', 'center', 'right', 'none']);
            const SAFES = new Set(['left', 'right', 'top', 'bottom', 'full', 'none']);
            const labels: (VisualLabel | null)[] = prep.frames.map(() => null);
            for (const l of rawLabels) {
              const i = Number(l.index);
              if (!Number.isInteger(i) || i < 0 || i >= labels.length) continue;
              labels[i] = {
                content: CONTENTS.has(String(l.content)) ? (String(l.content) as VisualLabel['content']) : 'other',
                person: PERSONS.has(String(l.person)) ? (String(l.person) as VisualLabel['person']) : 'center',
                safe: SAFES.has(String(l.safe)) ? (String(l.safe) as VisualLabel['safe']) : 'full',
                hasText: l.has_text === true || l.hasText === true,
                desc: typeof l.desc === 'string' ? l.desc.slice(0, 200) : '',
              };
            }
            if (!labels.some(Boolean)) return { ok: false, error: t('labels 为空或 index 全不合法——按 visual_brief 回的 frames index 逐帧给标签') };
            const vis = finishVisualAnalysis(prep, labels);
            visualBriefRef.current = null;
            applyVisualResult(vis);
            return { ok: true, summary: t('画面分析完成(BYO)· {segs} 段、源切点 {cuts}', { segs: vis.segments.length, cuts: vis.cuts.length }), data: { segments: vis.segments.length, cuts: vis.cuts.length } };
          }
          case 'lay_out': {
            const v = currentVideo();
            if (!v || !videoFileRef.current) return { ok: false, error: t('先上传口播视频') };
            try {
              const segs = await stepAsr(report);
              if (!segs.length) return { ok: false, error: t('没有识别到人声,换条带口播的视频试试') };
              // 规划 ‖ 画面分析并行(画面是长 pole,进度以它为主)
              const [plan, vis] = await Promise.all([stepPlan(report), stepVisual(report)]);
              report(t('分镜编排…'));
              const draft = await restoreDraftContext(
                layoutFromPlan(plan, { video: v, sentences: segs, ...(vis ? { cuts: vis.cuts, visual: vis } : {}) }),
                vis,
              );
              setComp(draft);
              setSelectedId(null);
              setSelectedShotId(null);
              applyT(0);
              const slots = draft.blocks.filter(isPlaceholder).length;
              // 轮内不重发局势快照:新结构的 id 随回执给,后续 add_graphics/focus 才有的放矢
              return {
                ok: true,
                summary: slots
                  ? t('分镜完成 · {shots} 镜、{slots} 处待配图(说「配图」我来填)', { shots: draft.shots?.length ?? 0, slots })
                  : t('分镜完成 · {shots} 镜,但没有待配图占位(场景太短或全是录屏)', { shots: draft.shots?.length ?? 0 }),
                data: {
                  shots: (draft.shots ?? []).map((s, i) => ({ id: s.id, index: i + 1, srcStart: s.srcStart, srcEnd: s.srcEnd, treatment: s.treatment })),
                  placeholderBlocks: draft.blocks.filter(isPlaceholder).map((b) => ({ id: b.id, label: b.label })),
                },
              };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'add_graphics': {
            if (!videoFileRef.current) return { ok: false, error: t('先上传口播视频') };
            if (genIdsRef.current.size) return { ok: false, error: t('已有配图/重写在进行中,等它完成再发起') };
            const lockedIds: string[] = []; // 本次运行锁住的占位;finally 兜底解锁(异常中断不留死锁)
            try {
              // 没分镜先分镜(占位还没摆)。setComp wrapper 同步写 compRef,这里再读就是新 draft(不再拿旧 blocks 空手而归)
              if (!compRef.current.blocks.some(isPlaceholder)) {
                report(t('先分镜…'));
                const v = currentVideo();
                const segs = await stepAsr(report);
                if (!v || !segs.length) return { ok: false, error: t('没有识别到人声,换条带口播的视频试试') };
                const [plan, vis] = await Promise.all([stepPlan(report), stepVisual(report)]);
                // 与 lay_out 同一份回填:保设计状态 + 插回插入段(此前这条路是简化重复,
                // 插了片段直接说「配图」会把插入段整个丢掉)
                const draft = await restoreDraftContext(
                  layoutFromPlan(plan, { video: v, sentences: segs, ...(vis ? { cuts: vis.cuts, visual: vis } : {}) }),
                  vis,
                );
                setComp(draft);
              }
              let allSlots = compRef.current.blocks.filter(isPlaceholder);
              // 可选 blockIds:只(重)配指定占位(agent「重做第 3 张」不用全量跑)
              const wantIds = Array.isArray(input.blockIds) ? new Set((input.blockIds as unknown[]).map(String)) : null;
              if (wantIds) allSlots = allSlots.filter((b) => wantIds.has(b.id));
              if (!allSlots.length) {
                if (wantIds) return { ok: false, error: t('指定的块不是待配图占位') };
                // 分镜跑过了但一个占位都没落 → 说实话:是规划没给出可配的图形,不是「先分镜」
                const p = planRef.current;
                return {
                  ok: false,
                  error: p
                    ? t('分镜完成,但没有可配图的占位:{n} 个场景全被跳过(录屏场景不盖图/被开场标题挤得太短)。可以说「重新分析口播稿」再试', { n: p.scenes.length })
                    : t('没有待配图的占位(先分镜)'),
                };
              }
              const slots = allSlots.slice(0, GRAPHICS_TEST_CAP); // 测试期 cap,常量在文件顶部

              const skipped = allSlots.length - slots.length;
              // 排队即上锁(等待生成的也不允许编辑),每块生成完(或失败)即时解锁
              lockedIds.push(...slots.map((s) => s.id));
              markGenerating(lockedIds, true);
              // 并发配图(块之间无依赖,墙钟 ≈ 1/CONCURRENCY):worker 池抢队列,出错跳过不注一篑
              const CONCURRENCY = 3;
              let done = 0;
              let failed = 0;
              const queue = [...slots];
              // 邻块清单(组件+要旨,按时间序):喂给每次 compose,让模型主动区别于相邻组件(反单调)。
              // 取整个 composition 的图形位(占位 + 已配好的 custom)——重配单张时也能看见周围长什么样。
              const roster = graphicsRoster();
              // 插入源转写热身:插入窗占位的卡点要用它自己源的句子(冷缓存=卡点缺失)
              if ((compRef.current.shots ?? []).some((s) => s.src)) await ensureClipTranscripts();
              report(t('配图 0/{total}…', { total: slots.length }), 0);
              const fillOne = async (slot: Block) => {
                const boxPx = slot.box
                  ? { w: Math.round(slot.box.w * compRef.current.width), h: Math.round(slot.box.h * compRef.current.height) }
                  : undefined;
                // 落在这个占位时间窗内的口播句 → 本地时间 beats(逻辑在 beatsForWindow,与 BYO compose_context 共用)
                const beats = beatsForWindow(slot.startSec, slot.durationSec);
                const neighbors = neighborsFrom(roster, slot.id);
                const seed = { id: slot.id, kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: slot.label ?? '图形', durationSec: slot.durationSec, ...(boxPx ? { boxPx } : {}), ...(beats.length ? { beats } : {}), ...(neighbors ? { neighbors } : {}) };
                const parsed = await composeBlockChecked(seed, placeholderSpec(slot));
                setComp((cc) => ({
                  ...cc,
                  blocks: cc.blocks.map((b) =>
                    b.id === slot.id ? { ...b, templateId: 'custom', slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody } } : b,
                  ),
                }));
              };
              const worker = async () => {
                for (;;) {
                  const slot = queue.shift();
                  if (!slot) return;
                  try {
                    await fillOne(slot);
                  } catch (e) {
                    failed += 1;
                    console.warn('[studio] 配图失败', slot.id, e);
                  }
                  markGenerating([slot.id], false); // 出结果就解锁,不等整批
                  done += 1;
                  report(t('配图 {done}/{total} · {label}', { done, total: slots.length, label: (slot.label ?? '').slice(0, 12) }), done / slots.length);
                }
              };
              await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slots.length) }, worker));
              const okCount = slots.length - failed;
              return {
                ok: okCount > 0,
                summary:
                  t('已配 {n} 张设计图形', { n: okCount }) +
                  (failed ? t(',{n} 张失败(占位还在,可以再说「重新配图」)', { n: failed }) : '') +
                  (skipped ? t('(测试期只配前 {cap},另 {n} 处占位先留着)', { cap: GRAPHICS_TEST_CAP, n: skipped }) : ''),
                ...(okCount === 0 ? { error: t('配图全部失败,稍后重试') } : {}),
              };
            } finally {
              markGenerating(lockedIds, false);
              clearToolProgress(toolId);
            }
          }
          case 'move_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('找不到这个组件') };
            moveBlock(b.id, Number(input.startSec));
            return { ok: true, summary: t('已把「{name}」移到 {sec}s', { name: bname(b), sec: r1(input.startSec) }) };
          }
          case 'resize_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('找不到这个组件') };
            const s = Number(input.startSec);
            const d = Number(input.durationSec);
            resizeBlock(b.id, s, d);
            return { ok: true, summary: t('已把「{name}」改到 {from}–{to}s', { name: bname(b), from: r1(s), to: r1(s + d) }) };
          }
          case 'delete_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('找不到这个组件') };
            postPreview({ type: 'hf:remove', id: b.id });
            setComp((cc) => ({ ...cc, blocks: cc.blocks.filter((x) => x.id !== b.id) }));
            if (selectedIdRef.current === b.id) setSelectedId(null);
            return { ok: true, summary: t('已删除「{name}」', { name: bname(b) }) };
          }
          case 'delete_blocks': {
            const ids = Array.isArray(input.blockIds) ? new Set((input.blockIds as unknown[]).map(String)) : null;
            if (!ids?.size) return { ok: false, error: t('缺少 blockIds:要删哪些组件?') };
            const hit = c.blocks.filter((b) => ids.has(b.id));
            if (!hit.length) return { ok: false, error: t('找不到这些组件') };
            hit.forEach((b) => postPreview({ type: 'hf:remove', id: b.id }));
            setComp((cc) => ({ ...cc, blocks: cc.blocks.filter((b) => !ids.has(b.id)) }));
            if (selectedIdRef.current && ids.has(selectedIdRef.current)) setSelectedId(null);
            return { ok: true, summary: t('已删除 {n} 个组件', { n: hit.length }) };
          }
          case 'duplicate_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('找不到这个组件') };
            const at = typeof input.atSec === 'number' ? Math.max(0, input.atSec) : b.startSec + b.durationSec;
            const dupStart = Math.round(at * 100) / 100;
            const nb: Block = {
              ...b,
              id: blockId('dup'),
              startSec: dupStart,
              trackIndex: freeTrack(compRef.current.blocks, dupStart, b.durationSec, b.trackIndex),
              slots: { ...b.slots },
            };
            setComp((cc) => ({ ...cc, blocks: [...cc.blocks, nb] }));
            setSelectedShotId(null);
            setSelectedId(nb.id);
            return { ok: true, summary: t('已复制「{name}」到 {sec}s', { name: bname(b), sec: r1(nb.startSec) }), data: { newBlockId: nb.id } };
          }
          case 'add_transition': {
            const at = Number(input.atSec);
            if (!Number.isFinite(at) || at < 0) return { ok: false, error: t('atSec 不合法') };
            const sp = clipSpans(ensureShots(compRef.current));
            const bounds = sp.slice(1).map((s) => s.editedStart);
            const cut = bounds.find((b) => Math.abs(b - at) < 0.3);
            if (cut == null) return { ok: false, error: t('atSec 必须是分镜切点(边界:{bounds}s)——转场是两镜内容的交接', { bounds: bounds.map(r1).join(', ') }) };
            const remove = input.effect === 'none' || input.remove === true;
            const effect: CutTransitionEffect = typeof input.effect === 'string' && ['fade', 'fadeblack', 'directional', 'directionalwipe', 'circleopen', 'windowslice', 'crosszoom', 'rotatescale', 'glitch', 'dreamy'].includes(input.effect) ? (input.effect as CutTransitionEffect) : 'fade';
            const dir = typeof input.direction === 'string' && ['up', 'down', 'left', 'right'].includes(input.direction) ? (input.direction as TransitionDirection) : undefined;
            setCutTransition(cut, remove ? null : effect, dir);
            if (!remove && typeof input.durationSec === 'number' && Number.isFinite(input.durationSec)) {
              const selfId = sp[bounds.indexOf(cut) + 1]!.clip.id;
              resizeCutTransition(selfId, input.durationSec);
            }
            return { ok: true, summary: remove ? t('已移除 {sec}s 处的转场', { sec: r1(cut) }) : t('已在 {sec}s 的切点设转场({effect})', { sec: r1(cut), effect }) };
          }
          case 'get_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('找不到这个组件') };
            const s = b.slots as { innerHtml?: unknown; timelineBody?: unknown };
            const rendered =
              b.templateId === 'custom'
                ? { innerHtml: String(s.innerHtml ?? ''), timelineBody: String(s.timelineBody ?? '') }
                : renderBlock(b);
            const cap = (x: string, n: number) => (x.length > n ? `${x.slice(0, n)}\n…(truncated, ${x.length} chars total)` : x);
            return {
              ok: true,
              summary: t('「{name}」 {from}–{to}s · 轨{track}', { name: bname(b), from: r1(b.startSec), to: r1(b.startSec + b.durationSec), track: b.trackIndex }),
              data: {
                id: b.id,
                templateId: b.templateId,
                kind: blockKind(b),
                label: b.label,
                startSec: b.startSec,
                durationSec: b.durationSec,
                trackIndex: b.trackIndex,
                box: b.box ?? null,
                fitScale: b.fitScale ?? null,
                ...(isPlaceholder(b) ? { placeholder: true, spec: placeholderSpec(b).slice(0, 300) } : {}),
                innerHtml: cap(rendered.innerHtml, 1600),
                timelineBody: cap(rendered.timelineBody, 800),
              },
            };
          }
          case 'focus_element': {
            const id = String(input.id ?? '');
            const b = findBlock(id);
            if (b) {
              setSelectedShotId(null);
              setSelectedId(b.id);
              // 停到入场动画之后(seekBlockSettled 口径):+0.01 是入场 0 帧,块从
              // opacity:0 起势——离焦(点空白/Esc)后时间轴真值就是全透明,像块消失了
              seekBlockSettled(b.id);
              return { ok: true, summary: t('定位到「{name}」', { name: bname(b) }) };
            }
            const sp = clipSpans(ensureShots(c)).find((x) => x.clip.id === id);
            if (sp) {
              setSelectedId(null);
              setSelectedShotId(id);
              applyT(sp.editedStart + 0.01);
              return { ok: true, summary: t('定位到分镜 #{n}', { n: sp.index + 1 }) };
            }
            return { ok: false, error: t('找不到这个组件') };
          }
          case 'cut_range': {
            if (!c.video) return { ok: false, error: t('还没有视频') };
            const from = Number(input.fromSec);
            const to = Number(input.toSec);
            if (!Number.isFinite(from) || !Number.isFinite(to) || to - from < 0.1) return { ok: false, error: t('fromSec/toSec 不合法') };
            const shots = ensureShots(c);
            const r = removeEditedRange(shots, from, to, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }));
            if (!r.removed) return { ok: false, error: t('这个区间删不了(可能覆盖了整条视频)') };
            setComp((cur) => ({ ...cur, shots: r.clips, blocks: removeEditedInterval(cur.blocks, r.removed![0], r.removed![1]) }));
            setSelectedShotId(null);
            applyT(r.removed[0]);
            return { ok: true, summary: t('已删除 {from}–{to}s 的画面', { from: r1(r.removed[0]), to: r1(r.removed[1]) }), data: { shotIds: r.clips.map((s) => s.id) } };
          }
          case 'set_captions': {
            if (!c.video) return { ok: false, error: t('先上传视频再设字幕') };
            const preset = typeof input.preset === 'string' ? input.preset : undefined;
            if (preset && !CAPTION_PRESETS.some((p) => p.id === preset)) return { ok: false, error: t('没有这个字幕预设:{preset}', { preset }) };
            const yPct = Number(input.yPct);
            const scale = Number(input.scale);
            const patch: Parameters<typeof setCaptionStyle>[0] = {};
            if (Number.isFinite(yPct)) patch.yPct = yPct;
            if (Number.isFinite(scale)) patch.scale = scale;
            if (!preset && !Object.keys(patch).length) return { ok: false, error: t('没说要设什么:preset / yPct / scale 至少给一个') };
            if (preset) await applyCaptionPreset(preset); // 开/换样式:按口播稿重铺整层(内部会跑 ASR、压 undo 快照)
            if (Object.keys(patch).length) setCaptionStyle(patch);
            if (!compRef.current.blocks.some(isSentenceCaption)) return { ok: false, error: t('没能生成字幕(口播稿可能是空的)') };
            const cs = resolveCaptionStyle(compRef.current);
            return { ok: true, summary: preset ? t('已设字幕:{name}', { name: t(getCaptionPreset(cs.preset).name) }) : t('已调字幕:{name}', { name: t(getCaptionPreset(cs.preset).name) }) };
          }
          case 'remove_captions': {
            if (!compRef.current.blocks.some(isSentenceCaption)) return { ok: false, error: t('现在没有字幕') };
            removeCaptionLayer();
            return { ok: true, summary: t('已移除字幕') };
          }
          case 'set_caption_translations': {
            // 双语字幕:译文写在转写句的 sub 上(与离线执行器同语义),字幕层重铺自动带出
            const clear = input.clear === true;
            const items = (Array.isArray(input.items) ? input.items : [])
              .map((it) => {
                const o = (it ?? {}) as Record<string, unknown>;
                return { index: Number(o.index), text: typeof o.text === 'string' ? o.text.trim() : null };
              })
              .filter((it): it is { index: number; text: string } => Number.isInteger(it.index) && it.index >= 0 && it.text !== null);
            if (!clear && !items.length) return { ok: false, error: t('items 为空/不合法(要 {index, text}[],index 是 read_script 的行号)') };
            const stripSub = (segs: AsrSegment[]) => segs.map(({ sub: _s, ...rest }) => rest);
            let summary: string;
            if (clear) {
              if (asrRef.current) {
                const next = stripSub(asrRef.current);
                setAsrSentences(next);
                asrRef.current = next;
              }
              const nextClips = Object.fromEntries(Object.entries(clipAsrRef.current).map(([k, v]) => [k, stripSub(v)]));
              setClipAsr(nextClips);
              clipAsrRef.current = nextClips;
              summary = t('已清除全部字幕译文');
            } else {
              const shotIdIn = typeof input.shotId === 'string' ? input.shotId : undefined;
              const src = shotIdIn ? ensureShots(compRef.current).find((s) => s.id === shotIdIn)?.src : undefined;
              if (shotIdIn && !src) return { ok: false, error: t('这个 shotId 不是插入片段(主口播不要传 shotId)') };
              const segs = src ? clipAsrRef.current[src] : asrRef.current;
              if (!segs?.length) return { ok: false, error: src ? t('这个插入片段没有转写') : t('还没有口播稿,先 extract_asr') };
              const bad = items.filter((it) => it.index >= segs.length);
              if (bad.length) return { ok: false, error: t('index 越界:{list}(该转写共 {n} 句,行号见 read_script)', { list: bad.map((b) => b.index).join(', '), n: segs.length }) };
              const next = segs.map((s, i) => {
                const hit = items.find((it) => it.index === i);
                if (!hit) return s;
                const { sub: _s, ...rest } = s;
                return hit.text ? { ...rest, sub: hit.text } : rest;
              });
              if (src) {
                const nextClips = { ...clipAsrRef.current, [src]: next };
                setClipAsr(nextClips);
                clipAsrRef.current = nextClips;
              } else {
                setAsrSentences(next);
                asrRef.current = next;
              }
              summary = t('已配 {n} 句译文', { n: items.filter((it) => it.text).length });
            }
            if (compRef.current.blocks.some(isSentenceCaption)) {
              setComp((cur) => ({ ...cur, blocks: relayCaptionLayer(cur.blocks, ensureShots(cur), asrRef.current) }));
              return { ok: true, summary };
            }
            return { ok: true, summary: summary + t('(字幕未开启,set_captions 后显示)') };
          }
          case 'cut_narration': {
            if (!c.video) return { ok: false, error: t('还没有视频') };
            const raw = Array.isArray(input.ranges) ? input.ranges : [];
            const shots0 = ensureShots(c);
            // 口播源秒 → 成片秒(loose:边界落在已删段时吸附到最近存活点,删的还是剩余那部分);
            // 从后往前删,前段删除不移位后段坐标
            const edited = raw
              .map((r) => {
                const o = (r ?? {}) as Record<string, unknown>;
                return { from: Number(o.fromSec), to: Number(o.toSec) };
              })
              .filter((r) => Number.isFinite(r.from) && Number.isFinite(r.to) && r.to - r.from > 0.05)
              .map((r) => ({ from: srcToEditedLoose(shots0, r.from, inNarrationSource), to: srcToEditedLoose(shots0, r.to, inNarrationSource) }))
              .filter((r) => r.to - r.from > 0.05)
              .sort((a, b) => b.from - a.from);
            if (!edited.length) return { ok: false, error: t('ranges 为空/不合法,或这些区间在成片里已不存在') };
            let shots = shots0;
            let blocks = c.blocks;
            let removedCount = 0;
            let firstCut = Infinity;
            for (const e of edited) {
              const rr = removeEditedRange(shots, e.from, e.to, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }));
              if (!rr.removed) continue;
              shots = rr.clips;
              blocks = removeEditedInterval(blocks, rr.removed[0], rr.removed[1]);
              removedCount++;
              firstCut = Math.min(firstCut, rr.removed[0]);
            }
            if (!removedCount) return { ok: false, error: t('这些区间删不了(可能覆盖了整条视频)') };
            const relaid = relayCaptionLayer(blocks, shots, asrRef.current); // 字幕跟口播走:被删词自动掉出
            setComp((cur) => ({ ...cur, shots, blocks: relaid }));
            setSelectedShotId(null);
            if (Number.isFinite(firstCut)) applyT(firstCut);
            return { ok: true, summary: t('已按口播稿删了 {n} 段', { n: removedCount }) };
          }
          case 'undo': {
            // 生成进行中不许回滚:快照恢复旧 comp 后,在跑的 worker 还会把结果写回来,状态错乱
            if (genIdsRef.current.size) return { ok: false, error: t('有组件正在生成,等完成再撤销') };
            const stack = undoStackRef.current;
            // 工具没改成(返回失败/无变化)留下的快照与当前引用相同 → 去重,不算一步
            while (stack.length && stack[stack.length - 1] === compRef.current) stack.pop();
            const prev = stack.pop();
            if (!prev) return { ok: false, error: t('没有可撤销的改动') };
            redoStackRef.current.push(compRef.current); // agent 撤销同样喂重做线(⇧⌘Z/按钮可重做)
            setComp(prev);
            setSelectedId(null);
            setSelectedShotId(null);
            return { ok: true, summary: t('已撤销上一步') + (stack.length ? t('(还可再撤 {n} 步)', { n: stack.length }) : '') };
          }
          case 'export_video': {
            // 默认本地导出(用户定的,OSS 壳同路):经桥驱动本标签页跑客户端合成(WebCodecs),
            // 成片直接走浏览器下载落用户本机——不上传 R2,零服务端开销。track_export 轮询。
            if (!compRef.current.video?.url) return { ok: false, error: t('先上传口播视频再导出') };
            const job = agentExportRef.current;
            if (job.running) return { ok: true, summary: t('已有导出在进行中'), data: { status: 'running', progress: exportPctRef.current, hint: 'poll track_export' } };
            const opts = {
              res: [2160, 1440, 1080, 720, 540].includes(Number(input.resolution)) ? (Number(input.resolution) as 2160 | 1440 | 1080 | 720 | 540) : (1080 as const),
              fps: [24, 30, 60].includes(Number(input.fps)) ? (Number(input.fps) as 24 | 30 | 60) : (30 as const),
              format: input.format === 'webm' || input.format === 'mov' ? (input.format as 'webm' | 'mov') : ('mp4' as const),
            };
            agentExportRef.current = { running: true, filename: null, error: null };
            void exportVideo(opts)
              .then((r) => {
                agentExportRef.current = { running: false, filename: r.ok ? (r.filename ?? null) : null, error: r.ok ? null : (r.error ?? t('导出失败')) };
              })
              .catch((e) => {
                agentExportRef.current = { running: false, filename: null, error: e instanceof Error ? e.message : String(e) };
              });
            return { ok: true, summary: t('开始导出(本地客户端合成,约 1x 片长)'), data: { status: 'running', options: opts, hint: 'poll track_export every ~15s; keep this studio tab open' } };
          }
          case 'track_export': {
            const j = agentExportRef.current;
            if (j.running) return { ok: true, summary: t('导出中 {pct}%', { pct: exportPctRef.current }), data: { status: 'running', progress: exportPctRef.current } };
            if (j.filename) return { ok: true, summary: t('导出完成,已经浏览器下载落盘'), data: { status: 'done', filename: j.filename, saved_via: 'browser download (user Downloads folder by default)' } };
            if (j.error) return { ok: false, error: j.error };
            return { ok: true, summary: t('还没有发起过导出'), data: { status: 'idle', hint: 'call export_video first' } };
          }
          case 'set_shot_treatment': {
            const s = findShot(input.shotId);
            if (!s) return { ok: false, error: t('找不到这个分镜') };
            const tr = String(input.treatment) as ShotTreatment;
            setShotTreatment(s.id, tr);
            const name = SHOT_TREATMENTS.find((x) => x.id === tr)?.name ?? tr;
            return { ok: true, summary: t('已把取景换成「{name}」', { name: t(name) }) };
          }
          case 'split_shot': {
            if (!c.video) return { ok: false, error: t('还没有视频') };
            if (typeof input.atSec === 'number') applyT(Math.max(0, input.atSec));
            if (splitBlockedByTransition(ensureShots(compRef.current), tRef.current)) {
              return { ok: false, error: t('这个点在转场覆盖区内,不能分割——先 add_transition {atSec, effect:"none"} 移除转场') };
            }
            splitAtPlayhead();
            // setComp wrapper 同步写 compRef,这里读到的已是切完的段表
            return { ok: true, summary: t('已在播放头剪开'), data: { shotIds: (compRef.current.shots ?? []).map((s) => s.id) } };
          }
          case 'trim_shot': {
            if (!c.video) return { ok: false, error: t('还没有视频') };
            const side = input.side === 'left' ? 'left' : 'right';
            if (typeof input.atSec === 'number') applyT(Math.max(0, input.atSec));
            trimAtPlayhead(side);
            return { ok: true, summary: side === 'left' ? t('已裁掉 {sec}s 左侧的画面', { sec: r1(tRef.current) }) : t('已裁掉 {sec}s 右侧的画面', { sec: r1(tRef.current) }) };
          }
          case 'delete_shot': {
            const s = findShot(input.shotId);
            if (!s) return { ok: false, error: t('找不到这个分镜') };
            deleteShot(s.id);
            return { ok: true, summary: t('已删除这个场景') };
          }
          case 'set_video_filter': {
            const s = findShot(input.shotId);
            if (!s) return { ok: false, error: t('找不到这个分镜') };
            const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
            const f: ShotFilter = {
              ...(num(input.brightness) != null ? { brightness: num(input.brightness) } : {}),
              ...(num(input.contrast) != null ? { contrast: num(input.contrast) } : {}),
              ...(num(input.saturate) != null ? { saturate: num(input.saturate) } : {}),
            };
            const css = shotFilterCss(f);
            setShotFilter(s.id, css === 'none' ? null : f);
            return { ok: true, summary: css === 'none' ? t('已还原这个分镜的调色') : t('已调色:{css}', { css }) };
          }
          case 'insert_clip': {
            // agent 插 B-roll:字节必须已在我们的存储(helper 上传的 sig / 素材库·生成视频的
            // CDN url)——canvas 引擎画帧要 CORS 干净,所以一律拉字节成 File 走本地插入全套
            // (blob src + srcSig + OPFS + 云备份),与手动「+」插入完全同构
            if (!c.video) return { ok: false, error: t('先有主视频再插 B-roll') };
            const sigIn = typeof input.sig === 'string' ? input.sig.trim() : '';
            const urlIn = typeof input.url === 'string' ? input.url.trim() : '';
            if (!sigIn && !urlIn) return { ok: false, error: t('url 或 sig 至少给一个(sig=asset-import helper 上传返回的指纹;url=用户素材库/生成视频的地址)') };
            const at = typeof input.atSec === 'number' && Number.isFinite(input.atSec) ? Math.max(0, input.atSec) : tRef.current;
            try {
              report(t('拉取片段字节…'));
              const proxyFetch = async (u: string): Promise<File | null> => {
                const pr = await fetch(`/api/media/fetch?url=${encodeURIComponent(u)}`);
                if (!pr.ok) return null;
                const b = await pr.blob();
                const name = (() => {
                  try {
                    return decodeURIComponent(new URL(u).pathname.split('/').pop() || '') || 'clip.mp4';
                  } catch {
                    return 'clip.mp4';
                  }
                })();
                // lastModified 钉 0:合成 File 的 sig(name:size:0)跨次拉取稳定,云备份/OPFS 不重复存
                return new File([b], name, { type: b.type || 'video/mp4', lastModified: 0 });
              };
              let f: File | null = null;
              if (sigIn) {
                f = await studioProviders().vault.fetch(sigIn);
                if (!f) {
                  // presign 直拉失败(CORS/未配)→ 公网 CDN 经同源代理兜底
                  const r = await fetch('/api/studio/media', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'get', sig: sigIn }) });
                  const key = r.ok ? ((await r.json()) as { key?: string }).key : null;
                  const base = imgSourceBase();
                  if (key && base) f = await proxyFetch(`${base}/${key}`);
                }
                if (!f) return { ok: false, error: t('按 sig 没取到字节——先跑 asset-import helper 上传(它会返回这个 sig)') };
              } else {
                f = await proxyFetch(urlIn);
                if (!f) return { ok: false, error: t('url 拉取失败——只支持我们存储/CDN 上的视频(外部视频先经 asset-import helper 上传)') };
              }
              report(t('读取时长…'));
              const blobUrl = URL.createObjectURL(f);
              const dur = await videoDurationOf(blobUrl);
              if (!dur) {
                URL.revokeObjectURL(blobUrl);
                return { ok: false, error: t('读取视频时长失败(容器/编码浏览器不认,换 mp4/mov 试试)') };
              }
              void saveLocalVideo(f, fileSig(f)).catch(() => {});
              const newShotId = insertClipCore(blobUrl, Math.round(dur * 100) / 100, at, f);
              return { ok: true, summary: t('已在 {at}s 插入 {dur}s 的片段', { at: r1(at), dur: r1(dur) }), data: { shotId: newShotId } };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'attach_frame': {
            // agent 推荐/用户点名 → 挂 frame:走 chat 的 attachFrame(tag + 后续请求带 frameId),
            // onFrameApplied 再把 palette+frameId 落 comp。下一轮 <frame_attached> 会让它 read_frame。
            const fid = typeof input.frame_id === 'string' ? input.frame_id : '';
            const f = frameCatalogRef.current.find((x) => x.id === fid);
            if (!f) return { ok: false, error: t('没有这个 frame:{id}(id 见 <frame_catalog>)', { id: fid }) };
            chatRef.current?.attachFrame({ id: f.id, title: f.title, icon: f.icon, iconKey: f.iconKey ?? null });
            return { ok: true, summary: t('已应用「{title}」主题,之后生成的内容都走这套设计', { title: f.title }) };
          }
          case 'add_block': {
            try {
              const at = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c)) : r1(tRef.current);
              const seed = { id: blockId('ai'), kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: '新组件' };
              // 流式:note(围栏前的人话)边生成边推到卡片;产物过静态检查(坏 CSS 不进 composition)
              const parsed = await composeBlockChecked(seed, `新建一个叠加组件(标题/大数字/列表/花字等,按内容自己定):${String(input.instruction ?? '')}`, (acc) =>
                report(noteOf(acc) || t('生成中…')),
              );
              const nb: Block = {
                id: seed.id,
                templateId: 'custom',
                slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody },
                startSec: at,
                durationSec: 3,
                trackIndex: freeTrack(compRef.current.blocks, at, 3),
                label: String(input.instruction ?? t('新组件')).slice(0, 12),
              };
              setComp((cc) => ({ ...cc, blocks: [...cc.blocks, nb] }));
              setSelectedShotId(null);
              setSelectedId(seed.id);
              applyT(Math.max(0, at + 0.01)); // 生成完直接带用户看结果
              return { ok: true, summary: parsed.note || t('已添加组件'), data: { newBlockId: seed.id } };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'edit_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('找不到这个组件') };
            try {
              markGenerating([b.id], true); // 重写期间同样锁编辑(生成结果会整块覆盖 slots)
              const seed = { id: b.id, kind: blockKind(b), ...renderBlock(b), label: b.label };
              const parsed = await composeBlockChecked(seed, String(input.instruction ?? ''), (acc) => report(noteOf(acc) || t('修改中…')));
              setComp((cc) => ({
                ...cc,
                blocks: cc.blocks.map((x) =>
                  x.id === b.id ? { ...x, templateId: 'custom', slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody } } : x,
                ),
              }));
              return { ok: true, summary: parsed.note || t('已修改这个组件') };
            } finally {
              markGenerating([b.id], false);
              clearToolProgress(toolId);
            }
          }
          default:
            return { ok: false, error: t('未知操作 {tool}', { tool: toolId }) };
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
  };

  /** 外部 agent 专属桥操作(MCP-only,内部 chat 不可见)——BYO-brain 契约的浏览器半边:
   *  compose_context/plan_context 取实时上下文(服务端 briefs 组装 prompt,外部模型自己生成),
   *  apply_block/submit_plan 收生成物、过与自家路径**同一套**校验(parseBlockResponse+lintBlock /
   *  parsePlan)再落状态——LLM 换人,质量契约不降级。其余工具落回 runStudioTool。 */
  const runExternalTool = async (tool: string, input: Record<string, unknown>): Promise<StudioToolResult> => {
    const c2 = compRef.current;
    switch (tool) {
      case 'compose_context': {
        const script = (asrRef.current ?? []).map((s) => s.text).join('');
        const base = { theme: c2.theme, ...(c2.palette ? { palette: c2.palette } : {}), ...(c2.frameId ? { frameId: c2.frameId } : {}) };
        const bid = typeof input.blockId === 'string' ? input.blockId : undefined;
        if (bid) {
          const b = c2.blocks.find((x) => x.id === bid);
          if (!b) return { ok: false, error: t('找不到这个组件(id 来自 get_state / 工具回执)') };
          if (genIdsRef.current.has(b.id)) return { ok: false, error: t('这块正在生成中,等它完成') };
          if (isPlaceholder(b)) {
            const boxPx = b.box ? { w: Math.round(b.box.w * c2.width), h: Math.round(b.box.h * c2.height) } : undefined;
            const beats = beatsForWindow(b.startSec, b.durationSec);
            const neighbors = neighborsFrom(graphicsRoster(), b.id);
            return {
              ok: true,
              summary: t('已取占位上下文'),
              data: {
                ...base,
                block: { id: b.id, kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: b.label ?? '图形', durationSec: b.durationSec, ...(boxPx ? { boxPx } : {}) },
                context: { ...(script ? { script } : {}), ...(beats.length ? { beats } : {}), ...(neighbors ? { neighbors } : {}) },
                suggested_instruction: placeholderSpec(b),
              },
            };
          }
          return {
            ok: true,
            summary: t('已取块上下文'),
            data: { ...base, block: { id: b.id, kind: blockKind(b), ...renderBlock(b), label: b.label }, ...(script ? { context: { script } } : {}) },
          };
        }
        const at = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c2)) : Math.round(tRef.current * 10) / 10;
        return {
          ok: true,
          summary: t('已取新组件上下文'),
          data: { ...base, atSec: at, block: { id: blockId('ai'), kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: '新组件' }, ...(script ? { context: { script } } : {}) },
        };
      }
      case 'apply_block': {
        const raw = typeof input.raw === 'string' ? input.raw : '';
        if (!raw.trim()) return { ok: false, error: t('raw required(compose_block_brief 简报生成的原文)') };
        const bid = typeof input.blockId === 'string' ? input.blockId : undefined;
        const target = bid ? c2.blocks.find((x) => x.id === bid) : undefined;
        if (bid && !target) return { ok: false, error: t('找不到这个组件(用 compose_block_brief 给过的同一个 blockId)') };
        if (target && genIdsRef.current.has(target.id)) return { ok: false, error: t('这块正在生成中,等它完成') };
        const fb = target && !isPlaceholder(target) ? renderBlock(target) : { innerHtml: '<div></div>', timelineBody: '' };
        const applyId = target?.id ?? blockId('ai');
        const parsed = parseBlockResponse(raw, fb);
        const issues = lintBlock({ blockId: applyId, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody });
        // 与 composeBlockChecked 同一硬线:硬问题打回让外部模型自己修(它就是那个"修一轮"的模型)
        const hard = issues.filter((i) => HARD_LINT_CODES.has(i.code));
        if (hard.length) {
          return { ok: false, error: t('没通过静态检查——只修列出的问题,其余保持原样,再 apply_block 一次'), data: { issues: issues.map((i) => i.message) } };
        }
        const warnings = issues.length ? { warnings: issues.map((i) => i.message) } : {};
        pushUndoSnapshot();
        if (target) {
          setComp((cc) => ({
            ...cc,
            blocks: cc.blocks.map((x) => (x.id === target.id ? { ...x, templateId: 'custom', slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody } } : x)),
          }));
          setSelectedShotId(null);
          setSelectedId(target.id);
          applyT(Math.max(0, target.startSec + 0.01));
          return { ok: true, summary: isPlaceholder(target) ? t('已填充「{label}」', { label: target.label ?? t('图形') }) : t('已更新「{label}」', { label: target.label?.slice(0, 10) || blockKind(target) }), data: { blockId: target.id, ...warnings } };
        }
        const at = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c2)) : Math.round(tRef.current * 10) / 10;
        const dur = typeof input.durationSec === 'number' && input.durationSec >= 0.3 ? input.durationSec : 3;
        const nb: Block = {
          id: applyId,
          templateId: 'custom',
          slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody },
          startSec: at,
          durationSec: dur,
          trackIndex: freeTrack(c2.blocks, at, dur),
          label: (typeof input.label === 'string' && input.label ? input.label : t('新组件')).slice(0, 12),
        };
        setComp((cc) => ({ ...cc, blocks: [...cc.blocks, nb] }));
        setSelectedShotId(null);
        setSelectedId(nb.id);
        applyT(Math.max(0, at + 0.01));
        return { ok: true, summary: t('已添加组件'), data: { newBlockId: nb.id, ...warnings } };
      }
      case 'capture_frame': {
        // 外部 agent 的"眼睛":与导出同一条渲染管线截一帧(BYO 写块后自查视觉效果)
        const at = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c2)) : tRef.current;
        try {
          const shot = await captureCompositionFrame({ comp: c2, videoFile: videoFileRef.current, clipFiles: clipFilesRef.current, atSec: at });
          const b64 = shot.dataUrl.slice(shot.dataUrl.indexOf(',') + 1);
          return { ok: true, summary: t('已截取 {sec}s 处画面', { sec: Math.round(at * 10) / 10 }), image: { data: b64, mimeType: 'image/jpeg' }, data: { atSec: at, width: shot.width, height: shot.height } } as StudioToolResult;
        } catch (e) {
          return { ok: false, error: t('截帧失败:{message}', { message: e instanceof Error ? e.message : String(e) }) };
        }
      }
      case 'plan_context': {
        const segs = asrRef.current;
        if (!segs?.length) return { ok: false, error: t('还没有口播稿,先 extract_asr') };
        const vis = visualRef.current;
        const visuals = vis?.segments.length
          ? segs.map((s, i) => {
              const mid = (s.start + s.end) / 2;
              const seg = vis.segments.find((x) => mid >= x.start - 0.01 && mid < x.end + 0.01) ?? vis.segments.at(-1)!;
              return { index: i, content: seg.label.content, safe: seg.label.safe };
            })
          : undefined;
        const inserts = await insertedClipsForPlanRef.current().catch(() => [] as PlanInsert[]);
        return {
          ok: true,
          summary: t('已取规划上下文'),
          data: {
            sentences: segs.map((s, i) => ({ index: i, text: s.text, start: s.start, end: s.end })),
            videoDurationSec: currentVideo()?.durationSec ?? 0,
            theme: c2.theme,
            ...(visuals ? { visuals } : {}),
            ...(inserts.length ? { inserts } : {}),
          },
        };
      }
      case 'submit_plan': {
        if (!asrRef.current?.length) return { ok: false, error: t('先 extract_asr(规划挂在句子索引上)') };
        const text = typeof input.plan === 'string' ? input.plan : JSON.stringify(input.plan ?? {});
        // 统一叙事流(与 plan_context 给 agent 的同一交织):全局行号场景在装配层分解回主/插入段
        const insCtx = await insertedClipsForPlanRef.current().catch(() => [] as PlanInsert[]);
        const planRows = unifiedPlanRows(asrRef.current.map((x, i) => ({ index: i, text: x.text, start: x.start, end: x.end })), insCtx);
        let p: DraftPlan;
        try {
          p = parsePlan(text, planRows);
        } catch (e) {
          return { ok: false, error: t('规划解析失败:{message}——按 plan_brief 的契约重新生成', { message: e instanceof Error ? e.message : String(e) }) };
        }
        if (!p.scenes.length) return { ok: false, error: t('没有有效场景(检查 from/to 是否落在句子索引内)——重新生成再提交') };
        pushUndoSnapshot();
        planRef.current = p;
        setPlan(p);
        return { ok: true, summary: t('已接收规划 · {n} 个场景(接着 lay_out 落分镜)', { n: p.scenes.length }), data: { scenes: p.scenes.length } };
      }
      default:
        return runStudioTool(tool, input);
    }
  };

  // 外部 agent 桥(Codex/Claude Code/任何 MCP 客户端 经 /api/studio/mcp → StudioBridge DO → 本标签页):
  // 与内部 chat 完全同一执行面 + BYO 专属操作;get_state 回与 chat 同源的局势快照。
  useAgentBridge({
    runTool: runExternalTool,
    getState: () => `<composition_state>\n${buildSituation(getChatBody() as ChatSituation)}\n</composition_state>`,
    onExternalCall: (tool, result) => {
      if (tool === 'get_state' || tool === 'compose_context' || tool === 'plan_context') return; // 纯查询不打扰
      const EXTERNAL_LABELS: Record<string, string> = { apply_block: '外部生成落块', submit_plan: '外部规划' };
      const label = t(STUDIO_TOOL_MAP[tool]?.label ?? EXTERNAL_LABELS[tool] ?? tool);
      if (result.ok) toast.info(result.summary ? t('外部 agent · {label}:{summary}', { label, summary: result.summary }) : t('外部 agent · {label}', { label }));
      else toast.error(t('外部 agent · {label} 失败:{error}', { label, error: result.error ?? t('未知错误') }));
    },
  });

  // 选中态变化 → 背景色弹出盘收起
  useEffect(() => {
    setBgOpen(false);
  }, [selectedId]);

  // 选中态变化 → 输入框出一枚「当前选中」pill(撤掉上一枚)。
  useEffect(() => {
    let el: StudioElementRef | null = null;
    const c = compRef.current;
    if (selectedId) {
      const b = c.blocks.find((x) => x.id === selectedId);
      if (b) el = { id: b.id, label: b.label?.slice(0, 16) || blockKind(b), kind: blockKind(b), isShot: false };
    } else if (selectedShotId) {
      const i = (c.shots ?? []).findIndex((s) => s.id === selectedShotId);
      if (i >= 0) el = { id: selectedShotId, label: t('分镜 #{n}', { n: i + 1 }), kind: 'shot', isShot: true };
    }
    chatRef.current?.insertElementPill(el);
  }, [selectedId, selectedShotId]);

  /** hover 预览跳到 v 秒时,选中组件的编辑框该不该藏:出了它的时间窗 = 藏。
   *  句级花字例外 —— 手柄是全局带,只要 v 处还有任意句级花字在场就留着。v=null(hover 结束)= 不藏。 */
  const selHiddenAt = (v: number | null): boolean => {
    if (v == null) return false;
    const c = compRef.current;
    const sb = selectedIdRef.current ? c.blocks.find((b) => b.id === selectedIdRef.current) : null;
    if (!sb) return false;
    if (isSentenceCaption(sb)) {
      return !c.blocks.some((b) => isSentenceCaption(b) && v >= b.startSec && v < b.startSec + b.durationSec);
    }
    return v < sb.startSec - 0.01 || v > sb.startSec + sb.durationSec + 0.01;
  };

  /** 选中块在**当前画面时刻**是否在场:不在场就不画选中框/浮动条(组件都不在了,边框
   *  钉在一帧不相干的画面上只会误导)。播放头驻留时用 t;hover 预览另有 scrubHideSel。 */
  const selOnScreen = (b: Block): boolean => {
    if (isSentenceCaption(b)) return comp.blocks.some((x) => isSentenceCaption(x) && tSec >= x.startSec && tSec < x.startSec + x.durationSec);
    return tSec >= b.startSec - 0.01 && tSec < b.startSec + b.durationSec + 0.01;
  };

  // memo 子组件的回调 props:身份恒定、内部永远调最新实现(见 use-stable-callbacks)。
  // runStudioTool 本体保持每帧重建(要读最新 state/闭包),稳定的只是外壳。
  const chatCbs = useStableCallbacks({ runTool: runStudioTool });

  /* ---------- 双语翻译(字幕面板「双语翻译」区):译文由自家 LLM 出(providers.translate,
     OSS 壳缺省=面板隐藏该区),落数据走 set_caption_translations 同一执行器(undo/重铺同源)。 ---------- */
  const translateCaptionsTo = async (target: string) => {
    const tr = studioProviders().translate;
    if (!tr) return;
    if (!asrRef.current?.length) {
      toast.error(t('还没有口播稿——先提取口播稿'));
      return;
    }
    setCapTransBusy(true);
    try {
      await ensureClipTranscripts(); // 插入源一并翻,别出半截双语
      const main = asrRef.current ?? [];
      const out = await tr(main.map((x, i) => ({ index: i, text: x.text })), target);
      if (out.length) await runStudioTool('set_caption_translations', { items: out });
      for (const [src, segs] of Object.entries(clipAsrRef.current)) {
        if (!segs.length) continue;
        const shot = (compRef.current.shots ?? []).find((sh) => sh.src === src);
        if (!shot) continue;
        const co = await tr(segs.map((x, i) => ({ index: i, text: x.text })), target);
        if (co.length) await runStudioTool('set_caption_translations', { shotId: shot.id, items: co });
      }
      // 记住目标语言:面板 chip 选中态 + 新插入片段自动补翻同一语言
      setCaptionStyle({ sub: { ...(resolveCaptionStyle(compRef.current).sub ?? {}), lang: target } });
      toast.success(t('已生成{lang}译文', { lang: target }) + (compRef.current.blocks.some(isSentenceCaption) ? '' : t('——开启字幕后显示')));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('翻译失败,稍后再试'));
    } finally {
      setCapTransBusy(false);
    }
  };
  const timelineCbs = useStableCallbacks({
    onPps: setPps,
    onSeek: (v: number) => {
      if (playing) setPlaying(false);
      applyT(v);
    },
    onScrub: (v: number | null) => {
      if (playing) return; // 播放时不打扰
      postPreview({ type: 'hf:seek', t: v == null ? tRef.current : v }); // hover 预览:只动播放器,不动播放头
      videoEngineRef.current?.seek(v == null ? tRef.current : v); // 视频帧跟手(引擎侧定位取帧)
      // 选中边框跟画面走:hover 到选中组件时间窗外就藏(同值 setState 会被 React 直接跳过,不追加渲染)
      setScrubHideSel(selHiddenAt(v));
    },
    onSelect: (id: string | null) => {
      setSelectedId(id);
      setScrubHideSel(false);
      if (id) setSelectedShotId(null);
    },
    /** 组件点选。additive=⌘/Ctrl 多选(进/出多选集,不动播放头);单选=聚焦单块。 */
    onSelectBlock: (id: string, additive?: boolean) => {
      if (additive) {
        toggleBlockSelect(id);
        return;
      }
      setSelectedId(id);
      setScrubHideSel(false);
      setSelectedShotId(null);
    },
    onBoxSelectBlocks: selectBlocksBox,
    onSelectShot: selectShot,
    onBoxSelectShots: selectShotsBox,
    /** 场景卡拖动重排(同主流剪辑器):片段序列 splice 到新位。字幕跟口播走,无条件重铺;
     *  叠加组件块留在原成片时刻不跟片段走(同主流剪辑器口径)。 */
    onReorderShot: (from: number, to: number) => {
      const shots = ensureShots(compRef.current);
      if (from === to || !shots[from]) return;
      pushUndoSnapshot();
      const next = shots.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      setComp((cur) => ({ ...cur, shots: next, blocks: relayCaptionLayer(cur.blocks, next, asrRef.current) }));
    },
    onDeselectAll: () => {
      setSelectedId(null);
      setSelectedShotIds(new Set());
      setSelectedShotIdRaw(null);
    },
    onOpenShotSettings: openShotSettings,
    onMoveBlock: moveBlock,
    onResizeBlock: resizeBlock,
    /** 块跨轨移动(chip 纵向拖到另一条组件轨):改 trackIndex=改 z(NLE 惯例);
     *  搬空的轨自动消失(时间轴的轨道行从块派生,无行可渲即collapse)。 */
    onMoveBlockTrack: (id: string, trackIndex: number) => {
      if (genLockToast(id)) return;
      pushUndoSnapshot();
      setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, trackIndex } : b)) }));
    },
    /** 块拖进行间空隙=掰新轨:在自上而下显示序的 slot 位插一条新轨,整表重编 z
     *  (与 onReorderTracks 同口径:从 2 起编,z=1 恒归句级字幕层)。搬空的旧轨自动消失。 */
    onMoveBlockNewTrack: (id: string, slot: number) => {
      if (genLockToast(id)) return;
      const c = compRef.current;
      const order = [...new Set(c.blocks.filter((b) => b.trackIndex > 0 && !isSentenceCaption(b)).map((b) => b.trackIndex))].sort((a, b) => b - a);
      const NEW = -1; // 哨兵:新轨占位
      order.splice(Math.max(0, Math.min(order.length, slot)), 0, NEW);
      const K = order.length;
      const z = new Map(order.map((tk, i) => [tk, K - i + 1]));
      pushUndoSnapshot();
      setComp((cur) => ({
        ...cur,
        blocks: cur.blocks.map((b) =>
          b.id === id
            ? { ...b, trackIndex: z.get(NEW)! }
            : b.trackIndex > 0 && !isSentenceCaption(b) && z.has(b.trackIndex)
              ? { ...b, trackIndex: z.get(b.trackIndex)! }
              : b,
        ),
      }));
    },
    onInsertClipAt: (t: number) => void insertLocalClipAt(t),
    onOpenTransition: openTransitionAt,
    onResizeTransition: resizeCutTransition,
    onDropAsset: (t: number) => {
      // 非主轨落点:图片=落点时刻插画中画素材块;组件=落点时刻插入(与图片同权,用户定的统一);
      // 视频在这些区域不响应(时间轴侧已拦)
      const a = dragAsset;
      setDragAsset(null);
      if (a?.type === 'image') void insertPanelMedia(a, a.label, t);
      else if (a?.type === 'element') insertGeneratedElement(a.element, a.prompt, t);
    },
    onDropAssetClip: (t: number) => {
      // 主轨落点 = 插入片段:视频整段、图片 5s 静态帧(用户定的);组件不片段化(时间轴侧已拦)
      const a = dragAsset;
      setDragAsset(null);
      if (a && a.type !== 'element') void insertLibraryClipAt(a, t);
    },
    onReorderTracks: (topToBottom: number[]) => {
      // 时间轴叠加轨自上而下 = 画布 z 从高到低(NLE 惯例):按新显示序重编 z。
      // 从 2 起编(顶行 = K+1):z=1 恒归句级字幕层(时间轴上隐藏,不参与重排)
      const K = topToBottom.length;
      const map = new Map(topToBottom.map((tk, i) => [tk, K - i + 1]));
      pushUndoSnapshot();
      setComp((c) => ({
        ...c,
        blocks: c.blocks.map((b) => (b.trackIndex > 0 && !isSentenceCaption(b) && map.has(b.trackIndex) ? { ...b, trackIndex: map.get(b.trackIndex)! } : b)),
      }));
    },
  });

  // 打开项目 = 自动加载(用户定的:不弹「恢复/丢弃」条,进来就是上次的样子)。
  // 云端为准 + 本地缓存:先备着本地(离线/秒开),并发拉云端;云端更新(或本地没有)
  // 就采纳云端——落本地缓存后重挂 chat 重读会话,再走同一套恢复流程。
  // OPFS 本地库命中 → 主视频自动接回(走 pendingRestore 既有校验);插入段按 srcSig 复活。
  const applyDraft = useCallback((d: StudioDraft) => {
    pendingRestoreRef.current = d;
    setComp(() => ({ ...d.comp, video: null }));
    if (d.videoSig) {
      void loadLocalVideo(d.videoSig).then(async (f) => {
        if (f && pendingRestoreRef.current === d) {
          void pickVideoFile(f, { asSig: d.videoSig! });
          return;
        }
        if (f) return;
        // OPFS 没有(换设备/清过缓存)→ 云端字节汇合点取回;miss 才落回手动重选
        if (cloudMediaRef.current.video?.sig === d.videoSig) {
          toast.info(t('正在从云端取回视频…'));
          const cf = await studioProviders().vault.fetch(d.videoSig!);
          if (cf && pendingRestoreRef.current === d) {
            void pickVideoFile(cf, { asSig: d.videoSig! });
            return;
          }
        }
        toast.success(t('项目已加载；重新选择原视频即可接回画面'));
      });
    }
    void recoverLocalClips(d.comp.shots ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const autoRestoredRef = useRef(false);
  // boot 层的数据闸:auto-restore(云端优先回落本地)跑完即放行——
  // 视频字节接回(OPFS/云端取回)在门后继续,不算进场等待
  const [bootDataReady, setBootDataReady] = useState(false);
  useEffect(() => {
    if (autoRestoredRef.current) return;
    autoRestoredRef.current = true;
    setDraftOffer(null);
    // 编辑上下文水合(换设备/刷新):转写/媒体索引/规划从云端接回,不用重烧 ASR/重规划。
    // 只补空位——本会话已有的内存态是更新的真相。竞速输了云端迟到也要补(见下):
    // 这个标签页拿着空 asr/空媒体索引去 autosave,会把云端 context 越写越空。
    const hydrateContextRefs = (rc: StudioProjectDto['context'] | undefined) => {
      if (!rc) return;
      if (rc.media && !cloudMediaRef.current.video && !cloudMediaRef.current.clips) cloudMediaRef.current = rc.media;
      if (rc.asr?.length && !asrRef.current?.length) {
        asrRef.current = rc.asr;
        setAsrSentences(rc.asr);
      }
      if (rc.clipAsr && !Object.keys(clipAsrRef.current).length) clipAsrRef.current = rc.clipAsr;
      if (rc.plan && !planRef.current) {
        try {
          const p = parsePlan(JSON.stringify(rc.plan), rc.asr?.length ?? asrRef.current?.length ?? 0);
          if (p.scenes.length) {
            planRef.current = p;
            setPlan(p);
          }
        } catch {
          /* 坏 plan 丢弃,重新规划即可 */
        }
      }
    };
    // 云端项目 → 直接进工作台:cacheProjectLocally 返回的内存草稿直用,不经 localStorage
    // 读回——配额满时落盘静默失败,读回的是陈年旧草稿,应用后 autosave 会拿旧状态反写云端。
    const applyRemote = (remote: StudioProjectDto) => {
      setChatEpoch((v) => v + 1); // remount chat 重读云端会话
      applyDraft(cacheProjectLocally(remote));
    };
    void (async () => {
      const local = draftOffer;
      // 云端优先但不干等:有本地草稿时 1.2s 没回就先用本地(离线/慢网也能开工;画布不再
      // 半路替换)。**没有本地草稿**(换设备/agent handoff 新开的浏览器)云端是唯一来源
      // ——必须等它,只留 15s 兜底防挂死;掐 1.2s 会把整个项目连数据带视频全丢掉。
      const loadP = studioProviders().projects.load(projectId); // null=确定没有(新项目)或不可用
      const remote = await Promise.race([
        loadP,
        new Promise<undefined>((res) => setTimeout(() => res(undefined), local ? 1200 : 15_000)),
      ]);
      if (remote) {
        setProjectVersion(projectId, remote.version);
        hydrateContextRefs(remote.context);
        // 版本号判新旧,不用 savedAt(本地 autosave 每次打开都自刷新 savedAt,拿它比
        // 会让每个浏览器都觉得"我最新"——各用各的,再把旧状态反写云端,永不收敛)。
        // 云端版本领先本地草稿的基版 = 别处写过 → 云端胜;持平 = 本浏览器就是最后写者,
        // 本地草稿可能还有收工前 1s 防抖窗内没推上去的改动 → 本地胜。
        const remoteNewer = !local || local.baseVersion == null || remote.version > local.baseVersion;
        if (remoteNewer) {
          applyRemote(remote);
          return;
        }
      }
      if (local) {
        // 离线/云端超时打开:后续保存必须带上草稿的基版,服务端 409 检查才有依据
        // (内存版本表刷新即空,不带 baseVersion 的保存会无条件覆盖云端)
        if (remote === undefined && local.baseVersion != null) setProjectVersion(projectId, local.baseVersion);
        applyDraft(local); // 本地更新 / 云端不可达 → 用本地
      }
      // 两头落空且是"超时"(≠确定不存在):数据多半在云端,不能装作新项目空开
      else if (remote === undefined) toast.error(t('云端项目加载较慢,正在继续尝试…'));
      // 竞速输了 ≠ 放弃:云端迟到后①补水合引用数据(防空状态反写);②画布还是空的
      // (用户啥都没做)就整个接回——agent/换设备场景自动恢复,不用人刷新
      if (remote === undefined) {
        void loadP.then((late) => {
          if (!late) return;
          setProjectVersion(projectId, late.version);
          hydrateContextRefs(late.context);
          const untouched = !compRef.current.blocks.length && !(compRef.current.shots?.length ?? 0);
          if (!local && untouched) {
            applyRemote(late);
            toast.success(t('云端项目已接回'));
          }
        });
      }
    })().finally(() => setBootDataReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 同步上云(防抖):comp 或会话变化后 1.2s 攒一次 PUT。云端为准的写回口——
  // 本地 useDraftAutosave 仍写 localStorage 作缓存,两者独立。空画布不推(别把云端冲空)。
  useEffect(() => {
    const hasContent = comp.blocks.length > 0 || (comp.shots?.length ?? 0) > 0;
    if (!hasContent || !projectId) return;
    const timer = window.setTimeout(() => {
      const payload = {
        comp: { ...comp, video: null },
        chat: readChatThreads(projectId),
        // 编辑上下文镜像上云:离线 MCP 执行器(标签页关着时)靠它做 read_script/
        // cut_narration 字幕重铺/set_captions/plan——没有就只剩纯 comp 操作。
        // 这里只报内存里有的 key;缺的 key 服务端按 key 合并保留,不会被抹(projects.$id)
        context: {
          ...(asrRef.current?.length ? { asr: asrRef.current } : {}),
          ...(Object.keys(clipAsrRef.current).length ? { clipAsr: clipAsrRef.current } : {}),
          ...(planRef.current ? { plan: planRef.current } : {}),
          ...(cloudMediaRef.current.video || cloudMediaRef.current.clips ? { media: cloudMediaRef.current } : {}),
        },
        videoSig: videoFile ? (videoSigRef.current ?? fileSig(videoFile)) : null,
        videoDurationSec: comp.video?.durationSec ?? null,
        coverThumb: coverThumbRef.current,
      };
      void studioProviders().projects.save(projectId, payload).then((r) => {
        if (r !== 'conflict') return;
        // 409 已把 baseVersion 刷新到库里最新:立即重发这批改动,真正落实"后写为准"。
        // 等下一次编辑才重试的话,用户此刻收工,这批改动就永远丢在本地了。
        void studioProviders().projects.save(projectId, payload);
        if (!conflictWarnedRef.current) {
          conflictWarnedRef.current = true;
          toast.info(t('这个项目在别处也编辑过；以你这里的最新改动为准继续保存'));
        }
      });
    }, 1200);
    return () => window.clearTimeout(timer);
    // asrSentences/clipAsr 也入依赖:译文(sub)这类只动转写不动 comp 的改动也要上云
  }, [comp, chatRev, videoFile, projectId, cloudMediaRev, asrSentences, clipAsr]);

  return (
    <div className="studio-scope relative flex h-full min-h-0 w-full gap-2">
      {/* 进场 boot 层:重资源预热 + 项目数据双闸,盖住整个工作台(含 chat 栏),结束自卸 */}
      <StudioBootOverlay dataReady={bootDataReady} />
      {/* 左:对话区(大圆角卡)。关闭时整区隐藏(常挂保对话会话),预览区右上角「对话」重开 */}
      <div className={panelOpen ? 'flex min-h-0 shrink-0 gap-2' : 'hidden'}>
        {/* 面板可调宽(右缘拖动,320–760);舞台随之收缩(area observer 自动重算 fit) */}
        <div
          className="border-line bg-panel relative flex min-h-0 flex-col overflow-hidden rounded-lg border"
          style={{ width: panelW }}
        >
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                /* 靠 buttons 兜底 */
              }
              const sx = e.clientX;
              const w0 = panelW;
              let raf = 0;
              let last: PointerEvent | null = null;
              const flush = () => {
                raf = 0;
                if (last) setPanelW(Math.max(320, Math.min(760, w0 + (last.clientX - sx))));
              };
              const mv = (ev: PointerEvent) => {
                if (ev.buttons === 0) { up(); return; }
                last = ev;
                if (!raf) raf = requestAnimationFrame(flush);
              };
              const up = () => {
                if (raf) cancelAnimationFrame(raf);
                flush();
                window.removeEventListener('pointermove', mv);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
              };
              window.addEventListener('pointermove', mv);
              window.addEventListener('pointerup', up);
              window.addEventListener('pointercancel', up);
            }}
            title={t('拖动调整面板宽度')}
            className="hover:bg-accent/40 absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize transition-colors"
          />
          {/* 对话是本区唯一内容(收起时整区 hidden,会话/流式都保住) */}
          <div className="flex min-h-0 flex-1">
            <StudioChat
              key={chatEpoch}
              ref={chatRef}
              runTool={chatCbs.runTool}
              getBody={getChatBody}
              elements={chatElements}
              onFrameApplied={onFrameApplied}
              storageKey={chatKeyFor(projectId)}
              onThreadsChange={bumpChatRev}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        </div>

      </div>
      <div className="border-line bg-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
        {/* 视频导入走预览区上传 / chat;顶栏不再放按钮(流水线全部工具化,chat 驱动) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickVideoFile(f);
            e.target.value = ''; // 允许再选同一文件
          }}
        />

        {/* 上半区:预览 | 素材库(时间轴上方)。素材库固定列宽,舞台随剩余空间自适应(area observer 重算 fit)。
            预览必须 min-w-0:flex 的 min-width:auto 会让它锁死在舞台内容宽上,素材栏收起再展开时被挤出裁掉 */}
        <div className="flex min-h-0 min-w-0 flex-1">
        {/* 预览(= 编辑面:单击选块,双击文字就地改)。无视频 → 上传区。
            不设 overflow-hidden:浮动操作条要能跟着组件越过舞台边缘不被截断(画面裁剪在舞台内层) */}
        <div ref={previewAreaRef} className="bg-panel-2 relative flex min-h-0 min-w-0 flex-1 items-center justify-center p-3">
          {/* 预览区浮动入口(走带栏 TooltipProvider 作用域外,用原生 title 别用 Tooltip 会崩):
              左上=对话重开(chat 区在左侧,同侧归位;主题黑主按钮),右上=素材展开 */}
          {!panelOpen && (
            <button
              type="button"
              onClick={openChat}
              title={t('打开对话')}
              aria-label={t('打开对话')}
              className="bg-ink text-bg absolute left-3 top-2 z-20 flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium shadow-sm hover:opacity-90"
            >
              <MessageSquare size={13} /> {t('对话')}
            </button>
          )}
          {libCollapsed && (
            <button
              type="button"
              onClick={() => setLibCollapsed(false)}
              title={t('展开素材栏')}
              aria-label={t('展开素材栏')}
              className="border-line bg-panel text-ink-3 hover:text-ink absolute right-3 top-2 z-20 flex h-7 items-center gap-1 rounded-md border px-2 text-[11.5px] shadow-sm"
            >
              <ChevronsLeft size={13} /> {t('素材')}
            </button>
          )}
          {!comp.video ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void pickVideoFile(f);
              }}
              className="border-line text-ink-3 hover:border-ink-3 hover:text-ink flex h-full max-h-[70vh] w-full max-w-md flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition"
            >
              {busyImport ? <Loader2 size={28} className="animate-spin" /> : <Upload size={28} />}
              <div className="text-[13px] font-medium">{busyImport ? t('读取中…') : t('上传口播视频(或拖进来)')}</div>
              <div className="text-ink-4 text-[11px]">{t('视频留在本地不上传 · 仅提取音频做转写分镜')}</div>
            </button>
          ) : (
            <div ref={stageBoxRef} className="relative" style={{ width: boxW, height: boxH }}>
              {/* 画面裁剪层:圆角/溢出裁剪只作用于 iframe 画面 —— 浮动操作条等浮层挂在本层外面,
                  跟着组件越界也不会被截断(用户定的:toolbar 纯跟随、不截断;组件出界由这里截) */}
              <div className="absolute inset-0 overflow-hidden rounded-xl shadow-xl ring-1 ring-black/20">
                {/* 双缓冲 iframe:后台装好再切,消灭重载白闪。
                    信任边界:LLM 生成的块 HTML/脚本在 sandbox(opaque origin)里跑,拿不到主应用的 DOM/localStorage/cookie;
                    本地 blob 视频读不到 → onBufLoad 把 File 递进去自建 URL;控制协议全走 postMessage。 */}
                {([0, 1] as const).map((i) => (
                  <iframe
                    key={i}
                    ref={(el) => {
                      iframesRef.current[i] = el;
                    }}
                    title={`hyperframes-preview-${i}`}
                    srcDoc={bufs.docs[i]}
                    onLoad={() => onBufLoad(i)}
                    sandbox="allow-scripts"
                    // autoplay 必须显式授给任意源(*):sandbox 无 allow-same-origin → 文档是
                    // opaque origin,裸 "autoplay"(默认 src 源)匹配不上 → 带音轨的视频在
                    // 没被点过的新文档里 play() 会被静默拒绝(重建后"播放不了"的元凶)
                    allow="autoplay *"
                    className={bufs.active === i ? '' : 'pointer-events-none'}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: comp.width,
                      height: comp.height,
                      border: 0,
                      transform: `scale(${fit})`,
                      transformOrigin: 'top left',
                      // 后台缓冲用 z 序压底,不用 opacity:0 —— Chromium 会对不可见跨源 iframe
                      // 做渲染节流/媒体挂起,视频在隐形缓冲里装载会进入"paused:false、ready:4、
                      // currentTime 冻结"的僵尸态,切到前台也不醒(只有重建 src 能救,见看门狗)。
                      // 压底 = 始终在渲染、只是被前台同尺寸 iframe 遮住,解码器不会被挂起。
                      zIndex: bufs.active === i ? 2 : 1,
                    }}
                  />
                ))}
              </div>
              {/* 插入落点骨架:组件将出现的位置画虚线框+spinner,重建落定即散(比顶部胶囊更醒目) */}
              {pendingInsert && rebuilding && (
                <div
                  className="pointer-events-none absolute z-10"
                  style={{ left: `${pendingInsert.x * 100}%`, top: `${pendingInsert.y * 100}%`, width: `${pendingInsert.w * 100}%`, height: `${pendingInsert.h * 100}%` }}
                >
                  <div className="border-accent/70 flex h-full w-full items-center justify-center rounded-md border-2 border-dashed bg-black/20">
                    <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
                      <Loader2 size={12} className="animate-spin" /> {t('插入中…')}
                    </span>
                  </div>
                </div>
              )}
              {/* 整文档重建指示:插入/AI 生成落块/挂主题等结构变更,后台缓冲装载+握手期间给反馈 */}
              {rebuilding && (
                <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
                  <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white shadow">
                    <Loader2 size={12} className="animate-spin" /> {t('画面更新中…')}
                  </span>
                </div>
              )}
              {/* 选中块有 box → 画面级拖拽/缩放手柄(无 box 的满画布块由内部排版定位,不给手柄)。
                  播放中隐藏 —— 编辑框跟选中态走不跟时间走,播放时钉在画面上像贴了张膏药;
                  hover 预览跳出组件时间窗(scrubHideSel)同理让路。拖动中**不卸载**(ghost 语义:
                  基准实线不动、虚线跟手;卸载还会把 pointer capture 拆掉,曾靠护罩兜) */}
              {!playing && !scrubHideSel && (() => {
                const sb = selectedId ? comp.blocks.find((b) => b.id === selectedId) : null;
                if (!sb || !selOnScreen(sb)) return null;
                // 句级花字(无 box):给全局位置/缩放手柄 —— 拖的是 comp.captionStyle,全片花字一起动
                if (isSentenceCaption(sb)) {
                  const subSelected = capSelPart === 'sub' && typeof sb.slots.sub === 'string' && !!sb.slots.sub;
                  return (
                    <>
                    {/* 选中分靶:点主行出主手柄、点译文行出译文手柄(同一个组件的两个实例,互不叠显) */}
                    {subSelected && (
                      <CaptionEditOverlay
                        style={resolveSubCaptionStyle(comp)}
                        compH={comp.height}
                        stageW={boxW}
                        stageH={boxH}
                        measured={capSubMeasure}
                        label={t('译文 · 全局')}
                        onChange={(patch) => {
                          const keep = resolveCaptionStyle(compRef.current).sub ?? {};
                          setCaptionStyle({ sub: { ...keep, ...patch } });
                        }}
                        onLive={(v) => postPreview({ type: 'hf:capSubStyle', xPct: v.xPct ?? 50, yPct: v.yPct, ...(v.hPct ? { hPct: v.hPct } : {}) })}
                        onOpenPanel={(pn) => setFloatWin(pn === 'caption' ? 'captions' : 'script')}
                      />
                    )}
                    {!subSelected && (
                    <CaptionEditOverlay
                      style={resolveCaptionStyle(comp)}
                      compH={comp.height}
                      stageW={boxW}
                      stageH={boxH}
                      measured={capMeasure}
                      onChange={setCaptionStyle}
                      onLive={(s) =>
                        // 只发位置+框高(底板 min-height 跟手):live 通道没有字号。带上 fontPx 会让 iframe
                        // 每帧给全部字幕块的每个词重写 font-size——几百次样式写+整文档重排,拖动卡成幻灯片
                        postPreview({ type: 'hf:capStyle', xPct: s.xPct ?? 50, yPct: s.yPct, ...(s.hPct ? { hPct: s.hPct } : {}) })
                      }
                      onOpenPanel={(p) => setFloatWin(p === 'caption' ? 'captions' : 'script')}
                    />
                    )}
                    </>
                  );
                }
                if (!sb.box) return null;
                if (genIds.has(sb.id)) {
                  // 生成中不给手柄:box/时间窗已快照给 worker,拖了也会被生成结果按旧数据覆盖
                  return (
                    <div
                      className="pointer-events-none absolute z-10 flex items-center justify-center"
                      style={{ left: sb.box.x * boxW, top: sb.box.y * boxH, width: sb.box.w * boxW, height: sb.box.h * boxH }}
                    >
                      <span className="inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/90">
                        <Loader2 size={10} className="animate-spin" /> {t('生成中')}
                      </span>
                    </div>
                  );
                }
                return (
                  <BoxEditOverlay
                    box={sb.box}
                    stageW={boxW}
                    stageH={boxH}
                    rotation={sb.rotation}
                    overlayRef={rotateOverlayRef}
                    labelRef={rotateLabelRef}
                    onMovePointerDown={(e) => gripDrag(e, sb.id)}
                    onEdgePointerDown={(e, side) => edgeDrag(e, sb, side)}
                    onScalePointerDown={(e, sgnX, sgnY) => scaleDrag(e, sb, sgnX, sgnY)}
                    onRotatePointerDown={(e) => rotateDrag(e, sb)}
                  />
                );
              })()}
              {/* 空组件块:块内动作浮层(AI 生成 / 上传)。sandbox iframe 里放不了按钮,
                  父层按 box 对位盖上去,看起来就在块里 */}
              {!playing && !scrubHideSel && !bodyDragging && (() => {
                const eb = selectedId ? comp.blocks.find((b) => b.id === selectedId) : null;
                if (!eb?.box || !selOnScreen(eb) || genIds.has(eb.id) || blockKind(eb) !== 'media') return null;
                const s = eb.slots as { media?: { url?: string }; spec?: unknown };
                if (s.media?.url || typeof s.spec === 'string' || mediaBusy[eb.id]) return null; // 上传中不给动作,徽标层在播 loading
                return (
                  <div
                    className="pointer-events-none absolute z-40 flex items-center justify-center gap-2"
                    style={{ left: eb.box.x * boxW, top: eb.box.y * boxH, width: eb.box.w * boxW, height: eb.box.h * boxH }}
                  >
                    <button
                      type="button"
                      onClick={() => aiFillBlock(eb.id)}
                      className="bg-ink text-bg pointer-events-auto rounded-full px-3 py-1 text-[12px] font-medium shadow-lg"
                    >
                      {t('AI 生成')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void uploadIntoBlock(eb.id)}
                      className="bg-panel text-ink border-line pointer-events-auto rounded-full border px-3 py-1 text-[12px] font-medium shadow-lg"
                    >
                      {t('上传')}
                    </button>
                  </div>
                );
              })()}
              {/* 素材拖放层:上传面板拖出素材时罩住舞台(drop 会被 iframe 文档吞掉,必须父层接);
                  命中组件卡=填充,落空=在落点新建组件卡 */}
              {dragAsset && (
                <div
                  className="ring-accent/60 absolute inset-0 z-50 rounded-xl ring-2"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleAssetDrop(e);
                  }}
                />
              )}
              {/* 浮动操作条(Notion 式,悬在选中块边框外):拖动手柄 · AI 改 · 编辑源码 · 背景 · 删除。
                  素材块(上传图/视频)与生成组件同权出浮条(用户定的),入/出场动效仍归底部条;
                  生成中的块 box 里已有徽标,不出浮条。
                  拖动中不卸载 —— boxDrag 位移直改 DOM translate 跟着组件走,手柄不会从指下消失 */}
              {!playing && !scrubHideSel && (() => {
                const mb = selectedId ? comp.blocks.find((b) => b.id === selectedId) : null;
                if (!mb || !selOnScreen(mb) || genIds.has(mb.id)) return null;
                if (isSentenceCaption(mb)) return null; // 字幕=纯计算产物:没有源码/删除语义,不出浮动条
                if (imgSel && imgSel.blockId === mb.id) return null; // 块内图片工具条接管(贴图渲染,见下方)
                // 定位走 toolbarXY(拖动跟随与渲染同一公式,数值恒等零跳动):
                // toolbar 纯跟随不截断;组件本身可出界,由画布 overflow 截断
                const p = toolbarXY(mb.box);
                // 素材块(图片/视频)专属工具条:换素材 + 入/出场动效弹层 + 删除 ——
                // 没有 AI 改/源码/背景(那些是排版组件的语义);空素材位的上传/AI 生成在块内浮层
                if (blockKind(mb) === 'media') {
                  const m = mb.slots.media as MediaRef | undefined;
                  return (
                    <TooltipProvider delayDuration={200}>
                      <div
                        ref={toolbarRef}
                        className="border-line bg-panel absolute z-50 flex items-center gap-1 rounded-lg border px-1.5 py-1 shadow-lg"
                        style={{ left: p.left, top: p.top, transform: 'translateX(-50%)' }}
                      >
                        {mb.box && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onPointerDown={(e) => gripDrag(e, mb.id)}
                                aria-label={t('拖动移动')}
                                className="text-ink-3 hover:text-ink cursor-move rounded p-1"
                              >
                                <GripVertical size={13} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{t('拖动移动')}</TooltipContent>
                          </Tooltip>
                        )}
                        {m?.url && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => void replaceBlockMedia(mb.id)}
                                disabled={!!mediaBusy[mb.id]}
                                className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap disabled:opacity-40"
                              >
                                {mediaBusy[mb.id] ? <Loader2 size={13} className="animate-spin" /> : m.type === 'video' ? <FileVideo size={13} /> : <ImageIcon size={13} />}{' '}
                                {m.type === 'video' ? t('换视频') : t('换图')}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{m.type === 'video' ? t('替换视频') : t('替换图片')}</TooltipContent>
                          </Tooltip>
                        )}
                        {m?.url && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => (floatWin === 'anim' ? setFloatWin(null) : openFloatAt('anim', e.currentTarget.getBoundingClientRect()))}
                                className={`inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap ${floatWin === 'anim' ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink'}`}
                              >
                                <Wand2 size={13} /> {t('动效')}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{t('入场 / 出场动效')}</TooltipContent>
                          </Tooltip>
                        )}
                        {mb.box && (
                      <CardShapeControls
                        block={mb}
                        onRadius={(v) => {
                          postPreview({ type: 'hf:radius', blockId: mb.id, px: v }); // 实时预览
                          setBlockRadius(mb.id, v); // 落 Block(防抖重建烧进 HTML)
                        }}
                      />
                    )}
                        <div className="bg-line mx-0.5 h-4 w-px" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" onClick={() => removeBlock(mb.id)} aria-label={t('删除')} className="text-ink-3 rounded p-1 hover:text-destructive">
                              <Trash2 size={13} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('删除')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  );
                }
                return (
                  <TooltipProvider delayDuration={200}>
                  <div
                    ref={toolbarRef}
                    className="border-line bg-panel absolute z-50 flex items-center gap-1 rounded-lg border px-1.5 py-1 shadow-lg"
                    style={{ left: p.left, top: p.top, transform: 'translateX(-50%)' }}
                  >
                    {mb.box && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onPointerDown={(e) => gripDrag(e, mb.id)}
                            aria-label={t('拖动移动')}
                            className="text-ink-3 hover:text-ink cursor-move rounded p-1"
                          >
                            <GripVertical size={13} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('拖动移动')}</TooltipContent>
                      </Tooltip>
                    )}
                    {/* AI 改:切到对话(选中 pill 已随选中态挂在输入框)并聚焦输入框,直接打字 */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            openChat();
                            setTimeout(() => chatRef.current?.focusInput(), 0); // 等面板显隐切换落地再聚焦(隐藏组件聚焦不了)
                          }}
                          className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap"
                        >
                          <Sparkles size={13} /> {t('AI 改')}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t('在对话里说怎么改这个组件')}</TooltipContent>
                    </Tooltip>
                    {/* 同步内容:data-edit 文字槽按块时间窗的口播稿一键填充(预置组件=通用
                        占位,拖入后靠这一步对上内容;OSS 壳无 syncFill 能力时不显示) */}
                    {mb.templateId === 'custom' &&
                      typeof (mb.slots as { innerHtml?: unknown }).innerHtml === 'string' &&
                      ((mb.slots as { innerHtml: string }).innerHtml.includes('data-edit') || null) &&
                      !!studioProviders().syncFill && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => void syncBlockContent(mb)}
                              disabled={syncBusyId === mb.id}
                              className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap disabled:opacity-50"
                            >
                              {syncBusyId === mb.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {t('同步内容')}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('按这段口播稿自动填充组件文字')}</TooltipContent>
                        </Tooltip>
                      )}
                    {/* 存为组件:画布上改好的 custom 块回流素材库(复制语义的反向通道——
                        库→画布是拷贝,这里画布→库同样是拷贝快照,存完再改互不影响) */}
                    {mb.templateId === 'custom' && typeof (mb.slots as { innerHtml?: unknown }).innerHtml === 'string' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => saveBlockAsElement(mb)}
                            aria-label={t('存为组件')}
                            className="text-ink-3 hover:text-ink inline-flex items-center rounded p-1"
                          >
                            <Save size={13} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('存为组件:把当前样子存进素材库(之后可反复插入)')}</TooltipContent>
                      </Tooltip>
                    )}
                    {/* 层级:块间上下移一层;开了抠像再给块级「人像前/后」覆盖 */}
                    {!isSentenceCaption(mb) && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" onClick={() => bumpBlockLayer(mb, 1)} aria-label={t('上移一层')} className="text-ink-3 hover:text-ink rounded p-1">
                              <ChevronUp size={13} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('上移一层(盖过同位置组件)')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" onClick={() => bumpBlockLayer(mb, -1)} aria-label={t('下移一层')} className="text-ink-3 hover:text-ink rounded p-1" disabled={mb.trackIndex <= 1}>
                              <ChevronDown size={13} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('下移一层')}</TooltipContent>
                        </Tooltip>
                        {(comp.shots ?? []).some((sh) => sh.personMatte) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => togglePersonLayer(mb)}
                                aria-label={t('人像层级')}
                                className={`rounded p-1 ${(mb.personLayer ? mb.personLayer === 'behind' : !!comp.personFx?.personFront) ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink'}`}
                              >
                                <BringToFront size={13} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {(mb.personLayer ? mb.personLayer === 'behind' : !!comp.personFx?.personFront) ? t('这个组件在人像后面,点击提到人像上层') : t('这个组件在人像上层,点击垫到人像后面')}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </>
                    )}
                    {comp.video && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => (floatWin === 'person' ? setFloatWin(null) : openFloatAt('person', e.currentTarget.getBoundingClientRect()))}
                            disabled={!selectedShotId}
                            aria-label={t('智能抠像')}
                            className={`rounded p-1 disabled:opacity-40 ${(comp.shots ?? []).some((s) => s.personMatte) && comp.personFx?.personFront ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink'}`}
                          >
                            <SendToBack size={13} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('人物置顶(智能抠像)')}</TooltipContent>
                      </Tooltip>
                    )}
                    {!isSentenceCaption(mb) && (
                      <span className="relative inline-flex">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setBgOpen((o) => !o)}
                              aria-label={t('组件背景色')}
                              className={`rounded p-1 ${bgOpen ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink'}`}
                            >
                              <Palette size={13} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('背景与边框')}</TooltipContent>
                        </Tooltip>
                        {bgOpen && (
                          <div className="border-line bg-panel absolute left-1/2 top-full z-50 mt-1.5 flex -translate-x-1/2 flex-col gap-2 rounded-lg border px-2.5 py-2 shadow-xl">
                            {/* 背景 */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-4 w-9 shrink-0 text-[10px]">{t('背景')}</span>
                              <button
                                type="button"
                                onClick={() => setBlockBg(mb.id, undefined)}
                                title={t('无背景(透明叠在画面上)')}
                                aria-label={t('无背景')}
                                className={`h-5 w-5 shrink-0 rounded-full border bg-[linear-gradient(135deg,transparent_44%,#f43f5e_44%,#f43f5e_56%,transparent_56%)] ${!mb.bg ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                              />
                              {bgSwatches.map(([name, colorVal]) => (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => setBlockBg(mb.id, colorVal)}
                                  title={t('背景:{name}', { name: t(name) })}
                                  aria-label={t('背景:{name}', { name: t(name) })}
                                  className={`h-5 w-5 shrink-0 rounded-full border ${mb.bg === colorVal ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                                  style={{ background: colorVal }}
                                />
                              ))}
                              <label
                                title={t('自定义背景色')}
                                className="border-line relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border"
                                style={{ background: 'conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)' }}
                              >
                                <input
                                  type="color"
                                  value={/^#[0-9a-fA-F]{6}/.test(mb.bg ?? '') ? mb.bg!.slice(0, 7) : '#ffffff'}
                                  onChange={(e) => setBlockBg(mb.id, e.target.value)}
                                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                  aria-label={t('自定义背景色')}
                                />
                              </label>
                            </div>
                            {/* 边框 */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-4 w-9 shrink-0 text-[10px]">{t('边框')}</span>
                              <button
                                type="button"
                                onClick={() => setBlockBorder(mb.id, undefined)}
                                title={t('无边框')}
                                aria-label={t('无边框')}
                                className={`h-5 w-5 shrink-0 rounded-full border bg-[linear-gradient(135deg,transparent_44%,#f43f5e_44%,#f43f5e_56%,transparent_56%)] ${!mb.border ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                              />
                              {borderSwatches.map(([name, colorVal]) => (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => setBlockBorder(mb.id, colorVal)}
                                  title={t('边框:{name}', { name: t(name) })}
                                  aria-label={t('边框:{name}', { name: t(name) })}
                                  className={`relative h-5 w-5 shrink-0 rounded-full border ${mb.border === colorVal ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                                >
                                  <span className="absolute inset-[3px] rounded-full border-2" style={{ borderColor: colorVal }} />
                                </button>
                              ))}
                              <label
                                title={t('自定义边框色')}
                                className="border-line relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border"
                                style={{ background: 'conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)' }}
                              >
                                <input
                                  type="color"
                                  value={/^#[0-9a-fA-F]{6}$/.test(mb.border ?? '') ? mb.border! : '#ffffff'}
                                  onChange={(e) => setBlockBorder(mb.id, e.target.value)}
                                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                  aria-label={t('自定义边框色')}
                                />
                              </label>
                            </div>
                            {/* 透明度 */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-4 w-9 shrink-0 text-[10px]">{t('透明度')}</span>
                              <input
                                type="range"
                                min={10}
                                max={100}
                                step={5}
                                value={Math.round((mb.opacity ?? 1) * 100)}
                                onChange={(e) => setBlockOpacity(mb.id, Number(e.target.value) / 100)}
                                className="zoom-range w-28"
                                aria-label={t('组件透明度')}
                              />
                              <span className="text-ink-3 w-8 shrink-0 text-right font-mono text-[10px] tabular-nums">{Math.round((mb.opacity ?? 1) * 100)}%</span>
                            </div>
                          </div>
                        )}
                      </span>
                    )}
                    {mb.box && (
                      <CardShapeControls
                        block={mb}
                        onRadius={(v) => {
                          postPreview({ type: 'hf:radius', blockId: mb.id, px: v }); // 实时预览
                          setBlockRadius(mb.id, v); // 落 Block(防抖重建烧进 HTML)
                        }}
                      />
                    )}
                    <div className="bg-line mx-0.5 h-4 w-px" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" onClick={() => removeBlock(mb.id)} aria-label={t('删除组件')} className="text-ink-3 rounded p-1 hover:text-destructive">
                          <Trash2 size={13} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t('删除组件')}</TooltipContent>
                    </Tooltip>
                  </div>
                  </TooltipProvider>
                );
              })()}
              {/* 图片 slot 工具条(B 契约):custom 块内点中 <img> → 贴着图片矩形出图片专属条(换图/删除),
                  零 LLM 即时生效。选中环由父层画(不依赖 iframe 属性,文档重建不丢);块一拖/换选中即收 */}
              {!playing && !scrubHideSel && !bodyDragging && imgSel && imgSel.blockId === selectedId && !genIds.has(imgSel.blockId) && (() => {
                const r = imgSel.rect;
                const p = toolbarXY(r);
                return (
                  <TooltipProvider delayDuration={200}>
                    <div
                      className="border-accent/80 pointer-events-none absolute z-30 rounded border-2"
                      style={{ left: r.x * boxW, top: r.y * boxH, width: r.w * boxW, height: r.h * boxH }}
                    />
                    <div
                      className="border-line bg-panel absolute z-50 flex items-center gap-1 rounded-lg border px-1.5 py-1 shadow-lg"
                      style={{ left: p.left, top: p.top, transform: 'translateX(-50%)' }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => void replaceCustomImg(imgSel.blockId, imgSel.index)}
                            disabled={!!mediaBusy[imgSel.blockId]}
                            className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap disabled:opacity-40"
                          >
                            {mediaBusy[imgSel.blockId] ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />} {t('换图')}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('替换这张图')}</TooltipContent>
                      </Tooltip>
                      <div className="bg-line mx-0.5 h-4 w-px" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              patchCustomImg(imgSel.blockId, imgSel.index, () => 'remove');
                              setImgSel(null);
                            }}
                            aria-label={t('删除图片')}
                            className="text-ink-3 rounded p-1 hover:text-destructive"
                          >
                            <Trash2 size={13} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('删除这张图')}</TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                );
              })()}
              {/* 素材 loading 徽标:上传中(文件在传)/加载中(等重建+CDN 装载亮相)——
                  与「生成中」同款样式;boxless 块(满画布 custom)退到整画布居中 */}
              {Object.keys(mediaBusy).length > 0 && (
                <div className="pointer-events-none absolute inset-0 z-30">
                  {comp.blocks
                    .filter((b) => mediaBusy[b.id])
                    .map((b) => (
                      <div
                        key={b.id}
                        className="absolute flex items-center justify-center"
                        style={
                          b.box
                            ? { left: b.box.x * boxW, top: b.box.y * boxH, width: b.box.w * boxW, height: b.box.h * boxH }
                            : { inset: 0 }
                        }
                      >
                        <span className="inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/90">
                          <Loader2 size={10} className="animate-spin" /> {mediaBusy[b.id] === 'upload' ? t('上传中') : t('加载中')}
                        </span>
                      </div>
                    ))}
                </div>
              )}
              {/* 父层手柄拖动护罩:边柄/角柄按下时 overlay 会卸载,pointer capture 随组件移除失效,
                  之后指针滑过 iframe 的事件会被 iframe 文档吞掉(window 收不到 move/up,拖动冻死)——
                  全屏透明罩把事件截在父文档里。体拖/grip 拖不挂(capture 组件常驻,见 dragCursorRef='') */}
              {bodyDragging && dragCursorRef.current !== '' && (
                <div className="fixed inset-0 z-40" style={{ cursor: dragCursorRef.current }} />
              )}
              {/* 体拖中心吸附参考线:常驻节点,拖动中经 setGuideVis 直切 display(零 React 工作) */}
              <div className="pointer-events-none absolute inset-0 z-20">
                {/* 拖动 ghost 虚线框(同字幕手柄语义):基准实线不动,这条虚线跟手,松手一次应用 */}
                <div ref={ghostRef} className="border-accent pointer-events-none absolute rounded-md border-2 border-dashed" style={{ display: 'none' }} />
                <div ref={guideVRef} className="bg-accent/80 absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2" style={{ display: 'none', boxShadow: '0 0 4px rgba(63,75,232,0.5)' }} />
                <div ref={guideHRef} className="bg-accent/80 absolute left-0 right-0 top-1/2 h-px -translate-y-1/2" style={{ display: 'none', boxShadow: '0 0 4px rgba(63,75,232,0.5)' }} />
              </div>
              {/* 调试叠加:人脸(红)/ 主体(蓝虚线)/ 安全区(绿)。归一坐标 → % 直接对齐画布 */}
              {dbgGeom && (
                <div className="pointer-events-none absolute inset-0 z-20">
                  <div className="absolute left-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] leading-tight text-emerald-600">{t('几何遍:')}{geomNote()}</div>
                  {dbgGeom.rects.map((r, i) => (
                    <div key={`safe${i}`} className="absolute border-2 border-emerald-400" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
                      <span className="absolute left-0 top-0 bg-emerald-400 px-1 text-[9px] font-bold leading-tight text-black">{t('安全')}{i + 1}</span>
                    </div>
                  ))}
                  {dbgGeom.subject && (
                    <div className="absolute border border-dashed border-sky-400" style={{ left: `${dbgGeom.subject.x * 100}%`, top: `${dbgGeom.subject.y * 100}%`, width: `${dbgGeom.subject.w * 100}%`, height: `${dbgGeom.subject.h * 100}%` }}>
                      <span className="absolute right-0 top-0 bg-sky-400 px-1 text-[9px] font-bold leading-tight text-black">{t('主体')}</span>
                    </div>
                  )}
                  {dbgGeom.face && (
                    <div className="absolute border-2 border-red-500" style={{ left: `${dbgGeom.face.x * 100}%`, top: `${dbgGeom.face.y * 100}%`, width: `${dbgGeom.face.w * 100}%`, height: `${dbgGeom.face.h * 100}%` }}>
                      <span className="absolute bottom-0 left-0 bg-red-500 px-1 text-[9px] font-bold leading-tight text-white">{t('脸')}</span>
                    </div>
                  )}
                  {visual?.textBands?.map((r, i) => (
                    <div key={`text${i}`} className="absolute border-2 border-orange-400 bg-orange-400/15" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
                      <span className="absolute right-0 top-0 bg-orange-400 px-1 text-[9px] font-bold leading-tight text-black">{t('字幕区(预留)')}</span>
                    </div>
                  ))}
                  <div className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] leading-tight text-white">
                    {liveGeom ? '实时帧' : '段聚合'} · t={tSec.toFixed(1)}s{geomSeg ? ` · ${geomSeg.label.content}·人${geomSeg.label.person}·粗安全${geomSeg.label.safe}` : ''}{dbgGeom.face ? '' : ' · 无脸'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 素材栏:素材(图片/视频/组件/上传聚合,来源徽标)/ 主题 两个 tab;宽 320 对齐主题卡 CARD_W。
            可收起腾画面:整列 hidden 常挂(保住筛选/滚动/生成轮询),展开钮浮在预览区右上。
            工具面板(floatWin)开着时**停靠占整列**(用户定的:不是新增 tab):tabs 头换成
            面板标题头,素材列表 hidden 保状态,关面板回到 tabs */}
        <div className={`border-line flex shrink-0 flex-col border-l ${libCollapsed ? 'hidden' : 'w-[320px]'}`}>
          <div className="flex min-h-0 flex-1 flex-col">
          {floatWin ? (
            <div className="border-line flex items-center gap-1 border-b px-2 py-1.5">
              {floatWin === 'gen' ? (
                (
                  [
                    { v: 'image', label: '图片' },
                    { v: 'video', label: '视频' },
                    { v: 'element', label: '组件' },
                  ] as { v: GenType; label: string }[]
                ).map((gt) => (
                  <button
                    key={gt.v}
                    type="button"
                    onClick={() => setGenType(gt.v)}
                    className={`rounded-md px-2.5 py-1 text-[12px] transition ${
                      genType === gt.v ? 'bg-panel-2 text-ink font-medium' : 'text-ink-4 hover:text-ink-2'
                    }`}
                  >
                    {t(gt.label)}
                  </button>
                ))
              ) : (
                <span className="text-ink truncate px-1 text-[12px] font-medium">
                  {floatWin === 'script'
                    ? t('智能剪口播')
                    : floatWin === 'person'
                      ? t('人像')
                      : floatWin === 'anim'
                        ? t('素材动效')
                        : floatWin === 'captions'
                          ? t('字幕')
                          : floatWin === 'shot'
                            ? (() => {
                                const i = (comp.shots ?? []).findIndex((s) => s.id === selectedShotId);
                                return t('镜头取景') + (i >= 0 ? t(' · 场景 {n}', { n: i + 1 }) : '');
                              })()
                            : floatWin === 'transition'
                              ? (() => {
                                  const i = transitionCut == null ? -1 : clipSpans(comp.shots ?? []).findIndex((sp) => Math.abs(sp.editedEnd - transitionCut) < 0.05);
                                  return t('转场') + (i >= 0 ? t(' · 场景 {a}/{b} 之间', { a: i + 1, b: i + 2 }) : '');
                                })()
                              : (() => {
                                  const cb = codeBlockId ? comp.blocks.find((x) => x.id === codeBlockId) : null;
                                  return t('源码 · {label}', { label: cb?.label || codeBlockId || '' });
                                })()}
                </span>
              )}
              <button
                type="button"
                onClick={() => setFloatWin(null)}
                title={t('关闭')}
                aria-label={t('关闭面板')}
                className="text-ink-4 hover:text-ink ml-auto rounded p-1"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="border-line flex items-center gap-1 border-b px-2 py-1.5">
              {(
                [
                  { v: 'assets', label: '素材' },
                  // 主题 tab 隐藏(2026-07-19 用户定):组件库已按主题分组自带 token,挂主题走 chat 选择器
                ] as { v: 'assets' | 'frames'; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.v}
                  type="button"
                  onClick={() => setLibTab(tab.v)}
                  className={`rounded-md px-2.5 py-1 text-[12px] transition ${
                    libTab === tab.v ? 'bg-panel-2 text-ink font-medium' : 'text-ink-4 hover:text-ink-2'
                  }`}
                >
                  {t(tab.label)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setLibCollapsed(true)}
                title={t('收起素材栏')}
                aria-label={t('收起素材栏')}
                className="text-ink-4 hover:text-ink ml-auto rounded p-1"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          )}
          {/* 素材常挂(切走/被面板盖住都 hidden 保住轮询/滚动位);主题按需挂(封面墙别在背后跑) */}
          <div className={!floatWin && libTab === 'assets' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <AssetsPanel
              comp={comp}
              onInsert={(m, l, d) => void insertPanelMedia(m, l, undefined, d)}
              onInsertElement={insertGeneratedElement}
              onDragAsset={setDragAsset}
              onOpenGen={(t, anchor) => {
                setGenType(t);
                openFloatAt('gen', anchor);
              }}
              genRefreshTick={genRefreshTick}
            />
          </div>
          {!floatWin && libTab === 'frames' && (
            <div className="flex min-h-0 flex-1">
              <FramePanel comp={comp} onUse={useFrameInChat} />
            </div>
          )}
          {floatWin && (
            <div className="flex min-h-0 flex-1">
              {floatWin === 'gen' && (
                <GenChatPanel
                  key={genType}
                  type={genType}
                  comp={comp}
                  onInsertMedia={(m, l, d) => void insertPanelMedia(m, l, undefined, d)}
                  onSetMainVideo={setMainVideoFromUrl}
                  onInsertElement={insertGeneratedElement}
                  onMention={mentionAsset}
                  generateElement={generateElementStandalone}
                  onInsertTemplate={insertTemplateBlock}
                />
              )}
              {floatWin === 'script' && (
                <ScriptPanel
                  sentences={asrSentences}
                  clipSentences={clipAsr}
                  shots={ensureShots(comp)}
                  videoDurationSec={comp.video?.durationSec ?? 0}
                  extracting={asrBusy}
                  onExtract={() => void extractForScript()}
                  onSeek={(sec) => applyT(Math.max(0, sec))}
                  onCut={cutSrcRanges}
                  onRestore={restoreSrcRanges}
                  onReplaceWord={replaceScriptWord}
                />
              )}
              {floatWin === 'code' &&
                (() => {
                  const cb = codeBlockId ? comp.blocks.find((x) => x.id === codeBlockId) : null;
                  return cb ? (
                    <ElementSourceEditor
                      key={cb.id}
                      block={cb}
                      locked={genIds.has(cb.id)}
                      loop={codeLoop}
                      onLoop={toggleCodeLoop}
                      onDraft={(draft) => handleCodeDraft(cb.id, draft)}
                      onApply={(draft) => handleCodeApply(cb.id, draft)}
                      runAi={(instruction, draft, onNote) => runCodeAi(cb, instruction, draft, onNote)}
                    />
                  ) : (
                    <div className="text-ink-4 flex flex-1 items-center justify-center gap-2 text-[12px]">
                      {t('组件已删除')}
                      <button type="button" onClick={() => setFloatWin(null)} className="text-ink underline">
                        {t('关闭')}
                      </button>
                    </div>
                  );
                })()}
              {floatWin === 'shot' && selectedShot && (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {selectedShot.src?.startsWith('blob:') && !clipFilesRef.current.has(selectedShot.src) && (
                    <div className="border-line flex items-center gap-2 border-b px-3 py-2">
                      <span className="text-ink-2 min-w-0 flex-1 text-[11px]">{t('这段插入片段的源文件丢失,预览是黑段')}</span>
                      <button
                        type="button"
                        onClick={() => void reconnectClip(selectedShot.id)}
                        className="bg-accent shrink-0 rounded px-2.5 py-1 text-[11px] font-medium text-white transition hover:brightness-110"
                      >
                        {t('重新选择文件')}
                      </button>
                    </div>
                  )}
                  <ShotTreatmentPanel
                    shot={selectedShot}
                    onSetTreatment={setShotTreatment}
                    onSetTreatSize={setShotTreatSize}
                    onPreviewTreatSize={previewShotTreatSize}
                    onSetFilter={setShotFilter}
                    onPreviewFilter={previewShotFilter}
                  />
                </div>
              )}
              {floatWin === 'transition' && transitionCut != null && (
                <TransitionPanel
                  effect={cutTransitions(comp.shots ?? []).find((tr) => Math.abs(tr.cut - transitionCut) < 0.05)?.effect ?? null}
                  direction={cutTransitions(comp.shots ?? []).find((tr) => Math.abs(tr.cut - transitionCut) < 0.05)?.dir ?? 'left'}
                  onPick={(ef, dir) => setCutTransition(transitionCut, ef, dir)}
                />
              )}
              {floatWin === 'captions' && (
                <CaptionsPanel
                  comp={comp}
                  generating={capGenBusy}
                  onPickPreset={applyCaptionPreset}
                  onRemove={removeCaptionLayer}
                  translation={
                    studioProviders().translate
                      ? {
                          done: (asrSentences ?? []).filter((x) => x.sub).length + Object.values(clipAsr).flat().filter((x) => x.sub).length,
                          total: (asrSentences ?? []).length + Object.values(clipAsr).flat().length,
                          busy: capTransBusy,
                          lang: resolveCaptionStyle(comp).sub?.lang,
                          onTranslate: (lang) => void translateCaptionsTo(lang),
                          onClear: () => void runStudioTool('set_caption_translations', { clear: true }),
                        }
                      : undefined
                  }
                />
              )}
              {floatWin === 'person' && (
                <PersonFxPanel
                  comp={comp}
                  onChange={setPersonFx}
                  matte={matteState}
                  selectedShotMatte={(() => {
                    const s = (comp.shots ?? []).find((x) => x.id === selectedShotId);
                    return s ? !!s.personMatte : null; // 平权:任意源的段都能开抠像
                  })()}
                  onToggleShotMatte={toggleShotMatte}
                  onRetry={() => {
                    const s = (compRef.current.shots ?? []).find((x) => x.id === selectedShotIdRef.current);
                    if (s) void runMatteForShot(s);
                  }}
                />
              )}
              {floatWin === 'anim' &&
                (() => {
                  const b = selectedId ? comp.blocks.find((x) => x.id === selectedId) : null;
                  if (!b) return null; // 自动关面板的 effect 随即接管
                  return (
                    <MediaAnimPanel
                      anim={(b.slots.anim ?? {}) as { enter?: string; exit?: string; dur?: number }}
                      onChange={(patch) => {
                        setBlockAnim(b.id, patch);
                        // 点卡即演一遍(hf:animPreview 在活跃文档直接跑 tween,不等防抖重建);
                        // 换时长则重演当前入场,立刻能感受快慢
                        const merged = { enter: 'fade', ...((b.slots.anim ?? {}) as { enter?: string; exit?: string; dur?: number }), ...patch };
                        if (patch.enter !== undefined) postPreview({ type: 'hf:animPreview', id: b.id, phase: 'in', effect: patch.enter, dur: merged.dur ?? 0.5 });
                        else if (patch.exit !== undefined) postPreview({ type: 'hf:animPreview', id: b.id, phase: 'out', effect: patch.exit, dur: merged.dur ?? 0.5 });
                        else if (patch.dur !== undefined) postPreview({ type: 'hf:animPreview', id: b.id, phase: 'in', effect: merged.enter ?? 'fade', dur: patch.dur });
                      }}
                    />
                  );
                })()}
            </div>
          )}
          </div>
        </div>
        </div>

        {/* 走带。窄窗(≤1280)按钮文字禁止折行:空间不够整条横向滚,不许「安全区」竖排成三行 */}
        <TooltipProvider delayDuration={200}>
        <div className="border-line flex items-center gap-3 overflow-x-auto border-t px-4 py-2 whitespace-nowrap [&>button]:shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                disabled={!hasContent}
                className="bg-ink text-bg inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
                aria-label={playing ? t('暂停') : t('播放')}
              >
                {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{playing ? t('暂停(空格)') : t('播放(空格)')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setLocateSignal((n) => n + 1)}
                disabled={!hasContent}
                className="hover:bg-panel-2 shrink-0 rounded px-1 disabled:pointer-events-none"
                aria-label={t('定位到播放头')}
              >
                <TimeReadout duration={hasContent ? duration : 0} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('定位到播放头')}</TooltipContent>
          </Tooltip>
          {/* 撤销/重做 + 剪辑(对播放头所在片段,仅图标):分割 / 向左裁剪 / 向右裁剪 —— ][ 字形,虚线边=被裁掉的一侧 */}
            <div className="text-ink-3 ml-1 flex shrink-0 items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={undoLast} disabled={!canUndo} aria-label={t('撤销')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
                    <Undo2 size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('撤销(⌘Z)')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={redoLast} disabled={!canRedo} aria-label={t('重做')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
                    <Redo2 size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('重做(⇧⌘Z)')}</TooltipContent>
              </Tooltip>
              <div className="bg-line mx-0.5 h-4 w-px shrink-0" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={splitAtPlayhead} disabled={!comp.video} aria-label={t('分割')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
                    <BracketCutIcon />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('分割')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => trimAtPlayhead('left')} disabled={!comp.video} aria-label={t('向左裁剪')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
                    <BracketCutIcon dashed="left" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('向左裁剪')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => trimAtPlayhead('right')} disabled={!comp.video} aria-label={t('向右裁剪')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
                    <BracketCutIcon dashed="right" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('向右裁剪')}</TooltipContent>
              </Tooltip>
            </div>
          {/* 删除选中:分镜/组件通吃(与 Delete 键同一套守卫:生成中不删/至少留一镜) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  if (selectedId) removeBlock(selectedId);
                  else if (selectedShotIds.size) deleteShots(selectedShotIds); // 多选批量;单个自动退化
                }}
                disabled={!selectedId && selectedShotIds.size === 0}
                aria-label={t('删除选中')}
                className="text-ink-3 hover:bg-panel-2 ml-1 rounded p-1 hover:text-destructive disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{selectedShotIds.size > 1 ? t('删除 {n} 个场景', { n: selectedShotIds.size }) : t('删除选中')}</TooltipContent>
          </Tooltip>
          {/* 智能剪口播(Transcript 驱动):词级改稿/删词剪辑的入口(往片子里下手的动作与字幕同排) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => (floatWin === 'script' ? setFloatWin(null) : openFloatAt('script', e.currentTarget.getBoundingClientRect()))}
                disabled={!comp.video}
                className={`border-line ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] disabled:opacity-40 ${
                  floatWin === 'script' ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink hover:bg-panel-2'
                }`}
              >
                <ScrollText size={13} /> {t('智能剪口播')}
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('按词剪辑口播稿')}</TooltipContent>
          </Tooltip>
          {/* 字幕:样式预设 popover(从 rail 面板改挂走带栏——就近时间轴,点开即选) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setFloatWin(floatWin === 'captions' ? null : 'captions')}
                disabled={!comp.video}
                className={`border-line ml-1 inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] disabled:opacity-40 ${
                  floatWin === 'captions' ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink hover:bg-panel-2'
                }`}
              >
                <CaptionsIcon size={13} /> {t('字幕')}
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('字幕样式(全片生效)')}</TooltipContent>
          </Tooltip>
          {/* 人像:抠像全局配置(羽化/描边/换背景);哪些组件在人后归组件浮动条 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => (floatWin === 'person' ? setFloatWin(null) : openFloatAt('person', e.currentTarget.getBoundingClientRect()))}
                disabled={!comp.video || !selectedShotId}
                aria-label={t('人像')}
                className={`ml-1 rounded p-1 disabled:opacity-40 ${floatWin === 'person' ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink hover:bg-panel-2'}`}
              >
                <UserRound size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('智能抠像(人物置顶/描边/换背景)')}</TooltipContent>
          </Tooltip>
          {/* 取景:选中分镜的取景设置(样式卡面板) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => selectedShotId && (floatWin === 'shot' ? setFloatWin(null) : openFloatAt('shot', e.currentTarget.getBoundingClientRect()))}
                disabled={!comp.video || !selectedShotId}
                aria-label={t('镜头取景')}
                className={`rounded p-1 disabled:opacity-40 ${floatWin === 'shot' ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink hover:bg-panel-2'}`}
              >
                <Frame size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('镜头取景')}</TooltipContent>
          </Tooltip>
          <div className="flex-1" />
          {/* 时间轴缩放:− 细线滑块 +(无边框,垂直居中) */}
          <div className="text-ink-3 flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={() => setPps((p) => Math.max(MIN_PPS, Math.round(p / 1.4)))} disabled={pps <= MIN_PPS} aria-label={t('时间轴缩小')} className="hover:text-ink flex items-center disabled:opacity-40">
                  <Minus size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('缩小时间轴')}</TooltipContent>
            </Tooltip>
            <input
              type="range"
              min={MIN_PPS}
              max={MAX_PPS}
              step={1}
              value={pps}
              onChange={(e) => setPps(Number(e.target.value))}
              className="zoom-range w-24"
              aria-label={t('时间轴缩放')}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={() => setPps((p) => Math.min(MAX_PPS, Math.round(p * 1.4)))} disabled={pps >= MAX_PPS} aria-label={t('时间轴放大')} className="hover:text-ink flex items-center disabled:opacity-40">
                  <Plus size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('放大时间轴')}</TooltipContent>
            </Tooltip>
          </div>
          {/* 调试口子(开发者):仅管理员可见,只留一个「分析」入口 —— 人脸/安全区、源码
              都收进分析面板头部,不再各占一个工具栏按钮 */}
          {isAdmin && (
          <div className="border-line flex shrink-0 items-center gap-0.5 border-l pl-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowDebug((s) => !s)}
                  aria-label={t('调试:口播稿与画面分析')}
                  className={`rounded p-1.5 ${showDebug ? 'text-ink bg-panel-2' : 'text-ink-4 hover:text-ink'}`}
                >
                  <FlaskConical size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('分析(调试)')}</TooltipContent>
            </Tooltip>
          </div>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                disabled={exporting || publishing || !comp.video}
                className="border-line text-ink-2 hover:text-ink inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] disabled:opacity-50"
              >
                {exporting || publishing ? <Loader2 size={14} className="animate-spin" /> : <FileVideo size={14} />}{' '}
                {exporting ? t('导出 {pct}%', { pct: exportPct }) : publishing ? t('合成 {pct}%', { pct: exportPct }) : t('导出')}
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('导出成片')}</TooltipContent>
          </Tooltip>
          <Dialog open={exportOpen} onOpenChange={(v) => { if (!v && exporting) return; setExportOpen(v); }}>
            <DialogContent className="max-w-[320px]" showCloseButton={!exporting}>
              <DialogHeader>
                <DialogTitle>{t('导出成片')}</DialogTitle>
              </DialogHeader>
              {exporting ? (
                // 导出中弹窗不关:进度留在这里,只有「取消导出」能关(遮罩/Esc 都拦)
                <div className="flex flex-col gap-3">
                  <div className="bg-line h-1.5 overflow-hidden rounded-full">
                    <div className="bg-accent h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${exportPct}%` }} />
                  </div>
                  <p className="text-ink-3 text-[12px]">{t('合成中 {pct}%，完成后自动下载', { pct: exportPct })}</p>
                  <button
                    type="button"
                    onClick={() => {
                      cancelExport();
                      setExportOpen(false);
                    }}
                    className="border-line text-ink-2 hover:text-ink inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[13px]"
                  >
                    <X size={14} /> {t('取消导出')}
                  </button>
                </div>
              ) : (
              <div className="flex flex-col gap-3">
                <ExportOptRow
                  label={t('分辨率')}
                  value={exportOpts.res}
                  options={[
                    [2160, '4K'],
                    [1440, '2K'],
                    [1080, '1080p'],
                    [720, '720p'],
                    [540, '540p'],
                  ]}
                  onPick={(res) => setExportOpts((o) => ({ ...o, res }))}
                />
                <ExportOptRow
                  label={t('帧率')}
                  value={exportOpts.fps}
                  options={[
                    [24, '24'],
                    [30, '30'],
                    [60, '60'],
                  ]}
                  onPick={(fps) => setExportOpts((o) => ({ ...o, fps }))}
                />
                <ExportOptRow
                  label={t('格式')}
                  value={exportOpts.format}
                  options={[
                    ['mp4', 'MP4'],
                    ['mov', 'MOV'],
                    ['webm', 'WebM'],
                  ]}
                  onPick={(format) => setExportOpts((o) => ({ ...o, format }))}
                />
                <p className="text-ink-4 text-[11px] leading-relaxed">{t('导出完成后自动下载；内容和选项都没变时直接下载上次的成片。')}</p>
                <button
                  type="button"
                  onClick={() => {
                    // 弹窗留着显示进度,合成结束(完成/失败/取消)才收
                    void exportVideo(exportOpts).finally(() => setExportOpen(false));
                  }}
                  className="bg-ink text-bg inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium hover:opacity-90"
                >
                  <Download size={14} /> {t('开始导出')}
                </button>
              </div>
              )}
            </DialogContent>
          </Dialog>
          {((exporting && !exportOpen) || publishing) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    cancelExport();
                  }}
                  className="text-ink-3 hover:text-ink shrink-0 rounded p-1"
                >
                  <X size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('停止合成')}</TooltipContent>
            </Tooltip>
          )}
        </div>
        </TooltipProvider>

        {/* 字幕样式 popover:整件复用 CaptionsPanel;点样式即全局应用,点外面/Esc 收起 */}
        {/* 多层时间轴 */}
        <StudioTimeline
          comp={comp}
          playing={playing}
          locateSignal={locateSignal}
          selectedShotIds={selectedShotIds}
          selectedBlockIds={selectedBlockIds}
          filmstrip={filmstrip}
          clipStrips={clipStrips}
          pps={pps}
          assetDragging={!!dragAsset}
          assetDragKind={dragAsset?.type ?? null}
          clipPendingAt={clipPending}
          {...timelineCbs}
        />

        {/* 测试口子:口播稿 + 画面分析(只读) */}
        {showDebug && (
          <div className="border-line flex h-44 flex-col border-t">
            <div className="border-line text-ink-4 flex items-center gap-2 border-b px-3 py-1.5 text-[11px]">
              <span>{t('口播稿 + 画面分析（只读 · 也在 window.__studio · 已缓存）')}</span>
              <div className="ml-auto flex items-center gap-1.5">
                {/* 人脸/安全区叠加(原工具栏按钮收进来):在预览上叠人脸(红)/主体(蓝)/安全区(绿) */}
                <button
                  type="button"
                  onClick={() => setShowGeom((s) => !s)}
                  disabled={!visual}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] disabled:opacity-40 ${showGeom ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600' : 'border-line text-ink-3 hover:text-ink hover:bg-panel-2'}`}
                >
                  <ScanFace size={11} /> {t('人脸/安全区')}
                </button>
                {/* assembled HTML(原工具栏按钮收进来) */}
                <button
                  type="button"
                  onClick={() => setShowCode((s) => !s)}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] ${showCode ? 'border-line bg-panel-2 text-ink' : 'border-line text-ink-3 hover:text-ink hover:bg-panel-2'}`}
                >
                  <Code2 size={11} /> {t('源码')}
                </button>
                <button
                  type="button"
                  onClick={() => void rerunVisual()}
                  disabled={!comp.video}
                  className="border-line text-ink-3 hover:text-ink hover:bg-panel-2 rounded border px-2 py-0.5 text-[11px] disabled:opacity-40"
                >
                  {t('清缓存重跑画面分析')}
                </button>
              </div>
            </div>
            <textarea
              value={debugText}
              readOnly
              spellCheck={false}
              className="bg-panel text-ink-3 min-h-0 flex-1 resize-none p-3 font-mono text-[11px] leading-[1.6] outline-none"
            />
          </div>
        )}

        {/* assembled HTML(只读,透明可查) */}
        {showCode && (
          <div className="border-line flex h-44 flex-col border-t">
            <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[11px]">{t('assembled HTML（由块拼出，只读）')}</div>
            <textarea
              value={assembled}
              readOnly
              spellCheck={false}
              className="bg-panel text-ink-3 min-h-0 flex-1 resize-none p-3 font-mono text-[11px] leading-[1.5] outline-none"
            />
          </div>
        )}
      </div>


    </div>
  );
}

/** 除 captionStyle 外其它字段全同(引用比对)——重建防抖/跳过的判据。 */
/** 只有主题挂载面(frameId/palette)变:跳过重建——已插组件 token 全烘焙独立,舞台不该
 *  因换主题整刷(用户定);新 palette 在下一次自然重建时生效(stage 底色/AI 生成用)。 */
function themeMountOnlyChange(a: Composition | null, b: Composition): boolean {
  if (!a) return false;
  if (Object.is(a.palette, b.palette) && Object.is(a.frameId, b.frameId)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'palette' || k === 'frameId' || k === 'personFx') continue;
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}

function sameExceptCapStyle(a: Composition | null, b: Composition): boolean {
  if (!a) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'captionStyle') continue;
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}
/** 只有分镜取景/调色(treatment/treatSize/filter)变了:跳过重建——hf:shotVars 已即时打上,
 *  vid 时间轴由 hf:vidTimeline 就地换体(与重建烤出的完全同源,取景与调色关键帧都在体内)。
 *  其余任何字段/结构变化都不走这条。 */
function shotFramingOnlyChange(a: Composition | null, b: Composition): boolean {
  if (!a || a === b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'shots') continue;
    if (!Object.is(a[k], b[k])) return false;
  }
  const sa = a.shots ?? [];
  const sb = b.shots ?? [];
  if (sa === sb) return false; // shots 也没变=没变化,交给常规路径的恒等判断
  if (sa.length !== sb.length) return false;
  for (let i = 0; i < sa.length; i++) {
    const x = sa[i]!;
    const y = sb[i]!;
    if (x === y) continue;
    const { treatment: _xt, treatSize: _xs, filter: _xf, ...rx } = x;
    const { treatment: _yt, treatSize: _ys, filter: _yf, ...ry } = y;
    const kx = Object.keys(rx) as (keyof typeof rx)[];
    if (kx.length !== Object.keys(ry).length) return false;
    for (const k of kx) if (!Object.is(rx[k], (ry as typeof rx)[k])) return false;
  }
  return true;
}

/** 只有花字位置(xPct/yPct)变了:可跳过重建(hf:capStyle 已直改,重烤值恒等)。 */
function capPosOnlyChange(a: Composition | null, b: Composition): boolean {
  if (!a || !sameExceptCapStyle(a, b)) return false;
  const ca = a.captionStyle;
  const cb = b.captionStyle;
  if (!ca || !cb) return Object.is(ca, cb);
  // sub(译文行)同口径:位置(yPct/xPct/hPct)live 通道已直改可跳;字号/框宽变了要重分段,必须重建
  const sa = ca.sub ?? {};
  const sb = cb.sub ?? {};
  return (
    ca.preset === cb.preset &&
    Object.is(ca.scale, cb.scale) &&
    Object.is(ca.wPct, cb.wPct) &&
    Object.is(sa.scale, sb.scale) &&
    Object.is(sa.wPct, sb.wPct) &&
    // sub 从无到有/从有到无(首次拖出独立位置/清除)也得重建:锚定方式变了(top↔bottom)
    !!ca.sub === !!cb.sub
  );
}

/** 块级就地补丁的分类结果:每对变更块标注命中的补丁维度。 */
interface BlockPatchPair {
  a: Block;
  b: Block;
  geom: boolean; // box/contentBox/scale/rotation → hf:boxSize/hf:rotate
  timing: boolean; // startSec/durationSec → hf:blockTiming(运行时每帧动态读 data-start,改属性即生效)
  style: boolean; // bg/border/radius/opacity → hf:blockStyle(与 assemble 共用 blockBgCss,输出恒等)
  slots: boolean; // slots 文本 → 仅当是 iframe 就地改字的回显才可跳(调用方验 echo)
}
const PATCH_GEOM = new Set(['box', 'contentBox', 'scale', 'rotation']);
const PATCH_TIMING = new Set(['startSec', 'durationSec']);
const PATCH_STYLE = new Set(['bg', 'border', 'radius', 'opacity']);
const PATCH_IGNORE = new Set(['fitScale', 'label']); // 不进预览文档(fitScale 单独走 hf:fit;label 只在时间轴)

/** 只有可就地补丁的块级变更(几何/时间窗/表观/slots 回显)+ 纯删除:返回补丁清单;
 *  其余任何变化(新增块/换轨/换模板/caption 重铺/comp 级字段…)返回 null 走整文档重建。
 *  命中即跳过重建(重建=双缓冲切换=视频重载,"改一下闪一次"的来源),终值一次打进活跃文档。 */
function blockPatchableChange(a: Composition | null, b: Composition): { pairs: BlockPatchPair[]; removed: Block[] } | null {
  if (!a || a === b) return null;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Composition>;
  for (const k of keys) {
    if (k === 'blocks') continue;
    if (!Object.is(a[k], b[k])) return null;
  }
  const ba = a.blocks;
  const bb = b.blocks;
  if (ba === bb) return null;
  // 顺序保持的 id 配对:允许删除;新增/重排 → null(要动 DOM 结构,交给重建)
  const pairs: BlockPatchPair[] = [];
  const removed: Block[] = [];
  let j = 0;
  for (const x of ba) {
    const y = bb[j];
    if (!y || y.id !== x.id) {
      removed.push(x);
      continue;
    }
    j++;
    if (x === y) continue;
    const p: BlockPatchPair = { a: x, b: y, geom: false, timing: false, style: false, slots: false };
    const ks = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of ks) {
      const xv = (x as unknown as Record<string, unknown>)[k];
      const yv = (y as unknown as Record<string, unknown>)[k];
      if (Object.is(xv, yv) || PATCH_IGNORE.has(k)) continue;
      if (PATCH_GEOM.has(k)) {
        if (!x.box || !y.box) return null; // box 从无到有=布局模式切换,必须重建
        p.geom = true;
      } else if (PATCH_TIMING.has(k)) p.timing = true;
      else if (PATCH_STYLE.has(k)) p.style = true;
      else if (k === 'slots') p.slots = true;
      else return null;
    }
    if (p.geom || p.timing || p.style || p.slots) pairs.push(p);
  }
  if (j !== bb.length) return null; // bb 有 ba 没有的块(新增/重排)
  if (!pairs.length && !removed.length) return null;
  return { pairs, removed };
}

/** 整块平移:box(裁切窗口)与 contentBox(内容锚)一起挪,保持裁切关系不变。 */
function shiftBox(b: Block, dx: number, dy: number): Block {
  if (!b.box) return b;
  return {
    ...b,
    box: { ...b.box, x: b.box.x + dx, y: b.box.y + dy },
    contentBox: b.contentBox ? { ...b.contentBox, x: b.contentBox.x + dx, y: b.contentBox.y + dy } : undefined,
  };
}

/**
 * 选中块的画面级 box 操控壳(几何 = Block.box 布局矩形)。
 * 裁切与缩放分工(用户定的):边框窄条 = 移动;四边中点条柄 = 裁切这条边(对边锚死,
 * 内容锚定画布不重排);四角圆点 = 等比缩放(窗口/内容/字号一起 ×k,对角锚死)。
 * 字号本身不在这调(那是字体的事)。
 * 拖拽本体不在这 —— 统一 ghost 语义(同字幕手柄,用户定的):基准实线不动、虚线 ghost
 * 跟手(setGhostRect 直改 DOM),内容不实时改,松手提交 Block 后经免重建通道一次应用
 * (见 workbench 的 gripDrag/edgeDrag/scaleDrag 与 boxDrag 消息处理)。
 * 内部镂空(pointer-events:none)——不挡 iframe 里的单击选块 / 点字就地改。
 */
function BoxEditOverlay({
  box,
  stageW,
  stageH,
  rotation,
  overlayRef,
  labelRef,
  onMovePointerDown,
  onEdgePointerDown,
  onScalePointerDown,
  onRotatePointerDown,
}: {
  box: { x: number; y: number; w: number; h: number };
  stageW: number;
  stageH: number;
  /** 当前旋转角(度):选中框整体跟着转,手柄贴合旋转后的组件。 */
  rotation?: number;
  /** 选中框根 ref:旋转拖动期间父层直改它 transform(手柄跟手,不走 React state)。 */
  overlayRef?: React.Ref<HTMLDivElement>;
  /** 角度数字 ref:旋转拖动期间父层直改它 textContent/正立补偿。 */
  labelRef?: React.Ref<HTMLSpanElement>;
  onMovePointerDown: (e: React.PointerEvent) => void;
  /** 边柄:只拉这一轴的盒子尺寸(对边锚死),内容铺满重排——不裁切、不锁比例。 */
  onEdgePointerDown: (e: React.PointerEvent, side: 'l' | 'r' | 't' | 'b') => void;
  /** 角柄:等比缩放(窗口/内容/字号一起,对角锚死)。 */
  onScalePointerDown: (e: React.PointerEvent, sgnX: 1 | -1, sgnY: 1 | -1) => void;
  /** 底部旋转手柄:绕中心转整体。 */
  onRotatePointerDown: (e: React.PointerEvent) => void;
}) {
  const edge = 'pointer-events-auto absolute';
  // 白底描边圆点/条柄:深浅画面上都可读
  const knob = 'pointer-events-auto absolute rounded-full border-2 border-accent bg-white shadow';
  return (
    <div
      ref={overlayRef}
      className="pointer-events-none absolute z-30"
      style={{
        left: box.x * stageW,
        top: box.y * stageH,
        width: box.w * stageW,
        height: box.h * stageH,
        // 选中框整体跟着组件转(手柄贴合旋转后的卡片)
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
    >
      <div className="absolute inset-0 rounded-md ring-2 ring-accent/80" />
      {/* 底部中间接一根蓝线 + 旋转手柄(拖动绕中心旋转,实时) */}
      <div className="pointer-events-none absolute left-1/2 top-full flex -translate-x-1/2 flex-col items-center">
        <div className="bg-accent w-px" style={{ height: 22 }} />
        <button
          type="button"
          onPointerDown={onRotatePointerDown}
          title={t('拖动旋转（按住 Shift 吸附 15°）')}
          aria-label={t('旋转')}
          className="border-accent text-accent pointer-events-auto -mt-px flex h-5 w-5 cursor-grab items-center justify-center rounded-full border-2 bg-white shadow active:cursor-grabbing"
        >
          <RotateCw size={11} />
        </button>
        {/* 当前角度(拖动中实时;committed 非 0 时常显)。反转补偿保持数字正立 */}
        <span
          ref={labelRef}
          className="bg-accent mt-1 rounded px-1 py-0.5 font-mono text-[9px] leading-none text-white whitespace-nowrap"
          style={{ display: rotation ? 'block' : 'none', transform: rotation ? `rotate(${-rotation}deg)` : undefined }}
        >
          {rotation ? `${Math.round(rotation)}°` : ''}
        </span>
      </div>
      {/* 四边:拖移动(窄条,中间镂空给 iframe) */}
      <div className={`${edge} -top-1 left-0 right-0 h-2.5 cursor-move`} onPointerDown={onMovePointerDown} />
      <div className={`${edge} -bottom-1 left-0 right-0 h-2.5 cursor-move`} onPointerDown={onMovePointerDown} />
      <div className={`${edge} -left-1 bottom-0 top-0 w-2.5 cursor-move`} onPointerDown={onMovePointerDown} />
      <div className={`${edge} -right-1 bottom-0 top-0 w-2.5 cursor-move`} onPointerDown={onMovePointerDown} />
      {/* 四边中点条柄:只拉这一轴(对边锚死,内容铺满重排;不裁切、不锁比例) */}
      <div className={`${knob} top-1/2 -right-[5px] h-5 w-2 -translate-y-1/2 cursor-ew-resize`} title={t('调整宽度')} onPointerDown={(e) => onEdgePointerDown(e, 'r')} />
      <div className={`${knob} top-1/2 -left-[5px] h-5 w-2 -translate-y-1/2 cursor-ew-resize`} title={t('调整宽度')} onPointerDown={(e) => onEdgePointerDown(e, 'l')} />
      <div className={`${knob} left-1/2 -bottom-[5px] h-2 w-5 -translate-x-1/2 cursor-ns-resize`} title={t('调整高度')} onPointerDown={(e) => onEdgePointerDown(e, 'b')} />
      <div className={`${knob} left-1/2 -top-[5px] h-2 w-5 -translate-x-1/2 cursor-ns-resize`} title={t('调整高度')} onPointerDown={(e) => onEdgePointerDown(e, 't')} />
      {/* 四角圆点:等比缩放(窗口/内容/字号一起,对角锚死) */}
      <div className={`${knob} -top-[7px] -left-[7px] h-3.5 w-3.5 cursor-nwse-resize`} title={t('等比缩放')} onPointerDown={(e) => onScalePointerDown(e, -1, -1)} />
      <div className={`${knob} -top-[7px] -right-[7px] h-3.5 w-3.5 cursor-nesw-resize`} title={t('等比缩放')} onPointerDown={(e) => onScalePointerDown(e, 1, -1)} />
      <div className={`${knob} -bottom-[7px] -left-[7px] h-3.5 w-3.5 cursor-nesw-resize`} title={t('等比缩放')} onPointerDown={(e) => onScalePointerDown(e, -1, 1)} />
      <div className={`${knob} -bottom-[7px] -right-[7px] h-3.5 w-3.5 cursor-nwse-resize`} title={t('等比缩放')} onPointerDown={(e) => onScalePointerDown(e, 1, 1)} />
    </div>
  );
}

/**
 * 句级字幕的全局位置/大小手柄:选中任意一条字幕——**整个框身可拖**(双轴自由挪);
 * 左右中点柄 + 四角 = 调行宽(拆段跟着行宽算,**不动字号**,文本框语义);字号只走顶部
 * A−/A+ 步进。**全片字幕一起动**(Vids Captions 语义,没有单条特调)。
 * 框只是当前样式下字幕行的近似落位(定位对齐 renderLine 的 bottom:yPct% / left:xPct%);
 * 字幕词的编辑面在智能剪口播面板,框身盖住预览不挡任何编辑路径。
 */
function CaptionEditOverlay({
  style,
  compH,
  stageW,
  stageH,
  measured,
  onChange,
  onLive,
  onOpenPanel,
  label = t('字幕 · 全局'),
}: {
  style: CaptionStyle;
  compH: number;
  stageW: number;
  stageH: number;
  /** iframe 实测的字幕行矩形(w/h 归一 + 量时 scale):没有实测前退化为估算带。 */
  measured: { w: number; h: number; scale: number } | null;
  onChange: (patch: Partial<CaptionStyle>) => void;
  /** 拖动中的即时预览(零 setState,同组件 hf:boxSize 契约):workbench 发 hf:capStyle 直改 iframe。 */
  onLive: (style: CaptionStyle) => void;
  /** toolbar 快捷入口:打开右侧口播稿/花字面板(字幕的两个编辑面)。 */
  onOpenPanel: (panel: 'script' | 'caption') => void;
  /** 手柄标签(主行「字幕 · 全局」/译文行「译文 · 全局」——同一套逻辑两个实例)。 */
  label?: string;
}) {
  // 拖动中的本地实时样式(只重渲本 overlay):框跟手不隐藏(用户定的),iframe 由 onLive 直改。
  // ghost=改行宽拖动:基准实线原地不动、另画虚线跟手,不碰 iframe,松手提交后一次重建变化
  const [liveStyle, setLiveStyle] = useState<CaptionStyle | null>(null);
  const [ghost, setGhost] = useState(false);
  // 拖动护盾:拖动期间罩住整个舞台——指针滑进 iframe 区域事件就归 iframe 文档,父层
  // window 收不到 move/up(setPointerCapture 在这条边界上并不可靠),拖动会"断线"
  const [shield, setShield] = useState(false);
  const eff = liveStyle ?? style;
  const k = stageH / compH; // comp px → stage px
  const capPreset = getCaptionPreset(style.preset);
  const fontPx = capPreset.size;
  // 框几何(定位对齐渲染锚:行中心在 xPct、底边在 yPct;框高实测,无实测退化为估算)。
  // 基准框 = 已提交样式,实时框 = 拖动中样式:移动实线直接跟手;改宽走 ghost——基准实线
  // 原地不动,另画一条虚线跟手,松手实线一次到位(不会"弹回初始再跳过去",用户点名的体感)
  // 字幕行文字实高(归一到舞台高):框高(hPct)的下限——框可以比文字高(纯占位),不能比文字矮
  // 文字行实高(解析式,与渲染 CSS 同源:fs×1.2 行高 + 底板上下 padding round(fs×0.22)×2)。
  // 不能拿 iframe 实测矩形——实测含 min-height(框高),会把"框不能矮过文字"的下限撑虚,框缩不回去
  const textHNorm = (s: CaptionStyle) => {
    const fsC = Math.max(10, Math.round(fontPx * s.scale));
    const padC = capPreset.bg ? Math.round(fsC * 0.22) * 2 : 0;
    return ((fsC * 1.2 + padC) * k) / stageH;
  };
  const rectOf = (s: CaptionStyle) => {
    const w = Math.max(60, ((s.wPct ?? 56) / 100) * stageW);
    const h = Math.max(16, Math.max(textHNorm(s), (s.hPct ?? 0) / 100) * stageH);
    return { left: (stageW * (s.xPct ?? 50)) / 100 - w / 2, top: (stageH * s.yPct) / 100 - h, w, h };
  };
  const baseR = rectOf(style);
  const liveR = rectOf(eff);
  const rootR = ghost ? baseR : liveR;
  const startRef = useRef(style);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  /** 拖动零 setComp:过程每帧本地 liveStyle(框跟手);mode='live'(移动)另发 onLive
   *  (hf:capStyle 直改 iframe),mode='ghost'(改大小)只动虚拟框线——改大小要重排/重分段,
   *  逐帧直改跟不上(用户反馈性能),停手提交后一次重建变化。overlay 不卸载,capture 一直有效。 */
  const drag = (e: React.PointerEvent, apply: (s: CaptionStyle, dx: number, dy: number) => Partial<CaptionStyle>, mode: 'live' | 'ghost' = 'live') => {
    startRef.current = style;
    let patch: Partial<CaptionStyle> = {};
    startPointerDrag(e, {
      onStart: () => {
        if (mode === 'ghost') setGhost(true);
        setShield(true);
      },
      onFrame: (dx, dy) => {
        patch = apply(startRef.current, dx / stageW, dy / stageH);
        const merged = { ...startRef.current, ...patch };
        setLiveStyle(merged);
        if (mode === 'live') onLive(merged);
      },
      onEnd: () => {
        setLiveStyle(null);
        setGhost(false);
        setShield(false);
        if (Object.keys(patch).length) onChange(patch); // 松手一次提交(重建换入最终形态)
      },
    });
  };
  // 移动:双轴;水平贴近画布中轴(50%)时吸附并亮中轴参考线
  const move = (s: CaptionStyle, dx: number, dy: number): Partial<CaptionStyle> => {
    let x = clamp((s.xPct ?? 50) + dx * 100, 10, 90);
    if (Math.abs(x - 50) < 1.5) x = 50;
    return { xPct: x, yPct: clamp(s.yPct + dy * 100, 15, 98) };
  };
  const snappedCenter = liveStyle != null && Math.abs((eff.xPct ?? 50) - 50) < 0.01;
  // 上下中点柄:调**框高**(纯占位,不动字号,用户定的)。顶边:底边(yPct)锚死,拖高只扩
  // 占位;底边:顶边锚死——底边即字幕锚,字幕贴底跟着走,框高同步补偿。下限=文字实高
  const edgeTop = (s: CaptionStyle, _dx: number, dy: number): Partial<CaptionStyle> => {
    const tH = textHNorm(s);
    const h0 = Math.max(tH, (s.hPct ?? 0) / 100);
    const h = clamp(h0 - dy, tH, Math.max(tH, s.yPct / 100));
    return { hPct: Math.round(h * 1000) / 10 };
  };
  const edgeBottom = (s: CaptionStyle, _dx: number, dy: number): Partial<CaptionStyle> => {
    const tH = textHNorm(s);
    const h0 = Math.max(tH, (s.hPct ?? 0) / 100);
    const yTop = s.yPct / 100 - h0;
    const y = clamp(s.yPct / 100 + dy, yTop + tH, 0.98);
    return { yPct: Math.round(y * 1000) / 10, hPct: Math.round((y - yTop) * 1000) / 10 };
  };
  // 左右中点柄:调**框宽**(行宽口径,拆段跟着框宽算)——只动被拖的边,对边锚死;不动字号
  const edgeWidth = (sgn: 1 | -1) => (s: CaptionStyle, dx: number): Partial<CaptionStyle> => {
    const w0 = (s.wPct ?? 56) / 100;
    const x0 = (s.xPct ?? 50) / 100;
    let l = x0 - w0 / 2;
    let r = x0 + w0 / 2;
    if (sgn > 0) r = clamp(r + dx, l + 0.16, 0.98);
    else l = clamp(l + dx, 0.02, r - 0.16);
    return { wPct: Math.round((r - l) * 1000) / 10, xPct: clamp(((l + r) / 2) * 100, 10, 90) };
  };
  // A± 连点合并(单独机制,与松手无关):框/读数即时跟 pending 值,停点 200ms 才提交一次。
  // 不发 onLive 改字号——改字号不重分段会出现瞬时换行(定宽框),等重建一步到位。
  // 字号**只**走这里:拖边框调的是行宽,不牵动字号(文本框语义,用户定的)
  const pendingScaleRef = useRef<{ v: number; timer: ReturnType<typeof setTimeout> | null }>({ v: style.scale, timer: null });
  const stepScale = (d: number) => {
    const base = pendingScaleRef.current.timer ? pendingScaleRef.current.v : style.scale;
    const scale = Math.round(clamp(base + d, 0.4, 4) * 100) / 100;
    pendingScaleRef.current.v = scale;
    setLiveStyle({ ...style, scale });
    if (pendingScaleRef.current.timer) clearTimeout(pendingScaleRef.current.timer);
    pendingScaleRef.current.timer = setTimeout(() => {
      pendingScaleRef.current.timer = null;
      setLiveStyle(null);
      onChange({ scale });
    }, 200);
  };
  const knob = 'pointer-events-auto absolute rounded-full border-2 border-accent bg-white shadow';
  return (
    <div className="pointer-events-none absolute z-30" style={{ left: rootR.left, top: rootR.top, width: rootR.w, height: rootR.h }}>
      {/* 中轴对齐参考线:拖动吸附到画布水平中心时点亮(贯穿整个舞台) */}
      {snappedCenter && (
        <div className="bg-accent/90 absolute w-px" style={{ left: stageW / 2 - rootR.left, top: -rootR.top, height: stageH, boxShadow: '0 0 6px rgba(63,75,232,0.55)' }} />
      )}
      <div className="ring-accent/80 absolute inset-0 rounded-md ring-2" />
      {/* 改宽 ghost:基准实线不动,虚线跟手(松手实线一次到位) */}
      {ghost && (
        <div
          className="border-accent pointer-events-none absolute rounded-md border-2 border-dashed"
          style={{ left: liveR.left - baseR.left, top: liveR.top - baseR.top, width: liveR.w, height: liveR.h }}
        />
      )}
      {/* 框身整面可拖 = 移动(字幕词的编辑面在口播稿面板,盖住不挡任何编辑) */}
      <div className="pointer-events-auto absolute inset-0 cursor-move" onPointerDown={(e) => drag(e, move)} />
      {/* 顶部小 toolbar:居中悬在边框正上方跟着走(贴近舞台顶时翻到边框下方,不出界) */}
      <TooltipProvider delayDuration={200}>
      <div
        className="pointer-events-auto absolute left-1/2 flex -translate-x-1/2 items-center gap-1 whitespace-nowrap"
        style={rootR.top < 34 ? { top: rootR.h + 8 } : { top: -28 }}
      >
        <span className="bg-accent rounded px-1.5 py-0.5 text-[10px] font-medium text-white">{label}</span>
        <span className="border-line bg-panel flex items-center gap-0.5 rounded border px-1 py-0.5 shadow">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={t('字号调小')} onClick={() => stepScale(-0.1)} className="text-ink-3 hover:text-ink px-0.5 text-[11px] leading-none">
                A−
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('字号调小')}</TooltipContent>
          </Tooltip>
          <span className="text-ink-4 min-w-8 text-center font-mono text-[10px] tabular-nums">{Math.max(10, Math.round(fontPx * eff.scale))}px</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={t('字号调大')} onClick={() => stepScale(0.1)} className="text-ink-3 hover:text-ink px-0.5 text-[11px] leading-none">
                A＋
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('字号调大')}</TooltipContent>
          </Tooltip>
        </span>
        {/* 字幕的两个编辑面快捷入口:改词/删词 → 智能剪口播;换样式 → 字幕样式 */}
        <span className="border-line bg-panel flex items-center gap-0.5 rounded border px-1 py-0.5 shadow">
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => onOpenPanel('script')} className="text-ink-3 hover:text-ink px-1 text-[10.5px] leading-none">
                {t('智能剪口播')}
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('改词/删词')}</TooltipContent>
          </Tooltip>
          <span className="bg-line h-3 w-px" />
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={() => onOpenPanel('caption')} className="text-ink-3 hover:text-ink px-1 text-[10.5px] leading-none">
                {t('字幕样式')}
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('换样式')}</TooltipContent>
          </Tooltip>
        </span>
      </div>
      </TooltipProvider>
      {/* 左右中点柄=行宽(重分段,ghost:实线不动、虚线跟手,停手一次重建);
          上下中点柄=框高(纯占位不动字号,live 直接跟手);四角=行宽+框高一起(ghost)。 */}
      <div className={`${knob} top-1/2 -left-[5px] h-5 w-2 -translate-y-1/2 cursor-ew-resize`} title={t('调整行宽')} onPointerDown={(e) => drag(e, edgeWidth(-1), 'ghost')} />
      <div className={`${knob} top-1/2 -right-[5px] h-5 w-2 -translate-y-1/2 cursor-ew-resize`} title={t('调整行宽')} onPointerDown={(e) => drag(e, edgeWidth(1), 'ghost')} />
      <div className={`${knob} left-1/2 -top-[5px] h-2 w-5 -translate-x-1/2 cursor-ns-resize`} title={t('调整框高')} onPointerDown={(e) => drag(e, edgeTop)} />
      <div className={`${knob} left-1/2 -bottom-[5px] h-2 w-5 -translate-x-1/2 cursor-ns-resize`} title={t('调整框高')} onPointerDown={(e) => drag(e, edgeBottom)} />
      <div className={`${knob} -top-[7px] -left-[7px] h-3.5 w-3.5 cursor-nwse-resize`} title={t('调整大小')} onPointerDown={(e) => drag(e, (s, dx, dy) => ({ ...edgeWidth(-1)(s, dx), ...edgeTop(s, dx, dy) }), 'ghost')} />
      <div className={`${knob} -top-[7px] -right-[7px] h-3.5 w-3.5 cursor-nesw-resize`} title={t('调整大小')} onPointerDown={(e) => drag(e, (s, dx, dy) => ({ ...edgeWidth(1)(s, dx), ...edgeTop(s, dx, dy) }), 'ghost')} />
      <div className={`${knob} -bottom-[7px] -left-[7px] h-3.5 w-3.5 cursor-nesw-resize`} title={t('调整大小')} onPointerDown={(e) => drag(e, (s, dx, dy) => ({ ...edgeWidth(-1)(s, dx), ...edgeBottom(s, dx, dy) }), 'ghost')} />
      <div className={`${knob} -bottom-[7px] -right-[7px] h-3.5 w-3.5 cursor-nwse-resize`} title={t('调整大小')} onPointerDown={(e) => drag(e, (s, dx, dy) => ({ ...edgeWidth(1)(s, dx), ...edgeBottom(s, dx, dy) }), 'ghost')} />
      {/* 拖动护盾(最后渲染=最顶):舞台大小,挡住 iframe 吃事件 */}
      {shield && (
        <div
          className="pointer-events-auto absolute"
          style={{ left: -rootR.left, top: -rootR.top, width: stageW, height: stageH, cursor: ghost ? 'ew-resize' : 'move' }}
        />
      )}
    </div>
  );
}

/** 走带时间读数:订阅播放头 store,播放中每帧只有这一个小组件重渲。 */
function TimeReadout({ duration }: { duration: number }) {
  const t = usePlayheadT();
  return (
    <span className="text-ink-3 shrink-0 font-mono text-[11px] tabular-nums">
      {t.toFixed(1)} / {duration.toFixed(1)}s
    </span>
  );
}

/** 剪辑图标 ][:两半括号夹播放头;dashed 指定哪半虚线 = 被裁掉的一侧(分割不虚)。
 *  虚线半边拆三段各自起笔:一笔画会让下臂的 dash 相位接着竖线跑,上下臂不对称。 */
/** 导出弹窗的一行选项:标签 + 单选 chips。 */
function ExportOptRow<T extends string | number>({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-ink-3 w-12 shrink-0 text-[12px]">{label}</span>
      <div className="flex gap-1.5">
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onPick(v)}
            className={`rounded-md border px-2.5 py-1 text-[12px] ${v === value ? 'border-accent bg-accent/10 text-accent' : 'border-line text-ink-3 hover:text-ink'}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function BracketCutIcon({ dashed }: { dashed?: 'left' | 'right' }) {
  // outer=臂的外端 x,bar=竖线 x。臂都从外端往竖线画,相位一致;竖线 9px 配 1.8 周期整除,两端头对称
  const half = (outer: number, bar: number, isDashed: boolean) =>
    isDashed ? (
      <g strokeDasharray="1.8 1.8">
        <path d={`M${outer} 2.5 H${bar}`} />
        <path d={`M${bar} 2.5 V11.5`} />
        <path d={`M${outer} 11.5 H${bar}`} />
      </g>
    ) : (
      <path d={`M${outer} 2.5 H${bar} V11.5 H${outer}`} />
    );
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {half(2.5, 5.5, dashed === 'left')}
      {half(11.5, 8.5, dashed === 'right')}
    </svg>
  );
}


