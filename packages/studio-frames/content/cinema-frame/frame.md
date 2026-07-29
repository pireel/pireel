---
id: cinema-frame
title: 影院 Cinema
summary: 黑边宽幕:中英双语字幕、时间码、片名卡,适合剧情/影评/vlog 大片感
icon: 🎬
showcase: [title-card, chapters, quote, cta, big-number, compare, list, lower-third]
palette: { paper: "#0B0B0B", panel: "#141414", panel-2: "#101010", fg: "#EDEAE4", muted: "#EDEAE480", accent: "#E8B54D", accent-2: "#6E7F8D", line: "#EDEAE41F", grid: "#EDEAE40A", radius: "2px", shadow: "0 20px 50px rgb(0 0 0 / 0.7)", glow: "0 0 0 rgb(0 0 0 / 0)", font-head: "'Noto Serif SC', 'Songti SC', serif" }
version: 0.2.0
---

# Cinema — letterboxed frames that speak in subtitles

A film still. Solid letterbox bars squeeze the frame into a widescreen band, and everything inside behaves like cinema: bilingual subtitles bottom-centre, a scene slate and a timecode in the upper corners, serif title cards with micro-credits. The middle of the band stays mostly EMPTY — the shot itself lives there. Built for storytelling, film commentary and cinematic vlogs. Type is quiet warm-ivory serif; nothing bounces; everything fades like a cut.

## Palette semantics
- The theatre dark is the ground; the letterbox bars are a hair lighter, edged by hairlines. Text never sits on the bars.
- Warm ivory carries all reading text; faded ivory voices the English subtitle line, credits, slates and timecodes.
- Projector gold is rationed to ONE thing per composition: a single emphasized word inside the Chinese subtitle, OR one thin rule under a title — never both, never a fill, never a button.
- Steel blue exists only for the tiny recording-status accents inside slates.
- Light comes from the projector, not from CSS: no glow, corners essentially square.

## Layout language
- Bars first, always: every composition opens by re-establishing the widescreen band, and content lives inside it.
- The subtitle stack is the voice: a serif Chinese line over a small wide-tracked English capitals line, both centred low in the band.
- Chrome is production paperwork: scene/take slates, running timecodes, credit rows with wide gaps — quiet mono and small caps in the corners.
- Emptiness is composition: the centre of the band is the imagined shot; filling it with graphics turns cinema into slideware.

## Signature (miss one and it is off-system)
- The letterbox bars sliding in from off-frame at the start of every composition.
- One gold spotlight per composition — the emphasized subtitle word or the thin title rule, never more.

## Motion personality
Cut, fade, hold. Bars slide in, then contents fade with the smallest drift, like dialogue appearing over a held shot. Nothing scales, nothing pops, nothing animates like an app.

## Two faces
- Overlaid on footage: the footage IS the shot — only bars, slates and subtitle text carry fill, and the film shows through everything else.
- As a full page: an end-title or poster card — the full theatre dark, a centred serif title, gold rule and credits — used only when a designed scene is explicitly the point.

## Taboos
Text on the bars. Two gold elements. Gold fills or buttons. Glow. Scaling or bouncing entrances. A busy centre band. Sans-serif headlines. Painting over the film.
