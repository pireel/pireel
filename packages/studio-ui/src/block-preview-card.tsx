'use client';

/**
 * 单块活预览卡的共享件(组件库卡 / 模板面板卡共用,此前各自手抄一份已开始漂移):
 * - BlockPreviewFrame:blockPreviewDoc 自包含 iframe(定格稳定帧)+ 等比缩放;overlay 走 children。
 * - BlockKindFooter:KIND_META 图标 + 标签脚标。
 */

import { useEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { type Block, type Composition, blockKind, blockPreviewDoc, renderBlock } from '@pireel/studio-engine/composition';
import { getTheme, themeVarsCss } from '@pireel/studio-engine/theme';
import { injectPreviewRuntime } from './sample-composition';
import { KIND_META } from './kind-meta';
import { t } from './i18n';

/** 透明区棋盘格(屏幕像素级画在容器上;画进缩放文档会被缩糊,踩过)。 */
const CHECKER_STYLE: CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage:
    'linear-gradient(45deg,#d7dbe0 25%,transparent 25%,transparent 75%,#d7dbe0 75%),linear-gradient(45deg,#d7dbe0 25%,transparent 25%,transparent 75%,#d7dbe0 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,8px 8px',
};

export function BlockPreviewFrame({
  comp,
  block,
  width,
  animate = false,
  ground = 'checker',
  focus,
  children,
}: {
  comp: Composition;
  block: Block;
  width: number;
  /** 预览底:'checker'=诚实底(透明棋盘格,库/卡片默认);'stage'=舞台纸底(主题墙)。 */
  ground?: 'stage' | 'checker';
  /** 取景框(设计画布 px):给了=只看这一块(件居中放大,组件列表卡用);缺省=整画布缩微。 */
  focus?: { x: number; y: number; w: number; h: number };
  /** 动态预览:true = 自动循环播;'hover' = 悬停才播、移开回稳定帧。缺省定格稳定帧。 */
  animate?: boolean | 'hover';
  /** 叠加层(时间戳章/悬浮按钮/生成中盖层),挂在同一 relative 容器里 */
  children?: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // 仅当本块(或主题/画布尺寸/调色板)变才重渲文档——故意不依赖整个 comp,
  // 否则任何编辑都会让整墙 iframe 重载。
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const doc = useMemo(() => injectPreviewRuntime(blockPreviewDoc(comp, block, { loop: animate, ground })), [block, comp.theme, comp.width, comp.height, comp.palette, animate, ground]);
  // checker 态组件不占满格:缩进一圈居中,四周露出棋盘格(占满会把"透明可见"盖没)
  const inset = ground === 'checker' ? 0.86 : 1;
  const h = Math.round(comp.height * (width / comp.width));
  // focus 取景:按件的包围盒选缩放,件中心对齐卡中心——列表卡看"件本体"不看整画布
  const scale = focus ? Math.min((width * inset) / focus.w, (h * inset) / focus.h) : (width / comp.width) * inset;
  const padX = focus ? Math.round(width / 2 - (focus.x + focus.w / 2) * scale) : Math.round((width * (1 - inset)) / 2);
  const padY = focus ? Math.round(h / 2 - (focus.y + focus.h / 2) * scale) : Math.round((h * (1 - inset)) / 2);
  // 沙箱 iframe(opaque origin)拿不到 __hfPreview,悬停播放控制走 postMessage
  const setLoop = (on: boolean) => iframeRef.current?.contentWindow?.postMessage({ type: 'hf-loop', on }, '*');
  return (
    <div
      className={`relative ${ground === 'checker' ? '' : 'bg-black/40'}`}
      style={{ width, height: h, ...(ground === 'checker' ? CHECKER_STYLE : {}) }}
      onPointerEnter={animate === 'hover' ? () => setLoop(true) : undefined}
      onPointerLeave={animate === 'hover' ? () => setLoop(false) : undefined}
    >
      <iframe
        ref={iframeRef}
        title={block.label || t(KIND_META[blockKind(block)].label)}
        srcDoc={doc}
        sandbox="allow-scripts"
        tabIndex={-1}
        loading="lazy"
        className="pointer-events-none"
        style={{ position: 'absolute', left: padX, top: padY, width: comp.width, height: comp.height, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      />
      {children}
    </div>
  );
}

export function BlockKindFooter({ block }: { block: Block }) {
  const meta = KIND_META[blockKind(block)];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-1 px-1.5 py-1">
      <Icon size={11} className={`${meta.dot} shrink-0`} />
      <span className="text-ink truncate text-[10px]">{block.label || t(meta.label)}</span>
    </div>
  );
}

/* ============================ 内联预览(可信块专用) ============================ */

/** 主页面按需加载自托管 GSAP(与预览 iframe 用同一份 /vendor/gsap.min.js),进程内单次。 */
type GsapLike = { timeline: (o?: Record<string, unknown>) => GsapTimeline };
interface GsapTimeline {
  play(t?: number): void;
  pause(t?: number): void;
  progress(v: number): GsapTimeline;
  kill(): void;
}
let _gsap: Promise<GsapLike | null> | null = null;
function loadGsap(): Promise<GsapLike | null> {
  const w = window as unknown as { gsap?: GsapLike };
  if (w.gsap) return Promise.resolve(w.gsap);
  _gsap ??= new Promise((resolve) => {
    const el = document.createElement('script');
    el.src = '/vendor/gsap.min.js';
    el.onload = () => resolve((window as unknown as { gsap?: GsapLike }).gsap ?? null);
    el.onerror = () => resolve(null);
    document.head.appendChild(el);
  });
  return _gsap;
}

/**
 * 内联块预览 —— **只给我们自己手写的可信块用**(frame 方言封面/showcase):
 * 不走 iframe(切面板不再白屏、不用每卡起一个文档拉脚本),直接渲 innerHtml +
 * 主页面 GSAP 跑时间轴。信任边界不变:LLM 生成的块仍然只能走 BlockPreviewFrame 沙箱。
 * 字体差异:主应用是系统字体栈(不载 Noto 切片),衬线/等宽走栈内回落,可接受。
 */
/** 预览里的占位人像(半身剪影):把「图形浮在口播的人上面」演出来。
 *  front=false 垫在图形后(常规叠加);front=true 压在图形前(文字穿人/人物置顶);
 *  strokeColor 有值 = 主题的人像描边推荐(贴纸白边)直接画在剪影上。 */
export interface PreviewPerson {
  front?: boolean;
  strokeColor?: string | null;
  /** hero = 封面主角尺寸;corner = 产出卡角落小像(默认 hero)。 */
  size?: 'hero' | 'corner';
}

function PersonBust({ person, canvasH }: { person: PreviewPerson; canvasH: number }) {
  const h = Math.round(canvasH * (person.size === 'corner' ? 0.46 : 0.62));
  return (
    <svg
      viewBox="0 0 200 220"
      style={{
        position: 'absolute',
        right: person.size === 'corner' ? '2.5%' : '6%',
        bottom: -Math.round(h * 0.04),
        height: h,
        pointerEvents: 'none',
        ...(person.strokeColor ? { filter: 'drop-shadow(0 10px 22px rgb(0 0 0 / 0.2))' } : {}),
      }}
      aria-hidden
    >
      <path
        d="M100 14c24 0 41 19 41 45 0 19-9 35-22 43 38 9 66 38 75 84 3 16-7 30-23 30H29c-16 0-26-14-23-30 9-46 37-75 75-84-13-8-22-24-22-43 0-26 17-45 41-45z"
        fill="var(--panel-2)"
        stroke={person.strokeColor ?? 'var(--line)'}
        strokeWidth={person.strokeColor ? 14 : 2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InlineBlockPreview({
  comp,
  block,
  width,
  animate = false,
  person = null,
  ground = 'checker',
}: {
  comp: Composition;
  block: Block;
  width: number;
  /** true = 自动循环;'hover' = 悬停播、移开回稳定帧;false = 定格稳定帧。 */
  animate?: boolean | 'hover';
  /** 占位人像;null = 不画(非主题场景)。 */
  person?: PreviewPerson | null;
  /** 预览底:'checker'=诚实底(透明棋盘格,库/卡片默认);'stage'=舞台纸底(主题墙)。 */
  ground?: 'stage' | 'checker';
}) {
  const { innerHtml, timelineBody } = useMemo(() => renderBlock(block), [block]);
  const theme = getTheme(comp.theme);
  const vars = useMemo(() => themeVarsCss(theme, comp.palette), [theme, comp.palette]);
  const stageBg = comp.palette?.paper ?? theme.background;
  const inset = ground === 'checker' ? 0.86 : 1;
  const scale = (width / comp.width) * inset;
  const h = Math.round(comp.height * (width / comp.width));
  const padX = Math.round((width * (1 - inset)) / 2);
  const padY = Math.round((h * (1 - inset)) / 2);
  const tlRef = useRef<GsapTimeline | null>(null);

  useEffect(() => {
    let dead = false;
    void loadGsap().then((g) => {
      if (dead || !g) return;
      // animate=true(详情卡):循环播,播完稳定一拍再来。
      // 其余(封面/静态):不循环 —— 默认定格在**最终态**(progress 1),
      // hover 从头播一遍,播到尾自然停在最终态。
      const tl = g.timeline(animate === true ? { paused: true, repeat: -1, repeatDelay: 1.2 } : { paused: true });
      try {
        new Function('tl', timelineBody)(tl);
      } catch {
        /* 坏时间轴 → 静态展示 */
      }
      tlRef.current = tl;
      if (animate === true) tl.play(0);
      else tl.progress(1).pause();
    });
    return () => {
      dead = true;
      tlRef.current?.kill();
      tlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelineBody, animate]);

  return (
    <div
      className="relative overflow-hidden"
      style={{ width, height: h, ...(ground === 'checker' ? CHECKER_STYLE : {}) }}
      onPointerEnter={animate === 'hover' ? () => tlRef.current?.play(0) : undefined}
      onPointerLeave={animate === 'hover' ? () => tlRef.current?.progress(1).pause() : undefined}
    >
      <div
        ref={(el) => {
          if (el)
            el.style.cssText = `position:absolute;left:${padX}px;top:${padY}px;width:${comp.width}px;height:${comp.height}px;transform:scale(${scale});transform-origin:top left;overflow:hidden;${ground === 'checker' ? 'background:transparent;' : `background:${stageBg};`}${vars}font-family:var(--font-body);color:var(--fg);`;
        }}
      >
        {/* 占位人像垫底(常规叠加:图形在人前) */}
        {person && !person.front && <PersonBust person={person} canvasH={comp.height} />}
        {/* 方言块的选择器全部 #id 作用域,直接落主文档不串样式 */}
        <div id={block.id} style={{ position: 'absolute', inset: 0 }} dangerouslySetInnerHTML={{ __html: innerHtml }} />
        {/* 人物置顶(personFront:文字穿人/贴纸人)→ 剪影压在图形前 */}
        {person?.front && <PersonBust person={person} canvasH={comp.height} />}
      </div>
    </div>
  );
}
