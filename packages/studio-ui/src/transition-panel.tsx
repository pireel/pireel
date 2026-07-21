'use client';

/**
 * 转场面板(时间轴切点热区/区域点开,统一浮窗承载):效果集 = gl-transitions gallery
 * 十选,着色器本体与预览/导出同一份(transition-gl.ts 的 GL_MIXER_SRC)。每张卡是
 * 一块 canvas,用两张**真实照片**跑真着色器——静态定格半程,hover 从头到尾循环播
 * (对齐 gl-transitions.com/gallery 的交互)。全部卡共享一个 WebGL 合成器(canvas
 * 上下文有数量上限,一卡一个会被浏览器回收),渲染完 blit 到各卡的 2d canvas。
 * 推移/划开带方向。时长在时间轴区域两侧柄上对称拖(≤4s),面板不管时长。
 */

import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import {
  type CutTransitionEffect,
  type TransitionDirection,
  CUT_TRANSITION_EFFECTS,
  DIRECTIONAL_TRANSITIONS,
} from '@pireel/studio-engine/composition';
import { type GlMixer, createGlMixer, glDirection } from '@pireel/studio-engine/transition-gl';
import { t } from './i18n';
import fromJpg from './assets/transition-from.jpg';
import toJpg from './assets/transition-to.jpg';

const HINTS: Record<CutTransitionEffect, string> = {
  fade: '交叉叠化',
  fadeblack: '黑场吸入吐出',
  directional: '后镜把前镜推出画面',
  directionalwipe: '柔边斜向擦过',
  circleopen: '圆形光圈打开',
  windowslice: '竖条百叶窗',
  crosszoom: '变焦冲击(动态模糊)',
  rotatescale: '旋转缩放对切',
  glitch: '故障色散',
  dreamy: '波浪浮动',
};

const CW = 168;
const CH = 104;

/** 预览资源单例:两张真实照片 cover 进 CW×CH 的板 + 共享 GL 合成器。 */
let RES: Promise<{ mixer: GlMixer | null; plateA: HTMLCanvasElement; plateB: HTMLCanvasElement }> | null = null;
function res() {
  RES ??= (async () => {
    const load = (src: string) =>
      new Promise<HTMLImageElement | null>((ok) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = () => ok(null);
        im.src = src;
      });
    const [a, b] = await Promise.all([load(fromJpg), load(toJpg)]);
    const plate = (im: HTMLImageElement | null, fallback: string) => {
      const cv = document.createElement('canvas');
      cv.width = CW;
      cv.height = CH;
      const g = cv.getContext('2d')!;
      if (im) {
        const k = Math.max(CW / im.width, CH / im.height);
        g.drawImage(im, (CW - im.width * k) / 2, (CH - im.height * k) / 2, im.width * k, im.height * k);
      } else {
        g.fillStyle = fallback;
        g.fillRect(0, 0, CW, CH);
      }
      return cv;
    };
    return { mixer: createGlMixer(CW, CH), plateA: plate(a, '#6b4e35'), plateB: plate(b, '#2b3a55') };
  })();
  return RES;
}

/** 单张效果卡:真着色器渲染,静态定格半程;hover 循环播 p 0→1(1.2s + 短驻留)。 */
function EffectCard({ effect, dir }: { effect: CutTransitionEffect | null; dir: TransitionDirection }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const hoverRef = useRef(false);
  const paint = async (p: number) => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    const { mixer, plateA, plateB } = await res();
    if (effect == null) {
      g.drawImage(p < 0.5 ? plateA : plateB, 0, 0); // 无 = 跳切
      return;
    }
    const [dx, dy] = glDirection(dir);
    if (mixer && mixer.render(plateA, plateB, effect, p, dx, dy)) g.drawImage(mixer.canvas as HTMLCanvasElement, 0, 0);
    else g.drawImage(p < 0.5 ? plateA : plateB, 0, 0);
  };
  useEffect(() => {
    void paint(0.45);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effect, dir]);
  const start = () => {
    hoverRef.current = true;
    const t0 = performance.now();
    const loop = (now: number) => {
      if (!hoverRef.current) return;
      void paint(Math.min(1, ((now - t0) % 1600) / 1200)); // 1.2s 播完 + 0.4s 驻留
      rafRef.current = requestAnimationFrame(loop);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  };
  const stop = () => {
    hoverRef.current = false;
    cancelAnimationFrame(rafRef.current);
    void paint(0.45);
  };
  return <canvas ref={ref} width={CW} height={CH} onMouseEnter={start} onMouseLeave={stop} className="block h-auto w-full rounded-md" />;
}

const DIRS: { id: TransitionDirection; icon: typeof ArrowUp; name: string }[] = [
  { id: 'up', icon: ArrowUp, name: '向上' },
  { id: 'down', icon: ArrowDown, name: '向下' },
  { id: 'left', icon: ArrowLeft, name: '向左' },
  { id: 'right', icon: ArrowRight, name: '向右' },
];

export function TransitionPanel({
  effect,
  direction,
  onPick,
}: {
  /** 该切点当前的转场效果(null=没设)。 */
  effect: CutTransitionEffect | null;
  /** 当前方向(仅推移/划开;缺省 left)。 */
  direction: TransitionDirection;
  /** 点卡/点方向即应用;effect null=移除。 */
  onPick: (effect: CutTransitionEffect | null, direction?: TransitionDirection) => void;
}) {
  const cards: { id: CutTransitionEffect | null; name: string; hint: string }[] = [
    { id: null, name: '无', hint: '跳切(默认)' },
    ...CUT_TRANSITION_EFFECTS.map((e) => ({ id: e.id as CutTransitionEffect | null, name: e.name, hint: HINTS[e.id] })),
  ];
  const directional = effect != null && DIRECTIONAL_TRANSITIONS.has(effect);
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[10.5px]">{t('两镜内容在切点交接,悬停卡片预览;时长拖时间轴上转场区两侧的柄(对称,最长 4 秒);区内不能分割')}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
        <div className="grid grid-cols-2 gap-2">
          {cards.map((ef) => {
            const active = effect === ef.id;
            return (
              <button
                key={ef.id ?? 'none'}
                type="button"
                onClick={() => onPick(ef.id, direction)}
                aria-label={t('转场:{name}', { name: t(ef.name) })}
                title={t(ef.hint)}
                className="group flex flex-col items-center gap-1"
              >
                <div className={`w-full overflow-hidden rounded-lg border-2 transition ${active ? 'border-accent' : 'border-transparent group-hover:border-line-2'}`}>
                  <EffectCard effect={ef.id} dir={ef.id != null && DIRECTIONAL_TRANSITIONS.has(ef.id) ? direction : 'left'} />
                </div>
                <span className={`text-[10.5px] ${active ? 'text-ink font-medium' : 'text-ink-3 group-hover:text-ink'}`}>{t(ef.name)}</span>
              </button>
            );
          })}
        </div>
        {directional && (
          <section className="flex flex-col gap-1.5 text-[11.5px]">
            <span className="text-ink font-medium">{t('方向')}</span>
            <div className="flex gap-1.5">
              {DIRS.map(({ id, icon: Icon, name }) => (
                <button
                  key={id}
                  type="button"
                  title={t(name)}
                  aria-label={t('方向:{name}', { name: t(name) })}
                  onClick={() => onPick(effect, id)}
                  className={`border-line flex h-8 w-10 items-center justify-center rounded-md border transition ${
                    direction === id ? 'bg-accent/15 border-accent text-ink' : 'text-ink-3 hover:text-ink hover:bg-panel-2'
                  }`}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
