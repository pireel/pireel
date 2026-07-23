---
id: mega-sale
title: 爆炸 Mega Sale
summary: 大促红金:爆炸贴、巨价签、倒计时,适合带货/促销/清单好物
icon: 🧨
showcase: [title-card, big-number, count-up, cta, countdown, compare, list, steps]
palette: { paper: "#EE2A24", panel: "#FFE14D", panel-2: "#C81E14", fg: "#FFFFFF", muted: "#FFFFFFB3", accent: "#FFE14D", accent-2: "#7A0E08", line: "#FFFFFF40", grid: "#FFFFFF14", radius: "16px", shadow: "0 16px 40px rgb(90 8 4 / 0.5)", glow: "0 0 40px rgb(255 225 77 / 0.55)" }
version: 0.1.2
---

# Mega Sale — red-hot promo blast

The design language is a HYPERMARKET BLAST POSTER: the whole canvas is sale red, gold starburst stickers explode over it, prices are gigantic, ribbons run diagonal, and a countdown always ticks. Everything is LOUD and slightly rotated — this frame shouts, it never whispers. Emphasis is achieved by the gold/deep-red collision, never by a third hue, never by gradients, never by soft glassy panels or polite whitespace.

By default blocks are BLAST STICKERS slapped over the footage: the block root stays transparent, and each piece — a price starburst, a corner countdown, a diagonal ribbon strip — carries its own red or gold fill so the shout still lands, sticker-sized and never burying the seller on camera. THE FULL BLAST POSTER — root carrying sale-red `background:var(--paper)` edge to edge — detonates only when a full-screen poster scene is explicitly requested.

## Token semantics
- `--paper` sale red is the stage; leave it dominant. Big cool-off panels are forbidden — stickers and strips only.
- `--panel` gold is the SCREAM voice: starbursts, ribbons, the CTA bar. Text sitting on gold ALWAYS uses `var(--accent-2)` (deep oxblood), never white.
- `--panel-2` deep red is the countdown-tile voice: dark blocks that make white digits pop.
- `--fg` white carries headlines and giant prices; the price gets a `-webkit-text-stroke` in `--accent-2` so it reads as a printed sticker.
- `--accent-2` oxblood is ink-on-gold plus the price outline; it never appears as a background.
- `--muted` white 70% for crossed-out old prices and fine print; `--line` white 25% hairlines close a card at the bottom.
- `--shadow` deep-red drop under every gold plate; `--glow` gold halo reserved for the CTA slab only.
- `--radius:16px` on tiles and the CTA slab; starbursts are clip-path polygons (no radius); ribbons are sharp full-bleed rectangles.

## Typography
- Headlines: `var(--font-head)` 130-160px, weight 900, tracking -0.01em, white, line-height 1.15, rotated -2 to -4°.
- Giant price: 420-480px digits, weight 900, white fill + `-webkit-text-stroke:6px var(--accent-2)`; the ¥ symbol smaller (160-180px) in `--accent` gold.
- Ribbon/tag copy: 44-56px weight 900, tracking 0.2-0.24em, oxblood on gold, repeated as a marquee phrase.
- Countdown digits: `var(--font-num)` 140-160px weight 800 white on `--panel-2` tiles; separators `:` in gold at 120px.
- Crossed-out old price: 72-90px `--muted` with `text-decoration:line-through`.
- Fine print: 34px weight 700, tracking 0.3em, `--muted`, above a `--line` hairline. Smallest text 34px.
- Burst copy: 76-130px weight 900, two characters or a percentage, line-height 1.1, centered inside the star.
- Never letter-space headlines; the crowding IS the urgency. Only ribbons, kickers and fine print get tracking.

## Structural motifs (reuse verbatim)
- Starburst sticker (24-vertex spiky badge), gold with oxblood text, rotated 8-12°:
  `clip-path:polygon(50% 0%,59% 15%,75% 7%,76% 25%,93% 25%,85% 41%,100% 50%,85% 59%,93% 75%,76% 76%,75% 93%,59% 85%,50% 100%,41% 85%,25% 93%,24% 76%,7% 75%,15% 59%,0% 50%,15% 41%,7% 25%,24% 24%,25% 7%,41% 15%); background:var(--panel); color:var(--accent-2);`
- Diagonal ribbon strip: full-bleed bar (`left:-80px; right:-80px;`) rotated -3 to -4°, gold bg, oxblood spaced caps repeating `限时开抢 — MEGA SALE — …`, `box-shadow:var(--shadow)`.
- Countdown tile row: three `--panel-2` tiles (radius 16px, `--shadow`) with mono digits `00 12 45`, gold `:` separators between, a spaced-caps kicker line above.
- Price stack: crossed old price above, giant outlined new price center-left, starburst discount badge overlapping its top-right airspace.
- CTA slab: gold bar, 100-110px oxblood text `马上抢购 ▶`, rotated -2°, `box-shadow:var(--glow)`.
- Sticker-outline hero: cover-size type may take `-webkit-text-stroke:8px var(--accent-2)` over white fill for the die-cut look.
- Kicker line: `font-size:46px; font-weight:800; letter-spacing:0.4em; color:var(--muted); text-align:center;` — spaced Chinese caps announcing the countdown.
- Slam grammar (the only entrance family allowed):
  `tl.from(el,{scale:2.2,autoAlpha:0,duration:0.24,ease:'power4.in'})` for type; `back.out(2)` with rotation for bursts; `x:±320` `power3.out` for ribbons.

