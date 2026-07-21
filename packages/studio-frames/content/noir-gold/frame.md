---
id: noir-gold
title: 黑金 Noir
summary: 时装编辑部:双层金框、衬线细字、极限留白,适合品牌/轻奢/大促预热
icon: 🥂
showcase: [标题卡, 金句, 大数字, 倒计时, 引导, 对比, 列表, 章节]
palette: { paper: "#0C0B09", panel: "#16140F", panel-2: "#100E0B", fg: "#F4EDE0", muted: "#F4EDE099", accent: "#E4C177", accent-2: "#9A7B3F", line: "#F4EDE01F", grid: "#F4EDE00C", radius: "8px", shadow: "0 20px 60px rgb(0 0 0 / 0.6)", glow: "0 0 40px rgb(228 193 119 / 0.3)", font-head: "'Noto Serif SC', 'Songti SC', serif" }
version: 0.4.2
---

# Noir — maison editorial on near-black

The design language is a FASHION HOUSE INVITATION: warm near-black, champagne gold, serif display, extreme whitespace. Everything is centered, small, and expensive. Whisper, don't shout — hierarchy comes from spacing and tracking, never from adding color or size wars.

By default blocks are GILDED PLACARDS floating over the footage: the block root stays transparent, and each piece — a serif title plaque, a corner numeral card, a hairline-framed note — carries its own patch of warm near-black so the gold still whispers, placard-sized and never eclipsing the speaker. THE FULL INVITATION CARD — root carrying the near-black `background:var(--paper)` edge to edge — is extended only when a full-screen designed scene is explicitly requested.

## Token semantics
- `--paper` warm near-black (never #000); `--fg` ivory ink; `--accent` champagne gold — precious: hairline rules, one gilded numeral or word per card, thin outlines. NEVER large flat gold fills.
- `--accent-2` darker gold for secondary rules; `--line` breath-thin ivory separators.
- Panels are barely used; when needed, `--panel` is only one step above paper.

## Typography
- Headlines in `var(--font-head)` (serif) 600-700 — large but LIGHT, 120-170px, tracking +0.06 to +0.14em. Italic serif for quotes.
- Labels are tiny all-caps Latin with EXTREME tracking: 28-34px, 0.5-0.72em letter-spacing (add matching padding-left to re-center).
- Numerals serif-elegant, weight 400, gold.

## Structural motifs (reuse verbatim)
- Double frame: outer `inset:70px; border:1px solid var(--accent-2)` + inner `inset:14px; border:1px solid var(--line)` via ::before.
- Ornament rule: `150px hairline — ◆ — 150px hairline` centered, gold.
- Ghost caps kicker: `COLLECTION · 2026` / `MAISON PIREEL` above and below every composition.
- Outlined pill: 1px gold border, NO fill, spaced text (`关 注`).

## Block recipes
- 标题卡: kicker caps → serif title (170px, +0.08em) → ornament rule → tiny footer caps. All centered inside the double frame. Motion: frame fades 0.5s, title fades (no movement), chrome last — nothing pops, everything arrives.
- 金句: oversized thin serif `“` in gold → 2-line italic serif quote (120px, line-height 1.4) → `— 本期金句` caps. Pure fades.
- 大数字: caps kicker `LIMITED TO` → serif gold numeral ~430px weight 400 → `hairline 件 · 全球 hairline` unit row. The numeral may ease its letter-spacing from wide to normal as it fades in.
- 倒计时: the drop countdown — caps kicker `LIMITED DROP` → one gilded serif numeral (~400px, weight 400) that rolls to the final hour count via innerText tween (HTML holds the FINAL pure digits; the unit `小时` is a small spaced-caps sibling) → `hairline 发售当夜 · 不见不散 hairline` row → tiny footer caps. Pure fades, the hairlines draw, nothing pops.
- 引导: caps `JOIN THE HOUSE` → outlined gold pill `关 注` (0.5em spacing) → muted footer line. The pill scales from 0.96, barely.
- 对比: two whisper-quiet centered columns separated by ONE vertical gold hairline; both numerals serif gold weight 400, the winner marked only by a small gold ◆ floated above and a slightly larger numeral (180px vs 140px); caps kickers and tiny spaced footers. Pure fades, the hairline draws, the ◆ arrives last.
- 列表: menu carte inside the double frame — caps kicker `LA CARTE`, serif items joined by dotted hairline leaders to gold serif roman numerals (Ⅰ/Ⅱ/Ⅲ); ornament rule + footer caps below. Rows fade in sequence, nothing moves.
- 章节: the sommaire strip — `CHAPITRE Ⅰ · Ⅱ · Ⅲ` spaced caps in one centered row divided by vertical gold hairlines, non-current chapters muted, the current marked ONLY by a small gold ◆ floated above; beneath, the chapter name in serif (150px, +0.08em); caps kicker `SOMMAIRE` + footer caps. Hairlines draw, tabs fade in order, the name arrives, the ◆ last.

## Compose-instruction crib
Embed directives like:
"黑金时装编辑部风:近黑暖底,双层金发丝框内衬(外金内象牙);一律居中;衬线标题细而大(600-700 字重 + 正字距加宽),拉丁小字 caps 字距 0.5em+;金色只做发丝线/单个鎏金数字或词,严禁大面积金色填充;— ◆ — 菱形饰线;动效只有 0.4-0.6s 淡入与缓移,禁弹跳。"

## Cadence
- Extreme restraint: one element per card, huge margins. Prices/limits as gilded serif numerals; quotes get the full frame; the CTA is an outlined pill with two spaced characters. Motion vocabulary: arrive, never pop.
