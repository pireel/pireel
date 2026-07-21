---
id: glass-tech
title: 玻璃 Glass
summary: 深底光斑上的毛玻璃层:冰蓝高光、悬浮卡,适合产品/AI/数码测评
icon: 🧊
showcase: [标题卡, 大数字, 数字变化, 图表, 代码, 金句, 步骤, 章节, 引导]
palette: { paper: "#0E1420", panel: "#FFFFFF14", panel-2: "#FFFFFF0A", fg: "#F0F6FF", muted: "#F0F6FF99", accent: "#4DD6FF", accent-2: "#9D7BFF", line: "#FFFFFF2E", grid: "#FFFFFF0A", radius: "28px", shadow: "0 24px 60px rgb(0 0 0 / 0.5)", glow: "0 0 40px rgb(77 214 255 / 0.4)" }
version: 0.1.2
---

# Glass — frosted layers floating over light

The design language is FROSTED GLASS OVER COLORED LIGHT: a deep slate backdrop lit by two huge blurred color orbs (ice blue and violet), with translucent glass slabs floating ON TOP at staggered depths. The orbs always come first — they are the light source; the glass exists to catch that light. Cards overlap deliberately, sit off-axis, and stack like panes on a desk — never a single centered card, never symmetric.

By default blocks are FLOATING PANES over the footage: the block root stays transparent, and each piece — a title pane, a corner stat chip, a side glass card — carries its own frosted `--panel` fill, `--line` edge and inner light so the glass reads against the video, at card scale that leaves the speaker in view. THE WHOLE LIT ROOM — root carrying `background:var(--paper)` full-bleed with its two color orbs — is lit only when a full-screen designed scene is explicitly requested.

## Token semantics
- `--paper` is the dark slate room. It only shows around the orbs' falloff.
- The two orbs are pure `--accent` (ice blue) and `--accent-2` (violet) circles at `filter: blur(90px); opacity: 0.5` — the ONLY large color fields allowed. Blue orb upper-left, violet orb lower-right (or swapped), always bleeding off-canvas.
- `--panel` (white @ 8%) is the glass body; `--panel-2` for chips and secondary panes.
- `--line` is the glass edge; the TOP edge is brighter (`border-top-color: var(--muted)`) to read as a lit rim.
- `--accent` also owns data: the leading bar, the hero numeral, chip dots — solid, glowing via `--glow`. Text set on solid accent uses `var(--paper)`.
- `--muted` for labels; `--radius` (28px) on every pane, no exceptions.

## Typography
- Headlines `var(--font-head)` 800-900, 120-140px, tight tracking, plain `--fg`.
- Data readouts `var(--font-num)` 300-360px for hero numerals (accent + `text-shadow: var(--glow)`), 36-48px for bar values.
- Chip labels 32px muted with a 14px accent dot; kickers Latin caps 30-34px, 0.25em tracking.

## Structural motifs (reuse verbatim)
- Orb pair (always first in DOM, behind everything):
  `#id .orb{position:absolute;border-radius:999px;filter:blur(90px);opacity:0.5;}`
  `#id .o1{width:820px;height:820px;left:-180px;top:-240px;background:var(--accent);}`
  `#id .o2{width:720px;height:720px;right:-160px;bottom:-280px;background:var(--accent-2);}`
- Glass pane: `background:var(--panel);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);border:1px solid var(--line);border-top-color:var(--muted);border-radius:var(--radius);box-shadow:var(--shadow);`
- Layered float: one MAIN pane anchored off-center + one SMALL pane overlapping a corner of it at higher z, offset 40-80px past the main pane's edge.
- Chip: pill of `--panel-2` + glass border, 32px muted text, leading `14px` solid accent dot with `box-shadow: var(--glow)`.
- Glass bar: column with `background:var(--panel);border:1px solid var(--line);border-radius:14px 14px 0 0;` — the leader swaps to solid `background:var(--accent);box-shadow:var(--glow);` with its value in `var(--paper)` inside.

