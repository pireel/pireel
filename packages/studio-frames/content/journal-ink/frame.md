---
id: journal-ink
title: 报刊 Journal
summary: 报纸头版:报头双线、多栏假文、红章批注,适合深度/盘点/评论
icon: 📰
showcase: [title-card, chapters, list, compare, qa, quote, chart, lower-third, cta]
palette: { paper: "#F6F1E7", panel: "#FFFDF7", panel-2: "#ECE4D3", fg: "#1D1A14", muted: "#1D1A1499", accent: "#C8321E", accent-2: "#24519E", line: "#1D1A1433", grid: "#1D1A1412", radius: "2px", shadow: "0 12px 28px rgb(60 50 30 / 0.14)", glow: "0 0 0 rgb(0 0 0 / 0)", font-head: "'Noto Serif SC', 'Songti SC', serif" }
version: 0.4.2
---

# Journal — front page in newsprint

The design language is a NEWSPAPER FRONT PAGE: warm newsprint, black serif ink set in columns with hairline rules, and one red editor's stamp. Credible, dense, composed — density IS the aesthetic; whitespace here reads as unset type, so fill columns.

By default blocks are CLIPPINGS laid over the footage: the block root stays transparent, and each piece — a headline strip, a boxed figure, a short margin column, the red stamp — is set on its own scrap of newsprint with hairline rules, cutting-sized and never covering the speaker. THE FULL FRONT PAGE — root carrying `background:var(--paper)` edge to edge — goes to press only when a full-page scene is explicitly requested.

## Token semantics
- `--paper` newsprint; `--fg` ink; `--accent` seal red — an editor's mark stamped ONTO set type (stamps, circled verdicts, red indexes), at most twice per card; `--accent-2` link blue is the rare second ink.
- `--panel-2` doubles as the grey of fake body-text bars. `radius: 2px`; shadows barely there; NO glow.

## Typography
- Headlines `var(--font-head)` (serif) 850-900, 130-330px, centered like a front-page banner. Kickers/mastheads serif 900 with 0.3em spacing (`视 频 日 报`).
- Meta (dates, page refs, vol) in `var(--font-num)` 28-38px muted.

## Structural motifs (reuse verbatim)
- Masthead: `VOL.xx | 报名 | 日期` row over a `border-bottom:6px double var(--fg)`.
- Deck line: single sentence centered between 2px hairlines.
- Column blocks: 3 columns separated by 2px hairlines, filled with grey bars (`height:14px; background:var(--panel-2)`, last bar 62% width) as body-text placeholder.
- Red stamp: rotated 9-10° bordered box (`border:6px solid var(--accent); border-radius:8px`), 2-char verdict, stamps in with scale 1.7→1 + power3.in.
- Circled verdict: red ellipse (`border:5px solid var(--accent); border-radius:50%; transform:rotate(-4°)`) over a table cell.
- Double-rule sandwich: `border-top:4px solid + border-bottom:2px solid` closing pull-quotes and tables.

## Block recipes
- title-card: masthead → banner headline (150px serif) → deck line → 3 columns of fake text bars → red stamp `头条` overlapping top-right. Masthead drops, headline fades, stamp lands last.
- chapters: section navigation strip in the masthead register — three desk tabs `要闻 P.01 / 深度 P.04 / 专栏 P.08` split by hairlines between a 6px double rule and a 2px rule; the current desk keeps ink, its page index turns seal red and a thick red underline sweeps in beneath it; below, that desk's 120px banner headline over three columns of fake text bars. Tabs drop in, underline sweeps, headline fades, columns settle.
- list: `本 期 要 目` boxed between double rules; rows `一 | 要点 | P.02` with red hanzi indexes and hairline separators; rows slide in from left.
- compare: `本报评测` table between double rules — header row muted caps, winner row bold with a red-circled `推荐` cell; rows fade in sequence, circle stamps last.
- qa: letters-to-the-editor column — `读 者 来 信` capped between double rules; the reader's question set in serif corner quotes, led by a red-circled `问` medallion tilted like a red-pen mark; a hairline, then the editors' reply led by an ink-circled `答`: one reply line, fake-text bars continuing the copy, right-aligned mono sign-off `—— 本报编辑部`. Question slides in, the red 问 stamps on (scale 1.7→1, power3.in), reply fades after.
- quote: pull-quote sandwiched by double rules — red em-dash `——` lead-in, 128px serif line, mono attribution `摘自本期口播 · 02'14"`; rules draw first (scaleX), text after.
- chart: thin-bar newsprint chart headed `数 据 版` between double rules — hairline left axis + 4px ink baseline, narrow (44px) solid-ink bars with mono values above, ONLY the key bar (and its bold value) in seal red; serif weekday labels under the baseline; mono caption `单位:万次播放 · 本报资料室制图` under a closing 6px double rule. Bars rise flat (power2, no bounce), caption last.
- lower-third: reporter byline lower third — page header `人物专访 | A04` over a hairline top-left (the page index is the card's only red), a short column of fake text bars below it, the middle of the page left open for the person on camera; bottom byline bar in the double-rule sandwich (4px over 2px): 76px serif name + spaced `本报记者` + a hairline leader + mono desk tag. Header drops, bars set, the bar rises gently — restrained, no stamps.
- cta: footer classified ad — double-boxed notice (4px ink outer + hairline inner) with `订阅本刊` as a 150px serif banner, deck line between hairlines, mono sign-off `广告部敬启 · 第 24 版`; red stamp `免费` overlapping the top-right corner, stamping in last (scale 1.7→1, power3.in).

## Compose-instruction crib
Embed directives like:
"报刊头版风:新闻纸底 + 衬线墨字;报头 6px 双线,栏间 2px 发丝线,正文区用灰条假文填充保持排版密度;红色只做编辑批注(旋转红章/红圈圈住结论/红编号),每卡至多两处,可用藏蓝作第二墨色;圆角 2px 近直角、无发光;动效纸面化:快淡入 + 沿栏轴 0.2s 滑动,禁止缩放弹跳(红章的盖章除外)。"

## Cadence
- Front-page logic: the lead claim is the banner; rankings/roundups as 要目 lists; verdicts as evaluation tables with a red circle; quotes as pull-quotes. Keyword slams read like headline stamps — rare. CTA is a footer notice, understated.
