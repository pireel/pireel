---
id: scrapbook-tape
title: 手帐 Scrapbook
summary: 牛皮纸拼贴:胶带、白框照片卡、便签手写线,适合日常记录/旅行/好物
icon: 📎
showcase: [title-card, list, quote, comments, steps, timeline, big-number, cta]
palette: { paper: "#F3EBDD", panel: "#FFFFFF", panel-2: "#F6E7A9", fg: "#37302A", muted: "#37302A99", accent: "#E4572E", accent-2: "#4C9F70", line: "#37302A2E", grid: "#37302A12", radius: "4px", shadow: "0 10px 24px rgb(55 48 42 / 0.28)", glow: "0 0 0 rgb(0 0 0 / 0)" }
version: 0.1.2
---

# Scrapbook — kraft collage, tape-pinned memories

The design language is a HANDMADE SCRAPBOOK PAGE: warm kraft paper, white polaroid cards, translucent washi tape and sticky notes, all pinned down slightly crooked.
Nothing aligns to a grid on purpose — every element is rotated 1-6° and overlaps a neighbor, like objects physically glued onto a page.
No centered hero layouts, no clean rounded cards, no gradients, no glow; the charm is imperfection plus one real drop shadow under every piece of lifted paper.

On footage the collage is TAPED OBJECTS, not the page: the block root stays transparent — the live shot stands in for the kraft page, and every polaroid, note and tape strip carries its own paper fill and drop shadow so it reads physically glued onto the video. Never paint a full kraft `--paper` background behind the pieces to fake the page. The full kraft page comes out only as a scene card, when a full-screen designed scene is explicitly requested.

## Token semantics
- `--paper` is kraft — leave large areas exposed; it is the page everything is taped onto. Never cover it edge-to-edge with a single panel.
- `--panel` is polaroid white. A card ALWAYS carries `box-shadow: var(--shadow)` and a rotation; a flat, unrotated white card breaks the system.
- `--panel-2` is sticky-note yellow, reserved for notes and checklists. Never use it as a page background or a text color.
- `--accent` warm orange is the hand of the writer: crooked underlines, checkmarks, one highlighted word, the oversized quote mark — at most two touches per card.
- `--accent-2` green is TAPE ONLY: a solid `var(--accent-2)` strip at `opacity: 0.75`. Never use green for text or fills.
- `--muted` handles captions, dates and struck-through done-items.
- `--radius: 4px` — paper corners, not pills. Anything rounder than 4px reads as plastic, not paper.
- `--glow` stays zero; all depth comes from `--shadow` under lifted paper.

## Typography
- Headlines 110-150px, weight 800-900, default sans stack, slight negative tracking (−0.01em).
- Headlines live INSIDE cards or notes — never floating raw on kraft; raw kraft text looks unglued.
- Body and checklist text 52-60px, weight 600, ink `--fg`.
- Polaroid captions 32-38px in `--muted` with 0.15-0.2em tracking, centered in the thick bottom margin of the card.
- Sticky-note labels (dates, page numbers, series names) 36-52px, weight 800, rotated together with their note.
- One keyword per card may carry the crooked accent underline; do not underline whole sentences.

## Structural motifs (reuse verbatim)
- Washi tape strip (pins a corner or a note top):
  `.tp{position:absolute;width:250px;height:66px;background:var(--accent-2);opacity:0.75;border-radius:var(--radius);}`
  Rotate −45° to −30° over a top-left corner, +30° to +45° over a top-right corner, or −3° horizontally across a sticky-note top edge.
- Polaroid card:
  `background:var(--panel);border-radius:var(--radius);box-shadow:var(--shadow);padding:44px 44px 120px;transform:rotate(±2-4deg);`
  The thick bottom padding IS the polaroid frame; the caption sits in it, absolutely positioned near the bottom edge.
- Photo window inside a polaroid: a `background:var(--paper);` block filling the padded area — kraft shows through as the "photo".
- Sticky note: `background:var(--panel-2);box-shadow:var(--shadow);transform:rotate(±2-6deg);` square-ish, with a tape strip at its top edge.
- Crooked hand underline: `height:6px;background:var(--accent);transform:rotate(-1deg);`
  Build it as a real child element so GSAP can draw it (`scaleX` from 0, `transformOrigin:'left center'`) — never as a pseudo-element if it animates.
- Checklist checkbox: `width:52px;height:52px;border:4px solid var(--fg);border-radius:var(--radius);` with a `var(--accent)` ✓ glyph inside when done.
- Overlap rule: at least one pair of elements must physically overlap per card (card over card, note over card corner, tape over both).

## Block recipes
- title-card: sticky-note kicker (series + day) top area rotated +3-5°; the main polaroid rotated −2° holds the 126px headline with a crooked accent underline on one phrase and a muted caption in its bottom margin; a smaller empty polaroid peeks from behind at +4°; two tape strips pin the main card's top corners.
  Motion: cards settle with `back.out` drop plus rotation overshoot, tapes scale in, underline draws last.
