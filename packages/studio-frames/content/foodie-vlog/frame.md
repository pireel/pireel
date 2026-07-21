---
id: foodie-vlog
title: 奶油 Cream
summary: 贴纸软糖风:歪斜贴纸、药丸清单、糖珠缀饰,适合做饭/探店口播
icon: 🍳
showcase: [标题卡, 步骤, 列表, 大数字, 数字变化, 引导, 金句, 评论, 图表]
palette: { paper: "#FFF7EE", panel: "#FFFFFF", panel-2: "#FFEBD9", fg: "#33210F", muted: "#33210F99", accent: "#FF6B35", accent-2: "#FFB03A", line: "#33210F24", grid: "#33210F10", radius: "26px", shadow: "0 16px 40px rgb(90 50 10 / 0.16)", glow: "0 10px 30px rgb(255 107 53 / 0.4)" }
version: 0.4.2
---

# Cream — sticker & candy warmth

The design language is STICKERS ON A CREAM TABLE: big rounded white stickers laid slightly tilted, pill-shaped chips, scattered candy-dot ornaments. Warm, tactile, appetizing. The food footage is the hero — graphics are cute props around it, never a wall over it.

Every block is PROPS ON THE FOOTAGE, not a page: the block root stays transparent — the shot itself is the table. Stickers, chips and candy dots each carry their own white/blush fills and soft shadows, but never paint a cream `--paper` wall behind them; a full-page background would bury the dish. Even the 标题卡 is just one big sticker on the shot; the cream `--paper` page comes out only as a scene card, when a full-screen designed scene is explicitly requested.

## Token semantics
- `--paper` warm cream table; `--panel` white sticker; `--panel-2` blush secondary sticker/dot; `--accent` appetite orange (the ONE crave-point per card); `--accent-2` honey (its softer echo).
- Shadows are soft and low (`--shadow`); the orange CTA/badge may glow (`--glow`). No hairline borders — separation comes from shadow and tilt.

## Typography
- Round friendly weights: headlines `var(--font-head)` 800 at 130-160px; chips/steps 700 at 52-60px. Numbers warm and big in `var(--font-num)`. Never letterspace Chinese body text.

## Structural motifs (reuse verbatim)
- Tilted sticker: `border-radius:48-64px; box-shadow:var(--shadow); transform:rotate(-2deg)` (alternate ±2-5° between siblings; the middle one stays straight and overlaps: `z-index:2`).
- Badge: orange pill rotated +6-8°, white 800 text, `--glow`.
- Candy dots: 3 filled circles (accent / accent-2 / panel-2), 40-120px, scattered asymmetrically near corners.
- Chip: `padding:34px 58px; border-radius:999px; background:var(--panel); box-shadow:var(--shadow);` highlight chips swap to accent/accent-2 with white text.
- Blob plate: `border-radius:44% 56% 52% 48% / 55% 46% 54% 45%` white plate for a hero number.

## Block recipes
- 标题卡: one big tilted sticker with the dish claim (150px) + a row of 3 candy dots inside; `今日菜谱` badge overlapping its corner; 2 pearls scattered on the table. Motion: sticker back.out(1.6) settle, badge/pearls pop in stagger.
- 步骤: three sticker cards fanned −5°/0°/+5°, each a numbered circle (step 1 = orange filled + glow) over a 2-word step; pop in stagger 0.12s.
- 列表 (ingredients): flow-wrapped CHIPS, not rows — `名称 + 用量` per chip, 1-2 chips accent-colored; chips scale in with back.out.
- 大数字: `180°C` style number (font-num 230px accent) centered on a blob plate, `· 12 分钟 ·` beneath; sprinkles around; blob scales in from 0.6.
- 数字变化 (price drop): old price `¥29.9` on a small tilted sticker with a chunky fg marker strike drawing across it; the new price rolls up inside the blob plate — `¥` and `.9` as siblings around the counting `19` (font-num accent 250px), `今日到手价` beneath; honey `立省 ¥10` pill top-right; sprinkles pop last.
- 引导: headline `收藏防丢 · 配方在评论区` + tilted orange pill `＋ 关注` (glow) + a row of tilted heart emoji; pill pops, hearts stagger.
- 金句: the quote on ONE big tilted sticker (rotate +2°) — 108px line with the appetite word in accent, `—— 今日试吃结论` attribution, candy-dot row inside, pearls on the table. Sticker settles back.out, accent word blinks in, dots/pearls pop.
- 评论: 3 diner-comment stickers tilted −3°/+1.5°/−2° (middle straight-ish, `z-index:2`) — round food-emoji avatar (accent-2/panel-2), muted username, one-line rave, and a 🧡-count pill on the right (top comment's pill accent + glow, the others blush); stickers back.out in stagger 0.12s, pills pop after.
- 图表: lollipop bars — rounded white stems (soft shadow, no axis lines) topped by candy circles holding the scores; the winner swaps to accent (glowing circle with paper text, honey stem); labels beneath. Stems grow from the bottom, candy tops pop in stagger.

## Compose-instruction crib
Embed directives like:
"奶油贴纸风:白色大圆角贴纸歪 2-5° 叠放、软阴影无描边;清单一律药丸 chips 流式排布;强调用食欲橙(一卡只有一个橙点),蜂蜜黄作次强调;圆点糖珠散落点缀;动效 back.out 弹入 ≤0.3s;图形放画面下/侧三分之一,别盖食物。"

## Cadence
- Opening 3s: dish name + one irresistible qualifier. Ingredients → chip list verbatim amounts. Procedure → numbered sticker steps timed to sentences. Temp/time/gram → blob-plate stat. Appetite words are the keyword slams (2-4). CTA ties to the recipe.
