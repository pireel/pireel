/**
 * Slab — a protest poster. Type at full width, colour in blocks, nothing decorative. Loud on
 * purpose: the graphic is the loudest thing on screen for the seconds it is up.
 */

import type { Theme } from '../theme';

export const slab: Theme = {
  id: 'slab',
  title: 'Slab',
  palette: {
    fg: '#0d0d0f',
    muted: '#4b4b52',
    accent: '#ff3b1f',
    accent2: '#1f4fff',
    panel: '#f2ef27',
    panel2: '#0d0d0f',
    line: '#0d0d0f',
    radius: '0px',
    shadow: 'none',
    fontHead: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    fontNum: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  },
  voice: `A poster pasted on a wall: one idea, shouted, gone. The viewer reads it in under a second.
- Cut copy to the bone — three or four words beats a sentence. Drop articles if the meaning holds.
- Prefer surface "card" with a flat colour block and sharp corners; the block IS the design.
- Set claims in capitals when they are short enough to stay one line.
- One idea per graphic. If two facts compete, drop the weaker one rather than shrinking both.`,
  blueprints: [
    {
      id: 'slab-metric-block',
      component: 'metric',
      name: 'Colour block',
      html: `<div class="bp-root"><div class="stack">
  <div class="fig">{{value}}</div>
  {{?label}}<div class="tag">{{label}}</div>{{/}}
  {{?note}}<div class="sub">{{note}}</div>{{/}}
</div></div>`,
      css: `.stack{position:absolute;left:{{pad}}px;right:{{pad}}px;top:50%;transform:translateY(-50%)}
.fig{font-size:{{hero}}px;font-weight:900;line-height:.84;letter-spacing:-.045em}
.tag{display:inline-block;margin-top:{{gap}}px;padding:.14em .5em;background:var(--sk-accent,#ff3b1f);color:#fff;font-size:{{labelPx}}px;font-weight:800;text-transform:uppercase;letter-spacing:.04em}
.sub{margin-top:{{gap}}px;font-size:{{kickerPx}}px;font-weight:700;text-transform:uppercase;letter-spacing:.12em}`,
      motion: [
        { sel: '.fig', preset: 'heroLand', at: 0.04 },
        { sel: '.tag', preset: 'fadeUp', at: 0.3 },
        { sel: '.sub', preset: 'fadeUp', at: 0.42 },
      ],
    },
    {
      id: 'slab-callout-shout',
      component: 'callout',
      name: 'Shout',
      html: `<div class="bp-root"><div class="stack">
  <div class="line">{{text}}</div>
  {{?support}}<div class="foot">{{support}}</div>{{/}}
</div></div>`,
      css: `.stack{position:absolute;left:{{pad}}px;right:{{pad}}px;top:50%;transform:translateY(-50%)}
.line{font-size:{{head}}px;font-weight:900;line-height:.94;text-transform:uppercase;letter-spacing:-.02em}
.foot{margin-top:{{gap}}px;display:inline-block;border-top:{{rule}}px solid var(--sk-accent,#ff3b1f);padding-top:.3em;font-size:{{kickerPx}}px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}`,
      motion: [
        { sel: '.line', preset: 'heroLand', at: 0.05 },
        { sel: '.foot', preset: 'fadeUp', at: 0.4 },
      ],
    },
  ],
};
