'use client';

/**
 * 素材块动效面板(浮动条「动效」入口):入场/出场各一组 SVG 效果卡(与取景面板同范式,
 * 1:1 画框 + 运动示意,标题在图下),时长胶囊。作用于当前选中的素材块;选中一走父层自动关。
 */

import { t } from './i18n';

export type MediaAnimValue = { enter?: string; exit?: string; dur?: number };

const ENTERS = [
  ['none', '无'],
  ['fade', '淡入'],
  ['slide', '滑入'],
  ['rise', '升起'],
  ['scale', '放大'],
] as const;
const EXITS = [
  ['none', '无'],
  ['fade', '淡出'],
  ['slide', '滑出'],
  ['rise', '上浮'],
  ['scale', '缩小'],
] as const;

const ACCENT = 'var(--color-accent, #3f4be8)';

/** 单张动效卡:96×96 画框,素材=浅底圆角矩形,运动轨迹=残影 + accent 箭头。 */
function AnimPreview({ effect, phase }: { effect: string; phase: 'in' | 'out' }) {
  // 素材占位矩形(残影用低透明度同形)
  const R = (x: number, y: number, o: number, w = 40, h = 28) => <rect x={x} y={y} width={w} height={h} rx="5" className="fill-ink-4/40" opacity={o} />;
  // 虚线轮廓(缩放的目标/起点形)
  const D = (x: number, y: number, w: number, h: number) => (
    <rect x={x} y={y} width={w} height={h} rx="5" fill="none" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" strokeDasharray="4 3" />
  );
  // accent 箭头:杆 + 头
  const A = (d: string) => <path d={d} fill="none" stroke={ACCENT} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />;
  let inner: React.ReactNode;
  switch (effect) {
    case 'fade':
      // 淡:同形三格透明度渐变(入=越来越实,出=越来越虚)
      inner = (
        <>
          {R(7, 40, phase === 'in' ? 0.15 : 0.95, 24, 16)}
          {R(36, 40, 0.45, 24, 16)}
          {R(65, 40, phase === 'in' ? 0.95 : 0.15, 24, 16)}
        </>
      );
      break;
    case 'slide':
      // 滑:横向残影拖尾 + 向右箭头(入=拖尾在左落到实体,出=实体甩出拖尾)
      inner =
        phase === 'in' ? (
          <>
            {R(8, 30, 0.15)}
            {R(20, 30, 0.4)}
            {R(36, 30, 0.95)}
            {A('M26 76 L64 76 M56 70 L64 76 L56 82')}
          </>
        ) : (
          <>
            {R(20, 30, 0.95)}
            {R(36, 30, 0.4)}
            {R(48, 30, 0.15)}
            {A('M32 76 L70 76 M62 70 L70 76 L62 82')}
          </>
        );
      break;
    case 'rise':
      // 升:纵向残影 + 向上箭头(入=从下浮上来,出=继续上浮离场)
      inner =
        phase === 'in' ? (
          <>
            {R(22, 54, 0.15)}
            {R(22, 40, 0.4)}
            {R(22, 24, 0.95)}
            {A('M78 66 L78 28 M72 36 L78 28 L84 36')}
          </>
        ) : (
          <>
            {R(22, 46, 0.4)}
            {R(22, 32, 0.15)}
            {R(22, 14, 0.95)}
            {A('M78 62 L78 18 M72 26 L78 18 L84 26')}
          </>
        );
      break;
    case 'scale':
      // 缩放:虚线形→实体形 + 对角箭头(入=由小放大箭头向外,出=收小箭头向内)
      inner =
        phase === 'in' ? (
          <>
            {D(38, 41, 20, 14)}
            {R(22, 30, 0.95, 52, 36)}
            {A('M60 36 L72 24 M64 24 L72 24 L72 32')}
            {A('M36 60 L24 72 M32 72 L24 72 L24 64')}
          </>
        ) : (
          <>
            {D(18, 27, 60, 42)}
            {R(36, 40, 0.95, 24, 16)}
            {A('M74 22 L62 34 M62 26 L62 34 L70 34')}
            {A('M22 74 L34 62 M34 70 L34 62 L26 62')}
          </>
        );
      break;
    default:
      // 无:空画框 + 斜杠(与取景面板「无」同款标识)
      inner = <line x1="14" y1="82" x2="82" y2="14" stroke="currentColor" strokeOpacity="0.45" strokeWidth="3" strokeLinecap="round" />;
  }
  return (
    <svg viewBox="0 0 96 96" className="text-ink-3 w-full" aria-hidden>
      <rect x="0.75" y="0.75" width="94.5" height="94.5" rx="5" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />
      <clipPath id={`ap-${phase}-${effect}`}>
        <rect x="1.5" y="1.5" width="93" height="93" rx="4.5" />
      </clipPath>
      <g clipPath={`url(#ap-${phase}-${effect})`}>{inner}</g>
    </svg>
  );
}

function AnimCards({
  options,
  phase,
  value,
  onPick,
}: {
  options: readonly (readonly [string, string])[];
  phase: 'in' | 'out';
  value: string;
  onPick: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map(([v, name]) => {
        const active = value === v;
        return (
          <button key={v} type="button" onClick={() => onPick(v)} aria-label={`${t(phase === 'in' ? '入场' : '出场')}:${t(name)}`} className="group flex flex-col items-center gap-1">
            <div className={`w-full rounded-lg border-2 transition ${active ? 'border-accent' : 'border-transparent group-hover:border-line-2'}`}>
              <AnimPreview effect={v} phase={phase} />
            </div>
            <span className={`text-[10.5px] ${active ? 'text-ink font-medium' : 'text-ink-3 group-hover:text-ink'}`}>{t(name)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MediaAnimPanel({
  anim,
  onChange,
}: {
  anim: MediaAnimValue;
  onChange: (patch: Partial<{ enter: string; exit: string; dur: number }>) => void;
}) {
  const enter = anim.enter ?? 'fade';
  const exit = anim.exit ?? 'none';
  const dur = anim.dur ?? 0.5;
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {/* 标题/关闭归浮窗头部,这里只剩一行说明 */}
      <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[10.5px]">{t('作用于当前选中的图片 / 视频块')}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3 text-[11.5px]">
        <section className="flex flex-col gap-1.5">
          <div className="text-ink font-medium">{t('入场')}</div>
          <AnimCards options={ENTERS} phase="in" value={enter} onPick={(v) => onChange({ enter: v })} />
        </section>
        <section className="flex flex-col gap-1.5">
          <div className="text-ink font-medium">{t('出场')}</div>
          <AnimCards options={EXITS} phase="out" value={exit} onPick={(v) => onChange({ exit: v })} />
        </section>
        <section className="flex flex-col gap-1.5">
          <div className="text-ink font-medium">{t('时长')}</div>
          <div className="flex items-center gap-1.5">
            {([0.3, 0.5, 0.8] as const).map((dv) => (
              <button
                key={dv}
                type="button"
                onClick={() => onChange({ dur: dv })}
                className={`rounded-full border px-2.5 py-1 ${dur === dv ? 'border-accent bg-accent/20 text-ink' : 'border-line text-ink-3 hover:text-ink'}`}
              >
                {dv}s
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