## Block recipes
- 标题卡: orbs → main glass pane left (chip `新品实测 · HANDS-ON`, 130px headline, muted deck) → small overlapping spec pane bottom-right of it (mono readout like `128GB · 3nm`) floating above. Motion: orbs fade/scale 0.5s, main pane rises 60px, small pane rises later and settles overlapping, chip dot pops.
- 大数字: orbs → main pane center-left holding a ~330px mono accent numeral with glow + muted label → a small chip pane overlapping top-right (`BENCHMARK · REAL WORLD`). The numeral fades up inside its own pane after the glass lands.
- 数字变化: a benchmark roll — orbs → main pane holding a chip title (`跑分实录 · suite name`) and a ~270px mono accent numeral that COUNTS from 0 to the final score via innerText tween (`tl.from('#id .v',{innerText:0,snap:{innerText:1},duration:0.8,ease:'power1.out'},0.15)`), glowing the whole climb, plus one muted verdict line; the small comparison pane overlaps bottom-right carrying the last-gen score in plain `--fg` — deliberately unlit so only the new number glows. HTML holds the FINAL pure digits; units and context stay in sibling nodes.
- 图表: orbs → one wide glass pane with a chip title and 4 glass bars rising from a hairline baseline; bars 3 frosted + 1 solid accent leader with glow, values above in mono, labels below 34px muted. Bars `scaleY` from bottom with stagger; leader value pops last.
- 代码: a frosted IDE — orbs → the main pane becomes a code window: a title bar (three small glass dots + mono filename, hairline `--line` bottom border) over ~5 mono code lines with right-aligned muted line numbers; keywords `--accent`, string literals `--accent-2`, comments muted; ONE line carries a brighter `--panel` highlight bar that sweeps in (`scaleX` from left) AFTER the lines land; a small `BUILD PASSED` readout pane overlaps the bottom-right corner. Motion: pane rises, window dots pop, lines fade up staggered, highlight sweeps, mini settles last.
- 金句: orbs → one large glass pane off-axis left (chip kicker + 100px two-line quote at 1.5 line-height, its brighter top rim reading as the lit edge); the KEY WORD inside the quote set `--accent` with `text-shadow: var(--glow)` — the only luminous thing on the card; a small attribution pane overlaps bottom-right at higher z. Motion: orbs first, pane rises 60px, quote fades up, the accent word lights AFTER the rest of the line, mini pane settles last.
- 步骤: orbs → three glass panes stacked top→bottom, each shifted ~110px further right and one z lower (first pane on top of the stack); every pane leads with a mono number chip — `01` solid accent with glow and `--paper` digits, `02`/`03` frosted `--panel-2` chips — followed by a 54px step title + muted sub-line. Motion: panes rise 60px in stack order with stagger, chips fade up, the accent `01` chip pops `back.out(2)`, sub-lines fade last.
- 章节: glass capsule breadcrumbs — orbs → three pill capsules in a top row (`01 开箱 / 02 实测 / 03 结论`), frosted `--panel-2` glass with the lit top rim, except the CURRENT one solid accent with `--glow` and `--paper` text; the row overlaps the top rim of the main pane below, which holds the current chapter name huge (~200px) plus one muted sub-line; a mono progress pane (`02/03`) overlaps bottom-right. Motion: capsules rise first in order, main pane settles under them, the accent capsule pops `back.out(2)`, chapter name fades up, mini last.
- 引导: orbs (given a slow finite drift, settling ≤1.2s) → main glass pane left holding a chip `NEXT DROP · schedule`, a ~112px teaser headline, and the accent-filled CTA pill `＋ 关注` (paper text, `--glow`, full 999px radius); a small episode pane (`EP.13` mono accent readout) overlaps bottom-right. Motion: orbs fade then drift, pane rises, headline fades, pill pops `back.out(1.6)`, chip dot pops, mini pane settles last.

## Compose-instruction crib
Embed directives like:
"毛玻璃科技风:深板岩底,先铺两个 blur(90px)、opacity 0.5 的巨型光斑(冰蓝一角+紫罗兰对角,出血到画布外),玻璃层浮在光斑上:background 白 8% + backdrop-filter blur(30px) + 1px 玻璃描边且顶边更亮(border-top-color 用 muted)+ 28px 圆角 + 大投影;主卡偏轴放置,再叠一张小卡压角错位悬浮,禁单卡居中;芯片标签 = 胶囊 + 发光 accent 圆点;数据一律 mono 冰蓝发光,图表里领先柱实心 accent 发光、柱内数值用 paper 色;动效:光斑先亮,玻璃层依次上浮 60px 落定,柱子 scaleY 生长,1.2s 内收。"

## Cadence
- Light first, glass second, content third — every card repeats this z-story. One solid-accent element per card maximum (the leader bar, the hero numeral, the chip dot family). Panes never align to a grid; they float. Motion vocabulary: rise and settle, like panes being laid on a lightbox.
