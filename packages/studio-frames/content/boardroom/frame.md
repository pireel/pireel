---
id: boardroom
title: 简报 Boardroom
summary: 冷白蓝调:章节页眉、KPI 卡组、结论先行标题,适合商业分析/职场/财经
icon: 📊
showcase: [标题卡, 章节, 图表, 列表, 大数字, 数字变化, 对比, 走势, 时间线, 人名条]
palette: { paper: "#F7F8FA", panel: "#FFFFFF", panel-2: "#EEF1F5", fg: "#14213D", muted: "#14213D99", accent: "#0F62FE", accent-2: "#DA1E28", line: "#14213D1F", grid: "#14213D0C", radius: "10px", shadow: "0 10px 28px rgb(20 33 61 / 0.1)", glow: "0 0 0 rgb(0 0 0 / 0)" }
version: 0.1.2
---

# Boardroom — consulting deck precision

The design language is a TOP-TIER CONSULTING DECK: cool white paper, navy ink, one corporate blue, one alert red, and absolutely zero decoration. Every card is chrome-framed by a full-width accent strip at the very top, a section header row, and a footnote hairline at the bottom. Headlines are ACTION TITLES — full-sentence conclusions, never topic words. The aesthetic is precision spacing; whitespace is deliberate, alignment is ruthless, nothing rotates, nothing bounces, nothing glows.

By default blocks are OVERLAY EXHIBITS on the speaker's footage: the block root stays transparent, and each piece — an action-title bar, a KPI corner card, a takeaway side card, a source footnote — is its own chrome-framed white `--panel` card at card scale, never covering the presenter and never filling the frame. Only when a full-page scene is explicitly requested does a block become a FULL DECK SLIDE: root carrying `background:var(--paper)` edge to edge, the page as the unit of communication.

## Token semantics
- `--paper` cool boardroom white; `--panel` pure-white KPI cards lifted by the faint `--shadow`; `--panel-2` the recessed grey of de-emphasized bars and disabled states.
- `--fg` navy ink for everything that matters; `--muted` for footnotes, page numbers, axis labels, owners.
- `--accent` corporate blue: the top strip, section numbers, chart fills, positive deltas, the one highlighted status. Data ink, not decoration.
- `--accent-2` alert red: negative deltas, risks, frozen items. At most one red element per card.
- `--line` hairlines everywhere (header underline, row separators, footnote rule); `--grid` the near-invisible chart gridlines. `--glow` is intentionally dead — never simulate one.

## Typography
- Action titles: `var(--font-head)` 700, 64-90px, split into two lines, ALWAYS a full-sentence conclusion ("获客成本翻倍,复购把这笔账拉平了"), never a label ("成本分析").
- KPI numbers and every figure: `var(--font-num)` 700, 80-96px in cards.
- Chrome text (section numbers, page refs, sources): `var(--font-num)` 28-34px, muted, slight 0.06em tracking.
- Labels above numbers: 29-32px muted with 0.08em tracking.

## Structural motifs (reuse verbatim)
- Top accent strip — full-bleed, first thing on every card:
```css
.top { position: absolute; left: 0; right: 0; top: 0; height: 10px; background: var(--accent); }
```
- Section header row — number, divider, section name, flexible space, page ref:
```css
.hd { display: flex; align-items: baseline; gap: 34px;
  border-bottom: 2px solid var(--line); padding-bottom: 26px; }
.hd .no  { font-family: var(--font-num); color: var(--accent); font-weight: 700; }
.hd .sec { border-left: 2px solid var(--line); padding-left: 34px; font-weight: 700; }
```
- KPI card — label / number / delta stack:
```css
.kpi { background: var(--panel); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow); padding: 44px 48px; }
.kpi i.good { color: var(--accent); }  /* ▲ ▼ deltas */
.kpi i.bad  { color: var(--accent-2); }
```
- Chart scaffold — faint gridlines, solid navy baseline, flat accent bars, value labels on top:
```css
.gl i   { height: 1px; background: var(--line); }
.base   { height: 2px; background: var(--fg); }
.bar    { background: var(--accent); }
.bar.dim{ background: var(--panel-2); border: 2px solid var(--line); }
```
- Footnote rule — hairline + mono source note, both bottom corners used:
```css
.ft { border-top: 1px solid var(--line); padding-top: 22px;
  display: flex; justify-content: space-between; color: var(--muted); }
```

