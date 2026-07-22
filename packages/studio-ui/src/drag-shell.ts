/**
 * Stage drag shell — the shared skeleton for all "press and drag" interactions (block box move/edge/scale/
 * rotate, caption main-line/translation-line handles… always use it for new types, don't hand-roll again).
 * It uniformly handles four things:
 *
 *  1. Pointer capture: setPointerCapture (keeps receiving move/up even outside the window / over an iframe;
 *     old engines without it fall back to buttons), with move/up/cancel all bound on window.
 *  2. rAF frame coalescing: at most one onFrame per frame (per-event drag callbacks are a proven source of jank).
 *  3. buttons==0 fallback: if pointerup is missed (popup/blur), wrap up immediately instead of tracking bare moves.
 *  4. Teardown order: onEnd is always called, and always after the last onFrame (the final frame isn't dropped).
 *
 * Semantics belong to the caller: compute deltas in onFrame and apply to the live channel / local ghost,
 * commit state in onEnd. **Visuals** like the shield/ghost are component-level state, toggled by the caller
 * in onStart/onEnd — the shell only manages the pointer lifecycle, not what gets drawn.
 */

export interface DragShellOpts {
  /** Start-of-gesture side effects (open shield/ghost, emit phase:start…). */
  onStart?: () => void;
  /** Once per frame (rAF-coalesced): dx/dy = **screen px** delta from the start point; ev = the latest
   *  pointer event (get shiftKey/absolute coords from here). Normalization/conversion is the caller's job (bases differ). */
  onFrame: (dx: number, dy: number, ev: PointerEvent) => void;
  /** Release/cancel teardown (commit state, close shield, emit phase:end…). */
  onEnd: () => void;
}

export function startPointerDrag(e: React.PointerEvent, opts: DragShellOpts): void {
  e.preventDefault();
  e.stopPropagation();
  try {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  } catch {
    /* Old engines lack capture: fall back to buttons */
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
