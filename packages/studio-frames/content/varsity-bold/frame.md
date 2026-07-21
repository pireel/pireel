---
id: varsity-bold
title: 竞技 Varsity
summary: 炭黑橙红:斜切巨号、对角条纹、比分对阵,适合健身/赛事/竞技解说
icon: 🏁
showcase: [标题卡, 大数字, 数字变化, 对比, 走势, 时间线, 步骤, 引导]
palette: { paper: "#101418", panel: "#1B222A", panel-2: "#141A21", fg: "#F5F7F8", muted: "#F5F7F899", accent: "#FF4D1F", accent-2: "#C7D3DC", line: "#F5F7F824", grid: "#F5F7F80E", radius: "6px", shadow: "0 18px 44px rgb(0 0 0 / 0.55)", glow: "0 0 36px rgb(255 77 31 / 0.45)" }
version: 0.1.2
---

# Varsity Bold — locker-room broadcast graphics

The design language is a STADIUM BROADCAST PACKAGE: charcoal night, blaze-orange strikes, and EVERYTHING skewed `skewX(-8deg)` — plates, type, tags — so the whole frame leans forward like a sprinter off the blocks. Giant hollow jersey numbers haunt the background, hazard stripes cut diagonals, and matchups read like a scoreboard. Fast, heavy, zero decoration that doesn't move the eye. No upright rectangles, no gentle fades, no pastel anything.

By default blocks are LOWER-THIRD GRAPHICS over the broadcast: the block root stays transparent, and each piece — a skewed title slab, a corner score bug, a stat tag with hazard stripes — carries its own charcoal `--panel` slab fill so the package still leans forward, broadcast-graphic scale that never blocks the athlete on camera. THE FULL BROADCAST FRAME — root carrying the charcoal `background:var(--paper)` edge to edge — cuts in only when a full-screen graphics scene is explicitly requested.

## Token semantics
- `--paper` charcoal is the arena dark; keep it moody and mostly empty — density lives in slabs.
- `--fg` chalk white is headline ink and the VS seam border; `--muted` is the loser's voice and every caption.
- `--panel` / `--panel-2` are the scoreboard slab surfaces (skewed rectangles, radius 6px, `--shadow`); `--panel-2` is the loser/secondary shade.
- `--accent` blaze orange is the WINNER voice: the deciding slab, the hazard stripes, the key stat chip. Text on accent uses `var(--paper)`. One orange statement per card.
- `--accent-2` steel is the jersey-number outline ink and secondary labels — never a background fill.
- `--glow` orange halo belongs to the winning slab only; `--shadow` grounds every other slab.
- `--line` and `--grid` stay almost invisible; this frame's structure comes from skew and stripes, not hairlines.
- Hollow jersey type = `color:var(--paper)` fill + `-webkit-text-stroke` in `--accent-2` (or `--accent` for the hero number), so it reads as an outline against the charcoal.

## Typography
- Headlines: `var(--font-head)` 140-160px weight 900, tracking -0.02em, inside a skewed slab (text inherits the skew — italic energy is the point, do not un-skew).
- Jersey numbers: `var(--font-num)` 600-720px weight 900, hollow stroke 6-8px, line-height 0.8, cropped at the frame edge.
- Tags/chips: `var(--font-num)` 36-40px weight 700, tracking 0.2em, UPPERCASE, on skewed `--accent` chips with `var(--paper)` text.
- Scoreboard values: `var(--font-num)` 200-260px weight 800 inside matchup slabs; slab captions 44px tracking 0.22em.
- Stat tiles: mono 130-140px value + 36px spaced caption.
- Smallest text 36px. No serif, no weights below 700, no lowercase Latin labels.
- Values use athletic notation: `4'32"`, `98`, `+12` — units live in the caption line, never inline with the number.
- Chinese headlines stay verb-first and under 6 characters (`把配速拉爆`) — commands, not descriptions.

## Structural motifs (reuse verbatim)
- Skew law: every plate/tag/headline wrapper carries `transform:skewX(-8deg);` (compose with translation as needed). Nothing in this frame stands upright.
- Hazard stripe band: `height:56px; background:repeating-linear-gradient(45deg, var(--accent) 0 28px, transparent 28px 56px);` — full-width (`left:-60px; right:-60px;`) diagonal energy bar above/below key content; a 32px-thin sliver variant tops stat cards.
- Ghost jersey number: hollow numeral pinned to a corner, half-cropped (`right:-80px; bottom:-80px;`), z-index under the slabs.
- Stat chip: skewed `--accent` rectangle, mono uppercase `var(--paper)` text (`ROUND 01`, `PERSONAL BEST`, `VO₂MAX`).
- Scoreboard tile: skewed `--panel` slab, mono value over a spaced muted caption, `--shadow`.
- VS seam: small skewed `--paper` box with `border:4px solid var(--fg)` and 84px mono `VS`, sitting on the joint between two slabs, above them in z-order.
- Winner slab: `background:var(--accent); color:var(--paper); box-shadow:var(--glow);` — always the right-hand side.
- Slam grammar (the only entrance family allowed):
  `tl.from(el,{x:-220,autoAlpha:0,duration:0.2,ease:'power3.out'})` and its mirrored `x:+220` twin; hazard bands wipe via `scaleX` from `transformOrigin:'left center'`; seams alone may `back.out(1.8)`.
- Pulse: `tl.to(winner,{scale:1.04,duration:0.1,yoyo:true,repeat:1})` — once per card, winner only.

## Block recipes
- 标题卡: ghost number `01` cropped at the top-right; an `--accent` chip (`TRAINING DAY — ROUND 01`) above a skewed `--panel` slab holding the 150px headline; hazard band across the bottom.
  Motion: slab slams from x-220 `power3.out` 0.2s, chip snaps after, hazard band wipes in via `scaleX` from the left, ghost number slides in last from the right.
