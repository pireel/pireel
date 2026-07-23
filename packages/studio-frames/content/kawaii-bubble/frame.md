---
id: kawaii-bubble
title: 泡泡 Kawaii
summary: 糖果粉泡泡:粗描边贴片、对话气泡、星星腮红,适合萌系/日常 vlog
icon: 🎀
showcase: [title-card, quote, qa, comments, steps, big-number, list, cta]
palette: { paper: "#FFEFF6", panel: "#FFFFFF", panel-2: "#FFD9EA", fg: "#4A2B3A", muted: "#4A2B3A99", accent: "#FF7DB0", accent-2: "#8E7DFF", line: "#4A2B3A22", grid: "#4A2B3A0F", radius: "40px", shadow: "0 14px 34px rgb(255 125 176 / 0.28)", glow: "0 10px 30px rgb(255 125 176 / 0.45)" }
version: 0.1.2
---

# Kawaii Bubble — candy sticker sheet that bounces

The design language is a STICKER SHEET: candy-pink paper, puffy white bubbles with THICK plum outlines, speech balloons with little tails, four-point sparkle stars and blush dots scattered like confetti. Nothing sits perfectly straight — every plate tilts 2-6 degrees, every entrance bounces with `back.out(2)`. It is soft but never mushy: the 4-5px ink outline is what keeps the cuteness crisp. No gradients, no drop-shadow-on-text, no straight grids, no full-bleed panels.

On footage these are PEELED STICKERS, not the sheet: the block root stays transparent — the live shot takes the place of the candy backing. Every bubble, balloon and star carries its own white fill plus the thick plum outline, so it reads on any video; never paint a full candy-pink `--paper` page behind them to fake the backing. Pink survives only inside small chrome — blush dots, tags, satellite bubbles. The full candy-pink sheet is allowed only as a scene card, when a full-screen designed scene is explicitly requested.

## Token semantics
- `--paper` candy pink stays exposed around every bubble; it is the sticker-sheet backing, never fully covered.
- `--panel` pure white is the bubble body; it ALWAYS carries a thick `--fg` outline (4-5px) plus the soft pink `--shadow`. A white plate without an outline is off-system.
- `--panel-2` blush pink fills satellite dots and secondary bubbles only — never a text surface.
- `--fg` warm plum is both text and outline ink. Outlines are structural, not decorative.
- `--accent` bubblegum pink owns tags, step numbers, blush dots and one filled bubble per card; text on it uses `var(--paper)`.
- `--accent-2` lavender is ONLY for sparkles (✦/✧) and one secondary satellite dot — never for text blocks.
- `--shadow` soft pink drop for every white plate; `--glow` reserved for the one accent-filled element per card.
- `--radius: 40px` for rectangular plates; true bubbles/pills go full-round (`border-radius:999px`).

## Typography
- Headlines: `var(--font-head)` 120-150px, weight 800, tracking 0.01em, always inside a bubble, never naked on paper.
- Quote text: 96-110px, weight 800, line-height 1.35, inside a speech balloon.
- Tags/pills: 40-48px, weight 800, on `--accent` pills with `var(--paper)` text, rotated 4-6°.
- Step labels: 48-56px weight 700; step numerals 76-84px weight 800 in `--accent`.
- Attribution/captions: 34-38px weight 700 in `--muted`.
- Smallest text 32px. No mono voice, no letterspaced caps — everything is chubby head font.

## Structural motifs (reuse verbatim)
- Outlined bubble plate:
  `background:var(--panel); border:5px solid var(--fg); border-radius:var(--radius); box-shadow:var(--shadow); transform:rotate(-2deg);`
- Speech-balloon tail (child of the balloon, covers the border under it):
  `position:absolute; bottom:-36px; left:190px; width:64px; height:64px; background:var(--panel); border-right:5px solid var(--fg); border-bottom:5px solid var(--fg); transform:rotate(45deg);`
- Sparkle: literal `✦` / `✧` glyph elements, 56-100px, `--accent-2` (one or two in `--accent`), scattered at tilted angles near corners.
- Blush pair: two `34px` round dots, `background:var(--accent); opacity:0.5;` sitting side by side under or beside a headline like cheeks.
- Numbered bubble: `190-240px` circle, white + 5px `--fg` outline, numeral in `--accent`; the current/first one inverts to `--accent` fill with `var(--paper)` numeral and `--glow`.
- Dotted trail: inline SVG path between bubble centers,
  `stroke:var(--accent); stroke-width:10; stroke-linecap:round; stroke-dasharray:1 44; fill:none;`
- Satellite dots: one big white outlined circle (110-130px) plus one small `--panel-2` or `--accent-2` dot (60-90px) floating on exposed paper near a corner.
- Accent pill tag:
  `background:var(--accent); color:var(--paper); font-weight:800; padding:22px 54px; border-radius:999px; box-shadow:var(--glow); transform:rotate(6deg);`
- Bounce grammar (the only easing family allowed):
  `tl.from(el,{scale:0,autoAlpha:0,duration:0.3,ease:'back.out(2)'})` for pops; `back.out(1.6-1.7)` for big plates; never `power*` slides, never plain fades on plates.

