---
id: botanic-press
title: 植物 Botanical
summary: 米纸苔绿:细线枝叶、标本标签、拉丁学名,适合自然/园艺/慢生活
icon: 🌿
showcase: [title-card, list, quote, qa, steps, timeline, big-number, cta]
palette: { paper: "#F4F1E8", panel: "#FFFFFF", panel-2: "#E7E4D5", fg: "#2E3B2E", muted: "#2E3B2E99", accent: "#6B8F5E", accent-2: "#C97B4A", line: "#2E3B2E26", grid: "#2E3B2E0E", radius: "14px", shadow: "0 10px 26px rgb(46 59 46 / 0.14)", glow: "0 0 0 rgb(0 0 0 / 0)", font-head: "'Noto Serif SC', 'Songti SC', serif" }
version: 0.1.2
---

# Botanical — herbarium field notes

The design language is a HERBARIUM SHEET: warm rice paper, one fine-line botanical sprig drawn in moss-green ink, a white specimen label card pinned by slanted paper tapes, latin-caps catalogue lines, and a single terracotta wax-seal dot. The layout is ASYMMETRIC and airy — a drawn sprig owns one column, serif text owns the other, separated by a vertical hairline rule. Everything is slow, quiet, hand-catalogued; no glow, no bounce, no saturated blocks.

By default blocks are PRESSED LABELS laid over the footage: the block root stays transparent, and each piece — a specimen label card, a corner catalogue line, a margin note with its wax-seal dot — is mounted on its own small patch of rice paper or white label stock, pinned by tapes, keeping well clear of the speaker. The COMPLETE HERBARIUM SHEET — root carrying `background:var(--paper)` across the full frame — is brought out only when a full-page sheet scene is explicitly requested.

## Token semantics
- `--paper` rice paper; `--panel` the white specimen label card (with `--radius` and the soft `--shadow`); `--panel-2` the kraft tone of the corner tapes.
- `--fg` deep leaf-green ink for serif text; `--muted` for latin catalogue lines and notes.
- `--accent` moss green, used almost exclusively as STROKE: the 2.5px sprig lines, leaf glyphs, thin rules. Never a filled background.
- `--accent-2` terracotta, ONE wax-seal dot per card — the collector's mark. Nothing else may be terracotta.
- `--line` hairlines: the vertical column rule, row separators, label dividers. `--glow` is dead; light here is daylight.

## Typography
- Headlines: `var(--font-head)` (serif) 500-600 weight ONLY, 100-130px, line-height 1.25-1.5, letter-spacing 0.03-0.05em — airy, never black-weight.
- Latin catalogue lines: `var(--font-num)` 28-32px, muted, 0.3em+ letter-spacing, uppercase (`HERBARIUM · NO.007`, `COLLECTED 2026`).
- Notes and metadata 36-42px muted; specimen names 56-60px serif 600.

## Structural motifs (reuse verbatim)
- Fine-line sprig — inline SVG, one curved stem + 5-7 simple leaf paths, drawn in via dash offset:
```css
.sprig .st, .sprig .lf { fill: none; stroke: var(--accent); stroke-width: 2.5;
  stroke-linecap: round; stroke-linejoin: round; }
.sprig .st { stroke-dasharray: 1400; stroke-dashoffset: 1400; } /* tl.to → 0 */
.sprig .lf { stroke-dasharray: 420; stroke-dashoffset: 420; }
```
- Vertical column rule dividing sprig column from text column:
```css
.rule { width: 1px; background: var(--line); }
```
- Specimen label card, pinned by two slanted kraft tapes:
```css
.card { background: var(--panel); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: 40px 52px; }
.tape { position: absolute; width: 170px; height: 50px;
  background: var(--panel-2); opacity: 0.85; transform: rotate(-42deg); }
```
- Wax-seal dot — the terracotta collector's mark, once per card:
```css
.wax { width: 44px; height: 44px; border-radius: 999px;
  background: var(--accent-2); box-shadow: var(--shadow); }
```
- Latin catalogue line:
```css
.lat { font-family: var(--font-num); font-size: 29px;
  letter-spacing: 0.32em; color: var(--muted); }
```

