---
id: memphis-pop
title: 孟菲斯 Memphis
summary: 奶白底几何纸屑:粗描边圆三角波浪、彩色硬影,适合创意/开箱/泛娱乐
icon: 🔷
showcase: [标题卡, 大数字, 数字变化, 列表, 金句, 评论, 步骤, 引导]
palette: { paper: "#FDF6EC", panel: "#FFFFFF", panel-2: "#B8E0D2", fg: "#1E1B4B", muted: "#1E1B4B99", accent: "#FF5D73", accent-2: "#FFC53D", line: "#1E1B4B33", grid: "#1E1B4B10", radius: "18px", shadow: "12px 12px 0 rgb(255 197 61 / 1)", glow: "0 0 0 rgb(0 0 0 / 0)" }
version: 0.1.2
---

# Memphis — geometric confetti, hard candy shadows

The design language is MEMPHIS-GROUP POP: cream paper scattered with bold outlined geometry — circles, triangles, half-circles, polka-dot patches, squiggles — and white panels that cast a HARD 12px yellow offset shadow with zero blur.
Compositions are deliberately asymmetric: the message sits off to one side while confetti balances the other side of the frame.
Playful but drawn with a thick confident ink line — never soft, never gradient, never a centered card in the middle.

By default blocks are CONFETTI PIECES scattered over the footage: the block root stays transparent, and each piece — a title plate, a corner number chip, a side list card — is a white `--panel` plate with the thick ink outline and hard yellow offset shadow, with a few outlined shapes orbiting it, at card scale that leaves the speaker clear. THE FULL SHEET OF CREAM PAPER — root carrying `background:var(--paper)` edge to edge — is unrolled only when a full-screen designed scene is explicitly requested.

## Token semantics
- `--paper` cream stays exposed as the playground; confetti floats directly on it with no container.
- `--panel` white panels carry the SIGNATURE combo: `--shadow` (hard yellow offset, no blur) PLUS a `4px solid var(--fg)` outline. A panel missing either half of the combo is off-system.
- `--fg` deep indigo is text AND the 3-6px outline ink of every hollow shape and every dot patch.
- `--accent` pink fills exactly ONE solid shape or one chip per card; a second pink fill tips the card into noise.
- `--accent-2` yellow lives in the offset shadow and at most one squiggle/zigzag line; never use it for text.
- `--panel-2` mint fills the quieter shapes (half-circles, squares) and never carries text either.
- `--muted` only for secondary captions inside panels.
- `--radius: 18px` on panels and chips only — confetti shapes stay pure geometry (perfect circles, sharp triangles, true half-circles).
- `--glow` stays zero; Memphis depth is the offset shadow, nothing luminous.

## Typography
- Headlines 130-160px, weight 900, `--fg`, tracking 0 to +0.02em, left-aligned inside their panel — never centered in the frame.
- Numbers use `var(--font-num)` at 400-520px, weight 800, −0.03 to −0.05em tracking, sitting RAW on paper (no panel) with a shape stacked behind.
- Kicker chips 38-46px weight 800; list items 58-62px weight 700.
- Latin kickers take 0.2-0.26em tracking; Chinese headlines take none.
- Text never sits on top of a dot patch or stripe patch — patches are backdrops for shapes, not for words.

## Structural motifs (reuse verbatim)
- Hard-shadow panel (headline plates, list rows, caption tags):
  `background:var(--panel);border:4px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);`
- Outlined circle confetti: `border:6px solid var(--fg);border-radius:999px;background:transparent;` (equal width/height, 150-560px).
- Solid triangle: `background:var(--accent);clip-path:polygon(50% 0,100% 100%,0 100%);` — rotate it 10-25° so it never sits flat.
- Half-circle: `border:6px solid var(--fg);border-bottom:none;border-radius:200px 200px 0 0;background:var(--panel-2);` rotated ±14-18°.
- Polka-dot patch: `background-image:radial-gradient(var(--fg) 3px,transparent 3px);background-size:30px 30px;` on a transparent rectangle slipped half behind a panel corner.
- Diagonal-stripe patch (rarer): `background:repeating-linear-gradient(45deg,var(--fg) 0 10px,transparent 10px 34px);`
- Squiggle/zigzag: inline SVG `<polyline points="0,50 40,10 80,50 120,10 …"/>` with `fill:none;stroke:var(--accent-2);stroke-width:12;`
  Animate the draw via `stroke-dasharray`/`stroke-dashoffset` — it is the closing flourish of a card.
- Chip: pill (`border-radius:999px`) filled `var(--accent)`, `color:var(--paper)` text, 4px `--fg` outline.
- Scatter rule: 3-5 confetti pieces per card, mixed hollow/solid/patch, clustered opposite the message — never sprinkled evenly.

## Block recipes
- 标题卡: headline panel pushed to the upper-left with a chip kicker above the 150px title; confetti cluster lower-right — outlined circle, pink triangle, mint half-circle; a polka patch slides behind the panel corner; the yellow zigzag underlines the composition at bottom-left.
  Motion: panel slams in from the left (power3), chip pops, shapes stagger in with `back.out(1.8)`, zigzag draws last.
