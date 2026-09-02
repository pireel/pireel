---
name: audio-and-music
description: Craft rules for sound in Pireel Studio: music beds and sound effects as typed audio clips (register_media + add_clips), levels, fades and speed (set_clip_properties), text-to-music and text-to-sound-effect (generate_audio), picture-synchronous Foley (generate_foley), transitions (add_transition), beat-aligned cuts (get_beat_grid) and noise cleanup (denoise_audio). Read before adding or fitting music or sound effects, changing levels, or placing transitions.
---
# Sound, music and transitions

Sound is what makes an edit feel finished or amateurish long before anyone notices a graphic. The
tools are simple; the craft is in levels, edges and restraint. Add none of this unless the request or
the selected Studio Skill asks for it — but when asked, do it completely rather than dropping a track
on the timeline and moving on.

Timeline positions and durations are frames; read `fps` from `get_state` once and convert (at 30 fps,
1 s = 30 frames). Source positions and transcript timing stay in seconds.

## Where music comes from (cheapest first)

1. **The user's own file** — bring it in through the local import helper (agent plugins: the
   `asset-import` reference, audio row) or the Studio upload panel; it is then registered in the
   project library and ready to place by asset id.
2. **Already available audio** — `search_assets {kind:"audio"}` in `mine` (this project's library),
   then `official`, then `cloud`; place by the returned id or locator, never an invented url.
3. **Generate** — `generate_audio {kind:"music"}` charges Pireel credits: state the cost and get a yes
   first. Prompt shape: genre or instrumentation + energy + role under the picture + constraints.
   Example: `warm acoustic guitar and soft percussion, calm and confident, background bed under a spoken
   product walkthrough, no vocals, no sudden dynamics, loop-friendly`. Under speech always add
   `no vocals`. Generation cannot promise beat or drop positions — fit the music with the timeline
   tools afterwards.

Never present generated music as a substitute for a copyrighted track the user asked for by name.

## Placing a music bed

Music is an ordinary audio clip on the music lane: `register_media` for a generated or remote result
(project-library audio is already registered), then `add_clips {role:"music", assetId, startFrame,
durationFrames?, source?, volumeDb?, fades?}`. Music clips are plain: **no looping, no auto-ducking;
overlapping clips sum.** So:

- **Start** at frame 0 unless the edit opens on a cold silent beat or the user asks for a late
  entrance.
- **End on the picture.** After the cut is final, read the last visual clip's end frame from
  `get_state` and give the bed exactly that `durationFrames` (or retrim with `set_clip_properties
  source`). Music must never outlast the last visual clip — a silent black tail is the most common
  amateur tell.
- **Edges**: `fades {in, out}` in frames — in 1–2 s, out 1.5–3 s. Internal seams (after a
  `split_clips`) get 0.3–0.5 s on both sides.
- **Music shorter than the picture**: do not stretch it. Place the same asset a second time starting
  1.5 s before the first clip ends, fade the first out and the second in over that overlap, and trim
  the last repeat to the picture end. Compute every start before placing; place them in one
  `add_clips` call.
- **Music longer than the picture**: one clip, duration to the picture end, fade out.
- **Speed** (`set_clip_properties speed` 0.5–2) changes pitch on purpose; use it only when the user
  wants that effect.

## Levels: sit under the voice

There is no automatic duck, so the level *is* the mix:

- With speech present, keep the bed roughly **−18 to −12 dB relative to source level** (`volumeDb`
  negative). If the user says the music is too loud or too quiet, move in 3 dB steps.
- Where nothing is spoken (intro, outro, montage passage) the bed may rise. Do it by **splitting**:
  `split_clips` at the speech start and end frames, then `set_clip_properties` with a `volumeDb` per
  segment (e.g. −6 for the intro, −15 under speech, −6 on the outro) and 0.5 s fades at the seams —
  one call for all segments. This is the manual duck; two or three segments are enough — do not chop
  the bed at every sentence.
- Never fix speech clarity by both lowering the whole bed to a whisper *and* asking for more; pick one
  audible base level and duck only where speech needs it.
- No prominent lyrics under speech. Tone matches content: a tense reveal does not get a ukulele.

## Per-clip sound

B-roll and inserted clips carry their own sound (linked audio shows as `audio:{clipId}` on the visual
clip in `get_state`; address that nested id). Under narration, lower them (`volumeDb` −20 to −30) or
`mute` them, and give exposed edges `fades` of 0.2–0.4 s so cuts do not pop. Batch all of them in one
`set_clip_properties` call; never one call per clip. Keep a source's own sound audible when it *is*
the content (a demo click, an engine, applause, a reaction).

## Narration, music and SFX as typed audio clips

Imported or generated audio lives as a clip on its typed lane: pass the helper's or
`generate_speech`'s registration unchanged to `register_media`, then `add_clips` with
`role: "narration" | "music" | "sfx"` and a `startFrame`. Use `set_clip_properties` for exact
`source [inSec, outSec]` retrims and `move_clips` for timing. Narration placed this way is
transcript-readable with `get_transcript` when word timing matters.

**Sound effects** have three sources — use them in this order:

1. **An existing sound** — the user's files, or a library asset found with `search_assets
   {kind:"audio"}` (official library first; reuse a timing-compatible sound before generating
   anything) → `add_clips {role:"sfx"}` (with `register_media` first only for remote results).
2. **`generate_audio {kind:"sfx"}` — off-screen / editorial sound from a text description**
   (server-side, so it also works over MCP; charges credits, 0.5–22 s). This is the path for
   whooshes, UI pings, stingers, risers, impacts and ambience beds — sounds no picture drives.
   Describe the *sound*, not the scene: source, material, motion, intensity, perspective, duration
   feel ("short airy whoosh, fast, passing left to right"; "soft glass notification ping, single
   hit"). Keep hits and whooshes at 0.5–2 s; use `loop:true` only for ambience beds. Never ask it
   for speech or music.
3. **`generate_foley` — picture-synchronous Foley** (Studio chat only: it needs the in-Studio
   approval card, so over MCP tell the user to run that step in Studio Chat). Give it up to 8 items,
   each an exact 1–30 s source span of a video asset plus a prompt naming only audible events
   grounded in the picture — action, material, intensity, perspective, room, timing
   (`negativePrompt` for speech / music / ambience to exclude). It shows the event list and the
   credit cost, waits for approval, uploads only those spans, generates with a video-to-audio model,
   saves each result as a reusable AAC in the cross-project audio library with `eventType` /
   `material` / `reusePolicy`, and returns registration fields. One coherent visible action = one
   item; merge continuous actions; skip static, speech-only, decorative or misleading events. Never
   use it for speech or music.

Place every generated result with `register_media` and **one** `add_clips` call using `role: "sfx"`
and no `trackId`, so overlapping hits land on parallel SFX lanes. Anchor each SFX at its editorial
frame, keep it short, never stack two on the same beat, and set level and fades in the same
`add_clips` items or one `set_clip_properties` call — a sound effect that is louder than the voice is
a mistake, not emphasis.

## Transitions: `add_transition`

A hard cut is the default and is usually the strongest rhythm. Add a transition only where the boundary
communicates a real change of time, place, chapter, source or emotional mode — not to soften a jump
cut inside one speech (fix that with framing or B-roll instead).

- `add_transition {atFrame, effect, durationFrames}` at an existing boundary between two story-spine
  clips; `effect:"none"` removes.
- Duration **0.5–1 s** (max 4 s). Longer only for a deliberate dreamy or chapter beat.
- One style family per video: `fade` / `fadeblack` for time and chapters; `directional` /
  `directionalwipe` (with `direction`) for place changes; `crosszoom` for an energy jump; `circleopen` /
  `windowslice` / `rotatescale` for playful or reveal moments; `glitch` / `dreamy` only when the visual
  language already says so. Do not mix four families in one piece.
- Never put a transition across the middle of a spoken sentence, and not on every B-roll insert seam by
  default.

## Rhythm: cutting to music

When a music-led passage should land on the beat, call `get_beat_grid` with the music asset or placed
clip and an explicit `bpm` (from the asset's metadata or the user; it does not detect tempo). Use the
returned frames with `split_clips` / `move_clips`. Cut on phrases and accents, not on every beat —
let some motion cross the bar so the viewer feels momentum rather than a metronome.

## Cleanup and speed

- `denoise_audio {strength}` (default 0.6) cleans noisy narration; re-tune is cheap. Turn it off if it
  thins the voice.
- `set_clip_properties {speed}` for slow-mo (0.25–1) or speed-ups (1–4); the story spine ripples later
  material by default, other lanes do not.

## Verify

`inspect_timeline` shows pictures and hears nothing. Confirm the mix from the `get_state` receipt and the
deltas — music start and end against the last visual clip, fades present, segment levels, B-roll clips
lowered — and tell the user in plain words what they will hear ("music comes in with the first clip,
sits under your voice, lifts on the outro and ends with the last frame"), then invite them to press
play. When something lands wrong, make the forward correction (set the level again, move the clip);
undo is for the user to ask for.
