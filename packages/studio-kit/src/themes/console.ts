/**
 * Console — a readout. Monospace, hairline frame, corner ticks, everything aligned to a grid.
 * Reads as instrumentation: precise, live, unembellished.
 */

import type { Theme } from '../theme';

export const consoleTheme: Theme = {
  id: 'console',
  title: 'Console',
  palette: {
    fg: '#d8e2dc',
    muted: '#7d8c86',
    accent: '#4ade80',
    accent2: '#f4a261',
    panel: '#0f1412e6',
    panel2: '#182220',
    line: '#2c3a36',
    radius: '2px',
    shadow: 'none',
    fontHead: "'IBM Plex Mono', 'SF Mono', ui-monospace, monospace",
    fontNum: "'IBM Plex Mono', 'SF Mono', ui-monospace, monospace",
  },
  voice: `A telemetry readout: measured, exact, faintly clinical. It reports rather than persuades.
- Label everything. A bare number without its field name is noise here.
- Keep labels short and machine-like — lowercase or SCREAMING, no sentence case, no articles.
- Prefer surface "card" over dark translucent panel with sharp corners; the frame is part of it.
- Never round a figure that was stated precisely. Precision is the aesthetic.`,
  blueprints: [
    {
      id: 'console-metric-readout',
      component: 'metric',
      name: 'Readout',
      html: `<div class="bp-root"><i class="tick tl"></i><i class="tick br"></i><div class="grid">
  {{?label}}<div class="key">{{label}}</div>{{/}}
  <div class="val">{{value}}</div>
  {{?note}}<div class="meta">// {{note}}</div>{{/}}
</div></div>`,
      css: `.grid{position:absolute;left:{{pad}}px;right:{{pad}}px;top:50%;transform:translateY(-50%)}
.key{font-size:{{kickerPx}}px;letter-spacing:.22em;text-transform:uppercase;color:var(--sk-accent,#4ade80)}
.val{font-size:{{hero}}px;font-weight:600;line-height:1;letter-spacing:-.01em;margin-top:.12em}
.meta{margin-top:{{gap}}px;font-size:{{kickerPx}}px;color:var(--sk-muted,#7d8c86)}
.tick{position:absolute;width:{{gap}}px;height:{{gap}}px;border:{{rule}}px solid var(--sk-accent,#4ade80);opacity:.75}
.tl{left:{{gap}}px;top:{{gap}}px;border-right:0;border-bottom:0}
.br{right:{{gap}}px;bottom:{{gap}}px;border-left:0;border-top:0}`,
      motion: [
        { sel: '.tick', preset: 'fadeUp', at: 0.04 },
        { sel: '.key', preset: 'fadeUp', at: 0.12 },
        { sel: '.val', preset: 'countUp', at: 0.22, field: 'value' },
        { sel: '.meta', preset: 'fadeUp', at: 0.5 },
      ],
    },
    {
      id: 'console-kpi-channels',
      component: 'kpi',
      name: 'Channels',
      html: `<div class="bp-root"><div class="rows">{{#cells}}<div class="ch">
  <span class="k">{{label}}</span><span class="dots"></span><span class="v">{{value}}</span>
</div>{{/}}</div></div>`,
      css: `.rows{position:absolute;left:{{pad}}px;right:{{pad}}px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:{{gap}}px}
.ch{display:flex;align-items:baseline;gap:.6em;font-size:{{labelPx}}px}
.k{text-transform:uppercase;letter-spacing:.14em;color:var(--sk-muted,#7d8c86);white-space:nowrap}
.dots{flex:1;border-bottom:1px dotted var(--sk-line,#2c3a36);transform:translateY(-.2em)}
.v{font-weight:600;color:var(--sk-accent,#4ade80);white-space:nowrap}`,
      motion: [{ sel: '.ch', preset: 'staggerUp', at: 0.08 }],
    },
  ],
};