- 大数字: hero hollow number `98` (≈620px, orange stroke 8px) center-left, skewed; an `--accent` chip `最大摄氧量 VO₂MAX` riding its lower edge; scoreboard tile bottom-right `+12 / THIS WEEK`; thin hazard sliver along the top.
  Motion: sliver wipes, number slams from x+220 0.22s, chip counter-slams from the left, tile pops from scale 0.6 — all inside 0.7s.
- 数字变化: 记分牌滚分 — thin hazard sliver on top, ghost number `07` cropped top-right; an `--accent` chip `NEW PERSONAL BEST` over a skewed `--accent` flip-board slab: giant mono value (≈320px, paper ink) rolling up to `145` via innerText snap, a paper seam line splitting the digits for the split-flap read, caption `卧推 1RM · KG` beneath (units never inline); a muted `--panel-2` scoreboard tile `138 / OLD PR` bottom-right as the beaten record.
  Motion: sliver wipes, slab slams x-260 `power3.out`, value rolls 0→145 (`snap:{innerText:1}`, 0.8s), chip counter-snaps, old-PR tile slams from the right, ghost slides in, and the winner slab fires the card's ONE 1.04 pulse when the roll lands.
- 对比: VS matchup board — left `--panel-2` slab (`上月 PACE 4'58"`, muted) and right `--accent` winner slab (`本月 PACE 4'32"`, paper text, `--glow`), both skewed, meeting at center; mono `VS` seam box on the joint; hazard band underneath.
  Motion: slabs slam from opposite sides 0.2s `power3.out`, seam scales in `back.out(1.8)`, winner slab fires ONE quick 1.04 pulse, hazard band wipes last.
- 走势: 成绩曲线 — an `--accent` chip (`PACE TREND — 8 WEEKS`) above a big skewed `--panel` chart slab (overflow hidden); inside: a steel `--accent-2` polyline rising left→right, the hazard-stripe band running along the slab's bottom edge under the line, and a hollow jersey data label (mono ≈220px, paper fill + 8px `--accent` stroke) pinned at the line's end, top-right.
  Motion: slab slams x-220 `power3.out`, chip snaps, hazard band wipes via `scaleX`, the line draws via `stroke-dashoffset` in 0.3s, jersey label slams in from the right last — all inside 0.82s.
- 时间线: 赛季周程 — chip kicker (`SEASON — WK 1-4`); a 32px hazard spine runs the full width with four skewed week slabs hanging under it, steel square markers pinning each slab to the line; every slab reads mono `WK n` / matchup word / mono `主场 HOME`|`客场 AWAY` tag; WK 3 is the `--accent` current week (paper text, `--glow`); ghost number `03` echoes the week, cropped bottom-right.
  Motion: chip snaps, spine wipes via `scaleX` from the left, slabs slam x-220 stagger 0.1 `power3.out`, markers drop y-40 onto the line, ghost slides in, the current week fires the card's ONE 1.04 pulse — done by 1.15s.
- 步骤: 训练三组 — chip kicker (`TRAINING PLAN — LEG DAY`), then three skewed slabs in a row each `SET n / 动作 / mono REPS`; SET 1 is the `--accent` slab (paper text, `--glow`), SETs 2-3 stay `--panel`; hazard band across the bottom.
  Motion: chip snaps, slabs slam from x-220 stagger 0.1 `power3.out`, the accent slab fires the card's ONE 1.04 pulse, hazard band wipes last; done by 0.78s.
- 引导: 号码牌 CTA — ghost jersey number `10` cropped at the bottom-right; an `--accent` chip `JOIN THE SQUAD` over a giant skewed `--accent` plate `+ FOLLOW` (mono 180px, paper text, `--glow`); hazard band underneath.
  Motion: plate slams x-260 `power3.out` and pulses once (1.04), chip counter-snaps, hazard band wipes, ghost number slides in from the right last.

## Compose-instruction crib
Embed directives like:
"体育竞技播报风:炭黑夜底,一切元素统一 skewX(-8deg) 前倾,禁竖直排版;巨型镂空球衣号码(纸色填充+钢灰/橙描边 6-8px)贴边裁切当背景;橙色一卡只用一次,给胜者板/危险条纹带/关键数据签,橙底字用纸色;对角危险条纹带 repeating-linear-gradient(45deg) 做能量分割;对比即比分对阵:左灰败者板右橙胜者板 + 中缝 VS 白框;动效 0.2s power3 对向硬撞入 + 胜者板一次 1.04 脉冲,禁弹跳禁超过 0.3s 的淡入。"

## Cadence
- One orange statement per card; steel and charcoal do the rest of the talking.
- Every entrance completes within 0.3s of its start; total card choreography under 0.8s — broadcast graphics never dawdle.
- Ghost numbers count up across the video (01, 02, 03…) like rounds; reuse the same crop corner per act.
- Keep at least one hazard element per card, but never two full bands in the same frame.
- Numbers escalate: ghost number → hero stat → final score; keep them physically bigger each act.
- Slams always arrive in opposed pairs (left slab / right slab, chip / number) so the frame feels contested.
- Comparisons always crown a winner — no neutral ties; the winner side is orange, right-handed, and pulses once.
- Hazard bands bracket acts: thin sliver to open a stat, full band to close a section.
- CTA is a chip + slab combo (`FOLLOW THE GRIND`), slammed in, never floating or centered politely.
- Sound-of-the-frame check: if a card wouldn't fit under an air-horn sting, it is too soft for this frame.
