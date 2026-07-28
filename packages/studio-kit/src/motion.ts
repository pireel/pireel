/**
 * Hand-tuned motion vocabulary. Components choreograph entrances from these
 * primitives instead of authoring GSAP ad hoc — the timing, easing and staging
 * that make motion feel designed live here, once.
 *
 * Grammar (the staged entrance): surface in → frame/rules draw → structure
 * staggers in → the hero lands LAST and hits hardest. Everything settles within
 * ~1.2s and then holds still; emphasis after settle is the host's business.
 *
 * All generators return statements against the paused local timeline `tl` and are
 * deterministic — seeking is exact, exports are frame-stable.
 */

export const EASE = {
  out: 'power3.out',
  inOut: 'power2.inOut',
  /** The landing ease — a restrained overshoot that reads as confidence, not bounce. */
  land: 'back.out(1.4)',
} as const;

/** Fade-rise: the workhorse entrance for surfaces and text rows. */
export function fadeUp(sel: string, at: number, opts: { y?: number; dur?: number } = {}): string {
  const { y = 14, dur = 0.3 } = opts;
  return `tl.from('${sel}',{autoAlpha:0,y:${y},duration:${dur},ease:'${EASE.out}'},${at});`;
}

/** A rule/underline draws from its origin edge. */
export function drawRule(sel: string, at: number, opts: { dur?: number; origin?: 'left' | 'center' } = {}): string {
  const { dur = 0.24, origin = 'left' } = opts;
  return `tl.from('${sel}',{scaleX:0,transformOrigin:'${origin} center',duration:${dur},ease:'${EASE.inOut}'},${at});`;
}

/** Structure rows/cells stagger in. */
export function staggerUp(sel: string, at: number, opts: { each?: number; y?: number; dur?: number } = {}): string {
  const { each = 0.07, y = 12, dur = 0.26 } = opts;
  return `tl.from('${sel}',{autoAlpha:0,y:${y},duration:${dur},ease:'${EASE.out}',stagger:${each}},${at});`;
}

/** The hero lands: scale-settle with the landing ease. Reserve for ONE element. */
export function heroLand(sel: string, at: number, opts: { dur?: number; from?: number } = {}): string {
  const { dur = 0.42, from = 0.86 } = opts;
  return `tl.from('${sel}',{autoAlpha:0,scale:${from},duration:${dur},ease:'${EASE.land}'},${at});`;
}

/**
 * Deterministic count-up: tweens a plain object and writes textContent on update,
 * so seeking any time yields the exact frame. Non-numeric text lands with heroLand
 * instead (the caller decides; see metric).
 *
 * Splits `final` as prefix + number + suffix ("¥1,284/mo" → "¥" 1284 "/mo");
 * thousands separators in the source are reapplied to the tweened value.
 */
export function countUp(sel: string, final: string, at: number, dur = 0.7): string | null {
  const m = final.match(/^([^0-9-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const [, prefix, numRaw, suffix] = m as unknown as [string, string, string, string];
  const grouped = numRaw.includes(',');
  const target = Number(numRaw.replace(/,/g, ''));
  if (!Number.isFinite(target)) return null;
  const decimals = numRaw.includes('.') ? (numRaw.split('.')[1] ?? '').length : 0;
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return (
    `(function(){var o={v:0},el=document.querySelector('${sel}');` +
    `tl.to(o,{v:${target},duration:${dur},ease:'${EASE.out}',onUpdate:function(){` +
    `var n=o.v.toFixed(${decimals});` +
    (grouped ? `n=n.replace(/\\B(?=(\\d{3})+(?!\\d))/g,',');` : '') +
    `if(el)el.textContent='${esc(prefix)}'+n+'${esc(suffix)}';}},${at});})();`
  );
}

/** Accent sweep under/behind a keyword. */
export function sweep(sel: string, at: number, dur = 0.3): string {
  return `tl.from('${sel}',{scaleX:0,transformOrigin:'left center',duration:${dur},ease:'${EASE.inOut}'},${at});`;
}
