---
id: y2k-chrome
title: 千禧 Y2K
summary: 银蓝气泡:椭圆环绕、星芒闪点、胶囊按钮,适合潮流/穿搭/音乐
icon: 💿
showcase: [标题卡, 金句, 引导, 大数字, 倒计时, 列表, 评论, 代码, 步骤]
palette: { paper: "#DCE9F5", panel: "#FFFFFF", panel-2: "#C3D9EE", fg: "#17244A", muted: "#17244A99", accent: "#2E63FF", accent-2: "#FF5EC4", line: "#17244A26", grid: "#17244A10", radius: "36px", shadow: "0 14px 34px rgb(23 36 74 / 0.22)", glow: "0 0 34px rgb(46 99 255 / 0.35)" }
version: 0.1.2
---

# Y2K — chrome-blue bubbles and orbit rings

The design language is EARLY-2000s CYBER POP: frosty silver-blue paper, glossy white bubbles with a single highlight dot, an electric-blue ORBIT ELLIPSE physically wrapping the headline, and ✦ sparkles scattered like lens glints.
Type is wide, italic, optimistic — the whole card feels like a skinned MP3-player UI.
Bubbly and airbrushed-clean, but built from flat tokens: no gradients, no chrome textures, just outlines, one glow, and round geometry.

By default blocks are SKINNED WIDGETS floating over the footage: the block root stays transparent, and each piece — a title bubble with its orbit ellipse, a corner counter capsule, a side player chip — carries its own glossy white or silver-blue fill with outline and highlight dot, widget-sized and never covering the speaker. THE FULL SKINNED SCREEN — root carrying the frosty silver-blue `background:var(--paper)` edge to edge — launches only when a full-screen designed scene is explicitly requested.

## Token semantics
- `--paper` icy blue is the atmosphere; keep it visible around every composition — a full-bleed panel kills the airiness.
- `--panel` white forms bubbles, capsules and chips; every bubble gets exactly ONE `--panel`-colored highlight dot near its upper-left (the gloss).
- `--panel-2` is the deeper bubble tone for background orbs; it never carries text.
- `--accent` electric blue draws the orbit ellipse, fills the CTA capsule, and owns `--glow`. Text sitting on an accent fill uses `var(--paper)`.
- `--accent-2` hot pink is ONLY for ✦ sparkles and one secondary ring — never body text, never a fill.
- `--muted` handles support lines and schedules.
- `--radius: 36px` minimum; capsules go full `999px`. Nothing in this system has a sharp corner, ever.
- `--glow` attaches to the orbit ring and the primary capsule ONLY — glow on everything reads as slop.

## Typography
- Headlines 130-320px, weight 900, ITALIC, with `transform: scaleX(1.15)` applied on an inline-block wrapper — the stretched-wide look is the signature.
- Never letter-space the italic headline; the stretch does the work.
- Kickers and labels 34-44px, weight 800, inside capsules, 0.1-0.24em tracking.
- Support lines 40-48px in `--muted`, 0.1em tracking.
- Attributions 34-38px in white capsule chips.
- Quotes 96-104px italic with a lighter `scaleX(1.08)`, centered inside their bubble.

## Structural motifs (reuse verbatim)
- Orbit ellipse (the emblem — wraps the headline or CTA):
  `border:4px solid var(--accent);border-radius:50%;transform:rotate(-12deg);box-shadow:var(--glow);`
  Size it ~40% wider than its content and ~55% as tall, absolutely centered over the content; the empty middle keeps the words readable.
- Secondary ring: same recipe with `border-color:var(--accent-2)`, no glow, rotated the other way (+6-8°), slightly larger, layered BEHIND.
- Sparkle: a text `✦` in `var(--accent-2)`, sizes 40-96px, 3-4 per card at asymmetric positions; exactly one sparkle may switch to `var(--accent)`.
- Bubble: `background:var(--panel-2);border-radius:999px;` circle with a child highlight dot:
  `background:var(--panel);border-radius:999px;width:22%;height:22%;top:16%;left:18%;`
- Double-outline capsule (the CTA):
  `background:var(--accent);color:var(--paper);border:6px solid var(--panel);box-shadow:0 0 0 4px var(--accent), var(--glow);border-radius:999px;`
  Outer blue line, white gap, blue fill — all three layers or it is not the Y2K button.
- White capsule chip: `background:var(--panel);border:3px solid var(--accent);border-radius:999px;color:var(--accent);` for kickers and attributions.
- Blink rule: sparkles may blink ONCE per card via a finite yoyo tween (`repeat:3`), settling fully visible.

## Block recipes
- 标题卡: kicker chip top-left; the ~158px stretched-italic headline center-left with the glowing orbit ellipse wrapped around it and the pink secondary ring behind at the opposite rotation; two `--panel-2` bubbles (with highlight dots) drifting on the right; 3 sparkles; a muted support line at bottom-left.
  Motion: chip drops, headline slides in wide (power3), rings scale-settle from 1.15, bubbles and sparkles pop with stagger, one sparkle blinks finitely.
- 金句: one huge white ellipse bubble (~1380×620, `--shadow`, elongated highlight) holding the quote; the pink ring peeks from behind its rim; attribution in a white capsule chip pinned below; sparkles at two opposite corners.
  Motion: bubble inflates with `back.out(1.4)`, ring settles, quote fades up, chip pops last, one sparkle blinks.
