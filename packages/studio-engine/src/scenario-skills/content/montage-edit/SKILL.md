---
name: montage-edit
description: Discover the governing emotion and visual motifs in a body of footage, then compose a montage whose image, rhythm, sound, and text form one intentional experience.
---

# Montage editing

A montage is not a bin of attractive shots cut to every beat. It is a compressed experience: images, sound, speech, motion, and absence organized around a governing feeling or idea.

Begin by sensing the material. The correct structure depends on what the footage actually contains and what the viewer should feel. A tribute, product sizzle, travel memory, event recap, mood film, and campaign teaser may all be montages, but they should not share one mechanical route.

## Define what the montage is for

Recover the brief from the request and project before asking for more information. Useful dimensions include:

- occasion and intended viewer;
- emotional destination, not only generic adjectives;
- target surface and approximate duration;
- whether the viewer needs to understand events or mainly feel them;
- source of music, narration, interview audio, or ambient sound;
- people, moments, products, sponsors, or messages that must appear;
- material that must not appear;
- chronological or factual obligations;
- brand identity, typography, titles, end cards, and rights constraints.

Translate vague mood words into an experiential direction. “Energetic” can mean playful release, competitive urgency, glamorous momentum, or communal excitement. Those are different films.

If the emotional destination, occasion, or must-include material is unknown and cannot be inferred, ask one concise question. If there are two or three plausible named directions, use `ask_user` to let the user choose. Wait when the choice changes the governing idea.

If the request expects music-led editing but no usable music is present, do not silently choose an arbitrary track. Determine whether the user wants existing licensed music, a supplied track, generated music, or a montage led by source sound. Use `ask_user` when those are concrete options; ask naturally when rights or brand requirements need an open-ended answer.

## Watch and listen before imposing a structure

Montage decisions are often carried by visuals and sound that transcripts miss: glances, entrances, texture, camera motion, crowd energy, mechanical action, room tone, imperfect but intimate moments.

Use the tools that expose the material:

- `get_state` for the existing sequence, tracks, outputs, and media usage, including library media not yet placed;
- `inspect_media` for shot content, movement, composition, quality, and usable spans — metadata first, frames for the actual pixels of candidate stills, geometry for cuts and subject tracks; the semantic and editorial modes charge and are for content understanding or a comparative review against a brief;
- `get_transcript` only when speech may provide a spine or meaningful fragments;
- project-library media is already registered: place chosen footage, stills, and audio directly by asset id with `add_clips`/`insert_clips` at real timing. Use `register_media` only for generated or remote media carrying an exact returned locator, never a locator built by hand;
- `organize_media` to make large source collections navigable by truthful editorial groupings.

Do not organize only by filename or camera. Build a perceptual understanding of the material:

- faces, relationships, gestures, and reactions;
- establishing scale, environment, and atmosphere;
- actions with clear anticipation and completion;
- entrances, exits, reveals, impacts, and transitions;
- repeated shapes, colors, directions, objects, or camera moves;
- changes in energy, light, crowd density, weather, or time;
- usable source sound: breaths, applause, impact, laughter, engines, room tone, machinery;
- hero images and fragile one-time moments;
- technical weaknesses that might become texture or must be avoided;
- shots required for factual or stakeholder coverage.

Keep a loose motif ledger in working context. It can be prose. It should make visible the recurring visual or sonic ideas the edit can develop, not trap the film inside a taxonomy.

For a complete montage, settle the chosen sequence and audiovisual contrast in working context before building the draft — a few sentences naming the governing gesture, the order of movements, and where sound leads. Then build the draft in as few passes as possible, and repair a passage by its clips rather than rebuilding the whole edit.

## Find the governing gesture

Choose a simple internal sentence for the montage: what should the viewer experience changing?

Examples of governing gestures:

- isolation gathers into community;
- preparation breaks into performance;
- unfamiliar details accumulate into a sense of place;
- precision builds until the product feels inevitable;
- memory moves from fragments to gratitude;
- controlled tension releases into celebration.

This is not necessarily on-screen copy. It is an editorial compass. Every major section should advance, complicate, or release it.

A list of mood adjectives is not enough. “Bold, premium, dynamic” does not decide what comes first, what repeats, or why the ending lands.

## Choose a structure native to the purpose

Select or invent the structure that fits the material. Do not force all montages through the same template.

### Music-led energy arc

Use when the emotional journey and kinetic pleasure lead. Shape sections around musical phrases, density, tension, release, and sonic contrast. Do not cut on every beat. Let some motion cross beats so the viewer feels flow rather than a metronome.

### Speech-spine montage

