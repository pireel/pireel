---
id: flip-board
title: 翻牌 Flipboard
summary: 起落牌翻板:字符逐格翻落、航班行、准点绿,适合盘点/榜单/行程叙事
icon: 🎴
showcase: [title-card, big-number, count-up, countdown, steps, compare, quote, cta]
palette: { paper: "#12151A", panel: "#1D2129", panel-2: "#171A20", fg: "#F4F1E8", muted: "#F4F1E899", accent: "#FFB300", accent-2: "#43D9A3", line: "#F4F1E824", grid: "#F4F1E80D", radius: "10px", shadow: "0 18px 44px rgb(0 0 0 / 0.5)", glow: "0 0 0 rgb(0 0 0 / 0)", font-num: "'IBM Plex Mono', ui-monospace, monospace" }
version: 0.2.0
---

# Flip Board — split-flap departure hall

A split-flap departure board in a near-black terminal hall. Every headline, number and status is built from FLAP TILES — cards split by a horizontal mid seam, top half lighter than the bottom, floating on a soft shadow. The chrome is airport idiom: a departures header with a clock, mono column headers, amber destinations, green on-time chips. Built for roundups, rankings and journey narratives. Motion is the whole point — everything flips into place; the board is matte and nothing ever glows.

## Palette semantics
- The hall wall is near-black with faint ruled row lines; flap tiles are its only panels — a lighter top half, a shaded bottom half, the wall showing through the hinge seam.
- AMBER owns data and destinations: destination text, hero digits, the header clock, and delay states. GREEN owns confirmation only — an on-time or boarding chip, ONE green element per screen. The two colours never touch the same element.
- Warm off-white writes the glyphs; faded ivory voices column headers, units and captions.
- Numbers are board data: zero-padded, fixed-width, timetable-formatted — never humanized.

## Layout language
- The header strip opens every composition — a departures label left, the clock or flight code right — and the clock only moves forward across a video.
- Information lives in departure rows: a four-column grid (flight / destination / time / status) under mono column headers, rows separated by thin rules.
- Everything speaks mono uppercase with wide tracking; a serif or friendly round voice does not exist in this hall. Quotes alone may flip in as full-width announcement cards — the public-address exception.
- The CTA is boarding idiom — now boarding, gate, board now — never a web button.

## Signature (miss one and it is off-system)
- The flip: every element enters by flipping shut like a split-flap — per-tile waves along a row, rows cascading top to bottom like the board refreshing. Anything that cannot flip rides inside something that does; a pure fade is a dead flap.
- The flap tile's split body with its hinge seam — a plain card without the seam is not a flap.

## Motion personality
Mechanical refresh: tiles flip shut in quick waves, rows cascade downward, counters roll up inside a tile with a clacking jitter. Counts only flip forward — a number never rolls down except on a countdown. A chip may flick a few times but always ends visible.

## Two faces
- Overlaid on footage: single departure rows mounted over the shot — a title row, a corner counter, a status strip — each on its own short band of wall so the tiles stay mounted.
- As a full page: the full board wall, ruled lines edge to edge, rows cascading in like the evening schedule posting.

## Taboos
Glow. Pure fades. Elastic bounces. Humanized numbers. Two green elements. Amber and green on one element. Rows cascading bottom-up. A rounded web-style button. Infinite blinking.
