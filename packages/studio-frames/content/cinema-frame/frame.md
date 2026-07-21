---
id: cinema-frame
title: 影院 Cinema
summary: 黑边宽幕:中英双语字幕、时间码、片名卡,适合剧情/影评/vlog 大片感
icon: 🎬
showcase: [标题卡, 章节, 金句, 引导, 大数字, 对比, 列表, 人名条]
palette: { paper: "#0B0B0B", panel: "#141414", panel-2: "#101010", fg: "#EDEAE4", muted: "#EDEAE480", accent: "#E8B54D", accent-2: "#6E7F8D", line: "#EDEAE41F", grid: "#EDEAE40A", radius: "2px", shadow: "0 20px 50px rgb(0 0 0 / 0.7)", glow: "0 0 0 rgb(0 0 0 / 0)", font-head: "'Noto Serif SC', 'Songti SC', serif" }
version: 0.1.2
---

# Cinema — letterboxed frames that speak in subtitles

The design language is A FILM STILL: solid letterbox bars top and bottom squeeze the canvas into a widescreen band, and everything inside behaves like cinema — bilingual subtitles at the bottom center, a scene slate and a timecode in the upper corners, serif title cards with micro-credits. The middle of the frame stays mostly EMPTY, as if the shot itself lives there; type is quiet, warm-ivory serif, and gold appears only as one emphasized subtitle word or one thin rule. Nothing bounces; everything fades like a cut.

Most blocks are LETTERBOX OVERLAYS, not pages: the block root stays transparent so the live footage IS the shot in the center; only the letterbox bars, slates, and subtitle text carry fill (`--panel-2` over `--line` hairlines). Never paint a full paper background across any block — the film must show through; even 标题卡 and 章节 are letterbox slates whose bars and plates carry their own fill while the center band stays open. A full-frame designed scene card may own the whole screen only when the user explicitly asks for one.

## Token semantics
- `--paper` is the dark of the theater; `--panel-2` is the letterbox bar fill (a hair lighter than paper, edged by `--line` hairlines).
- `--fg` warm ivory for all reading text; `--muted` for English subtitle lines, credits, slates, timecodes.
- `--accent` projector gold is rationed: ONE emphasized word inside the Chinese subtitle, or ONE thin 2px rule above a title — never both, never a fill, never a button.
- `--accent-2` steel blue is only for the tiny `● REC`-like status accents in slates, sparingly.
- `--radius` is 2px (essentially square); `--glow` is zero — light comes from the projector, not from CSS.

## Typography
- Chinese in `var(--font-head)` (serif): subtitles 64-80px weight 600, title cards 150-180px weight 600 with +0.08em tracking.
- English always UPPERCASE, 30px, `letter-spacing: 0.3em`, muted — the second subtitle line, credits, kickers.
- Slates and timecodes in `var(--font-num)`: 28-32px, +0.18em tracking, muted (`SC.04 · TAKE 02`, `00:02:14:07`).

## Structural motifs (reuse verbatim)
- Letterbox: `#id .lb{position:absolute;left:0;right:0;height:150px;background:var(--panel-2);z-index:3;}` with `.lb.t{top:0;border-bottom:1px solid var(--line);}` and `.lb.b{bottom:0;border-top:1px solid var(--line);}` — they SLIDE IN from off-canvas at the start of every card.
- Corner slate: `SC.xx · TAKE xx` mono at `left:80px;top:190px`; timecode `00:02:14:07` at `right:80px;top:190px` — always inside the widescreen band, never on the bars.
- Subtitle stack (bottom-center, ~190px above the bottom bar edge): Chinese serif line over an English caps line, both centered, gold on exactly one Chinese word (`<b>` in accent).
- Title card: centered serif title + a 220px × 2px gold rule + a micro-credits row (`出品 … · 导演 … · 摄影 …` 30-32px muted with wide gaps).
- Cut-fade motion: bars slide (`y:-150` / `y:150`, 0.5s power2.out), then contents fade 0.5-0.7s with tiny 20px drifts. Nothing scales, nothing bounces.

## Block recipes
- 标题卡: bars slide in → gold rule draws (scaleX from 0) → serif title (165px) fades below it → micro-credits row (出品/导演/剪辑) fades → slate + timecode appear last in the corners. Everything centered horizontally, weighted slightly above middle.
- 章节: a slate-board chapter strip — three mono tabs (`SCENE 01 / 02 / 03`, 32px, +0.18em) centered in the band, the current tab alone in ivory with a thin 2px gold underline beneath it (the card's entire gold ration); below, the current chapter's serif name (150px) and a 30px caps subtitle; slate + timecode in the corners. Bars slide, tabs fade in order, the name fades up 20px, the underline draws in last.
- 金句: the widescreen band stays EMPTY except the corners (slate left, timecode right) and the subtitle stack at the bottom: 76px Chinese line with ONE gold word, then the 30px English caps translation. Bars slide, subtitles fade up 20px like dialogue appearing — the emptiness above is the shot.
- 引导: an end-title card — `NEXT EPISODE` caps kicker, serif line `关注,别错过下一幕` (110px), thin gold rule beneath, then a schedule line (`每周五 20:00 · 首映`) in mono muted; corners keep slate + timecode. Pure fades after the bars land.
- 大数字: a box-office card — caps kicker (`BOX OFFICE · DAY 07`), ONE giant serif numeral in gold (280px, the card's entire gold ration) with a small cream unit character, then a micro-credits row of short claims; slate + timecode in the corners. Bars slide, numeral fades up 20px, credits stagger in.
- 对比: two widescreen take-bands stacked inside the letterbox band, each a `--panel` strip with a mono slate label (`SC.04A` / `SC.04B`), a 64px serif take description over a caps verdict note, and a mono verdict at the right (the chosen take's `OK` in `--accent-2`); the chosen take's line carries a thin 2px gold underline that draws in last. Bands fade up 20px in sequence; nothing scales.
- 列表: a rolling-credits list — thin 220px gold rule, `CAST · …` caps header, then three centered serif rows `角色 …… 演员` (54px) joined by dotted leaders (`border-bottom: dotted var(--line)`), the right column muted. Bars slide, rule draws, rows fade up 20px in credit order.
- 人名条: a CAST lower-third — the widescreen band stays EMPTY like a printed frame except the corner slate + timecode; anchored lower-left at the slate margin (`left:80px`, just above the bottom bar), a name block SLIDES IN horizontally: a 120px × 2px gold overline, a `CAST · …` caps kicker, the serif name (96px), then a 32px mono role line in muted. Bars slide, the strip glides in 60px from the left, the overline draws, kicker and role fade last.

## Compose-instruction crib
Embed directives like:
"影院宽幕风:上下各 150px 纯黑遮幅条(panel-2 填充 + 1px 发丝边),开场必须从画外滑入;画幅中带内容,遮幅条上永不放字;左上场记 SC.04 · TAKE 02、右上时间码 00:02:14:07,mono 28-32px 字距 0.18em;字幕堆叠在画幅底部居中:中文衬线 64-80px 在上、英文全大写 30px 字距 0.3em muted 在下,金色只给中文里唯一一个强调词或一根 2px 细金线,二选一;片名卡 = 居中衬线大字 + 金线 + 出品/导演式 30px 小字班底行;画幅中部大量留空当作镜头;动效只有遮幅滑入 + 0.5-0.7s 慢淡 + 20px 上移,禁缩放禁弹跳。"

## Cadence
- Every card is a shot: bars first, then one utterance. Subtitles carry emotion, title cards carry structure, the empty band carries the imagined footage. Gold is the single spotlight per card. Cut, fade, hold — never animate like an app.
