---
name: video-graphics
description: Make a video's on-screen graphics as its own video-level template. Write the look once (set_look: a stylesheet plus a few parametric pieces), place instances of its pieces timed to the speech (place_graphics), look at the result, and hand the creator only what they must confirm (set_confirm_list). Read before adding titles, cards, numbers, lists or any other graphics to a video.
---
# Graphics as a video-level template

The creator will publish what you make without editing it, so the graphics have to be finished work.
What goes on screen, how it looks and how it moves are your decisions. This skill describes the tools
and the order of work, not taste.

## 1. Know the material

Before designing anything, know what is actually in the picture and in the speech: what the video is
about, who speaks, what is already on screen (burned-in captions, notes, logos), where faces, hands
and products are, where the frame is calm or busy, bright or dark, where the managed captions sit, and
what the platform's own interface covers.

- In Studio chat, `get_facts` measures this locally: scenes with region grids, people and safe areas,
  levels, voice activity, the caption band and platform zones.
- Anywhere, `get_transcript` gives the words with timing, and `inspect_timeline` shows real frames.
  Look at frames yourself; measurements are not a substitute for looking.

## 2. Write the look (`set_look`)

A look is this video's own template: one stylesheet and a few parametric pieces that every graphic
of the video is an instance of. Decide it from this material and this content.

- `css` applies inside pieces only; `:root` means the look.
- Each piece is `function (props, ctx) { return { html, animate(tl, el, ctx) { … } }; }`.
  - `html` is the markup.
  - `animate` builds motion on the paused GSAP timeline `tl`, where time 0 is the instance start.
  - `el` is the piece host.
  - `ctx` holds `{ width, height, duration, words }`: the box in px, the instance length, and the
    spoken words the instance lands on.
- Every frame must depend on time only. Motion goes through `tl`; there are no timers, clock or
  unseeded randomness.
- `propsSchema` declares what a creator can change without regenerating: the words, numbers and
  items the piece shows. It becomes the piece's form in the inspector, so give each property a
  `title` in the creator's language.
- A rejected look lists exact issues. Fix those and send the whole look again.

## 3. Place instances (`place_graphics`)

Each item is a piece, its props, a box in canvas units (0–1) and its time in frames.

- Take times from the transcript, so a graphic appears as the words that call for it are spoken.
  `words` passes those words to the piece.
- `anchor` ties an instance to a spoken word, so it follows the word through later cuts.
- Structure that runs through the video can be one instance whose props change over time, or a series
  of instances. Choose what reads best.

## 4. Look at it

The receipt returns a still of every placed instance at its settled moment on the real picture. Use
`inspect_timeline` for entrances, transitions, the busiest moments and anything you are unsure of.

Fix what you see before handing over:
- place and time with `move_clips` and `set_clip_properties` (`box`);
- the look itself with `set_look`.

## 5. Hand over (`set_confirm_list`)

List only what the creator must confirm (`kind: fact`):
- facts you could not verify;
- speech you could not hear clearly;
- names you inferred from the picture;
- claims and borrowed sources.

If the video needs music or a voice, propose it as an item (`kind: music` or `voice`) instead of
applying it. The creator confirms or swaps it before it is used, and paid voice generation always
waits for that.

Design choices are not on this list.
