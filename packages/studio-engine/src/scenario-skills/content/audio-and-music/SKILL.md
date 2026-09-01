---
name: audio-and-music
description: Craft rules for sound in Pireel Studio: background music (set_bgm / generate_music), per-clip sound (set_shot_audio), narration / music / SFX audio clips (register_media + add_clips), transitions (add_transition), beat-aligned cuts (get_beat_grid), noise cleanup (denoise_audio) and speed changes (set_video_speed). Read before adding or fitting music or sound effects, changing levels, or placing transitions.
---
# Sound, music and transitions

Sound is what makes an edit feel finished or amateurish long before anyone notices a graphic. The
tools are simple; the craft is in levels, edges and restraint. Add none of this unless the request or
the selected Studio Skill asks for it — but when asked, do it completely rather than dropping a track
on the timeline and moving on.

## Where music comes from (cheapest first)

1. **The user's own file** — bring it in through the local import helper (agent plugins: the
   `asset-import` reference, audio row) or the Studio upload panel, then use its url / registration.
2. **Already available audio** — `list_assets {kind:"audio"}` or `search_assets` across
   `mine` / `cloud` / `official`; use the returned locator, never an invented url.
3. **Generate** — `generate_music` charges Pireel credits: state the cost and get a yes first. Prompt
   shape: genre or instrumentation + energy + role under the picture + constraints. Example:
   `warm acoustic guitar and soft percussion, calm and confident, background bed under a spoken product
   walkthrough, no vocals, no sudden dynamics, loop-friendly`. Under speech always add `no vocals`.
   Generation cannot promise beat or drop positions — fit the music with the timeline tools afterwards.

Never present generated music as a substitute for a copyrighted track the user asked for by name.

## Placing a music bed with `set_bgm`

`set_bgm {url, startSec?}` adds one audio clip on the music lane and returns its `trackId`. The level
auto-balances against the measured narration loudness when `volumeDb` is omitted on add. Music clips are
plain: **no looping, no auto-ducking; overlapping clips sum.** So:

- **Start** at `0` unless the edit opens on a cold silent beat or the user asks for a late entrance.
- **End on the picture.** After the cut is final, read the last visual clip's end from `get_timeline`
  and set `tailSec` to it. Music must never outlast the last visual clip — a silent black tail is the
  most common amateur tell.
- **Edges**: `fadeInSec` 1–2 s at the start, `fadeOutSec` 1.5–3 s at the end. Internal seams (after a
  `splitAtSec`) get 0.3–0.5 s.
- **Music shorter than the picture**: do not stretch it. Add the same url a second time with
  `startSec` = first clip's end − 1.5 s, fade the first out and the second in over that overlap, and
  trim the last repeat with `tailSec`. Compute every start before placing; place them in one pass.
- **Music longer than the picture**: one clip, `tailSec` at the picture end, fade out.
- **Speed** (`speed` 0.5–2) changes pitch on purpose; use it only when the user wants that effect.

## Levels: sit under the voice

There is no automatic duck, so the level *is* the mix:

- With speech present, keep the bed roughly **−18 to −12 dB relative to source level** (`volumeDb`
  negative; the auto-balance on add usually lands here — trust it unless the user says the music is too
  loud or too quiet, then move in 3 dB steps).
- Where nothing is spoken (intro, outro, montage passage) the bed may rise. Do it by **splitting**:
  `set_bgm {trackId, splitAtSec}` at the speech start / end, then `volumeDb` per segment (e.g. −6 for
  the intro, −15 under speech, −6 on the outro) with 0.5 s fades at the seams. This is the manual duck;
  two or three segments are enough — do not chop the bed at every sentence.
- Never fix speech clarity by both lowering the whole bed to a whisper *and* asking for more; pick one
  audible base level and duck only where speech needs it.
- No prominent lyrics under speech. Tone matches content: a tense reveal does not get a ukulele.

## Per-clip sound: `set_shot_audio`

B-roll and inserted clips carry their own sound. Under narration, lower them (`volumeDb` −20 to −30)
or `mute` them, and give exposed edges `fadeInSec` / `fadeOutSec` 0.2–0.4 s so cuts do not pop. Batch
with `shotIds` or `all:true`; never one call per shot. Keep a source's own sound audible when it *is*
the content (a demo click, an engine, applause, a reaction).

## Narration, music and SFX as typed audio clips

Imported or generated audio can also live as an ordinary clip on its typed lane: pass the helper's or
`generate_speech`'s registration unchanged to `register_media`, then `add_clips` with
`role: "narration" | "music" | "sfx"` and a `startSec`. Use `set_clip_properties` for exact
`startSec` / `sourceInSec` / `sourceOutSec` retrims. Narration placed this way is transcript-readable via
`read_script {assetId}` when word timing matters.

**Sound effects**: Pireel has no built-in SFX library yet — use the user's files or a library asset. Anchor
each SFX at its editorial moment (the reveal, the click, the transition), keep them short, and never stack
two on the same beat. If the user wants an effect you cannot source, say so instead of faking it with music.

## Transitions: `add_transition`

A hard cut is the default and is usually the strongest rhythm. Add a transition only where the boundary
communicates a real change of time, place, chapter, source or emotional mode — not to soften a jump
cut inside one speech (fix that with framing or B-roll instead).

- `add_transition {atSec, effect, durationSec}` at an existing shot boundary; `effect:"none"` removes.
- Duration **0.5–1 s** (max 4). Longer only for a deliberate dreamy or chapter beat.
- One style family per video: `fade` / `fadeblack` for time and chapters; `directional` /
  `directionalwipe` (with `direction`) for place changes; `crosszoom` for an energy jump; `circleopen` /
  `windowslice` / `rotatescale` for playful or reveal moments; `glitch` / `dreamy` only when the visual
  language already says so. Do not mix four families in one piece.
- Never put a transition across the middle of a spoken sentence, and not on every B-roll insert seam by
  default.

## Rhythm: cutting to music

When a music-led passage should land on the beat, call `get_beat_grid` with the music asset or placed
clip and an explicit `bpm` (from the asset's metadata or the user; it does not detect tempo). Use the
returned exact times with `split_clips` / `move_clips`. Cut on phrases and accents, not on every beat —
let some motion cross the bar so the viewer feels momentum rather than a metronome.

## Cleanup and speed

- `denoise_audio {strength}` (default 0.6) cleans noisy narration; re-tune is cheap. Turn it `off` if it
  thins the voice.
- `set_video_speed {shotIds|all, speed}` for slow-mo (0.25–1) or speed-ups (1–4); primary narrative ripples
  later material by default, B-roll does not.

## Verify

Neither `capture_frame` nor `review_sequence` hears anything. Confirm the mix from `get_timeline` /
`get_state` receipts — music start and end against the last visual clip, fades present, segment levels,
B-roll clips lowered — and tell the user in plain words what they will hear ("music comes in with the
first shot, sits under your voice, lifts on the outro and ends with the last frame"), then invite them to
press play. Undo is one `undo` per step.
