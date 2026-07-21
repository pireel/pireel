---
id: zen-white
title: 留白 Zen
summary: 暖白纸面:一根发丝线、一枚朱点、极小字与极大留白,适合思考/文艺/生活方式
icon: ⚪
showcase: [标题卡, 金句, 问答, 大数字, 时间线, 列表, 引导]
palette: { paper: "#FAFAF7", panel: "#FFFFFF", panel-2: "#F0EFEA", fg: "#1A1A18", muted: "#1A1A1866", accent: "#BC4327", accent-2: "#8A8A82", line: "#1A1A1814", grid: "#1A1A180A", radius: "0px", shadow: "0 0 0 rgb(0 0 0 / 0)", glow: "0 0 0 rgb(0 0 0 / 0)", font-head: "'Noto Serif SC', 'Songti SC', serif" }
version: 0.1.2
---

# Zen — one line, one dot, and a page of silence

The design language is RADICAL EMPTINESS on warm paper: a single small serif text block placed at a golden-ratio point, ONE hairline as the only structure, ONE cinnabar dot as the only color — pressed like a seal. Ninety percent of the canvas stays blank, and the blankness is the message. Nothing is ever centered both vertically AND horizontally; nothing has a box, a shadow, a glow, or a rounded corner. If a composition feels too empty, it is exactly right.

By default blocks are QUIET SLIPS over the footage: the block root stays transparent, and each piece — a small serif title line, one hairline, the cinnabar dot, a short caption — rests on its own modest slip of warm `--paper` so the silence travels with it, kept spare and placed clear of the speaker. THE WHOLE PAGE OF SILENCE — root carrying the warm `background:var(--paper)` edge to edge — is granted only when a full-screen designed scene is explicitly requested; only then does the block own the blankness.

## Token semantics
- `--paper` warm off-white — the page itself. No panels, no cards; `--panel` / `--panel-2` are effectively unused.
- `--fg` soft ink for all text; `--muted` (ink @ 40%) for captions and annotations.
- `--accent` cinnabar red appears EXACTLY ONCE per card, as a 10-14px dot (`border-radius:999px`) — a seal, never text color, never a fill, never twice.
- `--accent-2` warm grey may color one Latin caption at most.
- `--line` (ink @ 8%) draws the single hairline; `--grid` unused. `--radius`, `--shadow`, `--glow` are all zero by decree — never re-introduce them.

## Typography
- Everything in `var(--font-head)` (serif). Headlines are SMALL for a video frame: 96-120px, weight 500-600, tracking +0.1 to +0.16em.
- Numerals are modest serif, 180-200px MAX, weight 400 — never bold, never huge.
- Side annotations run vertical: `writing-mode: vertical-rl;` 32-40px, generous tracking.
- Captions 30px muted, tracking +0.2em; Latin captions uppercase 30px in `--accent-2`.

## Structural motifs (reuse verbatim)
- Golden placement: anchor the text block at ~38.2% or ~61.8% of one axis and near an edge on the other, e.g. `left:150px; top:38.2%;` or `left:61.8%; top:150px;` — never `50%/50%`.
- The one hairline: `height:1px; background:var(--line);` spanning most of the width at `top:61.8%` (or a vertical `width:1px` at `left:38.2%`). One per card, horizontal OR vertical, never both.
- The seal dot: `width:12px;height:12px;border-radius:999px;background:var(--accent);` sitting ON the hairline or closing a text block — the full stop of the composition.
- Vertical annotation: `writing-mode:vertical-rl;letter-spacing:0.5em;` hugging the right edge, muted.
- Tiny caption: 30px, `letter-spacing:0.24em`, muted, far from the main block — it breathes across the emptiness.

## Block recipes
- 标题卡: hairline across at `top:61.8%`; serif title (110px, +0.12em) sitting just ABOVE the line at `left:150px`; cinnabar dot resting on the line at ~61.8% width; vertical annotation on the right edge; one 30px Latin caption below the line. Motion: line fades in over 0.8s, title drifts up 10px over 0.7s, dot appears last with a bare fade.
- 金句: the quote runs VERTICAL (`writing-mode:vertical-rl`, 72-84px, +0.18em) placed right-of-center at ~61.8% width, top-anchored; the seal dot closes the column at its foot; a 30px horizontal attribution waits alone in the lower-left. Motion: quote fades 0.9s with a 10px vertical drift; dot 0.4s fade at the end.
- 问答: a question left hanging — the muted question line (42px, +0.3em) waits alone at `left:150px; top:38.2%`; the one hairline at `top:61.8%` IS the pause between asking and knowing; the serif answer (110px, +0.12em) is revealed just BELOW the line at `left:150px`; the cinnabar dot rests on the line at ~61.8% width; one 30px Latin caption keeps far away in the lower-right. Motion: line fades 0.8s, question fades first, a held beat, then the answer drifts up 10px; dot last.
- 大数字: a 200px weight-400 serif numeral at `left:150px; top:38.2%`; ONE vertical hairline standing to its right; a vertical label (`writing-mode:vertical-rl`, 38px) beyond the line; 30px muted caption in the lower-right corner, far away. Motion: numeral fades 0.8s drifting 10px, hairline scales from top 0.7s, label and caption fade after.
- 时间线: the one hairline at `top:61.8%` becomes the timeline, unrolling from the left (scaleX, 0.9s); three sparse stations straddle it — a serif stage word (44px, +0.12em) above, a 28px muted date below, each marked by a 1px ink tick crossing the line; ONLY the current station trades its tick for the cinnabar dot, landing at ~61.8% width; a 30px Latin caption waits in the lower-right. Motion: line unrolls first, stations drift up 10px in slow sequence, dot fades last.
- 列表: a sparse vertical index — ONE vertical hairline standing at the 38.2% column; three serif items (64px, weight 500, +0.12em) hang to its right with 90px+ gaps, each led by a tiny 28px muted numeral; the key item ALONE carries the cinnabar dot at its end; a 30px Latin caption waits far away in the lower-left. Motion: hairline scales from top 0.7s, items drift up 10px in slow sequence, dot fades last.
- 引导: a near-empty page — the one hairline at `top:61.8%`; a small serif `关注` (96px, +0.2em) resting just above it at `left:150px` with the cinnabar dot beside it; a vertical-rl side note hugging the right edge; one 30px Latin caption below the line. Motion: slow fades ONLY (0.6-0.8s), no drift, dot last.

## Compose-instruction crib
Embed directives like:
"极简禅白风:暖白纸底,全画面 90% 留白;唯一结构 = 一根 1px 发丝线(横线放 61.8% 高度或竖线放 38.2% 宽度,一张卡只许一根);唯一颜色 = 一枚 10-14px 朱砂圆点像印章一样落在线上或文块末尾,朱色绝不做文字色/填充、绝不出现第二次;文字全衬线,标题只许 96-120px、字重 500-600、字距 +0.12em,数字最大 200px 字重 400;文块锚在黄金分割点,严禁水平垂直同时居中;竖排批注 writing-mode:vertical-rl 贴右缘;小字 30px 字距 0.24em;零圆角零投影零光晕;动效只许 0.6-0.9s 慢淡入 + 10px 位移,别的都不许动。"

## Cadence
- One thought per card, one line, one dot. The dot is the loudest thing on screen — protect it. Numbers whisper; quotes stand like a hanging scroll; captions keep their distance. Motion is breath: fade, drift ten pixels, settle, done.