## Block recipes
- title-card: 150px white headline rotated -2° anchored center-left; a gold ribbon strip crossing near the top diagonally; one starburst `立减` (≈430px) at the lower-right; fine print above a hairline at the bottom.
  Motion: headline SLAMS from scale 2.2 with `power4.in` ≤0.25s, ribbon slides along its own diagonal, burst pops `back.out(2)` with spin, fine print fades last.
- big-number: the price stack — muted `日常价 ¥399` struck through, then ¥(gold)+`199`(giant outlined white), starburst `-50%` overlapping top-right; bottom ribbon `今晚 20:00 开抢`.
  Motion: old price drops in, giant price slams from scale 2.4, then ONE scale pulse to 1.06 and settle; burst pops, ribbon slides in from the right.
- count-up: price crash — spaced-caps kicker `价格崩了`; the muted old price `原价 ¥1299` gets killed by a gold slash bar wiping across it; below, ¥(gold)+giant outlined white digits ROLL up live (innerText snap) and land on `899`, then fire the card's ONE pulse; starburst `省400` overlapping the price's right airspace; fine print above the hairline.
  Motion: kicker fades, old price drops in, price slab slams from scale 2.4 while the digits roll 0→899 (`snap:{innerText:1}`, `power1.out`), slash bar wipes across `power3.out`, burst pops with spin, pulse 1.06 once, fine print last.
- cta: spaced-caps kicker `距结束仅剩`, countdown tile row `00:12:45` upper center, gold CTA slab `马上抢购 ▶` below, starburst `仅限今天` corner sticker.
  Motion: tiles drop from y-90 stagger 0.1 `power3.out`, colons blink on, CTA slams then pulses once (1.05), burst pops in parallel; all settled by 1.1s.
- countdown: flash-sale clock — spaced-caps kicker `距开抢仅剩`, a `00:59:59` tile row (`--panel-2` tiles, mono white 180px digits, gold colons) with 38px spaced unit labels 时/分/秒 under each tile; a small starburst corner sticker upper-right; bottom ribbon `今晚 8 点开抢`.
  Motion: tiles drop y-90 stagger 0.1 `power3.out`, colons blink on, the SECONDS tile ticks up a few discrete jumps (innerText snap) and settles on 59, burst pops with spin, ribbon slides in from the left last.
- compare: old vs new price duel — spaced-caps kicker on top, a `--panel-2` slab left holding the muted struck-through `日常价 ¥399`, and a big gold starburst (≈620px) right carrying `现价 ¥199` in oxblood; fine print above the hairline at the bottom.
  Motion: kicker fades, old-price slab slides in from the left and dies first, burst pops `back.out(2)` with spin then fires the card's ONE pulse (1.06), fine print last.
- list: 好物清单 — 110px white headline rotated -2°, then three numbered gold ribbon rows (gold bg, oxblood 900 text, radius 16px, `--shadow`) each `序号 + 品名 + mono ¥价格`, alternating ±1° tilts and ragged right edges; fine print at the bottom.
  Motion: headline slams scale 2.2 `power4.in`, rows hard-slam from alternating x±320 `power3.out` in sequence, fine print fades last; no burst on this card.
- steps: 下单三步 — spaced-caps kicker `三步抢到手`, three `--panel-2` tiles side by side each with a giant mono white digit (1/2/3), a 44px step phrase, and a small rotated gold corner ribbon (oxblood verb `领券/下单/付款`); an urgency ribbon strip `零点截单 — 手慢无` crossing the bottom at -3°.
  Motion: tiles drop y-90 stagger 0.1 `power3.out`, corner ribbons pop `back.out(2)` with spin stagger, bottom strip slides in from the left last; no countdown digits — those stay in 引导.

## Compose-instruction crib
Embed directives like:
"电商大促风:整屏大促红裸底,禁大面积冷静面板;金色只做爆炸贴/斜彩带/CTA 条,金底上的字一律深酒红;巨价签白字 900 加 6px 深酒红描边,¥ 符号金色缩小;旧价划线白 70%;倒计时用深红瓷砖 + 等宽白数字 + 金冒号;所有贴片旋转 2-12 度制造斜向能量;动效硬砸:scale 2 power4.in 落版 + 一次 1.06 脉冲,爆炸贴 back.out(2) 弹出,禁柔和淡入禁渐变。"

## Cadence
- One price per card, one starburst per card — the blast loses power if stickers crowd.
- Escalate numerically: discount teaser (标题卡) → exact price (大数字) → deadline (引导); each card's biggest element grows.
- Gold coverage stays under a third of the frame; the red must always dominate or the gold stops screaming.
- Fine print exists on every card (hairline + spaced 34px) — it is what makes the shouting look legal.
- The pulse fires exactly once per card (price or CTA, not both).
- Ribbons alternate their diagonal (-4° then +3°) between consecutive cards to keep the energy zig-zagging.
- Countdown appears in the CTA block only; urgency copy stays under six characters per ribbon segment.
- Old price always dies on screen (strikethrough enters before the new price slams).
- Never calm down at the end: the closing card is the loudest (CTA slab + countdown together).
- Bursts always enter WITH spin (`rotation:±70` in the from-state) so they land like thrown stickers.
