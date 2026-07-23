---
id: particle-dust
title: 星尘 Particle
summary: 深空星尘:粒子散点、星座连线、光晕聚拢,适合科普/宇宙/沉浸叙事
icon: ✨
showcase: [title-card, big-number, count-up, quote, trend, timeline, list, cta]
palette: { paper: "#0A0E1A", panel: "#111730", panel-2: "#0D1224", fg: "#EAF0FF", muted: "#EAF0FF99", accent: "#7C9CFF", accent-2: "#FFD9A0", line: "#EAF0FF1F", grid: "#EAF0FF0A", radius: "20px", shadow: "0 20px 60px rgb(0 0 0 / 0.6)", glow: "0 0 44px rgb(124 156 255 / 0.5)" }
version: 0.1.2
---

# Particle — deep-space dust that gathers into meaning

The design language is a DEEP FIELD: near-black indigo space, a scattered dust of tiny glowing particles, a few of them joined by hairline constellation lines, and a soft nebula halo breathing behind the hero text. There are NO panels, NO cards, NO borders framing content — text floats directly in space, and structure is implied by where the dust gathers. Every card tells the same story: chaos converges into a single luminous statement.

By default blocks are POCKETS OF VOID drifting over the footage: the block root stays transparent, and each piece — a luminous title line, a corner constellation figure, a short caption — gathers on its own soft-edged wash of near-black void (a dim halo, never a bordered card) so its dust can glow, small enough to leave the speaker in the light. THE WHOLE DEEP FIELD — root carrying the near-black `background:var(--paper)` edge to edge — opens only when a full-screen designed scene is explicitly requested; only then is the void the canvas.

