---
id: biennale-poster
title: 双年展 Biennale
summary: 构成主义海报:巨字出血、竖排刊号、反白墨板,适合宣言/锐评/发布
icon: 🟨
showcase: [标题卡, 大数字, 数字变化, 对比, 引导, 列表, 章节, 金句]
palette: { paper: "#F7D617", panel: "#FFFFFF", panel-2: "#E8CB0D", fg: "#111111", muted: "#111111A6", accent: "#111111", accent-2: "#F7D617", line: "#11111136", grid: "#11111114", radius: "0px", shadow: "10px 10px 0 rgb(17 17 17 / 1)", glow: "0 0 0 rgb(0 0 0 / 0)", font-num: "'IBM Plex Mono', ui-monospace, monospace" }
version: 0.5.1
---

# Biennale — constructivist poster, print-hard

The design language is a GALLERY POSTER: flat biennale yellow, ink black, zero radius, hard offset shadows. The frame IS the poster — type is the layout, oversized and allowed to crop at the edges. Loud, flat, typographic. No gradients, no blur, no soft anything, ever.

By default blocks are POSTER FRAGMENTS pinned over the live footage: the block root stays transparent, and each fragment — a title slab, a numbered corner plate, a caption strip — brings its own flat yellow or ink ground with the hard offset shadow, at card scale that crops boldly but never buries the speaker. The FULL-BLEED POSTER PAGE — root carrying `background:var(--paper)` across the whole frame — is reserved for when a full-screen designed scene is explicitly requested.

## Token semantics
- `--paper` the yellow is the brand — leave it exposed; do not cover it with big panels.
- `--fg` ink black is BOTH text and accent. Emphasis = INVERSION (ink plate with yellow/`--accent-2` text), used exactly once per card. Never introduce a third color.
- `--shadow` is a hard 10px offset ink block (no blur) — apply to white `--panel` plates only.
- `radius: 0` everywhere. Any rounded corner breaks the system.

## Typography
- Headlines at MAXIMUM: 300-520px, weight 900, tracking −0.04 to −0.08em; cropping at frame edges is a feature.
- Latin labels in `var(--font-num)` with 0.2-0.5em tracking (BIENNALE — 2026, №01). Vertical text via `writing-mode: vertical-rl` on one edge.
- A 6px solid ink rule (border-top) closes compositions.

## Structural motifs (reuse verbatim)
- Inverted plate: `background:var(--fg); color:var(--paper);` — headline second lines, verdicts, CTA plates.
- Edge strip: full-width ink-bordered marquee line of spaced mono caps (`FOLLOW — NEXT EPISODE — …`).
- Vertical spine: rotated/vertical mono label pinned to the right edge.
- Seam badge: rotated (−8°) paper-colored box with 10px ink border sitting on a split line (`VS`).
- Footer index: `№01 | OPENING` row above a 6px ink rule.

## Block recipes
- 标题卡: two stacked giant lines (330px), line 2 as an inverted plate; vertical spine `PIREEL BIENNALE — 2026`; footer index row. Motion: lines slam in from opposite sides (power3, ≤0.3s), chrome fades last.
- 大数字: the numeral fills the FULL height (~1000px, mono 800) cropped left; a 300px ink square holds the unit (%) in yellow; claim sits bottom-right with a 14px ink side-rule. 
- 数字变化: the evidence tally — a ~460px mono numeral (HTML holds the FINAL value as pure digits) rolls up via innerText snap tween; the unit rides the card's ONE inverted ink block at the numeral's shoulder; an 84px ink claim below, mono kicker `LIVE COUNT`, vertical spine `DATA OVER TASTE`, footer index `№04 | COUNT` above the 6px rule. The row slams from the left while digits climb, the unit block lands power3, chrome fades last.
- 对比: hard vertical split — left half yellow with ink giant value, right half INK with yellow giant value (right-aligned); rotated `VS` seam badge on the centerline. Halves slide in opposed; badge back.out.
- 引导: near-full-bleed ink plate with giant `关注` + oversized ↗ in `--accent-2`; bottom marquee strip. Plate drops in, arrow lands after, strip slides.
- 列表: manifesto index — three giant numbered lines (mono 01/02/03 + 168px 900 items) stacked between 6px ink rules, exactly ONE line inverted and bleeding past the margins; mono caption `MANIFESTO` on top, footer index `№03 | INDEX`. Rows slam in from alternating sides.
- 章节: act navigation — a full-width three-cell band (第Ⅰ幕/第Ⅱ幕/第Ⅲ幕) framed and divided by 6px ink rules, ONLY the current act inverted (ink plate, paper type); beneath it the current act's name as one giant 330px word; vertical spine `BIENNALE — ACT Ⅱ`, footer index `№02 | ACT Ⅱ / Ⅲ`. Cells slam down in order, the giant word slams from the left, chrome fades last.
- 金句: full-frame poster quote — two stacked giant lines (290-330px), exactly ONE word as an inverted plate; vertical spine credit `QUOTE · 摘自口播 02'14"` on the right edge; footer index above the 6px rule. Lines slam opposed, the plate word lands last (power3.in).

## Compose-instruction crib
Embed directives like:
"双年展海报风:大面积海报黄裸露,墨黑巨字 300px+ 允许出边裁切;零圆角;白板配 10px 无模糊硬偏移黑影;强调只用反白墨板(黄字),全片不出现第三种颜色;右缘竖排 mono 刊号,底部 6px 粗墨线 + №编号;动效 ≤0.25s power3 硬切入,禁弹跳禁渐变。"

## Cadence
- One message per frame, oversized; whitespace is part of the shout. Manifesto title in the first 3s; verdicts as inverted plates; keyword slams rare and full-frame; CTA is two words on an ink plate.
