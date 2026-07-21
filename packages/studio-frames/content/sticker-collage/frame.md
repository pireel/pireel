---
id: sticker-collage
title: 贴纸 Sticker
summary: 校园贴纸拼贴:浅灰纸面上白边裁切贴纸、荧光笔高亮、半调星爆,黑色只做小标签,主体人也抠成贴纸
icon: ✂️
showcase: [标题卡, 大数字, 列表, 步骤, 对比, 金句, 评论, 引导]
palette: { paper: "#F5F5F7", panel: "#FFFFFF", panel-2: "#0C0C10", fg: "#1D1D1F", muted: "#1D1D1F99", accent: "#1FE0FF", accent-2: "#FF52D9", line: "#1D1D1F1F", grid: "#1D1D1F0D", radius: 28px, shadow: "0 16px 40px rgb(29 29 31 / 0.16)", glow: "0 0 0 rgb(0 0 0 / 0)" }
personFx: { stroke-style: solid, stroke-width: 46, stroke-color: "#FFFFFF", person-front: true }
version: 0.1.2
---

# Sticker Collage — die-cut sticker sheet over a clean campus-store page

The design language is a STICKER SHEET laid over a clean, cool-gray store page: THE PAGE STAYS LIGHT — the paper background must dominate every screen. Everything on it is either a DIE-CUT STICKER (white-filled, or accent-filled with a thick white rim; soft shadow, slightly tilted), a HIGHLIGHTER MARK swiped across the key word, or a SMALL BLACK LABEL (capsule tags, index dots). Black is a seasoning, never a background: at most ONE black die-cut board per piece (the quote card), and it floats on paper as a sticker with a white rim — never a full-bleed plate. The SPEAKER IS A STICKER TOO — this frame ships a person-fx recommendation (thick solid white outline, person on top) so the matted speaker gets the same white die-cut rim as every graphic; person and graphics read as one sheet. Composition is collage: elements sit at small tilts (−4°…5°, signs alternating), overlap a little, and land with a slap. The page itself stays calm — the stickers carry all the energy.

By default blocks are PEELED STICKERS over the footage: the block root stays transparent — the live shot stands in for the page — and every die-cut piece (title sticker, capsule tag, highlighter-marked keyword, one small black label) carries its own white fill or thick white rim plus soft shadow so it reads slapped onto the video, sticker-sized and never plastering over the speaker. THE FULL STORE PAGE — root carrying `background:var(--paper)` full-bleed with the speaker re-entering as a matted sticker (personFx) on it — is laid down only when a full-screen page scene is explicitly requested.

## Token semantics
- `--paper` cool light gray, the store page. It stays EMPTY — no grids, no texture; whitespace is part of the look.
- `--panel` is BOTH the sticker fill and the die-cut rim color. A colored/black sticker gets its rim via `border: 12px solid var(--panel)`; a white sticker separates from the page by `var(--shadow)` alone.
- `--panel-2` near-black: mini label capsules, index dots, and at most one black die-cut board per piece. White type on it. Never fill large areas or the background with it.
- `--accent` highlighter cyan: the marker swipe behind key words, sticker fills, active states. It is a MARKER, not a fill — never paint a whole card with it.
- `--accent-2` neon pink: halftone starbursts, the savings/like badge, one loud word per screen at most.
- `--muted` for the gray half of every headline pair (see Typography); `--line` for hairline separators inside white stickers; `--shadow` under every sticker; `--glow` stays zero — nothing glows, this is paper.
- Halftone texture (the sticker-print feel) = `background-image: radial-gradient(var(--panel-2) 20%, transparent 21%); background-size: 10px 10px;` over an accent fill — use it on doodles (starbursts), never on text containers.

## Typography
- Headlines `var(--font-head)` weight 800-900, tight. On the black plate: white, 96-150px. On paper: `--fg`.
- THE SIGNATURE PAIR: every section lead is `<b class="mk">key phrase。</b><span>calm gray rest。</span>` — marked words in fg on a cyan marker block, the rest in `--muted` at the same size. One pair per screen.
- Mini label stickers (`开箱 UNBOX`, `STEP 1`): 30-34px weight 700, tracking 0.14em, white on `--panel-2`, radius 999px.
- Hero numerals 300-420px weight 900 in `--fg` inside a white sticker; prices/data may keep latin digits large and units small.
- No italics, no outlines-as-text, no gradient text. CJK headline words stay ≤8 characters.

## Structural motifs (reuse verbatim)
- Die-cut sticker (colored or black fill): `border:12px solid var(--panel); border-radius:28px; box-shadow:var(--shadow);` plus a tilt `transform:rotate(-3deg)`. White-filled sticker: same radius/shadow, NO border.
- Highlighter mark: `.mk{background:var(--accent); padding:2px 18px; box-decoration-break:clone;}` — swiped on via `scaleX` from `transform-origin:left`.
- Colored die-cut sticker: `background:var(--accent)` (or `--accent-2`) + `border:10px solid var(--panel); border-radius:26px; box-shadow:var(--shadow);` — the loud sibling of the white sticker; one or two per screen as accents (labels, the winning side of a comparison, STEP highlights).
- Black die-cut board (quote card only): same rim recipe with `--panel-2` fill, floating tilted on paper with generous margins — a blackboard STICKER, not a background plate.
- Halftone starburst: 16-point star `clip-path:polygon(50% 0%,59% 35%,95% 6%,66% 41%,100% 50%,66% 59%,95% 94%,59% 65%,50% 100%,41% 65%,5% 94%,34% 59%,0% 50%,34% 41%,5% 6%,41% 35%)` filled `--accent-2` + the halftone dots; a short word may sit inside, white, rotated with the star.
- Index dot: 64-84px circle, `--panel-2` fill, white numeral, white 6px rim + shadow — a mini sticker.
- Doodle arrows between steps: inline SVG dashed path in `--fg`, `stroke-dasharray:2 14`, `stroke-linecap:round`, hand-flick curve, drawn via dashoffset.
- PERSON STICKER (frame-level, not a block): mounting this frame applies `personFx = solid white stroke, width 46/100, person on top` to the matted speaker. Blocks must RESPECT the person: leave the speaker's area open, tilt content away, never place a white sticker flush behind the person (rim-on-rim mushes) — let paper or the black plate back them.
- Slap grammar (the only entrance family): `tl.from(el,{scale:0.6,rotation:'-=8',autoAlpha:0,duration:0.3,ease:'back.out(1.7)'})` for stickers, stagger 0.08-0.12; `.mk` sweeps `scaleX:0→1, transform-origin:left, 0.25s power3.out`; starbursts pop LAST `scale:0, back.out(2), 0.26s`. No fades-only, no infinite loops, everything still by 1.2s.

