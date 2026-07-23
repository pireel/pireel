---
id: circuit-board
title: 电路 Circuit
summary: 通电电路板:铜金走线、丝印标注、电流沿线奔跑,适合科技/教程/拆解
icon: ⚡
showcase: [title-card, big-number, steps, trend, code, compare, quote, cta]
palette: { paper: "#081611", panel: "#0F241B", panel-2: "#0B1D15", fg: "#E9F6EE", muted: "#E9F6EE99", accent: "#F0B84C", accent-2: "#53E6FF", line: "#E9F6EE21", grid: "#E9F6EE0B", radius: "6px", shadow: "0 18px 46px rgb(0 0 0 / 0.55)", glow: "0 0 26px rgb(83 230 255 / 0.55)", font-num: "'IBM Plex Mono', ui-monospace, monospace" }
version: 0.1.2
---

# Circuit Board — live powered PCB

The design language is a LIVE, POWERED CIRCUIT BOARD — not a paper schematic and not a drafting table (that's Blueprint). This board has current running through it: copper-gold traces route orthogonally with 45° corner bends, via dots sit at the bends, chips are dark plates with pin stubs and silkscreen labels, and on every screen a glowing cyan CURRENT PULSE visibly travels along one trace and lights an LED at the point being made. Everything is functional board furniture — silkscreen text, test points, VCC/GND captions — never decorative shapes.

By default blocks are BREAKOUT MODULES soldered over the live feed: the block root stays transparent, and each piece — a silkscreen title header, a corner readout, a side spec chip — sits on its own small patch of `--paper` substrate so its copper has board beneath it, module-sized and never covering the speaker. THE WHOLE BOARD — root carrying the deep `--paper` PCB substrate with its fab grid full-bleed — is fabbed only when a full-screen board scene is explicitly requested.

## Token semantics
- `--paper` deep PCB green with a faint fab grid: `background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px); background-size:80px 80px;`
- `--panel` is the chip/package body; `--panel-2` recessed instrument surfaces (scope screen, serial console).
- `--accent` copper gold owns POWERED copper: traces, pin stubs, vias, measured values, keyword data. `--accent-2` electric cyan owns ACTIVE current: the traveling pulse, lit LEDs, the active chip outline, the cursor. `--line`/`--muted` mean UNPOWERED: dead branches, queued steps, annotations. The three states never mix on one element.
- `--glow` cyan halo appears ONLY on lit LEDs, the active chip outline, and the closed CTA ring.
- `--shadow` soft drop for chip plates and instrument panels; traces never get shadows (the pulse gets a `drop-shadow` filter instead).
- `--radius` 6px — chips are gently chamfered packages, never pills.

## Typography
- All silkscreen and data in `var(--font-num)` 32-46px, weight 700, tracking 0.24-0.28em, UPPERCASE (`U1 · MAIN`, `VCC 3V3 · GND`, `PEAK 144 FPS`).
- Headlines and chip words: `var(--font-head)` 900; cover hero 320px, card headlines 88-110px, chip words 56-72px.
- Hero readouts: mono 380-420px weight 800 in `--accent`, units as 120px muted mono siblings (`16 ms`).
- Reference designators everywhere: U1/U7/SW1/TP1/CH1 — every labeled thing gets one. Values stay instrument-precise: `3.30V`, `1800 RPM`, `62°C`, never humanized.
- Smallest text 32px. No italics — slant is not in the fab vocabulary.

## Structural motifs (reuse verbatim)
- Full-bleed net: `<svg class="net" viewBox="0 0 1920 1080">` absolutely inset 0, drawn BEFORE chips in the DOM so traces run under packages.
- Trace (base copper): `<path class="tr" pathLength="100" d="M0 560 H420 L500 480 H900"/>` with
  `fill:none;stroke:var(--accent);stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:100;stroke-dashoffset:100;`
  Only horizontal/vertical runs joined by 45° bends (`|dx| === |dy|` on every `L`). Draw-in: `tl.to('.tr',{strokeDashoffset:0,duration:0.4,ease:'power2.out'})`.
- Unpowered branch: same path with class `tr dim` → `stroke:var(--line);`.
- Current pulse (the signature — exactly once or twice per screen): duplicate the trace path as
  `<path class="pu" pathLength="100" d="…same d…"/>` with
  `stroke:var(--accent-2);stroke-width:6;stroke-dasharray:14 200;stroke-dashoffset:14;filter:drop-shadow(0 0 8px var(--accent-2));`
  Run it with `tl.to('.pu',{strokeDashoffset:-114,duration:0.4,ease:'power1.inOut'})` — thanks to `pathLength="100"` the 14-unit glowing segment enters at the source, races the full trace at uniform speed, and exits at the destination (offset −114 leaves it off-path, invisible) as the LED takes over. Finite, one pass.
- Via: `<circle class="via" r="10" fill="var(--paper)" stroke="var(--accent)" stroke-width="5"/>` at bends and trace ends; fade in after the trace draws.
- Chip package: `background:var(--panel);border:2px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);` with pin stubs as pseudo-element columns on both sides:
  `content:'';position:absolute;top:26px;bottom:26px;width:16px;left:-18px;background:repeating-linear-gradient(180deg,var(--accent) 0 12px,transparent 12px 40px);` (mirror with `right:-18px`).
  Inside: silkscreen cap (mono gold 32px, e.g. `U1 · MAIN`) over a `font-head` 900 word.
  States: active = `border-color:var(--accent-2); box-shadow:var(--shadow),var(--glow);` + cyan cap; done/unpowered = `opacity:0.55;`; queued = muted cap and word.
- LED: `width:26px;height:26px;border-radius:50%;background:var(--accent-2);box-shadow:var(--glow);` — revealed with `tl.from(led,{autoAlpha:0,duration:0.12,ease:'steps(1)'})` right as the pulse arrives, then STAYS LIT.
- Silkscreen note: mono 34px weight 700, tracking 0.28em, uppercase, `--muted`; inline `<em>` flips to `--accent` for the designator.
- Header strip: top row `left/right 90px`, designator+mode left / rail facts right (`VCC 3V3 · GND`), mono muted, `2px solid var(--line)` rule underneath.

## Block recipes
- title-card: header strip (`SCH-01 · INTRO` / `VCC 3V3 · GND`) → a wide U1 chip plate holding silk cap `U1 · MAIN` and the 96px headline → inbound trace from the left edge into the chip's pins, outbound stub exiting right → silk test-point footer (`TP1 ● SELF-TEST OK` / `GND`).
  Motion: strip fades, traces draw 0.4s power2.out, chip snaps y−20, pulse runs the inbound trace, corner LED lights by 0.9s and stays.
- big-number: a U7 sensor chip (word = the metric) left; a trace runs from its pins to a giant gold mono readout (`16` at 420px + muted `ms`); the pulse DELIVERS the number — digits snap up only when it arrives; LED at the junction via; `font-head` claim line below the readout.
  Motion: chip snaps, trace draws, pulse 0.35s arrives ≈0.8s, LED steps on, digits rise y+30 power3.out, claim last.
- steps: three chips in series on one straight bus (`M0 550 H1920` running under all three) — `S1 · DONE 拆解` (dim), `S2 · ACTIVE 换硅脂` (cyan outline + glow + LED), `S3 · QUEUED 装回` (muted). The pulse crosses the full bus, passing under each package.
  Motion: bus draws, chips snap in stagger 0.12, pulse traverses 0.45s, LED on the active chip lights at 0.95s.
- trend: an oscilloscope — a `--panel-2` screen with its own finer grid, silk header `CH1 · 帧率曲线` left and gold `PEAK 144 FPS` right; the waveform is a stepped trace (H runs + 45° edges) drawing left→right; the pulse rides the drawn beam and the beam-end LED lights; `font-head` verdict + silk `DIP < 5%` below the screen.
  Motion: screen snaps, header ticks steps(1), waveform draws 0.5s, pulse 0.4s, LED at 0.98s, caption rises.
- code: a serial console — inbound trace powers the panel first; silk header `TX ▸ RX · CONNECTED` with a header LED; mono 46px log lines (`>` cyan, values gold): `> POWER RAIL 3.30V · OK`, `> 风扇转速 1800 RPM`, `> 温度墙 83°C`, `> 系统就绪` closed by a cyan block cursor `▌`.
  Motion: trace draws, pulse arrives 0.55s, header LED lights, lines tick on steps(1) stagger 0.09, cursor blinks finite (`yoyo repeat 3`) ending visible by 1.18s — the card's only blinker.
- compare: one PSU source chip left, two parallel branches to two chips right — loser branch `tr dim` + muted via + dim chip (`U2 · 94°C 原装散热`), winner branch gold with the pulse + active cyan chip (`U3 · 62°C 加装风扇`) + LED. Current only flows where the argument goes. `font-head` verdict bottom.
  Motion: source snaps, both branches draw, chips snap top-then-bottom, pulse runs ONLY the winner branch, LED at 0.98s, verdict rises.
- quote: the quote as silkscreen print — silk speaker tag (`TP1 · 装机十年的老师傅`), two 96px `font-head` quote lines, then an underline trace routes beneath them with a 45° drop; the pulse underlines the quote and the end LED lights like a period. A dead gold stub decorates the top-right corner.
  Motion: tag ticks steps(1), lines rise y+24 stagger 0.14, trace draws under them, pulse 0.35s, LED at 0.98s.
- cta: a momentary switch closing the circuit — inbound trace ends at an OPEN lever (an SVG line rotated −30° at a via gap); the SW1 chip button holds 900-weight `关注`; pulse #1 arrives at the switch, the lever SNAPS closed (rotation→0), a cyan glow ring steps onto the button, pulse #2 runs the outbound trace and lights the far LED; `font-head` caption below.
  Motion: traces draw, button snaps, pulse1 0.25s → lever closes 0.15s power3.out at 0.6s → ring steps(1) → pulse2 0.28s → LED at 1.02s. Two pulses — the only screen allowed two.

## Compose-instruction crib
Embed directives like:
"通电电路板风:深 PCB 绿底 + 80px 淡网格;走线=内联 SVG path,描边 6px 铜金色,只许横平竖直 + 45° 折角,折点/端点放过孔圆;芯片=panel 色圆角 6px 面板,两侧 repeating-linear-gradient 引脚,内放 mono 金色丝印位号(U1/SW1/TP1)+ 黑体大字;电流效果=同路径复制一条 accent-2,pathLength=100 + stroke-dasharray:14 200 起始 offset 14,tween 到 -114,亮段沿线奔跑一趟后由 LED 圆点(accent-2 + glow)接棒常亮;三态铁律:没电=灰线,有电=铜金,激活=电光青,绝不混用;动效:走线 0.4s 画入 → 芯片 y-20 落位 → 电流跑线 → LED steps(1) 点亮收尾,全部 1.2s 内落定,有限次,禁无限循环。"

## Cadence
- One powered path per screen — the pulse always ends at the point being made, and an LED stays lit there.
- Unpowered = `--line`/muted, powered = gold, active = cyan; the three states never mix on one element.
- Traces route orthogonally with 45° bends only; every bend or trace end earns a via.
- The pulse fires AFTER the base trace has drawn and the destination exists — current never arrives at nothing.
- LEDs only turn on, never off; across a video the board accumulates lit LEDs like progress.
- Chips never move after landing; the current does the traveling.
- Every labeled element carries a reference designator (U/SW/TP/CH + number) that advances across the video.
- Header strip opens every card; rail facts (`VCC 3V3 · GND`) stay constant — the board is always powered.
- One blinker maximum per card (the console cursor), always finite, always ending visible.
- If a card feels empty, add board furniture: a dead trace stub, a test point, a GND caption — never abstract decoration.
