---
id: neon-runner
title: 霓虹 Neon
summary: HUD 终端:扫描网格、状态栏、mono 读数、光标,适合科技/健身/游戏口播
icon: 🌃
showcase: [title-card, big-number, count-up, countdown, trend, steps, code, chart, cta]
palette: { paper: "#07100C", panel: "#0E1A13", panel-2: "#0A140E", fg: "#EAFFF3", muted: "#EAFFF399", accent: "#39FF88", accent-2: "#FF3D8A", line: "#39FF8830", grid: "#EAFFF30D", radius: "12px", shadow: "0 16px 44px rgb(0 0 0 / 0.6)", glow: "0 0 36px rgb(57 255 136 / 0.5)", font-num: "'IBM Plex Mono', ui-monospace, monospace" }
version: 0.2.0
---

# Neon — terminal HUD that glows

A heads-up display. Night-green terminal dark under a faint scan grid, corner brackets, a status bar, mono readouts, a command prompt with a blinking cursor. Built for tech, fitness and gaming narration. Fast, technical, alive — and HUD logic governs everything: chrome and metrics pin to the edges and corners, because the CENTER belongs to the person on camera.

## Palette semantics
- The night surface and its scan grid are the atmosphere; hairlines carry a faint neon tint.
- Neon GREEN owns data and progress, and data glows — readouts, drawn lines, the active state. Everything that is not data stays matte.
- MAGENTA is the alert voice: personal bests, warnings, the running cursor — always in its own element, never sharing a frame with green on the same piece of chrome.
- Faded mint voices labels and completed states.

## Layout language
- The status bar opens every composition — recording dot, session tag, small facts — with corner brackets claiming the frame's diagonal.
- Readouts are the heroes: a giant mono value with a small spaced unit, pinned toward an edge; headlines may glow, chrome never does.
- The prompt idiom runs through everything: command lines with a leading marker, checklists that tick on, terminal panes with one highlighted line, progress that draws itself.
- Labels speak mono capitals with wide tracking; alerts arrive as bordered magenta tags that blink a couple of times and settle visible.

## Signature (miss one and it is off-system)
- The edge discipline: metrics and chrome at the edges, the centre held clear for the person — a HUD that covers the subject has failed as a HUD.
- Glow on data only. If chrome glows too, nothing reads as data.

## Motion personality
Quick technical snaps: chrome lands first, values slide up fast, lines draw at constant speed, cursors and alerts blink a finite number of times and end visible. Nothing bounces; nothing loops forever.

## Two faces
- Overlaid on footage: HUD overlays reading the live feed — status bar, brackets, readouts and tags carry their own panel fills at the edges while the feed shows through the middle.
- As a full page: the boot-screen takeover — night surface and scan grid edge to edge — for the rare full-screen system moment.

## Taboos
Covering the centre. Glow on non-data. Green and magenta on one element. Infinite blinking. Soft bouncy easing. Humanist serif voices. Decorative shapes with no HUD job.