## Token semantics
- `--paper` is deep space (#0A0E1A) — the void. Never lighten it with large fills; emptiness IS the composition.
- `--fg` is starlight ivory-blue for all reading text. `--muted` for captions and attributions.
- `--accent` (nebula blue) owns the glow: hero halos, the brightest particles, big numerals, constellation strokes. Text sitting in the halo carries `text-shadow: var(--glow)`.
- `--accent-2` (warm star gold) is the RARE second voice: 2-4 warm particles per card and the single emphasized word inside a quote. Never use it for body text or large fills.
- `--line` only ever appears as constellation strokes inside inline SVG — never as box borders.
- `--panel` / `--panel-2` are reserved for particle bodies at low opacity, not for surfaces.

## Typography
- Headlines in `var(--font-head)`, weight 800-900, 140-170px, tight tracking (-0.01em), always with `text-shadow: var(--glow)`.
- Giant numerals in `var(--font-num)`, weight 700-800, 300-400px, accent-colored, glowing.
- Kickers are small spaced Latin caps 32-36px, `letter-spacing: 0.3-0.4em`, in accent.
- Captions and attributions 32-40px muted; nothing below 28px.

## Structural motifs (reuse verbatim)
- Dust field: 14 absolutely-positioned dots, 2-8px, `border-radius:999px`, colors cycling accent / accent-2 / fg at opacities 0.3-0.95:
  `#id .d{position:absolute;border-radius:999px;} #id .d0{left:150px;top:170px;width:7px;height:7px;background:var(--accent);opacity:0.9;}`
- Nebula halo: one huge blurred accent circle behind the hero, never crisp:
  `#id .halo{position:absolute;width:900px;height:900px;border-radius:999px;background:var(--accent);filter:blur(80px);opacity:0.25;}`
- Constellation: inline SVG, thin polyline joining 3-5 nodes, drawn via dash offset:
  `<polyline points="…" fill="none" stroke="var(--accent)" stroke-width="3" opacity="0.55" stroke-dasharray="900" stroke-dashoffset="900"/>` plus 6-10px node circles filled `var(--fg)`.
- Glow text: `text-shadow: var(--glow);` on the one hero element per card, never on captions.
- SIGNATURE MOTION — convergence: every particle flies IN from its own explicit `{x,y}` offset (e.g. `tl.from('#id .d3',{x:120,y:-140,autoAlpha:0,duration:0.7,ease:'power2.out'},0.09)`), landing softly with a slight stagger; the composition assembles like dust settling into a constellation. Write literal offsets per particle — no randomness at runtime.

## Block recipes
- title-card: halo bottom-left of center → spaced caps kicker (`DEEP FIELD · EP.01`) → 155px glowing headline → one muted sub-line → dust converges around the text → a small constellation draws itself in the upper-right void. Order: halo fades 0.5s, particles converge, headline rises 40px, constellation draws last.
- big-number: the numeral is the star — ~360px mono accent numeral with glow, centered on the halo; a spaced caps kicker above, a muted Chinese label + Latin caps below; particles converge toward the numeral as if pulled by gravity; nothing else on the card.
- count-up: the same gravity told in time — a muted caps kicker, then a ~340px mono accent numeral that ROLLS from 0 to its final value via innerText tween (`tl.from('#id .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15)`) while the dust converges inward as if feeding the count; the HTML carries the FINAL pure number, units (光年 etc.) live in an `--accent-2` sibling that pops in only AFTER the roll settles; one poetic muted line below. Glow stays on the numeral the whole ride.
- quote: a 2-line quote (100-120px, weight 700, fg) floating high-left among the dust; the key word set in `--accent-2`; ONE constellation polyline underlines that word, drawing left→right with node circles popping after; attribution `— 出处` muted 34px. The quote fades in place; only the dust and the line move.
- trend: a constellation that IS the chart — kicker + 120px glowing headline top-left, then one big rising polyline (left-low → right-high) drawn via dash offset with `--fg` node circles popping along it; the final node is a 4-point `--accent-2` star (`drop-shadow` gold flare) that scales in as the payoff, its value (`+327%`, mono accent-2) floating beside; halo sits under the climb's end. No axes, no grid — the void is the plot area.
- timeline: a light-trail — kicker + 120px glowing headline top-left, then ONE thin horizontal accent stroke (inline SVG, dash-drawn left→right) crossing the lower half of the void; 3-4 small `--fg` node dots pop along it in sequence, each with a mono year + 32px muted stage label beneath; the CURRENT node is larger, solid accent with `--glow` box-shadow, its year glowing accent and its label in bold `--fg` — the brightest point on the line lights LAST. Past stays dim, now burns. No boxes, no axis, no arrows.
- list: a star catalogue — kicker caps, then three floating rows led by 4-point star markers of VARYING size and voice (accent / accent-2 / fg at falling opacity), 62px fg text, separated by hairline `--line` SVG strokes that draw left→right like constellation lines; particles keep drifting behind, halo low-left. No bullets, no boxes.
- cta: one glowing orb-button — a 460px `--accent` circle (`--glow` shadow, `--paper` `＋ 关注` at 88px) centered on the halo; besides the ambient dust field, six extra bright particles fly INTO the orb from all edges and extinguish on contact (write literal to-offsets per particle, `power2.in`); one muted schedule line at the bottom. Gravity is the CTA.

## Compose-instruction crib
Embed directives like:
"星尘深空风:近黑靛蓝底,不用任何卡片/边框/面板,文字直接悬浮在太空里;标题带 text-shadow 光晕,主角元素背后垫一个 blur(80px)、opacity 0.25 的巨大 accent 光斑;14 颗 2-8px 圆点粒子(蓝/暖金/星白,透明度错落)绝对定位散布,动效必须是粒子从各自方向汇聚落位(逐粒写死 x/y 偏移 + stagger);细线星座连线用内联 SVG stroke-dasharray 自绘,节点小圆后弹出;金句的关键词用暖金色,下面用一根星座线划线;拉丁小字 caps 字距 0.3em+;全程 power2 缓动,1.2s 内落定。"

## Cadence
- One luminous statement per card. The void does the framing; particles do the motion; the halo does the mood. Numbers glow blue, the rare emphasis glows warm gold. Everything converges — nothing bounces, nothing slides in from off-screen as a block. If a card feels empty, it is correct.
