/**
 * Blueprints — component staging as DATA.
 *
 * A component's built-in variants are code, so only the library can add them. A blueprint is the
 * same thing expressed as markup + rules + declared motion, which means a theme can carry its own
 * stagings and a model can author one. The component still owns what matters for quality: which
 * props exist, how they are validated, the type scale, and the motion vocabulary. A blueprint
 * arranges those; it cannot invent a font size or hand-write a tween.
 *
 * Three guarantees make blueprints safe to accept from a generator:
 *
 *  1. SCOPING IS NOT OPTIONAL. Rules are written with bare class selectors and the renderer
 *     prefixes every one with the block id. An unscoped selector cannot be expressed.
 *  2. NO RAW PIXELS. Sizes come from the scale ({{hero}}, {{pad}}…), computed from the box the
 *     block actually occupies, so a blueprint adapts to any size — the failure mode of hand-written
 *     px that only looked right in the box it was drawn for.
 *  3. NO HAND-WRITTEN MOTION. Steps name a preset and a target; the tuned easing and staging stay
 *     in the library. A blueprint cannot produce uncanny motion because it cannot write motion.
 *
 * Template syntax, deliberately tiny:
 *   {{field}}        text, HTML-escaped
 *   {{?field}}…{{/}} render only when the field is non-empty
 *   {{#rows}}…{{/}}  repeat per row; inside, {{field}} reads the row's fields, {{i}} is the index
 */

import { esc } from './contract';
import type { TypeScale } from './sizing';

export interface MotionStep {
  /** Bare class selector of the element to animate ('.value'). */
  sel: string;
  /** A tuned entrance from the library's vocabulary. */
  preset: 'fadeUp' | 'staggerUp' | 'heroLand' | 'drawRule' | 'sweep' | 'countUp';
  /** Seconds into the block's entrance. */
  at: number;
  /** countUp only: the field holding the final value. */
  field?: string;
}

export interface Blueprint {
  /** Stable id — stored on the block, so a project keeps rendering after the theme gains variants. */
  id: string;
  /** Which component's props this stages. */
  component: string;
  /** Human label for pickers. */
  name: string;
  /** Markup using the template syntax. Bare class names only. */
  html: string;
  /** Rules with BARE selectors ('.value{…}'); the renderer scopes each to the block. */
  css: string;
  motion?: MotionStep[];
}

/** Values a blueprint may interpolate: the component's props plus the computed scale. */
export type BlueprintScope = Record<string, unknown>;

const asText = (v: unknown): string => (v === null || v === undefined ? '' : String(v));
const truthy = (v: unknown): boolean =>
  Array.isArray(v) ? v.length > 0 : v !== '' && v !== false && v !== null && v !== undefined;

/** Render the template body against a scope. Unknown fields resolve to '' rather than throwing —
 *  a blueprint referencing a prop the component doesn't have degrades to a gap, not a crash. */