Use when a short interview, vow, manifesto, testimonial, or narration gives the images meaning. Build the spoken arc first, then let visuals provide evidence, contrast, memory, or emotional expansion. Avoid wallpaper B-roll that merely repeats the noun being spoken.

### Chronological event compression

Use when viewers need a truthful sense of progression: arrival, preparation, opening, peak, aftermath. Compress time while preserving the event's causal order. Chronology can still have motifs and emotional shaping; it need not become a checklist recap.

### Impressionistic mood film

Use when atmosphere is the message. Organize by visual rhyme, texture, sensation, or association. Supply just enough anchors that intentional ambiguity does not read as confusion.

### Teaser or reveal

Use when withholding and controlled disclosure are central. Progress from partial evidence toward a hero reveal. Protect the reveal from premature wide shots, titles, thumbnails, or explanatory copy.

### Tribute or memory piece

Use when dignity, relationship, and recognition matter more than velocity. Give faces and source sound time to register. Avoid using emotional music to manufacture a relationship the images do not show.

### Product or craft montage

Use when process, material, and precision build desire. Favor actions with clear tactile or mechanical consequences. Distinguish illustrative beauty from proof of a product claim.

Hybrid structures are valid. Name the dominant logic so competing impulses do not flatten the edit.

## Shape the energy contour

Sketch an energy contour before committing every shot. It can be a few phrases, not a numeric graph.

Consider:

- how quickly the world becomes legible;
- where curiosity becomes investment;
- where density grows or breaks;
- what image or sound marks a turn;
- whether the peak is scale, intimacy, speed, reveal, or recognition;
- what emotional residue the final shot should leave.

Use contrast deliberately:

- wide against intimate;
- stillness against motion;
- source sound against full music;
- rapid compression against a held look;
- preparation against outcome;
- visual abundance against a single isolated detail.

A montage that only accelerates has no shape. A montage with constant shot length feels mechanically even when the music changes.

## Build a tone proof before scaling an unresolved direction

When the montage is long, high-stakes, dependent on expensive generation, or emotionally ambiguous, assemble a short representative passage first. The tone proof should demonstrate the intended image language, pace, music relationship, text behavior, and sound treatment.

Ask the user to choose or approve the direction before finishing the full piece when:

- two emotional readings of the same footage are both plausible;
- the music choice will determine most timing decisions;
- a brand-safe route and an experimental route diverge materially;
- generated visuals or paid assets would multiply cost;
- the occasion is personal, memorial, ceremonial, or otherwise sensitive.

Use `ask_user` for named options such as “intimate and observational” versus “large-scale and celebratory.” Ask one open-ended question when the desired feeling cannot be reduced honestly to a short menu. Wait after asking; do not treat silence as approval.

Skip the tone proof when the user supplied a precise reference, approved direction, and bounded deliverable, or explicitly asked you to exercise full editorial judgment.

## Compose shots by relationship

Place a shot because of its relationship to the shots around it, not because it is independently attractive.

Useful relationships include:

- match on action, direction, shape, color, gaze, or scale;
- cause followed by visible consequence;
- question followed by image evidence;
- repetition with meaningful variation;
- expectation followed by reversal;
- detail followed by the whole it belongs to;
- sound beginning before its image or surviving after it;
- a face reacting to what the previous shot established.

Respect screen direction and spatial legibility unless disorientation is intentional. Protect the completion of important action. Cutting before contact, reveal, or reaction can remove the very satisfaction the shot was selected for.

Do not use a transition effect to repair unrelated images. First search for a stronger visual, motion, sonic, or conceptual connection.

## Edit rhythm at several levels

Rhythm exists within the shot, between shots, across a phrase, and across the whole piece.

Listen for:

- musical phrase boundaries rather than only individual beats;
- breath and emphasis in speech;
- internal action peaks;
- recurring source sounds;
- silence that creates anticipation or recognition;
- the duration required to read faces, text, and unfamiliar spaces.

Use `get_beat_grid` when a reliable BPM and music-led structure make it useful. A beat grid is reference, not command. Sync decisive moments selectively so they retain force.

Vary shot duration according to information and feeling. A complex wide shot needs more reading time than a familiar close-up. An emotional look may need to remain after its informational content is understood.

## Let sound carry structure

Do not leave sound design until the end as decoration. It can create continuity across dissimilar images and make visual cuts feel inevitable.

Build with:

- intelligible primary speech when speech leads;
- music with clear editorial purpose and usable rights;
- room tone to avoid dead digital gaps;
- selected source sounds that make actions physical;
- pre-laps and tails that connect time and place;
- deliberate drops or thinning before major turns;
- restrained designed accents for events the image actually contains.

Do not stack impacts, risers, and whooshes on every transition. Repetition makes emphasis meaningless. Do not fake documentary source sound in a way that misrepresents what occurred.

