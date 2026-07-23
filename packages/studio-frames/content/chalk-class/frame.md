---
id: chalk-class
title: 黑板 Chalkboard
summary: 墨绿黑板:粉笔字、虚线重点框、①②③板书,适合教学/干货/知识拆解
icon: 🧑‍🏫
showcase: [title-card, chapters, list, quote, qa, big-number, steps, code, cta]
palette: { paper: "#234238", panel: "#2B4F43", panel-2: "#1D3830", fg: "#F2EFE4", muted: "#F2EFE499", accent: "#F7D794", accent-2: "#F79F9F", line: "#F2EFE433", grid: "#F2EFE40E", radius: "8px", shadow: "0 12px 30px rgb(0 0 0 / 0.35)", glow: "0 0 0 rgb(0 0 0 / 0)" }
version: 0.1.2
---

# Chalkboard — classroom blackboard writing

The design language is CLASSROOM BOARD WRITING (banshu): a deep-green blackboard inside a dark wooden frame, chalk-white handwriting energy, dashed "chalk stroke" boxes that sit slightly rotated, circled numerals ①②③ heading every point, and a hand-drawn underline that overshoots its word. Nothing is machine-straight: boxes tilt 0.3-0.8°, underlines rotate −0.8°, chalk dust speckles the corners. Three chalks only — white for body, yellow for key terms, pink for warnings — and the teacher never wastes colored chalk.

By default blocks are HAND-HELD SLATES over the footage: the block root stays transparent, and each piece — a title strip, a corner scorecard, a dashed point box — carries its own small patch of `--paper` slate (rimmed in `--panel-2` wood) so the chalk still reads, sized like a small board the teacher holds up, never covering them. THE WHOLE BOARD — root carrying `background:var(--paper)` full-bleed inside its wood frame — is rolled in only when a full-screen board scene is explicitly requested.

## Token semantics
- `--paper` the blackboard green; `--panel-2` doubles as the dark wooden frame (a thick border around the whole board) and shaded patches; `--panel` for the rare raised slate area.
- `--fg` white chalk: all body writing, plus the 3-4px dust dots at ~0.4 opacity.
- `--accent` YELLOW chalk: key terms, circled numerals, the hand-drawn underline, the emphasis ellipse. The scarce teaching resource.
- `--accent-2` PINK chalk: warnings and the 「划重点」 corner tag only — one pink element per card.
- `--line` is faded chalk for dashed borders and row separators; `--glow` is dead (chalk does not glow); `--radius` stays small — chalk lines barely round.

## Typography
- Board headlines: `var(--font-head)` 700-800, 120-140px, loosely tracked; body notes 40-60px.
- Circled numerals ①②③ render as text glyphs in `--accent`, 60-66px, leading each row.
- Meta (lesson number, date) 34-38px muted, tilted ~−1° like a corner scribble.
- Nothing below 28px — the back row must read the board.

## Structural motifs (reuse verbatim)
- Wooden frame — the whole card is the board:
```css
.board { position: absolute; inset: 0; border: 14px solid var(--panel-2); }
```
- Chalk box — dashed and slightly tilted, never straight:
```css
.box { border: 3px dashed var(--line); transform: rotate(-0.6deg); }
```
- Hand-drawn underline — overshoots the word on both ends, tilted:
```css
.ul { position: absolute; left: -14px; right: -26px; bottom: -12px;
  height: 5px; background: var(--accent); transform: rotate(-0.8deg); }
```
- Emphasis ellipse — a dashed yellow circle drawn around one word (real element, not pseudo):
```css
.circ { position: absolute; inset: -14px -30px; border: 4px dashed var(--accent);
  border-radius: 50%; transform: rotate(-4deg); }
```
- 「划重点」 corner tag — pink chalk, dashed, rotated:
```css
.tag { border: 3px dashed var(--accent-2); color: var(--accent-2);
  transform: rotate(3deg); padding: 14px 30px; }
```
- Chalk dust — a few 3-4px `--fg` dots at 0.38 opacity scattered near strokes.

