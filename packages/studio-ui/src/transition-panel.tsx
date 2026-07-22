'use client';

/**
 * Transition panel (opened from a timeline cut hotspot/zone, hosted in the shared popover): the effect
 * set = ten picks from the gl-transitions gallery, sharing the exact shader source with preview/export
 * (GL_MIXER_SRC in transition-gl.ts). Each card is a canvas running the real shader over two **real
 * photos** — static freeze at the midpoint, looping start-to-end on hover (matching the
 * gl-transitions.com/gallery interaction). All cards share one WebGL mixer (canvas contexts are capped;
 * one per card would get reclaimed by the browser), then blit into each card's 2d canvas.
 * Push/wipe carry a direction. Duration is dragged symmetrically on the handles at both sides of the
 * timeline zone (≤4s); the panel doesn't manage duration.
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

/** Preview resource singleton: two real photos cover-fit into CW×CH plates + a shared GL mixer. */
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

/** A single effect card: real shader render, static freeze at the midpoint; on hover, loops p 0→1 (1.2s + a short hold). */
function EffectCard({ effect, dir }: { effect: CutTransitionEffect | null; dir: TransitionDirection }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef(0);
  const hoverRef = useRef(false);
  const paint = async (p: number) => {
    const g = ref.current?.getContext('2d');
    if (!g) return;
    const { mixer, plateA, plateB } = await res();
    if (effect == null) {
      g.drawImage(p < 0.5 ? plateA : plateB, 0, 0); // none = hard cut
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
      void paint(Math.min(1, ((now - t0) % 1600) / 1200)); // 1.2s to play + 0.4s hold
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
  /** Current transition effect at this cut (null = unset). */
  effect: CutTransitionEffect | null;
  /** Current direction (push/wipe only; defaults to left). */
  direction: TransitionDirection;
  /** Clicking a card/direction applies immediately; effect null = remove. */
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