- 引导: the double-outline capsule CTA `＋ 关注` (~92px) pushed left-of-center, wrapped by the glowing orbit ellipse; four sparkles orbiting at staggered distances; a schedule line beneath in `--muted`; one bubble floating far right.
  Motion: capsule bounces in `back.out(1.7)`, ring settles around it, sparkles pop then two blink finitely.
- 大数字: a kicker chip top-center; the giant number (~290px, stretched-italic `scaleX(1.15)`) dead-center wrapped by the glowing orbit ellipse with the pink secondary ring behind at the opposite rotation; one bubble upper-right; a muted Latin+Chinese support line at bottom-center; 3 sparkles, one blue.
  Motion: chip drops, the number inflates `back.out(1.5)` from 0.5, rings settle from 1.15, bubble and sparkles pop, one sparkle blinks finitely.
- 倒计时: the millennium-bug clock — kicker chip top-center; `00:00:59` dead-center in stretched-italic `scaleX(1.15)` (~240px, colons in accent) wrapped by the glowing orbit ellipse with the pink secondary ring behind at the opposite rotation; one bubble upper-right; a muted Latin+Chinese support line bottom-center; 3 sparkles, one blue.
  Motion: chip drops, the clock inflates `back.out(1.5)` from 0.5, the seconds roll up via an innerText snap tween (0→59), rings settle from 1.15, then the whole clock glitch-jitters ONCE (x/skew finite yoyo, `repeat:3`) and lands clean by 1.2s; one sparkle blinks finitely.
- 评论: a Y2K instant-messenger window — one big rounded white pane (3px accent outline, `--radius` corners) with a title bar (`MSN · 千禧留言板`, two bubble buttons and a circled ✕) and three capsule messages alternating left/right like a chat log; the LAST message is set as the double-outline accent capsule with the gloss dot; a `+3 条新消息` toast chip bottom-right inside the pane; one bubble and 3 sparkles floating outside.
  Motion: the window inflates `back.out(1.4)`, messages pop in sequence with stagger, the gloss dot pops, the toast pops then blinks finitely like a new-message alert.
- 代码: a notepad source window — the same rounded white pane with a title bar (`记事本 · y2k_style.js`) holding four line-numbered code rows in `--font-num` (keywords in accent, comments in `--muted`); exactly ONE row is set as the double-outline accent capsule — the highlighted line — ending in a paper cursor block; kicker chip above the pane; one bubble and 3 sparkles outside.
  Motion: chip drops, window inflates, rows slide in with stagger, bubbles and sparkles pop, the cursor blinks finitely (yoyo `repeat:3`) and settles visible.
- 列表: a kicker chip top-left; three capsule ROWS at staggered left offsets — each a white capsule chip (3px accent outline, 56px fg text), except ONE hot row set as the double-outline capsule (accent fill, paper text, white gap + outer blue line + glow) carrying a small white highlight dot near its left like bubble gloss; one bubble upper-right; sparkles scattered.
  Motion: chip drops, rows inflate `back.out(1.6)` with stagger, the hot row's highlight dot pops, sparkles pop and one blinks.
- 步骤: three glossy `--panel-2` bubbles (each with the upper-left highlight dot) placed low-left → high-center → mid-right along a dotted accent arc (round-cap dashed SVG path), numbered 1/2/3 in stretched-italic inside; a white capsule chip label beneath each bubble; kicker chip top-left; sparkles fill the leftover corners.
  Motion: chip drops, the dotted arc fades in, bubbles inflate in path order with stagger, numbers pop, labels rise, one sparkle blinks finitely.

## Compose-instruction crib
Embed directives like:
"千禧 Y2K 风:冰蓝底 + 白色气泡,每个气泡左上角必有一颗白色高光点;标题一律斜体加 scaleX(1.15) 拉宽(套在 inline-block 上),外面套 4px 电光蓝椭圆环(border-radius:50%,rotate(-12deg),带蓝色 glow),粉色副环反向旋转垫在后面;✦ 星芒玫粉色散 3-4 颗、大小不一,至多一颗换成蓝色;按钮用双描边胶囊:蓝底白字 + 白色间隙 + 外圈蓝线 + glow;圆角最小 36px、胶囊全圆,禁止直角、禁止渐变;glow 只给主环和主按钮;动效充气感 back.out + 星芒有限次闪烁(yoyo repeat 3),1.2s 内定格。"

## Motion grammar
- Everything inflates: focal objects enter with `back.out` scale from ~0.5, rings settle DOWN from scale 1.15 like a lens focusing.
- Sparkles pop in stagger, then at most two blink via a finite yoyo tween (`repeat:3`), ending fully visible by 1.2s.
- Nothing slides linearly and nothing loops forever; the card ends in a glossy freeze-frame.

## Cadence
- Player-skin logic: one glossy focal object per card — headline in orbit, quote in a bubble, CTA in a capsule.
- Sparkles and rings carry the energy; never add a second message or a second glowing object to a card.
- Keep pink strictly decorative so blue stays the voice of the theme.
- Alternate focal position (left-anchored, centered, left-of-center) so consecutive cards drift like tracks changing.
- The CTA card is the album's last track: big capsule, one schedule line, nothing else competing.
