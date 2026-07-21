---
id: manga-panel
title: 漫画 Manga
summary: 白纸墨线:分镜格、速度线、对话泡、网点,适合吐槽/剧情/反转叙事
icon: 💥
showcase: [标题卡, 金句, 评论, 对比, 问答, 步骤, 大数字, 引导]
palette: { paper: "#FFFFFF", panel: "#FFFFFF", panel-2: "#F0F0F0", fg: "#101010", muted: "#10101099", accent: "#FF3355", accent-2: "#101010", line: "#10101040", grid: "#10101014", radius: "4px", shadow: "6px 6px 0 rgb(16 16 16 / 0.18)", glow: "0 0 0 rgb(0 0 0 / 0)" }
version: 0.1.2
---

# Manga — ink panels, speed lines, one red stamp

The design language is a BLACK-AND-WHITE MANGA PAGE: white paper, heavy 6px ink panel borders laid at slightly irregular sizes and angles, screentone halftone patches, radial speed lines slicing panel corners, and speech bubbles with tails.
Everything is ink on paper — the ONLY color is `--accent` red, allowed at most ONCE per card as an editor's stamp or shout.
Energy comes from line weight and tilt, never from color, softness, or gradients.

By default blocks are FLOATING PANELS AND BUBBLES inked over the footage: the block root stays transparent, and each piece — a title banner, a speech bubble with tail, a small bordered panel with screentone — carries its own white paper fill inside its 6px ink border so the inkwork reads, panel-sized and never covering the speaker. THE FULL MANGA PAGE — root carrying `background:var(--paper)` edge to edge — is drawn only when a full-page spread is explicitly requested.

## Token semantics
- `--paper` and `--panel` are the same white on purpose: a panel is defined by its INK BORDER, not by a fill difference.
- `--panel-2` light grey fills quiet caption boxes only; it is not a shadow and not a background wash.
- `--fg` ink does everything: borders, text, speed lines, halftone dots, and inverted panels (`background:var(--fg);color:var(--paper)`).
- `--accent-2` is a second ink alias — treat it as black; never look for a second color in this system.
- `--accent` red appears 0-1 times per card: a bordered stamp tag, a circled word, or one SFX stroke. Two reds on one card breaks the system.
- Emphasis without red = the inverted panel (ink plate, paper text) or a bigger SFX — reach for those first.
- `--radius: 4px` near-square; `--shadow` is a subtle hard offset for lifted panels; `--glow` stays zero.
- No transparency theatrics — ink is opaque; tone is faked with halftone dots, not alpha.

## Typography
- Titles and dialogue 96-150px, weight 900, tight 1.15-1.2 line-height, in `--fg`. The boldness is the brush; no serifs, no thin weights.
- SFX word: giant type (160-360px) with `color:var(--paper); -webkit-text-stroke:12-16px var(--fg);` rotated −3° to −8°, allowed to overlap panel borders.
- Panel kickers sit in a small ink box: `background:var(--fg);color:var(--paper);padding:12px 30px;` at 38-44px with 0.12em tracking.
- Captions, attributions, panel numbers 32-40px in `--muted`.
- Labels inside inverted panels use `var(--paper)` and keep the same weights — inversion changes ground, not voice.

## Structural motifs (reuse verbatim)
- Ink panel:
  `background:var(--panel);border:6px solid var(--fg);border-radius:var(--radius);box-shadow:var(--shadow);transform:rotate(±0.8-2deg);`
  Never perfectly straight, never equal-sized siblings — one panel dominates, the other yields.
- Speed-line patch (clip it into a panel corner):
  `background:repeating-linear-gradient(65deg,var(--fg) 0 3px,transparent 3px 26px);clip-path:polygon(0 0,100% 0,0 100%);`
  Mirror with `transform:scaleX(-1)` for right-side corners; on ink panels swap the gradient ink to `var(--paper)`.
- Halftone screentone: `background-image:radial-gradient(var(--fg) 2.4px,transparent 2.4px);background-size:18px 18px;` on a patch slipped behind or beside a panel edge.
- Speech bubble: white ellipse `border:5px solid var(--fg);border-radius:50%;` plus a tail —
  a rotated square with two inked sides: `background:var(--panel);border-right:5px solid var(--fg);border-bottom:5px solid var(--fg);transform:rotate(35deg);` overlapping the rim.
- Red stamp (the one red): `border:5px solid var(--accent);color:var(--accent);background:var(--panel);transform:rotate(±7-8deg);padding:12px 32px;font-weight:900;`
- Lightning divider: an SVG jagged polyline running the seam between clashing panels —
  outer stroke `var(--fg)` width ~26 plus an inner casing stroke `var(--paper)` width ~10 on the same points, both drawn via `stroke-dasharray`.
- Inverted panel: `background:var(--fg);color:var(--paper);` same 6px border — the loudest non-red emphasis available.

## Block recipes
- 标题卡: one dominant ink panel rotated −0.8° holding an ink-box kicker (`第 1 格 · 开场`) and the ~142px title; a speed-line patch cuts the panel's top-right corner; a halftone patch leans out from the lower-left; a `!?` SFX in paper-fill/ink-stroke overlaps the panel border; the single red stamp (`吐槽注意`) tilts over the top edge.
  Motion: panel snaps in (power3), speed lines wipe, title rises, SFX slams with power3.in scale, stamp punches last.