## Block recipes
- title-card: sprig fills the left column (drawn in stroke by stroke), vertical hairline rule, right column stacks `HERBARIUM · NO.007` → 128px serif title on two lines → hairline → muted note; a small specimen label card pinned bottom-right with tapes, a name + latin line, and the wax dot. Sprig draws first, text fades up in order, card lands with its tapes, wax dot last.
- list: a catalogue header row (`采收清单 · JULY`, flexible hairline, `3 SPECIMENS`) → three airy rows, each led by a small single-leaf SVG glyph: serif specimen name + latin habit note, right-aligned `NO.01` index; hairline separators; the featured row alone carries the wax dot. Leaf glyphs draw in, rows fade with generous stagger.
- quote: the sprig climbs the left margin; the quote owns the right two-thirds — `PRESSED WORDS` latin kicker, 104px serif quote at weight 500 over two lines, then a signature row (short hairline, muted attribution, wax dot). Quote fades slowly; the wax dot presses in last.
- qa: a specimen Q&A — the sprig climbs the left margin; the question lives on a specimen label card pinned by two corner tapes (`QUAESTIO` latin kicker + a 76px serif two-line question); the answer sits below directly on the sheet like a herbarium annotation — a short hairline, an `ADNOTATIO` kicker, a 58px serif verdict, a muted remedy note, and a signature row (latin species name + wax dot). Sprig draws, the card lands, the annotation reveals after a beat, wax presses last.
- steps: 栽培三步 — a catalogue header row (`栽培手记 · MENTHA`, flexible hairline, `3 STAGES`), then three specimen label cards in a row, each pinned by one slanted kraft tape and stacking a small stage sprig SVG (sprout → leaf → bloom, 2.5px moss stroke drawn in by dash-offset), a 56px serif stage name, a latin `DAY xx · STAGE` line and a muted care note; ONLY the bloom card carries the wax dot. Cards rise with generous stagger while the stage sprigs draw stroke by stroke.
- timeline: a growth record — a catalogue header row (`生长记录 · OCIMUM`, flexible hairline, `21 DAYS`), then a horizontal fine-line branch (one curved 2.5px moss stem + three small leaves, drawn in by dash-offset) carrying three stroked ring nodes; from each node a 1px hairline drops to a small specimen label card pinned by one slanted kraft tape (`DAY 01` latin line, 52px serif stage name, muted habit note); ONLY the last card carries the wax dot. Branch draws first, nodes pop along it, the tags hang down one by one, wax presses last.
- big-number: a growth-log hero — the sprig owns the left column past the vertical hairline rule; the right column stacks a latin kicker, `DAY` in spaced caps beside ONE 340px serif numeral (weight 500), a short hairline, a muted claim line, and a signature row (`PRESSED & FILED` + wax dot). Sprig draws first, column fades up in order, wax presses last.
- cta: a large specimen label card pinned by two corner tapes — `SUBSCRIBE · WEEKLY SPECIMEN` latin kicker, the 96px serif CTA `关注 · 每周一株`, a short hairline and a muted schedule note, wax-sealed at its top corner; the sprig grows up the left margin. Sprig draws, card lands 30px up, wax dot last.

## Compose-instruction crib
Embed directives like:
"植物标本手账风:米纸底,版式不对称——细线枝叶插画(inline SVG:一根 2.5px 苔绿弯茎 + 5~7 片简笔叶,stroke-dasharray 逐笔画入)占一栏,衬线文字占另一栏,中间立 1px 发丝纵线;标题只用衬线 500~600 字重、行距 1.3 以上,留白要大;编目信息用拉丁式大写字距行(NO.007 · COLLECTED 2026);标本标签白卡用两条斜贴的牛皮纸胶带钉住;每卡只有一粒陶土色蜡封圆点作藏家印记,绿色几乎只做描边不做底色;无发光、无弹跳;动效:枝叶先画入(0.6s),文字慢淡入,蜡封最后按下,1.2s 内收。"

## Cadence
- Field-notebook pacing: one specimen per card; name it, date it, note one habit. Let the sprig breathe — never crowd both columns with text.
- Lists are harvest catalogues; quotes are pressed words from the journal; the wax dot closes every entry like a signature.
- Terracotta twice on one sheet means the collector got careless — never let it happen.
