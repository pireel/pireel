# @pireel/studio-kit

**Typed motion-graphics components for video overlays. JSON in, animated HTML out.**

LLMs are excellent at deciding *what* to show — and unreliable at pushing pixels. Ask a model for free-form HTML and you get a different design every time; most of them are mediocre. This package flips the contract: the model fills a **typed, bounded props schema**, and hand-designed components own every visual decision — type scale, layout, spacing, colour, and motion. The model chooses among good options instead of authoring pixels.

- **Zero dependencies.** Pure functions from `(component, props, context)` to `{ html, timeline }`. No DOM, no framework.
- **LLM-native.** Every component ships a JSON Schema (draft 2020-12) ready for structured output / tool calls. Parsing **never throws**: unknown keys drop, numbers clamp, missing fields fall back to designed defaults. Malformed model output degrades — it doesn't break.
- **Designed defaults.** `{ value: "47%" }` alone renders a finished-looking block.
- **Deterministic motion.** Hand-tuned GSAP choreography (staged entrances, count-ups, sweeps) that seeks exactly — frame-stable for video export.
- **Safe by construction.** All text props are HTML-escaped at render; output never contains `<script>`.

## Quick start

```ts
import { render, components } from '@pireel/studio-kit';

const { html, timeline } = render(
  'metric',
  'blk1', // unique block id — all CSS is scoped under it
  { value: '47%', label: 'conversion lift', trend: 'up', variant: 'hero-number' },
  { box: { w: 900, h: 620 }, canvas: { w: 1080, h: 1920 }, lang: 'en' },
);
```

`html` is markup plus one `<style>` block, fully scoped under `#blk1`. `timeline` is GSAP statements against a paused timeline named `tl` in local time — create it, run the statements, and seek/play:

```ts
container.innerHTML = html;
const tl = gsap.timeline({ paused: true });
new Function('tl', timeline)(tl);
tl.play(); // or tl.seek(t) for frame-exact export
```

GSAP is a host expectation, not a dependency — the kit only emits code strings.

## Wiring an LLM

Hand the schema to your model as a tool / structured output, then pass whatever comes back straight to `render`:

```ts
const tool = {
  name: 'add_metric',
  description: components.metric.summary,
  input_schema: components.metric.jsonSchema,
};
// ...model returns args...
const out = render('metric', id, modelArgs, ctx); // no validation step needed
```

The runtime gate (`schema.parse`) is the same definition as the JSON Schema — one source, three artifacts (schema, TypeScript type, clamp/fill parser).

## Components

| id | what it says | variants |
| --- | --- | --- |
| `metric` | one headline number that matters | `hero-number` · `split-editorial` · `badge` |
| `kpi` | 2–4 numbers that belong together | `grid` · `row` |
| `comparison` | A vs B, with a stance | `columns` · `versus` |
| `chart` | real data, one accented series | `bars` · `columns` · `donut` |
| `steps` | an ordered sequence at presenter rhythm | `list` · `pipeline` · `timeline` |
| `callout` | a spoken punchline set as type | `poster` · `quote` · `stamp` |
| `lowerThird` | broadcast title + subtitle strip | `clean-bar` · `accent-underline` · `kicker` · `soft-pill` · `color-block` · `stack-bars` |
| `title` | opener / chapter / closer card | `hero` · `section` · `outro` |

Sizing is computed, not guessed: components derive every px from the box you give them (clamped type scale, CJK-aware metrics, fit-down for long values), so the same props re-render crisply at any size and orientation.

Every component also takes **surface props** — `surface` (`card`/`none`), `surfaceColor`, `border`, `borderColor`, `radius`. Background and outline belong to the component, not to a wrapper, so each one renders them in its own design language and flips its ink when the surface goes dark.

## Theming

Components consume CSS custom properties with designed fallbacks — set them on any ancestor to restyle everything at once:

```css
.my-video-canvas {
  --sk-fg: #f5f7fa;      /* ink */
  --sk-accent: #ffd644;  /* the one emphasis colour */
  --sk-panel: #101319;   /* card surface */
  --sk-font-head: 'Bricolage Grotesque', sans-serif;
}
```

Full token surface: `--sk-fg` `--sk-muted` `--sk-accent` `--sk-accent-2` `--sk-panel` `--sk-panel-2` `--sk-line` `--sk-radius` `--sk-shadow` `--sk-font-head` `--sk-font-num`.

## Blueprints and themes

A component's built-in variants are code, so only this package can add them. A **blueprint** is the same thing expressed as data — markup, bare-selector rules, and declared motion — so a theme can carry stagings of its own and a model can author one. Three guarantees make a blueprint safe to accept from a generator:

1. **Scoping is not optional.** Selectors are written bare; the renderer prefixes each with the block id. An unscoped selector cannot be expressed.
2. **No raw pixels.** Sizes come from the scale (`{{hero}}`, `{{pad}}`…), computed from the box the block actually occupies.
3. **No hand-written motion.** Steps name a preset and a target; the tuned easing stays in the library.

A **theme** bundles three things: a `palette` (the skin), a `voice` (what the theme is for and how it behaves, written for the model that fills components in), and its own `blueprints`. `themes/` ships three deliberately divergent examples — `press`, `slab`, `console`.

## Design principles

1. **Small output space.** Closed enums for layout and motion, bounded numbers, length-capped text. Most points in the space look good, because we designed all of them.
2. **The engine owns layout.** Models supply content and intent; the component computes sizes and arrangement from the box. A model cannot get sizing wrong because sizing isn't its job.
3. **Defaults are a finished design.** Underspecified props inherit a competent baseline, never a naked element.
4. **Compatibility is forever.** Props stored years ago must keep rendering: fields are only ever added, enum members are never removed.

## Development

From the workspace root:

```sh
pnpm test                                  # contract tests: scoping, determinism, escaping, size bounds
pnpm --filter @pireel/studio-kit demo      # static gallery of every component × variant × theme
```