function fill(tpl: string, scope: BlueprintScope, escape: (s: string) => string): string {
  // Sections first (they contain plain fields), innermost-last via a single pass with a stack
  const sectionRe = /\{\{([#?])(\w+)\}\}([\s\S]*?)\{\{\/\}\}/;
  let out = tpl;
  for (let guard = 0; guard < 50; guard++) {
    const m = sectionRe.exec(out);
    if (!m) break;
    const [whole, kind, field, body] = m as unknown as [string, string, string, string];
    const val = scope[field];
    let rendered = '';
    if (kind === '#') {
      const list = Array.isArray(val) ? val : [];
      rendered = list
        .map((row, i) => fill(body, { ...scope, ...(row as BlueprintScope), i, n: i + 1 }, escape))
        .join('');
    } else if (truthy(val)) {
      rendered = fill(body, scope, escape);
    }
    out = out.slice(0, m.index) + rendered + out.slice(m.index + whole.length);
  }
  return out.replace(/\{\{(\w+)\}\}/g, (_, k: string) => escape(asText(scope[k])));
}

/** CSS values are numbers, colours and keywords — never markup. Strip anything that could close a
 *  rule or open a new one, so an interpolated value cannot escape its declaration. */
const cssSafe = (s: string): string => s.replace(/[<>{}@;]/g, '').slice(0, 120);

/** Scope every rule to the block. Selectors are written bare, so this is the only place scoping is
 *  decided — a blueprint cannot leak styles into the rest of the document. */
function scopeCss(css: string, id: string): string {
  return css
    .split('}')
    .map((chunk) => {
      const [sel, body] = chunk.split('{');
      if (!sel || !body) return '';
      const scoped = sel
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => (s.startsWith('@') ? s : `#${id} ${s}`))
        .join(',');
      return scoped ? `${scoped}{${body}}` : '';
    })
    .join('\n');
}

/** Build the timeline body from declared steps — the presets carry the tuned easing. */
function motionBody(steps: MotionStep[], id: string, scope: BlueprintScope): string {
  const out: string[] = [];
  for (const st of steps) {
    const sel = `#${id} ${st.sel}`;
    const at = Math.max(0, Math.min(20, Number(st.at) || 0));
    switch (st.preset) {
      case 'fadeUp':
        out.push(`tl.from('${sel}',{autoAlpha:0,y:14,duration:0.34,ease:'power3.out'},${at});`);
        break;
      case 'staggerUp':
        out.push(`tl.from('${sel}',{autoAlpha:0,y:12,duration:0.28,ease:'power3.out',stagger:0.07},${at});`);
        break;
      case 'heroLand':
        out.push(`tl.from('${sel}',{autoAlpha:0,scale:0.86,duration:0.42,ease:'back.out(1.4)'},${at});`);
        break;
      case 'drawRule':
        out.push(`tl.from('${sel}',{scaleX:0,transformOrigin:'left center',duration:0.26,ease:'power2.inOut'},${at});`);
        break;
      case 'sweep':
        out.push(`tl.from('${sel}',{scaleX:0,transformOrigin:'left center',duration:0.3,ease:'power2.inOut'},${at});`);
        break;
      case 'countUp': {
        const final = asText(scope[st.field ?? 'value']);
        const m = final.match(/^([^0-9-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/);
        if (!m) {
          out.push(`tl.from('${sel}',{autoAlpha:0,duration:0.3},${at});`);
          break;
        }
        const [, prefix, numRaw, suffix] = m as unknown as [string, string, string, string];
        const target = Number(numRaw.replace(/,/g, ''));
        if (!Number.isFinite(target)) break;
        const dec = numRaw.includes('.') ? (numRaw.split('.')[1] ?? '').length : 0;
        const grouped = numRaw.includes(',');
        const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        out.push(
          `(function(){var o={v:0},el=document.querySelector('${sel}');` +
            `tl.to(o,{v:${target},duration:0.7,ease:'power3.out',onUpdate:function(){` +
            `var n=o.v.toFixed(${dec});` +
            (grouped ? `n=n.replace(/\\B(?=(\\d{3})+(?!\\d))/g,',');` : '') +
            `if(el)el.textContent='${q(prefix)}'+n+'${q(suffix)}';}},${at});})();`,
        );
        break;
      }
    }
  }
  return out.join('\n');
}

/** Render a blueprint into the same {html, timeline} shape a built-in variant produces. */
export function renderBlueprint(
  bp: Blueprint,
  id: string,
  props: BlueprintScope,
  s: TypeScale,
  surface: string,
): { html: string; timeline: string } {
  const scope: BlueprintScope = {
    ...props,
    hero: s.hero,
    head: s.head,
    label: props.label ?? s.label, // a prop named `label` wins; the scale step is `labelPx`
    labelPx: s.label,
    kickerPx: s.kicker,
    pad: s.pad,
    gap: s.gap,
    rule: s.rule,
  };
  const body = fill(bp.html, scope, esc);
  const css = scopeCss(fill(bp.css, scope, cssSafe), id);
  return {
    html: `${body}\n<style>\n#${id} .bp-root{position:absolute;inset:0;${surface}}\n${css}\n</style>`,
    timeline: motionBody(bp.motion ?? [], id, scope),
  };
}