## Use text and narration only when they add a layer

Text can establish occasion, location, time, thesis, chapter, attribution, or final invitation. It should not explain every image.

Keep copy short enough to read at the actual pace. Use `set_texts` for native editable text and `compose_component` → `apply_component` when a custom title, typographic composition, or richer graphic is justified. Preserve safe areas and required logos or sponsor language.

Narration should create coherence, interpretation, or information the images cannot carry. It should not describe obvious actions shot by shot.

If exact names, dates, spellings, credits, sponsor hierarchy, or legal language are missing, ask for them rather than guessing. Those are user-owned facts.

## Placing from a review

inspect_media mode:editorial returns, per source, candidate ranges with a verdict (strong / usable / reject), refined startSec/endSec, scores, and reserve:true on secondary ranges; a batch adds acceptedDurationSec and, when several sources qualify, an openingComparison ranked across sources. Read it as the complete selection result:

- Place only strong or usable ranges, inside their refined bounds; no score overrides a reject.
- Open with openingComparison rank 1 when present; otherwise the accepted range with the highest openingFrameScore.
- Order the rest by score and by visible continuity of action and setting; cut a scored child range rather than consuming a whole reservoir.
- Use a reserve range only when accepted capacity falls short of the narration or a deliberate echo needs it.
- Place everything in one add_clips batch, muted (source audio was excluded from the review). Do not review again or retry the selection after placing; leave rejected sources unused.
- For a montage whose first shot is picture, run the batch review with compareOpenings: true so openingComparison exists; it is one extra vision call.
- For a montage whose picture IS the primary track, call assemble_from_review once instead of hand-placing: your ordered picks are placed as written at natural speed and the receipt reports coverage. Nothing is chosen for you: when your picks fall short, the receipt lists the unused accepted ranges (remaining) — pick from them and call again with the complete ordered list, or tell the user the pool is short. B-roll over a talking head stays add_clips.

## Work with the timeline intentionally

Choose tools based on the sequence being built:

- use `add_clips` to place material where nothing should shift (a full-frame B-roll video overlapping another is refused: fix the frames or `remove_clips` the old clip first — never re-send a placement that already succeeded);
- use `insert_clips` when adding material into an existing sequence should ripple later clips;
- use `split_clips`, `move_clips`, `remove_clips`, and `ripple_delete_ranges` for structural refinement;
- use `set_clip_framing` for motivated reframes, `set_keyframes` for motion, and `set_clip_properties` for speed, level, and retrims;
- use `manage_tracks` and `manage_clip_links` (link, unlink, sync) to protect audio relationships and layered constructions;
- use `set_texts` for editable typography, adding and updating in one call;
- use `search_media` or `search_assets` only after identifying the concrete visual job missing from the source.

Private official media may arrive through runtime context. Do not assume it belongs in the open-source Studio repository, and do not use it merely because it is available.

## Adapt when the ideal material is missing

Do not disguise absence with random stock.

If a needed section lacks coverage, choose the most truthful response:

- restructure around the strongest material that exists;
- reuse a motif with a new crop, timing, or sound meaning;
- hold a strong shot longer and let sound advance the story;
- use a title, map, date, quote, or graphic to bridge necessary information;
- source clearly illustrative footage for a specific concept;
- ask the user for missing hero, stakeholder, product, or archival material;
- narrow the promise of the montage.

If a must-include person or moment has only weak footage, honor the requirement without letting that footage control the entire visual standard. If its inclusion is uncertain, ask the user.

## Review the experience, not only the cuts

Review at normal speed from a clean start, then inspect details.

### Emotional read

- Can the governing gesture be felt without reading the brief?
- Does the energy contour change, or remain at one intensity?
- Is the peak earned?
- Does the ending leave the intended residue?

### Visual read

- Does every section contain a clear subject or intended ambiguity?
- Are motion, direction, color, and scale relationships legible?
- Do repeated motifs develop rather than merely repeat?
- Are weak shots present only for a real obligation?

### Sound read

- Does the piece still have structure when viewed away from the timeline interface?
- Are speech, music, ambience, and accents competing?
- Are sound bridges truthful and purposeful?
- Is silence used intentionally?

### Obligation read

- Are required people, products, facts, credits, and logos present?
- Are rights-sensitive media and claims handled honestly?
- Is text readable on the destination surface?
- Did any unresolved user decision get guessed instead of surfaced?

Check the finished sequence once from the receipts (coverage, order, muted sources); look at frames with `inspect_timeline` only where a visual could be wrong. A good montage may finish as a complete film, a tone proof awaiting approval, or a material audit with one precise request. The correct pause is part of the craft.
