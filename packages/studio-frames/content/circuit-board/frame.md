---
id: circuit-board
title: 电路 Circuit
summary: 通电电路板:铜金走线、丝印标注、电流沿线奔跑,适合科技/教程/拆解
icon: ⚡
showcase: [title-card, big-number, steps, trend, code, compare, quote, cta]
palette: { paper: "#081611", panel: "#0F241B", panel-2: "#0B1D15", fg: "#E9F6EE", muted: "#E9F6EE99", accent: "#F0B84C", accent-2: "#53E6FF", line: "#E9F6EE21", grid: "#E9F6EE0B", radius: "6px", shadow: "0 18px 46px rgb(0 0 0 / 0.55)", glow: "0 0 26px rgb(83 230 255 / 0.55)", font-num: "'IBM Plex Mono', ui-monospace, monospace" }
version: 0.2.0
---

# Circuit Board — live powered PCB

A live, powered circuit board — not a paper schematic. Current runs through it: copper traces route orthogonally with 45° corner bends, via dots sit at the bends, chips are dark packages with pin stubs and silkscreen labels, and on every screen a glowing cyan CURRENT PULSE visibly travels along one trace and lights an LED at the point being made. Built for tech, tutorials and teardowns. Everything on the board is functional board furniture — silkscreen text, test points, power-rail captions — never decorative shapes.

## Palette semantics
- Deep PCB green is the substrate, with a faint fabrication grid.
- Three electrical states, and they never mix on one element: UNPOWERED is grey (dead branches, queued steps, annotations), POWERED is copper gold (traces, pins, vias, measured values), ACTIVE is electric cyan (the travelling pulse, lit LEDs, the active chip's outline).
- Glow belongs to cyan only — a lit LED, an active outline. Copper is matte; the board never haloes what isn't switched on.
- Silkscreen speaks in mono uppercase with reference designators — every labelled thing gets one (U1, SW1, TP1) — and values stay instrument-precise, never humanized.

## Layout language
- Traces route only horizontal, vertical and 45°; every bend or trace end earns a via. Chips sit ON the routing — traces run under packages, current arrives AT things.
- One powered path per screen: the composition is literally a circuit from source to destination, and the destination is the point being made.
- A header strip opens every composition with designator and rail facts; if a screen feels empty, add board furniture — a dead stub, a test point, a ground caption — never abstract decoration.
- Comparisons are parallel branches: current flows only where the argument goes; the losing branch stays unpowered.

## Signature (miss one and it is off-system)
- The current pulse: once (twice at most) per screen, a bright segment races the drawn trace and hands off to an LED that turns on and STAYS on. Current never arrives at nothing.
- The three-state discipline — grey, copper, cyan, never blended on one element.

## Motion personality
Electrical sequence: traces draw first, packages snap into place, the pulse runs, the LED steps on at the destination and holds. Chips never move after landing — the current does the travelling. Across a video the board accumulates lit LEDs like progress; LEDs only ever turn on.

## Two faces
- Overlaid on footage: breakout modules soldered over the shot — a silkscreen header, a corner readout, a spec chip — each on its own patch of substrate so its copper has board beneath it.
- As a full page: the whole powered board, routing and packages edge to edge, one path lit.

## Taboos
Decorative shapes with no electrical job. Curved or diagonal free-angle traces. Mixed electrical states on one element. Glow on copper. Infinite blinking. An LED turning off. Humanized numbers. Slanted type.
