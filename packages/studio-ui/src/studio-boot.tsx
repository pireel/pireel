'use client';

/**
 * 进场 boot 层:两件事都不做完不放行——
 *  1. 预热重资源(MODNet 26M + ort wasm 27M + GSAP):流式 fetch 进 HTTP 缓存,
 *     字节级真实进度;人像抠像/预览后续用到时秒开。失败/404 不拦进场(OSS 壳可能没这些文件)。
 *  2. 等项目数据落定(云端优先回落本地的 auto-restore 效果跑完,由 dataReady 传入)。
 * 背景 = 主题目录(useFrameCatalog)按 palette 画的纯 CSS 主题卡墙,列交叉滚动 + 虚化
 * ——不跑 22 个 GSAP iframe(loading 屏上自重就该轻);虚化后差别本也看不出。
 * 预热是模块级单次:换项目重挂工作台不重拉,进度直接续在已完成态。
 */

import { useEffect, useMemo, useState } from 'react';
import { PiGlyph } from '@pireel/ui/brand-mark';
import { type FrameCatalogItem, useFrameCatalog } from './use-frame-catalog';
import { modnetUrl, ortWasmUrls } from './matte-assets';
import { t } from './i18n';

interface WarmAsset {
  url: string;
  /** 磁盘实际字节数(进度分母;传输压缩不影响 reader 读到的解压字节) */
  bytes: number;
}

// 尺寸手抄自 public/ 实际文件——只是进度权重,不需要精确到字节。
// URL 从 matte-assets 取(与 person-matte 实际加载同 URL 含 ?v= 戳,预热才真命中缓存;
// 常量 rev 与运行时 ort 版本漂移时只浪费这次预热,功能不受影响)。
// 惰性求值:URL 里的 CDN base 由壳层注入(setMatteAssetBase),模块顶层取会抢跑在注入前。
const warmAssets = (): WarmAsset[] => [
  { url: modnetUrl(), bytes: 25_888_640 },
  { url: ortWasmUrls().wasm, bytes: 26_827_543 },
  { url: '/vendor/gsap.min.js', bytes: 72_927 },
];
const TOTAL_WARM_BYTES = 25_888_640 + 26_827_543 + 72_927;
/** 资源等待硬顶:慢网下不无限拦门,到点先进(预热在背后继续跑完)。 */
const WARM_WAIT_CEILING_MS = 20_000;
const MIN_HOLD_MS = 1_800; // 全命中缓存时也完整演一遍开场(用户定的:太快反而没体验)
const FADE_MS = 450;
/** 进度条显示打底:实际进度再快,显示值也按这个时长匀速涨满——不闪跳 100% 干等 */
const PROGRESS_RAMP_MS = 1_400;

let warmStarted = false;
let warmLoaded = 0; // 单调递增,模块级 —— 重挂/换项目续用
const warmListeners = new Set<(ratio: number) => void>();
const warmRatio = () => Math.min(1, warmLoaded / TOTAL_WARM_BYTES);

async function warmOne(a: WarmAsset): Promise<void> {
  let seen = 0;
  const bump = (n: number) => {
    const inc = Math.min(n, a.bytes - seen);
    if (inc <= 0) return;
    seen += inc;
    warmLoaded += inc;
    const r = warmRatio();
    for (const l of warmListeners) l(r);
  };
  try {
    const res = await fetch(a.url, { credentials: 'same-origin' });
    if (res.ok && res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bump(value.byteLength);
      }
    }
  } catch {
    /* 网络失败不拦进场 */
  }
  bump(a.bytes); // 失败/404/尺寸偏差一律补记满:进度只代表"预热流程走完"
}

