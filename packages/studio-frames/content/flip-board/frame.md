---
id: flip-board
title: 翻牌 Flipboard
summary: 起落牌翻板:字符逐格翻落、航班行、准点绿,适合盘点/榜单/行程叙事
icon: 🎴
showcase: [title-card, big-number, count-up, countdown, steps, compare, quote, cta]
palette: { paper: "#12151A", panel: "#1D2129", panel-2: "#171A20", fg: "#F4F1E8", muted: "#F4F1E899", accent: "#FFB300", accent-2: "#43D9A3", line: "#F4F1E824", grid: "#F4F1E80D", radius: "10px", shadow: "0 18px 44px rgb(0 0 0 / 0.5)", glow: "0 0 0 rgb(0 0 0 / 0)", font-num: "'IBM Plex Mono', ui-monospace, monospace" }
version: 0.1.2
---

# Flip Board — split-flap departure hall

The design language is a SPLIT-FLAP DEPARTURE BOARD (a Solari airport/rail board): a near-black terminal hall with faint ruled row lines, and every headline, number and status built from FLAP TILES — per-character (or per-word) cards split by a horizontal mid seam, top half lighter than the bottom, floating on a soft shadow. Chrome is airport idiom: a DEPARTURES header strip with an amber clock, mono column headers (FLIGHT / DEST / TIME / STATUS), amber destination text, and green ON TIME chips. Motion is the whole point: everything FLIPS into place — `rotationX` cards falling shut in waves along a row, rows cascading top to bottom like the board refreshing. Nothing fades in on its own, nothing bounces, nothing glows.

By default blocks are SINGLE DEPARTURE ROWS mounted over the footage: the block root stays transparent, and each piece — a title row, a corner counter, a status strip of flap tiles — brings its own short band of `--paper` wall so the tiles stay mounted, banner-scaled and never hiding the speaker. THE FULL BOARD WALL — root carrying `background:var(--paper)` with its ruled row lines edge to edge — is posted only when a full-screen board scene is explicitly requested.

## Token semantics
- `--paper` near-black hall wall with faint ruled board lines: `background-image:linear-gradient(var(--grid) 2px,transparent 2px); background-size:100% 108px;`
- `--panel` is the TOP half of every flap tile; `--panel-2` the shaded BOTTOM half; the 4px seam between them is `--paper` — the physical gap where the flap hinges. Tiles are the only panels this theme has.
- `--accent` amber owns destination letters, hero digits, the header clock/flight code, and delay states (DELAYED / CLOSING). `--accent-2` green owns confirmation only: ON TIME / GO / BOARD NOW chips — one green element per screen, never more.
- `--shadow` is a soft wide drop under every tile so flaps float off the wall; it never applies to text.
- `--glow` stays zero — a split-flap board is matte; nothing glows, ever.
- `--fg` warm off-white for glyphs and body; `--muted` for column headers, units, captions, footnotes; `--line` for the header rule and row separators (3px).
- `--radius` 10px belongs to tiles and chips only; the canvas and rows stay square.

## Typography
- Everything on the board speaks `var(--font-num)` mono, weight 700, UPPERCASE, tracking 0.14–0.3em on labels and chips.
- Hero flap glyphs: 240–320px inside tiles; digit tiles 280px in `--accent`.
- Headline word-flaps 150px; departure rows 46–52px; column headers 32px; chips 34px; captions/footnotes 34–38px. Smallest text 32px.
- Quote lines may switch to `var(--font-head)` 88px weight 900 inside full-width flap cards — the one non-mono voice, reserved for the PA announcement.
- Numbers are board data: `20:00`, `GATE 24`, `PR-101`, `+42%` — zero-padded, fixed-width, never humanized (`8.6万` is forbidden; the board would show `86400`).
- No italics anywhere; a split-flap has no slant.

## Structural motifs (reuse verbatim)
- Flap tile (per character or per word — real Solari boards have both):
  `display:flex;align-items:center;justify-content:center;font-weight:700;white-space:nowrap;border-radius:var(--radius);box-shadow:var(--shadow);background:linear-gradient(180deg,var(--panel) 0,var(--panel) calc(50% - 2px),var(--paper) calc(50% - 2px),var(--paper) calc(50% + 2px),var(--panel-2) calc(50% + 2px),var(--panel-2) 100%);`
  Amber variant just colors the glyph `var(--accent)` — destinations and hero digits.
- Status chip: `padding:12px 32px;border:3px solid var(--accent-2);border-radius:var(--radius);color:var(--accent-2);font-size:34px;font-weight:700;letter-spacing:0.14em;` — the amber variant swaps border and color to `var(--accent)` for DELAYED / CLOSING.
- Board header strip: `left/right 90px`, DEPARTURES-style label left, amber clock or flight code right, `border-bottom:3px solid var(--line)`.
- Departure row: `display:grid;grid-template-columns:300px 1fr 260px 340px;gap:40px;` under a muted mono column-header row (FLIGHT / DEST / TIME / STATUS); the DEST cell reads in `--accent`; rows separated by `3px solid var(--line)`.
- Flip grammar (the ONLY entrance family allowed):
  `tl.from(el,{rotationX:-90,transformPerspective:900,transformOrigin:'center center',autoAlpha:0,duration:0.2,ease:'power2.out'})`
  Per-tile waves add `stagger:0.04-0.07` so the flip runs along the row; departure rows cascade top→bottom with `stagger:0.12`; anything that cannot flip rides inside something that does.
