---
id: knowledge-cards
title: 蓝图 Blueprint
summary: 工程制图风:网格图纸、线框描边、尺寸标注,适合知识/观点口播
icon: 📘
showcase: [标题卡, 大数字, 数字变化, 图表, 走势, 列表, 章节, 代码, 金句, 问答, 引导]
palette: { paper: "#0E1526", panel: "#18233B", panel-2: "#121B2E", fg: "#F2F5FB", muted: "#F2F5FB99", accent: "#5B8CFF", accent-2: "#8FB0FF", line: "#F2F5FB21", grid: "#F2F5FB0D", radius: "18px", shadow: "0 18px 50px rgb(2 6 18 / 0.55)", glow: "0 0 44px rgb(91 140 255 / 0.4)" }
version: 0.4.2
---

# Blueprint — engineering-drawing dark

The design language is a TECHNICAL DRAWING: deep navy drafting paper, faint coordinate grid, stroked (not filled) shapes, dimension lines, and a drawing-title block. Arguments are rendered like schematics — measured, annotated, precise. Never decorative, never soft.

By default blocks are DETAIL CALLOUTS pinned over the footage: the block root stays transparent, and each piece — a drawing-title block, a corner dimension card, a side spec panel — is drafted on its own small patch of navy `--paper` with grid so strokes stay anchored, callout-sized and never obscuring the speaker. THE FULL SHEET OF DRAFTING PAPER — root carrying the deep navy `--paper` with its coordinate grid full-bleed — is drawn only when a full-screen schematic scene is explicitly requested.

## Token semantics
- `--paper` deep navy sheet. Every full-frame graphic sits on a faint grid: `background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size: 96px 96px;`
- `--fg` near-white drafting ink; `--muted` for annotations; `--accent` electric blue reserved for THE measured thing (one per card); `--line` hairlines and dashed guides.
- Outline over fill: key shapes are 2-3px strokes; giant numerals use hollow stroke text: `color: transparent; -webkit-text-stroke: 6px var(--accent);`

## Typography
- Headlines `var(--font-head)` 900, 140-170px, tracking −0.02em. Annotations/labels `var(--font-num)` 32-44px with 0.3em+ letter-spacing, uppercase Latin (FIG.01, MEASURED, REV A).
- Every number on screen is `var(--font-num)`.

## Structural motifs (reuse verbatim)
- Sheet frame: `position:absolute; inset:56px; border:2px solid var(--line);`
- Dimension line: dashed rule with end ticks — `border-top:2px dashed var(--line)` plus 2×20px tick pseudo-elements at both ends; a mono measurement sits in the middle.
- Leader annotation: accent dot → 2px line → muted note text.
- Title block (bottom-right): bordered mono strip of 2-3 cells, e.g. `DWG-01 | SCALE 1:1 | REV A`, first cell accent.
- Hatched emphasis fill: `repeating-linear-gradient(45deg, var(--accent) 0 10px, transparent 10px 24px)`.

## Block recipes
- 标题卡: kicker `FIG.01 — OPENING` (accent, mono, spaced) → 158px headline → dimension line labeled `1920` → title block. Motion: frame fades, headline rises 46px, guides last.
- 大数字: hollow-stroke numeral ~560px left-anchored; unit in fg stroke; leader annotation top-right with the claim + `MEASURED · Q2`; title block `DATA | ±0.5`.
- 数字变化: a live readout — the hollow-stroke accent value (font-num ~520px) rolls from 0 to the measured figure via innerText snap, CJK unit as an fg-stroked sibling; kicker `FIG.04 — LIVE COUNT`; full-width tolerance dimension line `TOL ±0`; leader claim top-right; title block `CNT-04 | TOL ±0 | REV A`.
- 图表: bars are STROKED boxes (3px fg border, no fill), baseline 3px solid; the winning bar gets the hatched accent fill and a mono crown value above. Grow from baseline, stagger 0.1s.
- 走势: solid accent polyline (8px) for actuals + DASHED muted extension for projection; nodes are paper-filled circles with accent stroke; header tag `PROJECTED`.
- 列表: a bordered spec table — mono header row (`SPEC — …`, accent), rows `01 | text | PASS/HOLD` separated by hairlines.
- 章节: the sheet-zone index as a top breadcrumb — three stroked tabs `SEC.01 开场 / SEC.02 方法 / SEC.03 实操`; the current tab is accent-stroked with the hatched fill sweeping in, the rest stay wireframe; below, mono tag `CURRENT SECTION`, the 150px chapter name, and a `2 / 3` dimension line; title block `SEC-02 | SHEET 2/3 | REV A`.
- 代码: a title-block code window — stroked window with mono header cells `SRC — hook.js | UTF-8`, muted line numbers, comments muted, keywords accent, all code in `var(--font-num)`; exactly ONE line gets an accent outline + hatch sweep, with a leader callout (`L03 · CRITICAL`) pointing at it from the right; title block `SRC-03 | REV B`.
- 金句: the quote as an annotated specimen — dashed dimension brackets (end ticks + accent mono spec labels `SPEC — QUOTE` / `VERIFIED`) above and below a 120px quote line; leader annotation `SOURCE: 口播 02'14"` bottom-right; title block `QTE-05 | REV A`. Brackets stretch in, quote rises, leader last.
- 问答: Q drawn as a figure annotation — accent dot → leader line → mono figure tag `FIG.Q1` → the question in fg; the answer revealed inside a stroked frame: mono header `ANSWER — VERIFIED` over a ~110px centered verdict; title block `QA-01 | FIG.Q1 | REV A`. Leader draws, Q slides in, frame appears, verdict rises last.
- 引导: the CTA drawn as a schematic — 3px accent-outlined button `关注` measured by dashed dimension arrows (`W 640` below, `H 220` at right), mono `+` crosshair marks at opposite corners, hatched accent fill sweeping in from the left (scaleX); mono note `PRESS TO FOLLOW · NEXT EPISODE`; title block `CTA-01 | SCALE 1:1`.

## Compose-instruction crib
When calling add_block / add_graphics / edit_block, embed directives like:
"蓝图工程制图风:满幅 96px 坐标网格底,外围 2px 发丝框;只描边不填充,巨数用空心描边字(-webkit-text-stroke 电光蓝);虚线尺寸标注带端刺 + mono 注记(FIG./REV/SCALE 字样);强调用 45° 斜纹填充;右下角工程图签;动效 rise-and-settle ≤0.4s 不弹跳。"

## Cadence
- Opening 3s: title card with the sharpest claim verbatim. One graphic per dense claim, timed to the sentence; skip filler. Keyword slams ≤2. Ending CTA echoes the opening claim.
