---
id: pixel-arcade
title: 像素 Arcade
summary: 8-bit 街机:硬像素块、血条金币、PRESS START,适合游戏/测评/整活
icon: 👾
showcase: [标题卡, 大数字, 数字变化, 倒计时, 步骤, 代码, 金句, 对比, 引导]
palette: { paper: "#14122B", panel: "#221F45", panel-2: "#1A1738", fg: "#F4F1FF", muted: "#F4F1FF99", accent: "#FFD23F", accent-2: "#3EE6C1", line: "#F4F1FF2E", grid: "#F4F1FF12", radius: "0px", shadow: "8px 8px 0 rgb(0 0 0 / 0.55)", glow: "0 0 30px rgb(62 230 193 / 0.4)", font-num: "'IBM Plex Mono', ui-monospace, monospace" }
version: 0.1.2
---

# Pixel Arcade — 8-bit cabinet screen

The design language is an ARCADE CABINET SCREEN: deep-space indigo, a faint 64px tile grid, ZERO border radius anywhere, and hard offset shadows with no blur — every element looks stamped out of pixels. Chrome is a game HUD: coin counters, HP bars, LEVEL plates, a blinking `PRESS START`. Motion is mechanical: things snap, tick, and blink in `steps(1)`; nothing eases softly, nothing bounces, and nothing glows except the mint active-state outline.

By default blocks are HUD SPRITES over the live feed: the block root stays transparent, and each piece — a score banner, a corner coin counter, a dialog box, an HP bar — sits on its own hard-edged indigo `--panel` plate with the offset shadow so sprites stay on screen, HUD-sized and never covering the player on camera. THE FULL CABINET SCREEN — root carrying the deep-indigo `--paper` with its 64px tile grid edge to edge — loads only when a full-screen designed scene is explicitly requested.

## Token semantics
- `--paper` deep indigo with the tile grid: `background-image:linear-gradient(var(--grid) 2px,transparent 2px),linear-gradient(90deg,var(--grid) 2px,transparent 2px); background-size:64px 64px;`
- `--panel` is the plate color; plates get PIXEL CORNERS via same-color plus-extension shadows (see motifs), not radius — `--radius` is 0 and must stay 0.
- `--panel-2` fills empty bar cells and recessed surfaces.
- `--accent` coin gold owns scores, coins, `PRESS START`, and LEVEL captions. `--accent-2` mint owns bar fills, arrows, and the active state; never mix both on one element.
- `--shadow` (8px hard offset, no blur) doubles as `text-shadow` on headlines and hero numerals — the stamped look.
- `--glow` mint halo appears ONLY on the active level plate, fused into its pixel-corner shadow list.
- `--fg` near-white for body type; `--muted` for cleared/locked states and HUD labels; `--line` for the HUD hairline rule.

## Typography
- HUD and all data in `var(--font-num)` 36-48px, weight 700, tracking 0.12-0.2em, UPPERCASE (`HI-SCORE 999900`, `STAGE 1-1`, `WORLD MAP`).
- Headlines: `var(--font-head)` 110-130px weight 900 with `text-shadow:var(--shadow)`.
- The cover hero may switch to `var(--font-num)` at 280-300px, tracking 0.06em, for the ROM-title look.
- `PRESS START ▶`: mono 52-56px, `--accent`, tracking 0.3em, blinking.
- Hero numerals: mono 440-480px weight 800 in `--accent` with the stamped shadow.
- Level captions mono 40px `--accent`; level words `var(--font-head)` 76-80px weight 900; status words mono 38px. Smallest text 36px.
- Numbers pad like ROM counters: `× 07`, `999900`, `1-1` — always fixed-width, never humanized (`7`, `99.9万`).
- No italics anywhere; slant is not in the 8-bit vocabulary.