- 大数字: the numeral (~500px, `--font-num`) sits raw on paper right-of-center with a huge outlined circle behind it and a triangle wedged near its baseline; the claim rides a small hard-shadow panel bottom-left; polka patch fills the top-left corner.
  Motion: number lands with scale overshoot, circle scales in behind, shapes pop, panel snaps in from the left, patch fades last.
- 数字变化: the count-up — a ~430px `--font-num` numeral (pure digits, final value in markup) sits raw on paper left-of-center with a huge outlined circle behind its top corner and a sibling `+` sign at its shoulder; a pink triangle wedges the baseline, mint half-circle up right, polka patch slides behind the claim panel's top corner bottom-right; yellow zigzag closes bottom-left.
  Motion: numeral drops with `back.out`, digits roll 0→final via `innerText` tween with `snap:{innerText:1}` over 0.8s, shapes pop `back.out(2.2)` with stagger, panel snaps in from the right, zigzag draws last.
- 列表: an 84px title top-left with the squiggle drawn beneath it; three hard-shadow row panels at STAGGERED left offsets (each row indented differently, alternating ±0.5° rotations), each led by a geometric bullet — solid pink circle, yellow triangle, outlined mint square; dot patch balances the freed top-right corner.
  Motion: title drops, rows punch in from the left with stagger, bullets pop `back.out(2)`, squiggle draws.
- 金句: the quote (~104px, two lines) rides a hard-shadow panel pushed left; ONE key word is hand-circled by a 6px `--fg` outlined perfect circle overlapping its lines; muted attribution below; confetti cluster (outlined circle, pink triangle, mint half-circle) balances the right; polka patch top-left behind the panel corner. No zigzag on this card.
  Motion: panel slams from the left, quote fades up, the word-circle pops `back.out(1.8)`, confetti staggers in, patch fades last.
- 评论: comment stickers — an 88px title top-left; three hard-shadow comment panels at staggered left offsets with alternating micro-rotations (±0.5-0.8°), each led by a geometric avatar bullet — solid pink circle, yellow triangle, outlined mint square — beside a 34px muted @handle stacked over a 54px one-liner; outlined circle, mint half-circle and polka patch balance the right edge. No zigzag on this card.
  Motion: title drops, cards slam down oversized (scale 1.5→1, power3) with 0.16 stagger like stickers stamped on, avatars pop `back.out(2)`, confetti staggers in, patch fades last.
- 步骤: an 88px title top-left; three geometric STATIONS at staggered heights marching left→right — an outlined circle, a solid pink triangle, a mint half-circle — each numbered in `--font-num` (paper-colored digit on the pink triangle) with a small hard-shadow label panel beneath; one `--accent-2` squiggle path snakes behind connecting all three; polka patch top-right.
  Motion: title drops, figures pop `back.out(1.8)` with stagger, label panels punch from the left, the connecting squiggle draws LAST as the flourish.
- 引导: a hard-shadow CTA panel left-of-frame holding a 136px two-line hook and the signature pill — `--accent` fill, `--paper` text, 4px `--fg` outline, `＋ 关注`; confetti burst (circle/triangle/half-circle) lands on the right AFTER the pill pops; zigzag underlines bottom-left; polka patch behind the panel.
  Motion: panel slams in, hook fades, pill pops `back.out(2)`, confetti bursts with stagger like thrown streamers, zigzag draws last.

## Compose-instruction crib
Embed directives like:
"孟菲斯波普风:奶白底散落粗描边几何纸屑——6px 深蓝描边空心圆、实心粉三角(clip-path)、薄荷半圆、波点补丁(radial-gradient 3px/30px)、黄色锯齿线;白面板必带 4px 深蓝描边 + 12px 无模糊硬黄偏移影,这是本主题签名,二者缺一不可;构图必须不对称,信息偏一侧、纸屑压另一侧;粉色每卡只填一个形状或一个胶囊,彩底上文字用奶白;文字不许压在波点/条纹补丁上;禁止渐变、柔和阴影、居中卡;动效 power3 滑入 + back.out 弹形状 + SVG 锯齿线最后 draw,1s 内全部落定。"

## Motion grammar
- Panels arrive with straight-line force (power3 slide from their off-side); confetti pops with `back.out(1.8-2)` stagger after the message lands.
- SVG squiggles and zigzags always draw last via `stroke-dashoffset` — the flourish that signs the card.
- No fades-in-place for shapes and no infinite loops; the whole burst settles within 1s.

## Cadence
- Party logic: every card is one confetti burst around ONE message; never two messages per card.
- Titles shout from a panel; numbers go raw and huge with geometry backing them; lists are stacked panels marching diagonally.
- Re-scatter the confetti on every card — same vocabulary, never the same arrangement twice; flip the cluster side each card.
- Keep one zigzag or squiggle per card at most; two wavy lines start to vibrate.
- CTA is a pink chip plus an arrow squiggle, still asymmetric, still shadowed hard.