## Block recipes
- title-card: corner scribble `第 4 课 · 日期` top-left → a big dashed box (rotate −0.6°) holding the 130px headline with the key word in yellow chalk + hand-drawn underline → one muted subtitle with a pink-chalk warning word → 「划重点」 tag top-right → dust dots. Box fades in with a small rotation settle, underline scaleX from the left, tag pops last.
- chapters: today's lesson plan — a chalk caption with underline (`今日课表`) → three ①②③ items in a centered row (each tilted a different 0.3-0.5°, non-current items in muted chalk); ONLY the current item wears a dashed yellow chalk frame snapped around it → below, a 110px `正讲到 · <节名>` line with the section name in yellow chalk → one muted note line → 「别走神」 pink tag. Underline draws, items appear in stroke order, the frame pops around the current item like the teacher boxing it, the big line lands, tag pops last.
- list: a chalk caption with underline (`今日板书 · …`) → three rows led by ①②③ in yellow, each row `bold term + muted note`, separated by 3px dashed rules, each row tilted a different 0.3-0.4°; one term yellow, one note pink. Rows appear in stroke order (stagger from left).
- quote: a giant yellow open-quote mark → 105-115px chalk quote, centered, tilted −0.5°, with ONE word wrapped in the dashed emphasis ellipse → muted attribution line → 「背下来」 pink tag. Quote fades, ellipse scales in around its word at the end, like the teacher circling it.
- qa: a classroom question — muted corner cap (`课堂提问 · …`) → a giant yellow chalk `Q` wrapped in the dashed emphasis ellipse beside an 80px two-line question → the `A` row reveals late (a plain white `A` and an 84px answer whose key word ALONE is yellow and wears the overshooting underline) → 「送分题」 pink tag. Q is circled first like the teacher calling on the class, the answer drops in after a beat, the underline draws on the key word last — quiz cadence.
- big-number: one muted chalk setup line on top → a giant white chalk numeral (330px 800, tilted −1°) with a small unit character, wrapped in the dashed yellow emphasis ellipse → a payoff line at the bottom with the key figure in yellow chalk → 「必考」 pink tag → dust dots. Numeral fades in, the ellipse circles it after, tag pops last.
- steps: 解题三步 — a chalk caption top-left, then three dashed chalk boxes in a row (each tilted a different 0.4-0.6°), led by ①②③ in yellow, a 60px verb + muted note; hand-drawn chalk arrows (SVG stroke in `--fg`, slightly rotated) hop between the boxes; the answer step's verb ALONE wears the yellow overshooting underline. Box → arrow → box cadence in stroke order, underline draws last, 「别跳步」 pink tag pops.
- code: chalk code on the board — a chalk caption with underline (`板书代码 · …`) → four mono lines (`var(--font-num)` 50px) each led by a muted line number and trailed by a hand-written muted comment tilted ~−1.2° like a margin annotation (旁批), each line rotated a different 0.2-0.3°; the money line ALONE is boxed by a dashed yellow chalk frame and its comment turns yellow; the last line is the `>>>` output, revealed after the box → 「抄这行」 pink tag. Lines write on in stroke order, comments fade in as asides, the frame snaps around the key line, the output prints, tag pops last.
- cta: a big dashed box (rotate −0.6°) holding `下课别走` (150px 800) and a 78px line `点个关注再交作业` where 关注 is yellow chalk wearing BOTH the underline and the dashed circle; a muted schedule line; 「回家作业」 pink tag; dust dots. Box settles, underline draws from the left, the circle rings the word, tag pops last.

## Compose-instruction crib
Embed directives like:
"黑板板书风:墨绿板面 + 14px 深木色外框;一切线条走粉笔手感——3px 虚线边框、盒子和行各带 0.3~0.8° 微倾,禁止机械横平竖直;板书编号用 ①②③(黄粉笔色)领行;关键词黄粉笔 + 手绘下划线(5px 黄条,旋转 −0.8°,两端出头);要圈的词用虚线黄椭圆圈住;警示词和『划重点/要考/背下来』角签用粉红粉笔,每卡至多一处;白粉笔写正文,角落撒几粒 0.4 透明度粉笔灰点;无发光无阴影堆砌;动效:快淡入 + 微旋转落定 + 下划线从左画出,圈词最后圈上,1.2s 内收。"

## Cadence
- Teach in strokes: title box first (the lesson), then numbered points (the board plan), then one circled takeaway (the exam point).
- Yellow chalk marks what is on the test; pink chalk marks what will hurt you; if everything is highlighted, nothing is.
- End every lesson by circling one word — the 金句 ellipse is the class dismissal bell.