## Block recipes
- title-card: one big tilted outlined bubble (≈76% width, radius `var(--radius)`) holding the 130px headline + blush pair; an `--accent` pill tag rotated 6° pinned near its top-right corner; 3 sparkles on the exposed paper.
  Motion: bubble scales in from 0.55 with `back.out(1.7)` (≤0.4s), pill pops `back.out(2)` at 0.28s, sparkles stagger-pop last; everything settles by 0.9s.
- quote: a centered speech balloon (outlined plate + tail in the same element tree) with the 100px quote and a 36px muted attribution; blush pair tucked in the balloon's top-right; sparkles orbiting outside.
  Motion: balloon bounces up from y+80 `back.out(1.6)`, attribution fades at 0.34s, sparkles pop after 0.44s.
- qa: fan ask-box — a white outlined title pill `粉丝问箱` up top; a small `--accent`-filled Q pill (paper text, `--glow`, its own tail, tilted -3°) floats upper-left carrying the fan's question; the answer is the big white outlined speech balloon (tail + blush pair) with an 84px `--accent` "A" mark, the 92px answer line and a 34px muted attribution.
  Motion: title pill pops `back.out(2)`, Q pill pops next, the answer balloon bounces up from y+80 `back.out(1.6)` as the reveal, attribution fades, sparkles close.
- comments: comment shower — the white outlined title pill up top, then three outlined comment balloons (small tail each) stacked at staggered lefts and alternating tilts; each carries a 34px `--accent` nickname, a 54px message and a ♥ count riding the right edge; exactly one balloon inverts to the `--accent` fill as the pinned favorite.
  Motion: title pill pops `back.out(2)`, balloons pop in one by one from scale 0 with `back.out(2)` stagger 0.14, ♥ counts pop after, sparkles close.
- steps: a left-to-right trail of 3 numbered circle bubbles at bouncing heights (mid → high → mid), connected by the dotted SVG trail; 52px step word under each numeral; bubble 1 is the `--accent`-filled one; each circle tilts a different 3-4°.
  Motion: dotted trail fades in first, bubbles scale from 0 with `back.out(2)` stagger 0.14, sparkles close the card.
- big-number: one huge round bubble (≈780px circle, white + 5px outline, tilted -3°) holding a 340px numeral with a 38px muted word line and the blush pair below; the unit character rides a small `--accent`-filled mini bubble (≈190px, `var(--paper)` text, `--glow`) overlapping the big bubble's top-right rim; 3 sparkles on the paper.
  Motion: big bubble scales in `back.out(1.6)`, numeral pops inside at 0.2s, mini bubble pops `back.out(2)` at 0.4s, sparkles stagger last; settled by 1s.
- list: a small white outlined title pill up top, then three outlined pill-bubble rows stacked at staggered lefts and alternating tilts, each led by a ♥ bullet in `--accent`; exactly one row inverts to the `--accent` fill (paper text, `--glow`, ✦ bullet) as the highlight; two sparkles on the right.
  Motion: title pill pops `back.out(2)`, rows bounce up from y+60 `back.out(1.7)` stagger 0.12, bullets pop after, sparkles close.
- cta: a speech balloon (outlined plate + tail) asking to stick around, blush pair in its corner; below it the CTA pill `＋ 关注` on `--accent` with paper text and `--glow`, tilted -4°; 3 sparkles.
  Motion: balloon bounces up `back.out(1.6)`, pill pops `back.out(2)` then does ONE tiny y-bounce (yoyo repeat 1) and settles — no loops; sparkles pop last.

## Compose-instruction crib
Embed directives like:
"泡泡可爱风:糖果粉底大面积裸露;所有白色泡泡板必须带 4-5px 深梅色粗描边 + 粉色软阴影,一律歪 2-6 度;强调用泡泡糖粉(accent)填充泡泡或药丸,字用纸色;✦✧ 星星和腮红圆点当彩纸点缀,薰衣草紫只给星星;金句必须装进带小尾巴的对话气泡;步骤是圆泡泡串珠加粉色虚线点轨迹;动效全用 back.out(2) 弹跳缩放,禁直线滑入禁渐变禁发光字。"

## Cadence
- One bubble = one message; keep at most one filled accent bubble per card so the pink pop stays special.
- Open on the biggest bubble of the video (title), keep mid-video balloons a size down, then let the CTA pill be small but loudest in color.
- Every card leaves at least 25% of raw candy paper visible around the plate cluster.
- Numbers are never data here — they are step beads; if a stat must appear, put it inside a bubble as words.
- Sparkles enter LAST, always staggered, never more than five per card.
- Steps count to three; quotes stay under two lines; tags are two-to-four characters.
- Blush pairs appear once per card, always beside or under the biggest text.
- Rotation alternates direction card to card (-2°, +3°, -4°) so the sheet feels hand-placed.
- CTA voice is a pill button on accent with paper text, tilted, that pops once and settles — no pulsing loops.
