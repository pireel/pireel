/**
 * Static demo gallery: every component × variant, three themes, live GSAP entrances.
 * Build: `pnpm demo` → demo/dist/index.html (self-contained apart from the GSAP CDN tag).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { components, render } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));

const THEMES = {
  paper: '',
  midnight: `--sk-fg:#f2f5fa;--sk-muted:#93a0b4;--sk-accent:#ffd644;--sk-accent-2:#ff6b8a;--sk-panel:#131720;--sk-panel-2:#1d2330;--sk-line:#2a3242;--sk-shadow:0 12px 40px rgb(0 0 0 / 0.5);`,
  editorial: `--sk-fg:#1a1712;--sk-muted:#7a715f;--sk-accent:#c8442c;--sk-accent-2:#3a6b5c;--sk-panel:#faf6ee;--sk-panel-2:#efe8da;--sk-line:#d9d0bd;--sk-radius:6px;`,
};

const SAMPLES = {
  metric: [
    { value: '47%', label: 'conversion lift', note: 'vs. last quarter', trend: 'up' },
    { variant: 'split-editorial', value: '¥1,284', label: 'cost per order', note: 'after the pricing change', trend: 'down' },
    { variant: 'badge', value: '3.2x', label: 'faster renders', motion: 'land' },
  ],
  lowerThird: [
    { title: 'Lena Okafor', subtitle: 'Principal Engineer' },
    { variant: 'kicker', title: 'The 4-day week', kicker: 'DEEP DIVE' },
    { variant: 'soft-pill', title: '@pireel', subtitle: 'follow for part 2' },
    { variant: 'stack-bars', title: 'Q3 Results', subtitle: 'revenue up 47%' },
  ],
  kpi: [
    { cells: [ { label: 'revenue', value: '¥2.4M', trend: 'up' }, { label: 'orders', value: '18,392' }, { label: 'refund rate', value: '0.8%', trend: 'down' } ] },
    { variant: 'row', cells: [ { label: 'before', value: '3.1s' }, { label: 'after', value: '0.4s', trend: 'up' } ] },
  ],
  comparison: [
    { aLabel: 'Build', aValue: '6 wks', bLabel: 'Buy', bValue: '2 days', winner: 'b', note: 'time to first user' },
    { variant: 'versus', aLabel: 'monolith', aValue: '99.2%', bLabel: 'microservices', bValue: '97.1%', winner: 'a' },
  ],
  chart: [
    { title: 'Where the time goes', unit: '%', series: [ { label: 'meetings', value: 42 }, { label: 'code', value: 31 }, { label: 'review', value: 17 }, { label: 'other', value: 10 } ] },
    { variant: 'columns', title: 'Weekly actives', unit: 'k', series: [ { label: 'Mon', value: 12 }, { label: 'Wed', value: 21 }, { label: 'Fri', value: 34 } ] },
    { variant: 'donut', series: [ { label: 'organic', value: 58 }, { label: 'paid', value: 27 }, { label: 'referral', value: 15 } ] },
  ],
  steps: [
    { items: [ { text: 'Record the take' }, { text: 'Cut by transcript', note: 'silence & retakes drop' }, { text: 'Ship it' } ] },
    { variant: 'pipeline', items: [ { text: 'Script' }, { text: 'Shoot' }, { text: 'Edit' }, { text: 'Publish' } ] },
  ],
  title: [
    { title: 'Ship the boring version', sub: '@pireel' },
    { variant: 'section', index: '02', title: 'The pricing trap' },
    { variant: 'outro', title: 'Follow for part 2', sub: 'SUBSCRIBE' },
  ],
  callout: [
    { text: 'Ship the boring version first', support: 'then let usage argue' },
    { variant: 'quote', text: 'Most points in a small space look good', support: 'design principle 01' },
    { variant: 'stamp', text: 'VERIFIED', support: 'reproduced on three machines' },
  ],
};

const cards = [];
let n = 0;
for (const [cid, samples] of Object.entries(SAMPLES)) {
  for (const props of samples) {
    for (const [theme, vars] of Object.entries(THEMES)) {
      const id = `d${n++}`;
      const { html, timeline } = render(cid, id, props, { box: { w: 640, h: 420 }, canvas: { w: 1080, h: 1920 }, lang: 'en', durationSec: 6 });
      cards.push(`
<figure>
  <div class="frame"><div class="stage" style="${vars}">
    <div class="blk" id="${id}">${html}</div>
  </div></div>
  <figcaption><b>${cid}</b> · ${props.variant ?? components[cid as keyof typeof components].defaults.variant} · ${theme}</figcaption>
  <script type="sk-timeline" data-for="${id}">${timeline.replace(/<\/script/gi, '<\\/script')}</script>
</figure>`);
    }
  }
}

const page = `<!doctype html>
<meta charset="utf-8">
<title>Studio Kit gallery</title>
<style>
  body{margin:0;padding:48px;background:#e8eaef;font-family:ui-sans-serif,system-ui;color:#333}
  h1{font-size:22px;margin:0 0 6px} p{margin:0 0 28px;color:#667}
  main{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:24px}
  figure{margin:0}
  .frame{position:relative;aspect-ratio:640/420;overflow:hidden;border-radius:10px}
  .stage{position:absolute;top:0;left:0;width:640px;height:420px;transform-origin:top left;background:
    linear-gradient(45deg,#cfd4dd 25%,transparent 25%,transparent 75%,#cfd4dd 75%),
    linear-gradient(45deg,#cfd4dd 25%,#c0c6d1 25%,#c0c6d1 75%,#cfd4dd 75%);
    background-size:28px 28px;background-position:0 0,14px 14px}
  .blk{position:absolute;inset:0}
  figcaption{font-size:12px;color:#556;padding:8px 2px}
</style>
<h1>Studio Kit</h1>
<p>Every card below is <code>render(component, props, ctx)</code> output playing its own timeline. Click a card to replay.</p>
<main>${cards.join('\n')}</main>
<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>
<script>
  for (const s of document.querySelectorAll('script[type="sk-timeline"]')) {
    const play = () => {
      const tl = gsap.timeline({ paused: true });
      new Function('tl', s.textContent)(tl);
      tl.play(0);
    };
    play();
    document.getElementById(s.dataset.for).closest('.frame').addEventListener('click', play);
  }
  const fit = () => {
    for (const f of document.querySelectorAll('.frame'))
      f.querySelector('.stage').style.transform = 'scale(' + f.clientWidth / 640 + ')';
  };
  fit();
  addEventListener('resize', fit);
</script>`;

mkdirSync(join(here, 'dist'), { recursive: true });
writeFileSync(join(here, 'dist', 'index.html'), page);
console.log('demo/dist/index.html written —', cards.length, 'cards');