- Rolling counter: an innerText tween inside ONE tile — `tl.from(tile,{innerText:0,snap:{innerText:1},duration:0.7,ease:'power1.out'})` — optionally with a small `rotationX:-14,duration:0.07,yoyo:true,repeat:1` jitter mid-roll so the flap looks like it is clacking through values.
- Chip flick: `tl.to(chip,{autoAlpha:0,duration:0.08,yoyo:true,repeat:3,ease:'steps(1)'})` — finite repeats, ENDS VISIBLE, at most one flicking chip per screen.

## Block recipes
- title-card: header strip (`出发 DEPARTURES` / amber `FLIGHT PR-101`) → muted `目的地 DEST` cap → the headline as two amber word-flap tiles (150px) → a 44px mono subline → a bottom `GATE 24 · 20:00` + green ON TIME chip.
  Motion: strip flips in, cap flips, headline tiles flip in a wave (stagger 0.07), subline flips, footer flips, chip flicks ×finite ending visible by 1.17s.
- big-number: giant amber digit flap-tiles (250×400px, 280px glyphs) center stage; muted mono cap above (`本月新增粉丝 NEW FOLLOWERS`); footer pairs a green record chip with a muted `+42%` delta note.
  Motion: strip, cap, then digits flip left→right stagger 0.06 like the board updating, footer flips, chip flicks finite.
- count-up: one wide amber flap tile whose number ROLLS — innerText snap 0→86400 over 0.7s — with a small rotationX jitter mid-roll (the flap clacking); cap `本周播放 VIEWS`; footer shows a green `+240%` chip and yesterday's figure for scale.
  Motion: tile flips in, number rolls up, jitter at midpoint, footer flips last; the roll is the star — no chip flick here.
- countdown: FINAL CALL screen — header `最后登机 FINAL CALL` / amber `GATE 24`; `时间 TIME` cap; one giant amber flap tile counting DOWN (innerText 60→10) with a muted `SEC` unit under it; footer pairs an amber CLOSING chip with the deadline line.
  Motion: tile flips in, seconds roll down, unit flips, footer flips, the amber chip flicks finite ending visible — the countdown is the only card where a number rolls down.
- steps: three departure rows as legs of ONE journey under the four column headers — `LEG 1 已完成 DONE`(dimmed) / `LEG 2 进行中 GO`(green chip, the active leg) / `LEG 3 候机 HOLD`(muted dest); times advance 09:00 → 14:30 → 20:00.
  Motion: headers flip, rows cascade top→bottom stagger 0.12, the GO chip flicks finite — exactly one green, exactly one active leg.
- compare: two rows, SAME destination, different status — `PLAN A` delayed amber and dimmed, `PLAN B` on-time green with a green destination; a muted verdict line at the bottom calls the winner.
  Motion: headers flip, both rows cascade, verdict flips, the winner's ON TIME chip flicks finite.
- quote: PA announcement — header `广播 ANNOUNCEMENT` / `PA SYSTEM`; the sentence flips in as two FULL-WIDTH flap cards in `var(--font-head)` 88px (a word-marquee flap), attribution line muted below.
  Motion: line one flips shut, line two follows 0.27s later, attribution flips last — whole-card flips, no per-character dicing of the quote.
- cta: boarding call — cap `现在登机 NOW BOARDING`; two amber word-flap tiles as the call to action; a `GATE ❤ · SEAT` row beside a green BOARD NOW chip; muted schedule footnote (`每周三班`).
  Motion: cap flips, tiles flip in a wave, gate row flips, chip flicks finite ending visible — boarding idiom, never a web button.

## Compose-instruction crib
Embed directives like:
"起落牌翻板风:近黑候机厅底 + 108px 横向行线;所有标题/数字/状态都做成翻牌格——上半 panel 下半 panel-2、中缝 4px paper、圆角 10px、软投影浮起;字体全等宽大写宽字距,数字永远板面格式(20:00/GATE 24/+42%);琥珀色只给目的地/时钟/延误态,准点绿只给状态 chip 且一屏一处,两色绝不同元素;信息行=出发四栏格(航班/目的地/时间/状态),行间 3px 细线;动效只许翻:rotationX -90→0 + transformPerspective 900 + power2.out 0.2s,逐格 stagger 0.04-0.07 波浪、行自上而下 0.12 级联,计数用格内 innerText snap 滚动可带小角度抖动;chip 可 steps(1) 有限次抖闪但必须停在可见帧;禁纯淡入禁弹性禁发光,1.2s 内全部落定。"

## Cadence
- The header strip opens every card; the clock only moves forward across a video, card to card.
- Counts only flip forward — a number never rolls down except on the countdown card.
- One green element per screen (a chip or the winner's destination); everything else is amber, white or muted.
- Amber = data and destinations; green = confirmation; the two never touch the same element.
- Everything enters by flipping; if it cannot flip, it rides inside something that does — pure fades are forbidden.
- At most one flicking chip per card, always finite repeats, always ending visible.
- Rows cascade top to bottom like the board refreshing; never bottom-up, never all at once.
- Steps are legs of one journey: exactly three rows, exactly one GO at a time; done legs dim, future legs mute.
- The CTA is boarding idiom — NOW BOARDING, GATE ❤, BOARD NOW — never a rounded web button.
- If a card feels empty, add board facts (gate number, flight code, clock time) — never decorative shapes.