- 金句: a giant speech bubble (~1420×600 ellipse) centered-high with its tail pointing lower-left, quote at 96px weight 900 inside; halftone patch bottom-left, speed lines top-right, a small `!!` stroke-SFX upper-right; muted attribution (`—— 内心 OS`) under the tail. No red on this card.
  Motion: bubble pops `back.out(1.5)`, tail after, quote fades, tones fade, SFX slams.
- 评论: a danmaku panel — one dominant ink panel (ink-box kicker `第 8 格 · 弹幕来袭`) with a speed-line patch cutting its top-right corner; THREE comment speech bubbles (5px ink ellipses with rotated-square tails, each tilted 1-2°) crash into the panel one after another, the third INVERTED (ink plate, paper text) as the impact bubble; a halftone patch leans out from the lower-left. No red on this card.
  Motion: panel snaps in, speed lines wipe, kicker snaps, bubbles slam `power3.in` from scale 1.7 with stagger like thrown rocks, halftone fades last.
- 对比: two clashing panels — left white panel rotated −1.2° (`改造前` + 150px verdict) vs right INVERTED panel rotated +1.2° (`改造后`, paper text, paper speed lines) — split by the lightning divider drawn down the seam; the single red stamp `反转` sits on the bolt.
  Motion: panels shove in from opposite sides, bolt strokes draw in 0.4s, tone patches fade, stamp punches in last.
- 问答: a Q&A spread — left white Q panel rotated −1.2° (ink-box kicker `Q · 读者提问`, ~104px question, a `ざわ…ざわ…` murmur caption pinned low) with a giant ？ SFX (paper fill, 13px ink stroke) overlapping its right edge; the right INVERTED A panel page-flips in on a left hinge (`rotationY` from −92 with perspective) revealing the answer in paper text under an inverted kicker; the single red stamp `真相!` punches on the seam last.
  Motion: Q panel shoves in, question rises, the ？ slams `power3.in`, murmur fades, the A panel flips open like a turned page, stamp punches last.
- 步骤: a 四格漫画 spread — four unequal ink panels each tilted ±1-1.6°: panels 1-3 carry ink-box numbers ①②③ plus an 84px step line, with a speed-line patch cutting panel 1's corner and a halftone patch leaning on panel 3; the LAST panel holds only speed lines and a giant `完!` SFX (paper fill, 13px ink stroke) overlapping its border. No red on this card.
  Motion: panels shove in from alternating sides/bottom like cuts, number boxes snap, tone patches fade, the SFX slams `power3.in` last.
- 大数字: the number itself is the SFX — ~420px, paper fill with a 16px ink text-stroke, rotated −4°, slamming over a large halftone patch; ink-box kicker top-left, muted caption bottom-left, speed lines cutting the top-right corner; the single red stamp punches beside the number.
  Motion: tones fade first, kicker snaps, the number slams `power3.in` from scale 1.8, caption fades, red stamp punches last.
- 引导: a speech-bubble CTA — white ellipse (5px ink border) holding `关注看下回` at 132px with its rotated-square tail pointing lower-left; a `つづく` corner tag in INVERTED ink (fg plate, paper text, 0.2em tracking) bottom-right as the next-issue teaser; speed lines top-right, halftone bottom-left. No red.
  Motion: bubble pops `back.out(1.5)`, tail snaps after, text fades up, tones fade, the つづく tag slams `power3.in` last.

## Compose-instruction crib
Embed directives like:
"黑白漫画分镜风:白纸 + 6px 粗墨线分镜格,格与格大小不等、各歪 1-2°,禁止整齐网格;速度线用 repeating-linear-gradient(65deg, 墨 0 3px, 透明 3px 26px) 配三角 clip-path 裁进格角,墨底格里把线换白;网点用 radial-gradient 2.4px/18px 补丁贴格边;对话泡=白椭圆 5px 墨边 + 旋转方块尾巴压住泡沿;拟声词超大号、白字填充 + 12-16px 墨描边、旋转出格;红色全卡至多一处(红章/红圈/一个 SFX),没有红也成立;强调优先用反白格(墨底白字)而不是颜色;动效硬切:格子对撞式滑入、闪电线 stroke draw、红章最后盖下,禁止弹性渐变和柔光。"

## Motion grammar
- Cuts, not tweens: panels shove in with hard power3 slides from opposite sides; tone patches snap-fade; nothing eases gently.
- SFX and stamps land with `power3.in` scale-down (1.7-1.9 → 1) — the impact frame of the card, always last or second-to-last.
- The lightning bolt draws via `stroke-dashoffset` in ~0.4s; the full card freezes within 1.2s like a printed page.

## Cadence
- Page logic: each card is one beat of the strip — setup panel, reaction bubble, clash spread — in that narrative order.
- Alternate quiet cards (one panel + a tone patch) with loud cards (SFX + speed lines) so the slams keep their punch.
- The red stamp is the editor's voice: spend it on the twist card, skip it everywhere else.
- Tilt direction should flip between consecutive cards, like panels fighting across the gutter.
- CTA reads as a next-issue teaser box (`下回预告`), inverted ink, no red.