- list: one big sticky note (`--panel-2`, rotated −1.5°) with a horizontal tape strip at top center; 78px title, then 3 checkbox rows at 58px. Done rows get the accent ✓ and a muted line-through; the open row stays full ink. A small captioned polaroid leans on the note's right edge for texture.
  Motion: note drops in, rows slide from the left with stagger, checks pop with `back.out(2)`.
- quote: a single large polaroid rotated +1.5° holding the quote at ~106px (weight 800, 1.4 line-height) with an oversized accent “ mark and the crooked underline under the key phrase; page-number attribution centered in the bottom margin; tape strips across BOTH top corners at ±40°; a tiny sticky note (收藏这句) tucked at a lower corner.
  Motion: card drops with rotation overshoot, tapes stamp on, quote fades up, underline draws.
- comments: a reader message wall — a taped white tag (读者留言墙, 60px weight 900, rotated −2°) leans top-left; three sticky notes (`--panel-2`, ~600px wide) pinned at alternating tilts (−3°, +2.5°, −1.5°), each with a tape strip across its top, a 36px muted @nickname and a 48px handwritten-tone comment (line-height 1.5); the lowest note overlaps its neighbor's corner, and exactly ONE note carries the crooked accent underline under its key phrase.
  Motion: tag lands first, notes drop in gluing order with `back.out(1.5)` rotation overshoot stagger 0.14, tapes stamp on, underline draws `scaleX` last.
- steps: 手帐 to-do trail — three sticky notes (`--panel-2`, ≈390px squares) taped in a loose row at alternating tilts (−3°, +2.5°, −2°), each with a tape strip across its top edge, a 38px muted `STEP n` label and a 68px verb phrase; two hand-drawn SVG arrows (curved `--accent` stroke, round caps, small open heads) hop between the notes.
  Motion: notes drop in gluing order with `back.out(1.5)` rotation overshoot stagger 0.12, tapes stamp on, arrows draw last via `stroke-dashoffset`.
- timeline: a journey route — a dashed `--accent` path (10px round-cap ink, `stroke-dasharray` dashes) meanders across raw kraft through three pushpin stops: 52px ink `--fg` pin heads with thick white rims and real shadows; each stop hangs a small taped sticky label (`--panel-2`, 34px muted `DAY n` over a 46px place name) at alternating tilts below its pin; a taped white tag names the trip top-left. The route is the card's single accent touch.
  Motion: tag drops, the dashed route reveals left→right via a clip-path wipe, pins drop from above with `back.out(2.2)` stagger, labels settle under their pins, tapes stamp last.
- big-number: a date-stamp polaroid — one big white polaroid rotated −2° holding `DAY` (80px muted) beside a 360px `07`, with a crooked `--accent` underline drawn beneath the number and a muted caption in the thick bottom margin; tape strips pin BOTH top corners (±40°); a small sticky note (`七月周记`) leans at a lower corner.
  Motion: card drops `back.out(1.4)`, tapes stamp, the number fades up, underline draws `scaleX` last, note lands beside it.
- cta: a taped white card `关注不迷路` — the 130px headline sits on a big polaroid rotated +1.5° and a hand-drawn `--accent` ellipse is scribbled around the 关注 characters (SVG stroke, drawn on); muted schedule caption in the bottom margin; tapes on both top corners; a sticky note with an accent ✓ (`记得回来`) tucked at the lower-right — the CTA stays a margin scribble, never a button.
  Motion: card drops with overshoot, tapes stamp, the circle draws around 关注 via `stroke-dashoffset` (0.34s), sticky note lands last; settled by 1s.

## Compose-instruction crib
Embed directives like:
"手帐拼贴风:牛皮纸底大面积裸露;所有白色照片卡带真实投影且旋转 2-4°,厚下边距当拍立得白框,说明文字写在白框里;绿色只做半透明胶带(opacity 0.75)压住卡片角或便签顶边;便签用米黄色方块;橙色只做手写感元素——歪 1° 的粗下划线、勾选✓、一个重点词,每卡至多两处;元素之间必须叠压、禁止水平垂直完全对齐;动效 back.out 落纸 + 胶带后贴 + 下划线最后画出,1s 内一件件落定。"

## Motion grammar
- Objects land one at a time, in gluing order: big card first, tapes second, ink details (underline, checks) last.
- Every entrance is physical: `back.out` drop with a small rotation overshoot; nothing slides frictionlessly and nothing fades in place except captions.
- Tape strips scale in from 0 with `back.out(2)`; underlines draw with `scaleX` from the left; everything settles within 1s.

## Cadence
- Page logic: each card is one spread of the journal, read as objects glued in order.
- Open with a dated sticky note + title polaroid; middles alternate checklists and photo-caption cards; quotes get a full polaroid to themselves.
- Keep 2-4 physical objects per card — one object feels unglued, five feels cluttered.
- Rotate the rotation: if the last card leaned left, lean this one right, so consecutive cards do not stack in the same direction.
- CTA reads like a margin scribble on a sticky note (关注 + 一颗✓), never a button.
