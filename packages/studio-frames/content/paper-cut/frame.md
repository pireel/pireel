---
id: paper-cut
title: 剪纸 Paper-cut
summary: 中国红层叠剪纸:窗花框、金章、竖排对句,适合国潮/节庆/传统文化
icon: 🏮
showcase: [title-card, chapters, big-number, count-up, cta, quote, list, steps]
palette: { paper: "#C8281E", panel: "#E33A2B", panel-2: "#A81E15", fg: "#FFF3DF", muted: "#FFF3DFB3", accent: "#F7C873", accent-2: "#FFF3DF", line: "#FFF3DF33", grid: "#FFF3DF11", radius: "12px", shadow: "0 16px 40px rgb(90 10 5 / 0.55)", glow: "0 0 34px rgb(247 200 115 / 0.4)", font-head: "'Noto Serif SC', 'Songti SC', serif" }
version: 0.1.2
---

# Paper-cut — layered chinoiserie red

The design language is LAYERED PAPER-CUT (jianzhi): saturated Chinese-red sheets stacked with chamfered knife-cut corners, gold corner marks framing an ornamental window, vertical couplet strips hung in symmetry, and one gold seal that lands last. Everything is ceremonial, centered, engraved in serif. Gold is treated like leaf — rationed to a seal, corner marks, thin rules, and at most ONE gilded word or numeral per card. Never casual, never flat-web, never gradient-washed.

By default blocks are CUT ORNAMENTS hung over the footage: the block root stays transparent, and each piece — a title banner, a corner medallion, a vertical couplet strip — carries its own small stacked red sheets (the ~18px `--panel`/`--panel-2` offset) with rationed gold, ornament-sized and never covering the speaker. THE FULL RED SHEET — root carrying `background:var(--paper)` edge to edge under the whole layered ceremony — is unfolded only when a full-screen ceremonial scene is explicitly requested.

## Token semantics
- `--paper` is the base red sheet. `--panel` is the lifted lighter-red plate; `--panel-2` is the deeper echo sheet peeking out from behind it — the two plates offset by ~18px ARE the paper-cut layering. Every card sits on this stack.
- `--fg` is warm rice-paper cream, the main ink on red. `--muted` for whispered meta lines only.
- `--accent` is GOLD, and gold is precious: the seal, four corner L-marks, cloud arcs, one gilded numeral. Never a gold background, never gold body text.
- `--accent-2` equals `--fg`: cream is the only second ink. There is no third color; restraint is the style.
- `--glow` is the gold halo, reserved for the seal ring. `--radius` only rounds the seal; plates get chamfered clip-paths instead of border-radius.
- `--line` draws the couplet-strip borders and hairline dividers at 2px.

## Typography
- Everything is `var(--font-head)` (serif). Headlines 700-900 weight, 130-160px, with generous 0.02-0.08em tracking — engraved on paper, not shouted.
- Couplets and vertical labels use `writing-mode: vertical-rl`, 40-48px, weight 600, 0.16-0.2em letter-spacing.
- Numerals sit in `var(--font-num)`; a giant numeral is the ONE place gold may run 380px+.
- Kickers are small spaced serif (34-38px, 0.4em+ letter-spacing) in gold.

## Structural motifs (reuse verbatim)
- Chamfered plate stack (knife-cut corners; the signature layering, on every card):
```css
.plate, .plate2 { position: absolute; inset: 88px 140px;
  clip-path: polygon(44px 0, calc(100% - 44px) 0, 100% 44px, 100% calc(100% - 44px),
    calc(100% - 44px) 100%, 44px 100%, 0 calc(100% - 44px), 0 44px); }
.plate  { background: var(--panel); }
.plate2 { background: var(--panel-2); transform: translate(18px, 18px); }
```
- Gold corner marks — four L-shapes at the plate's inner corners:
```css
.cm { position: absolute; width: 64px; height: 64px; border: 0 solid var(--accent); }
.cm.tl { border-left-width: 5px; border-top-width: 5px; } /* mirror tr / bl / br */
```
- Gold seal — a bordered ring with 1-2 serif characters, rotated, stamped in last:
```css
.seal { border: 6px solid var(--accent); border-radius: 999px; color: var(--accent);
  box-shadow: var(--glow); transform: rotate(6deg); }
```
- Vertical couplet strip, hung symmetrically left and right:
```css
.cpl { writing-mode: vertical-rl; background: var(--panel-2);
  border: 2px solid var(--line); padding: 40px 20px; letter-spacing: 0.18em; }
```
- Cloud arcs — a row of open arches, middle tallest, sides at 0.7 opacity:
```css
.cloud i { border: 5px solid var(--accent); border-bottom: none;
  border-radius: 96px 96px 0 0; }
```