## Structural motifs (reuse verbatim)
- Pixel-corner plate (plus-extension trick — four same-color shadows extend the bg so corners read stepped):
  `background:var(--panel); box-shadow:0 14px 0 var(--panel),0 -14px 0 var(--panel),14px 0 0 var(--panel),-14px 0 0 var(--panel);`
- Active plate variant: swap the four extension shadows to `var(--accent-2)` and append `,var(--glow)` — a mint pixel outline that glows.
- Coin: `width:40px;height:40px;margin:8px;background:var(--accent);` + the same plus-extension shadows in `--accent`; sits beside mono `× 38` in `--accent`.
- HP/XP bar: `border:4px solid var(--fg); padding:12px; display:flex; gap:10px;` holding `54×40px` cells — filled cells `--accent-2`, empty cells `--panel-2`; mono label `HP` / `XP` in `--accent-2` beside it.
- HUD strip: top row `left/right 90px`, coins left / score right, mono muted, `4px solid var(--line)` rule underneath.
- Level plate: pixel-corner plate with mono `LEVEL 2` cap in `--accent`, body word in `--fg`, status word (`CLEAR` / `▸ PLAY` / `???`) at the bottom; states: cleared = 0.55 opacity + muted status, active = mint extension shadows + `--glow`, locked = muted word and status.
- Blink: `yoyo:true, repeat:5, ease:'steps(1)'` — always finite, one blinker per card.
- Arrow tick: `▶▶` glyph pairs in `--accent-2` mono between sequential plates, snapped on with `duration:0.12, ease:'steps(1)'`.
- Snap grammar (the only entrance family allowed):
  `tl.from(el,{y:-30,autoAlpha:0,duration:0.22,ease:'power3.out'})` for plates; `steps(1)` staggers for cells/arrows; no back.out, no elastic, no rotation ever.

## Block recipes
- 标题卡: HUD strip (coins `× 12`, `STAGE 1-1`) → pixel-corner plate holding a mono `NEW GAME` cap and the 116px stamped headline → `PRESS START ▶` blinking below → HP bar bottom-left.
  Motion: HUD snaps in, plate slams y-30 `power3.out` 0.22s, HP appears, START blinks `steps(1)` ×6 ending visible by 1.18s.
- 大数字: giant mono score `9.8` (≈460px, `--accent`, stamped shadow) left-anchored; mono muted label `总评分 SCORE` above; XP bar below with enlarged `110×60px` cells filling 9 of 10; coin counter in the HUD.
  Motion: label first, digits snap from y+50 `power3.out`, then cells tick on one by one with `steps(1)` stagger 0.05.
- 数字变化: SCORE roll screen — HUD (`STAGE 2-2`), mono muted cap `本局得分 SCORE`, giant gold mono score (≈310px, stamped shadow) rolling up to `128500` via an innerText tween; a mint mono `+1000` bonus pops beside the digits mid-roll; a wide pixel-corner plate at the bottom pairs `HI-SCORE 999900` against a taunt line for contrast.
  Motion: HUD snaps, label first, score rolls 0→128500 (`snap:{innerText:1}`, 0.8s power1.out), HI-SCORE plate slams y+30, `+1000` ticks on `steps(1)` and blinks finite ending visible by 1.18s — the card's only blinker.
- 倒计时: arcade TIME screen — HUD (`STAGE 3-4`), centered mono muted `TIME` cap over giant gold mono seconds (≈400px, stamped shadow) counting DOWN and landing on `10`; a short stamped urgency line below the digits; gold `HURRY UP!` blinking at the bottom.
  Motion: HUD snaps, cap appears, seconds tick 60→10 via innerText snap (0.8s), the line slams y+30, `HURRY UP!` blinks `steps(1)` ×6 ending visible by 1.18s.
- 步骤: three level plates in a row — `LEVEL 1 开箱 CLEAR`(dim) `LEVEL 2 实测 ▸ PLAY`(active mint+glow) `LEVEL 3 结论 ???`(locked) — joined by `▶▶` mono arrows in `--accent-2`.
  Motion: plates slam from x-60 stagger 0.12, arrows tick on `steps(1)`, the active `▸ PLAY` blinks finite and ends visible.