## Block recipes
- 标题卡: a big WHITE die-cut sticker (tilted −2°) carrying the 130px headline and a muted sub line; a black mini label capsule (`开箱 UNBOX`) overlapping its top-left corner; one pink accent sticker (`第一期`) breaking the opposite edge; the signature pair `mk(第一件。)+muted(就把预算打醒。)` on paper below; one pink starburst; paper stays visibly open around everything.
  Motion: plate slides y-40, label slaps, headline slaps, mk sweeps, starburst pops last by 1.1s.
- 大数字: one big white sticker (tilt −3°) with a mono-weight 380px price, small unit beside; a black mini sticker (`教育价 EDU PRICE`) pinned to its top-left corner at +4°; the note line below gets the cyan mk on the savings claim; pink starburst tucked behind the sticker's right edge.
  Motion: sticker slaps, digits count up (plain-object innerText tween), label slaps, mk sweeps, burst pops.
- 列表: three white sticker STRIPS stacked, tilts −2°/+1.5°/−1°, each = index dot + 64px item text; a small black label sticker titles the stack.
  Motion: strips slap in stagger 0.12 from alternating x offsets; dots land with each strip; nothing blinks.
- 步骤: three square-ish stickers in a row (STEP 1/2/3 mini caps + a 64px verb phrase), joined by dashed doodle arrows; the ACTIVE step is the black sticker with white type + cyan mk under its phrase, others white with `--muted` caps.
  Motion: stickers slap left→right stagger 0.14, arrows draw via dashoffset between landings, mk sweeps on the active step last.
- 对比: two big stickers side by side, tilts mirrored: left white with `--muted` tag + plain price; right BLACK with white tag + price and the cyan mk under its verdict word; a pink halftone starburst (`省 750`) pinned across the right sticker's corner.
  Motion: left slaps, right slaps harder (scale 0.5), mk sweeps, burst pops last and stays.
- 金句: the one BLACK die-cut board of the piece — `--panel-2` fill with the white sticker rim, tilted, floating centered on paper with generous margins; 100px two-line quote in white, ONE phrase carried on the cyan mk (fg ink on it); a cyan `"` sticker overlaps its top-left; attribution mini capsule on paper above.
  Motion: plate slides y+40, lines slap in sequence, marks sweep one after another, quote-mark sticker settles with rotation.
- 评论: chat-bubble stickers on paper — white die-cut bubbles (one corner pinched to 6px radius as the tail), each with a black handle pill (`@开学搭子`) and a 56px message; the reply bubble is BLACK with white text; a small pink starburst acts as the like mark on the loudest bubble.
  Motion: bubbles slap in conversation order stagger 0.14 from alternating sides, pills land with their bubble, burst pops last.
- 引导: one huge white PILL sticker (radius 999px, tilt −2°) with `关注,不迷路。` — cyan mk swiped under 关注; a black mini sticker (`每周三更新`) pinned at +4°; a pink starburst (`FOLLOW`) breaking the pill's edge.
  Motion: pill slaps, mk sweeps, mini slaps, burst pops by 1.05s and everything holds.

## Compose-instruction crib
Embed directives like:
"校园贴纸拼贴风:冷灰纸面留白,一切元素都是贴纸——彩色/黑底贴纸走 12px 白描边+圆角 28+软阴影+±4° 微倾,白贴纸只靠阴影分离;关键词用青色荧光笔块(mk 扫入,scaleX 从左),句式=荧光词+灰色后半句;黑色撕边板块承载大标题,撕口下衬青色条;星爆贴纸用粉色半调网点(黑点 10px 网格),一屏最多一枚,最后 pop;步骤/列表=贴纸条+黑圆号码贴+虚线涂鸦箭头;主体人已由主题抠像加白描边(person-front),构图给人留位,别拿白贴纸贴脸;动效=贴纸 back.out 拍上来+荧光笔扫过,1.2s 内全部停稳,禁循环禁发光。"

## Cadence
- The person IS a sticker: the white speaker rim comes from the frame's person-fx — graphics never redraw or imitate it, they match it (same white, same softness of shadow).
- One cyan mk pair and at most one pink element per screen; cyan marks words, pink marks ONE moment.
- Tilt signs alternate across neighboring elements; never two stickers tilted the same way side by side.
- The black die-cut board appears on the quote screen only — every other screen stays on open paper with white/colored stickers.
- Whitespace is content: at least a third of the paper stays empty; if a screen feels bare, add a mini label sticker, never a texture.
- Starburst pops LAST on every screen that has one, and holds.
- Numbers live inside white stickers; black stickers carry labels and verdicts, not data.
- Rim-on-rim is forbidden: a white-rimmed sticker never sits flush on another white sticker or on the speaker.
- CTA is the pill sticker idiom (`关注,不迷路。`) — never a flat button, never underlined links.