## Block recipes
- title-card: plate stack → gold spaced kicker → 140-150px cream headline → cloud-arc row, all centered; couplet strips inside both plate edges; a gold seal overlapping the plate's top-right. Plates settle first (scale 0.97→1), headline rises, seal stamps last (scale 1.6→1, power3.in).
- chapters: a chapter-index divider — three vertical chapter tabs (第一回/第二回/第三回) hung in a centered row beneath a gold spaced kicker; the current chapter is a chamfered deep-red strip (18px knife corners, `--panel-2` ground, gold ink, weight 700) while the others stay 2px hairline-bordered and muted; below, the current chapter title runs as ONE couplet-flavored 110px cream line, grounded by cloud arcs; a small seal countersigns bottom-right. Tabs drop from above like hung scrolls in sequence, the title rises, seal stamps last.
- big-number: ONE gilded numeral 380-460px (`var(--font-num)`, gold) anchored left on the plate with a cream serif unit character; cloud arcs ground it; a vertical couplet on the right carries the claim; a small seal countersigns bottom-right. Numeral rises, couplet slides in from its edge.
- count-up: a window-flower medallion — a 560px `--panel-2` circle with a 2px cream rim and an inner dashed ring (paper-cut perforation) holds ONE gilded `var(--font-num)` numeral that rolls up from zero (`innerText` tween with `snap:{innerText:1}`, ~0.8s; the HTML carries the FINAL value as plain digits, the unit character is a cream sibling below it); a vertical couplet on the right spells the count out in words; cloud arcs ground the bottom center — no extra seal, the gilded count IS the gold. Medallion settles first, digits land well before the freeze.
- cta: the seal IS the button — a 320px+ gold ring with vertical 「关注」 inside, flanked by a four-character couplet pair; a muted footer line dates the next episode. Ring stamps in with its glow, couplets slide from their sides, footer fades last.
- quote: the quote itself hangs as a couplet — two vertical-rl serif strips (panel-2 ground, 2px `--line` border, 60px weight 700) placed as a symmetric pair, the first line right of center and higher, the second left and lower; a gold spaced kicker grounds the bottom center and a small seal countersigns. Strips drop from above like hung scrolls, seal stamps last.
- list: 年俗清单 — a gold spaced kicker on top, then three hairline-separated rows on the plate, each led by a small gold cloud-arc bullet (a single open arch), a 58px serif term at left and a muted note pushed right; a seal countersigns bottom-right. Rows slide in from the left in sequence, seal last.
- steps: three smaller chamfered plates (24px knife corners, `--panel-2`) in a row under a gold kicker, each stacking a gold seal-ring step numeral (一/二/三), one big serif verb (72px 800) and a muted note; open gold cloud arcs bridge the gaps between plates. Plates rise in sequence, arcs fade in after — no extra seal, the step rings ARE the gold.

## Compose-instruction crib
Embed directives like:
"剪纸国潮风:中国红纸面上叠两层切角红纸板(clip-path 44px 斜切角,底板深红、右下错位 18px);奶白衬线字为主墨;金色是贵重物——只做四角 L 形角标、一枚圆形金章(6px 金边圆环带金晕)、镂空云弧、细金线或一个鎏金大字/大数,禁止金色大底;左右对称悬挂竖排对句条(writing-mode:vertical-rl,深红底 2px 细边);版式居中对称、庄重仪式感;动效:纸板先落定,文字上浮,金章最后盖下(scale 1.6→1 power3.in),全程 1.2s 内收,不弹跳。"

## Cadence
- Ceremonial pacing: hold the title plate a beat longer than usual; one claim per plate, no dense paragraphs — red paper carries few words well.
- Numbers become gilded steles (大数字); verdicts and blessings go into couplets; the ending is always the seal-as-CTA.
- Never more than one seal and one gilded element per card — gold spent twice is gold wasted.
