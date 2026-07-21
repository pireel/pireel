/**
 * 舞台拖动壳 —— 所有"按住拖"交互的公共骨架(块框移动/改边/缩放/旋转、字幕主行/译文行
 * 手柄……新类型一律用它,别再手写)。统一承担四件事:
 *
 *  1. 指针捕获:setPointerCapture(出窗口/滑过 iframe 也持续收 move/up;老内核没有
 *     就靠 buttons 兜底),move/up/cancel 全挂 window。
 *  2. rAF 合帧:每帧最多一次 onFrame(拖动逐事件回调是持续卡顿的来源,踩过)。
 *  3. buttons==0 兜底:错过 pointerup(弹窗/失焦)立即收尾,不跟裸移动。
 *  4. 收尾时序:onEnd 必调、且必在最后一次 onFrame 之后(最后一帧不丢)。
 *
 * 语义归调用方:onFrame 里算增量落 live 通道/本地 ghost,onEnd 里提交状态。
 * 护盾(shield)/ghost 这类**视觉**是组件级 state,由调用方在 onStart/onEnd 里开关
 * ——壳只管指针生命周期,不管画什么。
 */

export interface DragShellOpts {
  /** 起手副作用(开护盾/ghost、发 phase:start……)。 */
  onStart?: () => void;
  /** 每帧一次(rAF 合帧):dx/dy = 相对起点的**屏幕 px** 增量;ev = 最新指针事件
   *  (要 shiftKey/绝对坐标的从这拿)。归一化/换算归调用方(各家基底不同)。 */
  onFrame: (dx: number, dy: number, ev: PointerEvent) => void;
  /** 松手/取消收尾(提交状态、关护盾、发 phase:end……)。 */
  onEnd: () => void;
}

export function startPointerDrag(e: React.PointerEvent, opts: DragShellOpts): void {
  e.preventDefault();
  e.stopPropagation();
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    /* 老内核没有 capture:靠 buttons 兜底 */
  }
  opts.onStart?.();
  const sx = e.clientX;
  const sy = e.clientY;
  let raf = 0;
  let last: PointerEvent | null = null;
  const flush = () => {
    raf = 0;
    if (last) opts.onFrame(last.clientX - sx, last.clientY - sy, last);
  };
  const mv = (ev: PointerEvent) => {
    if (ev.buttons === 0) {
      up();
      return;
    }
    last = ev;
    if (!raf) raf = requestAnimationFrame(flush);
  };
  const up = () => {
    if (raf) cancelAnimationFrame(raf);
    flush();
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    opts.onEnd();
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
