/**
 * Press — a broadsheet page. Serif headlines, hairline rules, wide margins, no cards. Authority
 * comes from restraint: nothing is boxed, nothing glows, the rule does the separating.
 */

import type { Theme } from '../theme';

export const press: Theme = {
  id: 'press',
  title: 'Press',
  palette: {
    fg: '#141210',
    muted: '#6b635a',
    accent: '#9c2a1e',
    accent2: '#2f4858',
    panel: '#faf7f2',
    panel2: '#efe9e0',
    line: '#141210',
    radius: '0px',
    shadow: 'none',
    fontHead: "'Noto Serif SC', 'Iowan Old Style', Georgia, serif",
    fontNum: "'Noto Serif SC', Georgia, serif",
  },
  voice: `A newspaper page: considered, evidential, unhurried. Copy reads as reporting, not as a
caption — state the fact and let it stand.
- Prefer surface "none": type sits on the footage, separated by rules, never by a box.
- One accent only, on the single most important figure or word. Never two.
- Labels are lowercase and quiet; the number or claim carries the weight.
- No exclamation, no hype adjectives ("huge", "insane"). If a number is remarkable, the number says so.`,
  blueprints: [
    {
      id: 'press-metric-column',
      component: 'metric',
      name: 'Column figure',
      html: `<div class="bp-root"><div class="col">
  {{?label}}<div class="dek">{{label}}</div>{{/}}
  <div class="rule"></div>
  <div class="fig">{{value}}</div>
  {{?note}}<div class="body">{{note}}</div>{{/}}
</div></div>`,
      css: `.col{position:absolute;left:{{pad}}px;right:{{pad}}px;top:50%;transform:translateY(-50%)}
.dek{font-size:{{kickerPx}}px;letter-spacing:.02em;font-style:italic;color:var(--sk-muted,#6b635a)}
.rule{height:1px;background:currentColor;opacity:.85;margin:{{gap}}px 0}
.fig{font-size:{{hero}}px;font-weight:700;line-height:.94;letter-spacing:-.02em}
.body{margin-top:{{gap}}px;font-size:{{labelPx}}px;line-height:1.35;max-width:76%;color:var(--sk-muted,#6b635a)}`,
      motion: [
        { sel: '.dek', preset: 'fadeUp', at: 0.05 },
        { sel: '.rule', preset: 'drawRule', at: 0.16 },
        { sel: '.fig', preset: 'countUp', at: 0.28, field: 'value' },
        { sel: '.body', preset: 'fadeUp', at: 0.55 },
      ],
    },
    {
      id: 'press-callout-standfirst',
      component: 'callout',
      name: 'Standfirst',
      html: `<div class="bp-root"><div class="col">
  <div class="quote">{{text}}</div>
  {{?support}}<div class="byline"><i class="tick"></i>{{support}}</div>{{/}}
</div></div>`,
      css: `.col{position:absolute;left:{{pad}}px;right:{{pad}}px;top:50%;transform:translateY(-50%)}
.quote{font-size:{{head}}px;font-weight:700;line-height:1.22;text-indent:-.4em}
.byline{display:flex;align-items:center;gap:{{gap}}px;margin-top:{{gap}}px;font-size:{{kickerPx}}px;letter-spacing:.18em;text-transform:uppercase;color:var(--sk-muted,#6b635a)}
.tick{display:block;width:{{pad}}px;height:1px;background:var(--sk-accent,#9c2a1e)}`,
      motion: [
        { sel: '.quote', preset: 'fadeUp', at: 0.06 },
        { sel: '.tick', preset: 'drawRule', at: 0.34 },
        { sel: '.byline', preset: 'fadeUp', at: 0.38 },
      ],
    },
  ],
};