- 代码: cheat-code entry — HUD (`DEBUG MODE`); a pixel-corner terminal plate holding a gold mono `ENTER CODE 输入秘籍` cap, ten square key cells `↑↑↓↓←→←→BA` filled mint (paper glyphs) that light on one by one like button presses, and a `>` status line in stamped head type confirming the unlock, closed by a mint block cursor `▌`; HP bar bottom-left.
  Motion: plate slams y-30 `power3.out`, cap ticks on, keys light `steps(1)` stagger 0.04, HP cells fill in parallel, status line snaps on, cursor blinks finite ending visible by 1.18s.
- 金句: NPC dialog box — HUD strip on top, then a wide pixel-corner plate anchored at the bottom like an RPG text window: mono gold speaker tag (`NPC · 通关的老玩家`), two quote lines in 92px stamped head type each prefixed by a mint mono `>`, and a mint block cursor `▌` closing the last line.
  Motion: HUD snaps, window slams y+30 `power3.out`, lines snap on one after another with `steps(1)`, cursor blinks finite (`yoyo repeat 3`) ending visible by 1.1s.
- 对比: 1P vs 2P versus screen — HUD (`VS MODE`), two pixel-corner fighter plates left/right each with a mono tag, an 76px stamped word, and an HP cell bar (loser 2/5 cells, winner 4/5); the right plate is the active one (mint extension shadows + `--glow`, white tag); giant 170px mono gold `VS` stamped between them.
  Motion: plates snap in from opposite x±60, `VS` ticks on `steps(1)`, HP cells fill cell-by-cell stagger 0.05, `VS` blinks finite and ends visible.
- 引导: INSERT COIN screen — HUD reads `CREDIT 00`; a giant pixel coin built from stacked gold squares (plus-extension shadows at 34px) drops center; below it the gold mono line `PRESS ❤ TO FOLLOW` blinking, and a muted `CONTINUE? 9` under it.
  Motion: HUD snaps, coin drops y-40 `power3.out`, captions tick on, `PRESS ❤ TO FOLLOW` blinks `steps(1)` ×6 ending visible by 1.18s — the card's only blinker.

## Compose-instruction crib
Embed directives like:
"8-bit 街机风:深靛底 + 64px 瓷砖网格,全局零圆角;面板用同色十字外扩阴影做像素阶梯角,绝不用 border-radius;标题压 8px 无模糊硬偏移影(text-shadow 同款);数据/HUD 全等宽字大写宽字距;金币金只给分数/金币/PRESS START/关卡编号,薄荷绿只给血条格子/箭头/激活态,两色不同框;血条 XP 用格子胞元逐格点亮;步骤即 LEVEL 1→2→3 关卡牌(CLEAR/▸PLAY/???);动效机械感:0.2s 硬滑 + steps(1) 有限次闪烁收尾要停在可见帧,禁弹性禁模糊光晕(激活框 glow 除外)。"

## Cadence
- The HUD strip opens every card; coin counts and scores only ever go UP across a video.
- Treat the video as one play-through: STAGE label advances (1-1, 1-2, …) card to card; the finale is the score screen.
- Everything aligns to the 64px grid mentally — offsets of 90/150px keep plates sitting on tile lines.
- Chinese headline words stay short (≤8 characters) so the stamped shadow stays readable at 8px offset.
- One blinking element per card maximum, always finite repeats, always ending visible.
- Bars fill cell-by-cell, never smoothly; a bar never empties on screen.
- Steps are levels and there are exactly three; exactly one is active at a time.
- Gold and mint never touch: if a plate is active (mint), its numbers stay white, not gold.
- CTA is `PRESS START ▶` or `CONTINUE? 9` — arcade idiom, never a rounded button.
- If a card feels empty, add HUD facts (coins, stage, score) — never decorative shapes.
