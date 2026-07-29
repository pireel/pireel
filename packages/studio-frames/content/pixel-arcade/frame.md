---
id: pixel-arcade
title: 像素 Arcade
summary: 8-bit 街机:硬像素块、血条金币、PRESS START,适合游戏/测评/整活
icon: 👾
showcase: [title-card, big-number, count-up, countdown, steps, code, quote, compare, cta]
palette: { paper: "#14122B", panel: "#221F45", panel-2: "#1A1738", fg: "#F4F1FF", muted: "#F4F1FF99", accent: "#FFD23F", accent-2: "#3EE6C1", line: "#F4F1FF2E", grid: "#F4F1FF12", radius: "0px", shadow: "8px 8px 0 rgb(0 0 0 / 0.55)", glow: "0 0 30px rgb(62 230 193 / 0.4)", font-num: "'IBM Plex Mono', ui-monospace, monospace" }
version: 0.2.0
---

# Pixel Arcade — 8-bit cabinet screen

An arcade cabinet screen. Deep-space indigo under a faint tile grid, ZERO rounding anywhere, and hard offset shadows with no blur — every element looks stamped out of pixels, with plate corners stepped like sprites rather than rounded. The chrome is a game HUD: coin counters, HP bars, level plates, a blinking PRESS START. Built for gaming, reviews and bit-crushed comedy. Motion is mechanical — things snap, tick and blink in hard steps; nothing eases softly.

## Palette semantics
- Deep indigo is the screen; plates sit on it with stepped pixel corners and the hard stamped shadow — which doubles as the text shadow on headlines and hero numerals.
- COIN GOLD owns scores, coins, PRESS START and level captions. MINT owns bar fills, arrows and the active state — and the mint active outline is the only thing allowed to glow. Gold and mint never touch: an active plate's numbers stay white, not gold.
- Near-white writes the body; the faded voice marks cleared and locked states.
- Numbers pad like ROM counters — fixed-width, zero-padded, never humanized.

## Layout language
- The HUD strip opens every screen: coins left, score right, a hard rule underneath. Coin counts and scores only ever go UP across a video.
- The video is one play-through: stage labels advance screen to screen, steps are exactly three LEVEL plates (cleared / playing / locked, exactly one active), the finale is the score screen.
- Bars fill cell by cell, never smoothly, and never empty on screen. Dialogue lands in an RPG text window pinned low; the CTA speaks arcade idiom — insert coin, press start, continue — never a rounded button.
- Everything speaks mono uppercase with wide tracking; headline words stay short so the stamped shadow keeps reading.

## Signature (miss one and it is off-system)
- Zero radius, everywhere, forever — one rounded corner and the cabinet is broken. Stepped pixel corners are the plate's identity.
- The hard offset shadow with no blur, on plates and headlines alike — the stamped look.

## Motion personality
Mechanical: plates slam in on a hard fast curve, cells and arrows tick on in discrete steps, one blinker per screen blinks a finite number of times and ends visible. No rotation, no elastic, no soft anything.

## Two faces
- Overlaid on footage: HUD sprites over the live feed — a score banner, a corner coin counter, a dialog box, an HP bar — each on its own hard-edged plate, never covering the player on camera.
- As a full page: the full cabinet screen loads — indigo and tile grid edge to edge, HUD and level plates like an attract mode.

## Taboos
Any border radius. Blurred or soft shadows. Smooth bar fills. Humanized numbers. Gold on an active mint element. Rotation or elastic easing. Two blinkers on one screen. A web-style button.
