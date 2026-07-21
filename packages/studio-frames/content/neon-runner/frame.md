---
id: neon-runner
title: 霓虹 Neon
summary: HUD 终端:扫描网格、状态栏、mono 读数、光标,适合科技/健身/游戏口播
icon: 🌃
showcase: [标题卡, 大数字, 数字变化, 倒计时, 走势, 步骤, 代码, 图表, 引导]
palette: { paper: "#07100C", panel: "#0E1A13", panel-2: "#0A140E", fg: "#EAFFF3", muted: "#EAFFF399", accent: "#39FF88", accent-2: "#FF3D8A", line: "#39FF8830", grid: "#EAFFF30D", radius: "12px", shadow: "0 16px 44px rgb(0 0 0 / 0.6)", glow: "0 0 36px rgb(57 255 136 / 0.5)", font-num: "'IBM Plex Mono', ui-monospace, monospace" }
version: 0.4.2
---

# Neon — terminal HUD that glows

The design language is a HEADS-UP DISPLAY: night-green terminal, faint scan grid, corner brackets, a status bar, mono readouts, a blinking cursor. Fast, technical, alive. HUD logic: chrome and metrics pin to edges/corners — the CENTER stays clear for the person on camera.

HUD blocks are OVERLAYS on the live feed, not pages: the block root stays transparent — the feed is what the HUD is reading, and chrome, readouts and tags carry their own panel fills and neon borders at the edges, keeping the center clear for the person on camera. Never paint the full night surface behind an edge-pinned HUD block. The BOOT-SCREEN TAKEOVER — root carrying `background:var(--paper)` with its scan grid full-bleed — boots only when a full-screen designed scene is explicitly requested.

## Token semantics
- `--paper` night surface with a faint grid: `background-image: linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size:120px 120px;`
- `--accent` neon green owns DATA and progress; it glows (`--glow`, or `filter: drop-shadow(0 0 14px var(--accent))` on SVG strokes). `--accent-2` magenta is the alert/PB voice — never mix both in one element. Everything else stays matte.
- `--line` neon-tinted hairlines for chrome borders.

## Typography
- All data, chrome, labels in `var(--font-num)` 32-52px with 0.1-0.3em tracking (`● REC`, `GPS LOCKED`, `ZONE 4`). Headlines `var(--font-head)` 900, 150-300px, may carry `text-shadow: var(--glow)`.

## Structural motifs (reuse verbatim)
- Status bar: top strip `left/right 70px` — `● REC  SESSION_04 …… 00:03 / FPS 60`, mono muted, hairline underline; the ● in accent-2.
- Corner brackets: two 70px L-shapes (`border:4px solid var(--accent)`, top-left and bottom-right, opposite sides removed).
- Prompt line: `> run night_mode --start` in accent mono.
- Cursor block: solid accent rectangle after text, blinking via `yoyo:true, repeat:5, ease:'steps(1)'`.
- Readout: giant mono value + small spaced unit (`4'32" /KM`); alerts as magenta-bordered tags that blink twice.
- Checklist row: `[✓] task …… DONE` bordered rows; the active row `[▸]` gets accent border + glow + a magenta RUNNING cursor.

## Block recipes
- 标题卡: status bar + brackets → prompt line → 158px glowing headline with blinking cursor → loading bar text `▓▓▓▓░░ 82%`. Chrome first, prompt types in, cursor blinks.
- 大数字: giant mono readout (~440px, accent, glow) left-anchored + unit; magenta `PB −0'11"` tag top-right blinking twice; slides up 60px.
- 数字变化: benchmark readout climbing — prompt line `> bench --final --gpu`, 96px headline `新装备跑分`, then a ~330px mono score rolling 0→18450 via innerText snap (accent, glow) with spaced `PTS` unit; muted sub-line `PREV 16140 · GPU 97% · 60FPS STABLE`; magenta `NEW BEST` tag top-right blinks twice. Status bar reads `BENCH_SCORE | RUN 03/03`.
- 倒计时: HUD countdown — `00:59` in giant mono (400px digits, accent, glow), colon as its own glyph; only the seconds pair ticks down via innerText snap and settles; 72px label `起跑窗口关闭前` above, magenta `最后召集 · LANE 04` tag top-right blinking twice; status bar reads `T_MINUS | GATE B · ARMED`.
- 走势: jagged heart-rate polyline (6px accent + drop-shadow glow) drawing left→right with `ease:'none'`; bottom-right readout `162 BPM` in magenta+muted.
- 步骤: bordered checklist rows sliding in from left, done rows dimmed to 0.62 opacity, active row glowing with blinking cursor.
- 代码: terminal pane — hairline-bordered window of five mono lines: `$` prompts and keywords in accent, strings/values in magenta, one `#` comment muted, a `✓ SESSION ARMED` result closing; exactly ONE `> exec` line gets an accent outline + glow with a blinking magenta cursor block. Window rises, rows type in from the left with stagger, cursor blinks finite (steps(1), ends visible); status bar reads `NIGHT_RUN.SH | TTY 04 · BASH`.
- 图表: equalizer — six thin segmented neon columns (30px cells via `repeating-linear-gradient(to top, var(--accent) 0 30px, transparent 30px 44px)`) rising from a hairline baseline; the peak cell of the tallest column is magenta (`box-shadow` glow) and blinks twice; mono scale `100…00` down the right edge behind a hairline. Columns scaleY up in stagger, status bar reads `AUDIO_LEVELS`.
- 引导: CTA module — prompt line `> exec follow --confirm`, neon-outlined button `+ FOLLOW` (4px accent border + `--glow`) that pulses twice (scale 1↔1.04), mono sub-line with a blinking magenta cursor; status bar reads `CTA_MODULE | LOADED`, corner brackets as always.

## Compose-instruction crib
Embed directives like:
"霓虹 HUD 终端风:夜绿底 + 120px 扫描网格;顶部状态栏(● REC/FPS/SESSION mono 小字)+ 对角 4px 荧光角标括号;数据一律 mono 荧光绿带发光,警报/PB 用洋红描边标签(绿洋红不同框);`>` 命令行前缀 + 闪烁光标块;中心留给人,读数贴边角;动效 0.15-0.25s power3 快滑 + steps(1) 闪烁,线图匀速自绘。"

## Cadence
- Metrics glow, everything else matte. Progress draws itself; steps tick on; keyword slams in magenta, rare. CTA is a neon-outlined button that pulses twice.