## Block recipes
- 标题卡: top strip → header row `01 | 执行摘要 … P.01 / 12` → two-line 84px action title → row of three KPI cards (label, big number, ▲/▼ delta; the bad one in red) → footnote with `SOURCE:` left and firm name right. Chrome fades, title rises 30px, cards stagger up, footnote last.
- 章节: an agenda divider — full chrome, then a breadcrumb row `AGENDA 01 复盘 / 02 目标 / 03 打法` in which the current item carries navy ink, an accent number and a 6px accent underline while the rest stay muted; beneath it the current topic lands as ONE giant 280px word over a 40px muted framing line. Breadcrumb items slide 20px from the left in sequence, the big word rises, footnote last.
- 图表: top strip + header row → a one-line 64px takeaway ("Q4 冲到 3.6 亿,只有 Q3 掉过队") → bar chart with faint gridlines, navy baseline, flat accent bars, value labels above each bar; the dip quarter renders as a grey outlined bar with a red ▼ label. Bars scaleY from the baseline, stagger 0.1s, no bounce.
- 列表: top strip + header row → a 64px ordering takeaway → three rows `01 | action sentence + owner/date | status`, hairline-separated; statuses in mono (active = blue, frozen = red, pending = muted). Rows slide 24px from the left in sequence.
- 大数字: a KPI hero — full chrome (top strip + header row), a 36px muted metric label, ONE giant `var(--font-num)` number (300px, weight 700) with a small muted unit, then a pill delta chip (accent fill, `var(--paper)` text, `▲ 18.6%`) beside a muted context line, and the sourced footnote. Number rises 30px, chip fades up after; no bounce, no glow.
- 数字变化: the rolling KPI hero — full chrome, a 36px muted metric label, ONE giant `var(--font-num)` number (300px, weight 700) that counts up from zero via `innerText` tween (`snap:{innerText:1}`, ~0.8s; the HTML holds the FINAL value as plain digits, the unit in a muted sibling `em`), then a bare 64px accent `▲` YoY delta beside a muted context line — no pill, no bounce. Digits land first, the delta fades up after.
- 对比: a 方案 A/B decision table — a verdict action title, then two `--panel` columns side by side, each a 44px header band over three ✓/✕ rows (✓ in accent, ✕ in muted, hairline-separated); the recommended column's header band fills accent with `var(--paper)` text and a paper-bordered `推荐` pill. Columns rise 26px in sequence; footnote closes.
- 走势: a line chart — takeaway title, faint gridlines + navy baseline + mono quarter axis labels, an accent SVG polyline drawn via stroke-dashoffset with paper-filled accent node dots, a dashed muted projection segment continuing past the last point, and a `--panel` callout box anchored at the end point stating the projected value. Line draws 0.55s power2.inOut, projection and callout fade in last.
- 时间线: a roadmap — takeaway title, then a full-width 2px navy axis carrying four quarter nodes Q1→Q4: past quarters get paper-filled accent-ring dots with navy mono labels, the current quarter a larger solid accent dot, accent label, bolder milestone phrase and a mono `NOW` tag, and the future quarter stays muted throughout. Axis draws left-to-right, dots pop in sequence, milestone phrases fade in after; footnote closes.
- 人名条: a speaker lower-third — full chrome plus a ghost agenda word (300px, `--panel-2` ink on paper) floating in the upper half as context; the nameplate is a white `--panel` bar anchored bottom-left holding an accent tag block (mono role, `--paper` text), a 56px navy name over a muted title-and-department line, and a hairline-divided mono speaking-time note. The ghost settles first, then the bar slides in 80px from the left; footnote last.

## Compose-instruction crib
Embed directives like:
"咨询简报风:冷白底,顶部 10px 通栏蓝条;章节页眉行『编号 | 章节名 …… 页码』压 2px 发丝线;标题必须是结论句(两行 84px 700,禁止写话题词);KPI 用白卡组(小标签 + 大数字 + ▲▼ 增减,涨好用蓝、风险用红,红每卡至多一处);图表只用平涂蓝柱 + 极淡网格线 + 深蓝基线 + 柱顶数值标签;底部发丝线 + SOURCE 出处注;版式全部水平垂直对齐,零旋转零装饰零发光;动效:淡入 + ≤30px 位移或柱体从基线生长,0.9s 内收,严禁弹跳。"

## Cadence
- Pyramid principle: the conclusion IS the title; evidence (KPI cards, one chart) sits below it; the footnote cites the source. One message per card.
- Number-heavy talk tracks map to KPI rows; trend claims map to the chart; recommendations map to the action list with owners and dates.
- Red appears only when something is genuinely wrong — a deck that cries red everywhere has no alarm left.