/** 预热进度 0..1(挂上即启动,模块级只跑一次)。 */
function useWarmProgress(): number {
  const [ratio, setRatio] = useState(warmRatio);
  useEffect(() => {
    warmListeners.add(setRatio);
    if (!warmStarted) {
      warmStarted = true;
      void Promise.all(warmAssets().map(warmOne));
    }
    setRatio(warmRatio());
    return () => {
      warmListeners.delete(setRatio);
    };
  }, []);
  return ratio;
}

/** 进场 boot 覆盖层:资源预热 + dataReady 双闸;结束淡出后自卸。 */
export function StudioBootOverlay({ dataReady }: { dataReady: boolean }) {
  const warm = useWarmProgress();
  const frames = useFrameCatalog();
  const [minHoldDone, setMinHoldDone] = useState(false);
  const [warmWaived, setWarmWaived] = useState(false);
  const [ramp, setRamp] = useState(0); // 显示打底斜坡 0..1
  const [leaving, setLeaving] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const hold = window.setTimeout(() => setMinHoldDone(true), MIN_HOLD_MS);
    const ceiling = window.setTimeout(() => setWarmWaived(true), WARM_WAIT_CEILING_MS);
    const t0 = performance.now();
    const tick = window.setInterval(() => {
      const r = Math.min(1, (performance.now() - t0) / PROGRESS_RAMP_MS);
      setRamp(r);
      if (r >= 1) window.clearInterval(tick);
    }, 80);
    return () => {
      window.clearTimeout(hold);
      window.clearTimeout(ceiling);
      window.clearInterval(tick);
    };
  }, []);

  // 显示进度 = min(真实, 斜坡):真下载时看真实,全命中缓存时也匀速演满而不是瞬间 100%
  const shown = Math.min(warm, ramp);
  const ready = dataReady && minHoldDone && (warm >= 1 || warmWaived);
  // 注意 deps 只有 ready(单调 false→true):这里若把 leaving 也放进 deps,
  // setLeaving 触发的重跑会先 cleanup 掉 setGone 定时器再被 guard 挡住 —— 覆盖层永不卸载
  useEffect(() => {
    if (!ready) return;
    setLeaving(true);
    const t = window.setTimeout(() => setGone(true), FADE_MS);
    return () => window.clearTimeout(t);
  }, [ready]);

  // 交叉滚动列:目录 round-robin 分列;每列 4 份同栈循环(位移 -50% = 两份,
  // 另两份保证高窗口下窗口高 + 半周期内容始终有得看,不露底)
  const columns = useMemo(() => {
    const COLS = 5;
    if (!frames.length) return [];
    const cols: FrameCatalogItem[][] = Array.from({ length: COLS }, () => []);
    frames.forEach((f, i) => cols[i % COLS]!.push(f));
    return cols.filter((c) => c.length > 0);
  }, [frames]);

  if (gone) return null;

  const pct = Math.round(shown * 100);
  const status = shown < 1 && !warmWaived ? t('正在准备创作引擎…') : dataReady ? t('进入工作台') : t('正在同步项目…');

  return (
    <div
      className={`bg-canvas absolute inset-0 z-[120] overflow-hidden rounded-lg transition-opacity ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      aria-busy={!ready}
      aria-label={t('正在进入工作台')}
    >
      {/* 主题卡墙(虚化背景):blur + 轻放大藏边缘,列交叉滚动。
          目录还没回来(首访且无镜像)先滚骨架卡——首帧就有背景,不空窗 */}
      <div className="absolute inset-0" style={{ filter: 'blur(4px) saturate(1.05)', transform: 'scale(1.04)' }} aria-hidden>
        <div className="flex h-full justify-center gap-4 px-4">
          {(columns.length ? columns : SKELETON_COLUMNS).map((col, i) => (
            <div key={i} className="h-full w-56 shrink-0 overflow-hidden">
              <div
                className="sb-col flex flex-col gap-4"
                style={{
                  animationName: i % 2 === 0 ? 'sb-col-down' : 'sb-col-up',
                  animationDuration: `${46 + i * 9}s`,
                }}
              >
                {[0, 1, 2, 3].flatMap((rep) =>
                  col.map((f, j) => (f ? <ThemeWallCard key={`${rep}-${f.id}`} frame={f} /> : <SkeletonWallCard key={`${rep}-sk-${j}`} />)),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* 压暗层:让前景进度浮起来,四周再加 vignette */}
      <div className="bg-canvas/45 absolute inset-0" aria-hidden />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, rgb(0 0 0 / 0.25) 100%)' }} aria-hidden />

      {/* 前景:π 描边 loading + 进度 */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
        <svg viewBox="0 0 100 100" width={56} height={56} className="sb-pi" aria-hidden>
          <PiGlyph stroke="var(--color-ink)" strokeWidth={12} />
        </svg>
        <div className="bg-line h-1 w-56 overflow-hidden rounded-full">
          <div className="bg-accent h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-ink-2 text-[12px]">{status}</span>
          <span className="text-ink-4 font-mono text-[11px] tabular-nums">{pct}%</span>
        </div>
      </div>
    </div>
  );
}

/** 首访骨架列(目录到达前的占位):首帧就有列在滚,目录回来原位换真卡。 */
const SKELETON_COLUMNS: null[][] = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => null));

/** 中性占位卡(token 配色,深浅色模式都对):形状与真卡同构,换卡不跳版。 */
function SkeletonWallCard() {
  return (
    <div className="bg-panel border-line flex shrink-0 flex-col gap-2.5 rounded-xl border p-4">
      <div className="flex items-center gap-2">
        <span className="bg-line-2 h-2 w-6 shrink-0 rounded-full" />
        <span className="bg-line-2 h-2.5 w-20 rounded-full" />
      </div>
      <span className="bg-line h-2 w-full rounded-full" />
      <span className="bg-line h-2 w-3/4 rounded-full" />
      <div className="bg-panel-2 flex flex-col gap-1.5 rounded-lg p-2.5">
        <span className="bg-line-2 h-1.5 rounded-full" style={{ width: '58%' }} />
        <span className="bg-line h-1.5 rounded-full" style={{ width: '86%' }} />
        <span className="bg-line h-1.5 rounded-full" style={{ width: '42%' }} />
      </div>
    </div>
  );
}

/** 主题卡(纯 CSS 迷你详情卡):palette 直出——纸底/面板/强调色/主题圆角,
 *  虚化下传达的是每套主题的色彩与形状性格,不追封面像素级还原。 */
function ThemeWallCard({ frame }: { frame: FrameCatalogItem }) {
  const p = frame.palette ?? {};
  const paper = p.paper ?? '#17181B';
  const fg = p.fg ?? '#E8E8E6';
  const muted = p.muted ?? `${fg}99`;
  const accent = p.accent ?? '#8A8A82';
  const panel = p.panel ?? '#202226';
  const line = p.line ?? `${fg}26`;
  const radius = p.radius ?? '14px';
  return (
    <div className="flex shrink-0 flex-col gap-2.5 p-4" style={{ background: paper, color: fg, borderRadius: radius, boxShadow: p.shadow }}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-6 shrink-0 rounded-full" style={{ background: accent }} />
        <span className="truncate text-[13px] font-semibold">{frame.title}</span>
      </div>
      <div className="line-clamp-2 text-[10.5px] leading-relaxed" style={{ color: muted }}>
        {frame.summary}
      </div>
      <div className="flex flex-col gap-1.5 p-2.5" style={{ background: panel, borderRadius: `calc(${radius} * 0.6 + 2px)`, border: `1px solid ${line}` }}>
        <span className="h-1.5 rounded-full" style={{ background: accent, width: '58%' }} />
        <span className="h-1.5 rounded-full" style={{ background: line, width: '86%' }} />
        <span className="h-1.5 rounded-full" style={{ background: line, width: '42%' }} />
      </div>
    </div>
  );
}
