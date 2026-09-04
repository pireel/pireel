---
name: talking-head-edit
description: Edit interviews, lessons, commentary, podcasts, and direct-to-camera recordings built around speech. Use it to remove dead air, filler words, false starts, repeated lines, and discarded retakes while preserving natural delivery and keeping captions aligned. When the user asks for visual enhancement, also use it for reframing, B-roll, Motion Graphics, music, and sound design.
---

# Talking-head edit

## Definition

Direct a speech-led video as an authored viewing experience. Treat the speaker's meaning, presence, and credibility as the primary source of truth. Shape the cut, scene progression, evidence, framing, typography, captions, music, and visual relief around what the audience must understand or feel at each moment.

Do not equate a talking-head edit with automatic silence removal plus cards. A finished result must have an editorial thesis, a deliberate rhythm, and a coherent visual language. It may remain visually restrained when the speaker carries the moment; it may become highly designed when an idea genuinely needs explanation.

This Skill is a high-freedom expert playbook. Adapt its judgment to the material. Do not turn its sections, scene vocabulary, examples, or review questions into a fixed pipeline, quota, schema, or Component/Motion Graphic recipe.

## Working contract

Preserve these invariants:

- Keep the speaker's actual meaning, qualifications, chronology, and emotional intent intact.
- Distinguish evidence from illustration and atmosphere. Never make decorative material appear to prove a factual claim.
- Let visual treatment follow the current viewer task rather than repeat the same card at regular intervals.
- Use one coherent visual system across the video while allowing scenes to differ in density, layout, imagery, and motion.
- Prefer reversible edits and real project evidence. Expose uncertainty instead of inventing missing facts, footage, product behavior, reactions, or outcomes.
- Treat a complete-edit request as a whole-video directing problem. Treat a pointed local request as a local edit unless it exposes a wider continuity issue.
- The user's request is the authorization. A complete instruction is executed end to end without a proposal or a confirmation stop; pause only when a choice changes the deliverable and has no reasonable default. Never ask the user to confirm an observation, a verified fact, or a plan you could simply carry out — state it once and proceed.
- The speaker's own footage is timed by what is said. Picture review on it informs openings and B-roll placement; it never limits which spoken sentences may be kept, and a sentence the user wants is placed from the transcript regardless of review windows.
- Talk to the user only at phase boundaries, one sentence each, in the user's language. Never restate a conclusion or a plan already given, and never narrate deliberation.

## Step 1: Determine the assignment

Classify the request before changing the timeline.

### Focused revision

Use a focused revision for a named sentence, visible defect, caption adjustment, local crop, single graphic, or bounded time range. Inspect enough neighboring context to protect continuity, then make the smallest complete change without creating planning artifacts.

### Conservative speech cleanup

Use conservative speech cleanup when the user asks to clean the full spoken track by removing only unambiguous dead air, disposable filler, false starts, superseded retakes, recording logistics, or meaningless repetition while preserving the order, meaning, and natural delivery. Enabling or reflowing captions may be part of the same cleanup.

This is a direct execution scope, not a whole-video directing assignment. Load the speech-cleanup guide, inspect the real audio and transcript, batch the supported cuts, update captions when requested, and review speech continuity. Skip whole-film proposals, planning artifacts, full visual analysis, B-roll planning, Motion Graphics, reframing, music and creative-thesis work. Ask only when a deletion could change meaning or the request crosses into aggressive shortening, restructuring, a generated hook, or visual enhancement. Do not interrupt cleanup to ask whether the user wants visual enhancement; after finishing, you may offer it as an optional next step.

When the active output is empty, resolve the intended source before reading its script. Honor an exact asset reference; otherwise list the user's project assets. If exactly one compatible talking-head video or spoken-audio source exists, place it as the primary video or narration and continue without asking. If several plausible spoken sources remain, ask one concrete question naming them instead of adding all of them or guessing from filenames, recency, or library order. When the user chooses several, preserve their explicit or clearly numbered order; ask once if the order is unresolved. Restore-access requirements apply only to the selected local sources. Placing the chosen primary source is cleanup setup, not B-roll or visual enhancement.

### Complete edit

Use a complete edit when the user asks to visually enhance, illustrate, package, rework, or direct the whole video, including B-roll, explanatory graphics, purposeful reframing, music, or a publishable visual treatment. Inspect the complete argument and usable media, choose a creative thesis and theme, compile the edit directly, and review the rendered result. Do not imply that conservative speech cleanup is unfinished or lower quality; these scopes deliver different kinds of work.

### Structural rewrite

Recognize a structural rewrite when the request implies aggressive shortening, reordered ideas, a new hook assembled from later speech, removal of substantial nuance, or multiple standalone outputs. Confirm intent when the change would materially alter what the speaker appears to say. Create separate outputs when deliverables need independent editorial logic.

### Missing evidence

If the recording, transcript, or requested asset scope cannot support a confident result, state what is missing. Continue with supported work when useful, but do not hide uncertainty behind generic graphics.

## Step 2: Read the material as an editor

For a complete edit, read the full transcript and inspect the full visual coverage before committing semantic cuts or a visual plan. Initial analysis is read-only. Then, when dead-air cleanup or tighter pacing is in scope, run `remove_silence` before transcript-driven timeline mutations. Use transcript evidence for language decisions and visual observations for framing, continuity, and asset decisions. If `get_transcript` fails while transcribing, do not retry it in the same user request: continue only with transcript-independent work, state that semantic cleanup remains pending, and let a later user turn try again.

Identify:

- the audience and the change promised to them;
- the most truthful central argument in one sentence;
- the strongest opening that can be understood in context;
- setup, tension, explanation, proof, implication, objection, turn, payoff, and next action where they actually exist;
- repeated passes, false starts, filler, dead air, broken sentences, and passages whose removal would change meaning;
- claims that need proof, examples that could become visible, and abstractions that need a diagram or analogy;
- emotional changes, humor, vulnerability, authority, surprise, and moments where the speaker's face matters more than visual variety;
- eyeline, subject position, gestures, camera movement, focus changes, jump-cut risk, occlusions, safe areas, and usable alternate footage;
- available source media, project assets, host-curated material, and gaps that may require an honest generated illustration.

Do not decide from isolated transcript rows when the surrounding sentence changes their meaning. Protect negation, causality, comparison, qualification, attribution, chronology, and comedic timing.

## Step 3: Form the editorial thesis

Write a concise internal thesis before planning scenes:

- What must the viewer understand, believe, remember, feel, or do by the end?
- What makes this speaker or explanation worth staying for?
- What is the central tension or progression?
- What should the edit feel like: intimate, rigorous, urgent, generous, playful, investigative, reflective, premium, raw, or another fitting quality?
- What should remain visually quiet so the strongest moments retain contrast?

Use this thesis to reject material that is individually acceptable but weakens the complete argument. A good edit is not every usable sentence; it is the strongest truthful progression.

## Step 4: Shape the spoken story

Build a progression from complete ideas rather than arranging sentences by convenience. Common movements include orientation, tension, explanation, demonstration, proof, implication, turn, payoff, and action, but the material decides which movements exist and in what order.

### Opening

Earn attention without manufacturing a promise. Prefer a line with specificity, tension, consequence, curiosity, proof, or a clear viewer benefit. Do not detach a dramatic phrase from the context that makes it true. Remove throat-clearing when the core idea can begin cleanly, but retain necessary orientation.

### Body

Compress repeated setup and redundant examples. Give mechanisms, evidence, and surprising turns enough time to register. Preserve a breath when it carries emotion, confidence, discomfort, humor, or a deliberate shift.

Use pacing as contrast:

- compress predictable setup, navigation, and repetition;
- allow space around proof, emotional turns, difficult ideas, reveals, and payoffs;
- alternate dense passages with resets so attention has somewhere to go;
- avoid a uniformly fast cadence that makes every sentence feel equally important.

### Ending

Deliver the promise made by the opening. End on a conclusion, implication, emotional resolution, memorable line, or supported next action. Do not add a generic call to action that the material or user did not request.

## Step 5: Clean speech without flattening the person

Use silence detection and transcript tools as evidence, not authority. A pause can be empty friction or meaningful performance.

Remove:

- false starts whose intended replacement is unambiguous;
- repeated takes when one pass clearly supersedes another;
- filler words that can disappear without changing rhythm or tone;
- dead runway before or after usable speech;
- redundant clauses and examples that do not advance the argument;
- technical interruptions that contribute no meaning.

Protect:

- qualifications, uncertainty, and exceptions;
- breaths that let a difficult or emotional statement land;
- conversational texture that makes the speaker credible and human;
- deliberate repetition used for emphasis;
- reaction time, humor, and timing;
- sentence boundaries needed to hide picture or audio discontinuity.

After consequential cuts, inspect both audio continuity and picture continuity. Repair a visible jump through a meaningful reframing, cutaway, alternate source, or scene change—not with an arbitrary overlay that has no editorial job.

## Step 6: Hold a compact whole-film map

For a broad complete edit, keep one creative thesis, one rhythm arc and one shared video design system in current working context. For each meaningful beat, retain only its viewer task, visual anchor, truthful evidence, timing and handoff. Compile those decisions directly into the timeline without saving a second planning artifact.

Place boundaries where the viewer's task, argument, evidence, emotion, time, place or visual mode materially changes. In a dense lesson or explainer, check whether the viewer receives a meaningful new visual anchor roughly every 5–10 seconds; an emotional face or legible demonstration may deserve a longer hold. Make neighboring beats contrast intentionally through speaker scale, composition, evidence type, information density, motion, color emphasis, sound or duration.

Only when the request leaves the whole-video direction genuinely open — several defensible theses and nothing in the brief or material to choose between them — present one concise proposal with `ask_user` (kind approval) and wait. After approval, execute it directly. After rejection, stop the current execution and await the user's next direction. A complete instruction needs no proposal.

## Step 7: Apply the shared visual system before individual graphics

Use the approved visual direction as the language for the complete pass, not as a card library. Do not silently redesign it scene by scene.

Define:

- dominant mood and level of polish;
- typography roles and emphasis behavior;
- palette roles for ground, text, accent, evidence, warning, and muted information;
- shape, border, texture, image, and icon behavior;
- motion character: restrained, editorial, energetic, technical, organic, cinematic, or another coherent direction;
- composition rules for speaker, captions, overlays, evidence, and negative space;
- density contrast between quiet, explanatory, evidentiary, and payoff moments.

Vary layout inside the system. A title, comparison, diagram, quote, metric, and evidence frame should not all become the same rectangular card with different text.

## Step 8: Assign every visual a job

Add a visual only when it improves at least one of these:

- orientation — who, where, when, or what is being discussed;
- comprehension — mechanism, structure, causality, sequence, or definition;
- belief — concrete evidence, demonstration, source, or supported result;
- recall — a decisive phrase, number, comparison, or organizing idea;
- feeling — atmosphere, intimacy, tension, relief, humor, or scale;
- action — a clear supported next step.

If a visual has no job beyond avoiding a clean speaker shot, omit it.

### Graphics

Choose the form from the meaning:

- use a lower third for identity;
- use a number treatment for scale;
- use comparison for contrast;
- use a diagram for mechanism or relationship;
- use a sequence for actual steps;
- use a map or timeline for place or chronology;
- use a brief full-screen line for a decisive turn;
- use annotations when the evidence itself needs attention directed.

Summarize the editorial idea instead of transcribing the sentence again. Keep one dominant reading order. Avoid stacking subtitles, keyword highlights, badges, title cards, and decorative labels until nothing has priority.

### Reframing

Use crop and scale to communicate emphasis, intimacy, reset, or transition. Inspect subject position first. Protect eyes, gestures, products, captions, and platform safe areas. Do not punch in on a timer or alternate wide/close mechanically.

### B-roll and images

Classify each candidate as proof, example, orientation, analogy, atmosphere, or transition. Match its claim strength to its role.

- Use source footage or project media for proof whenever available.
- Use host-curated assets for relevant context, orientation, or atmosphere; do not imply they depict the speaker's actual event or outcome.
- Use generated visuals for concepts, environments, or metaphors only when no honest source exists and the treatment cannot be mistaken for factual evidence.
- Prefer no B-roll over misleading B-roll.
- Let a strong image occupy meaningful space and duration. Do not bury it inside another default card unless the composition needs that relationship.

When narration is longer than the supplied demonstration footage, never loop or stretch one short clip as wallpaper for the full voice track. Reuse only distinct source moments that directly support the spoken beat. Build the remaining picture from truthful screenshots, screen recordings, source crops, full-field editorial explanations, diagrams, or clearly illustrative generated imagery. Alternate source-led, evidence-led, and designed-fullscreen moments so visual continuity has an argument rather than mere coverage.

Search from the scene's evidence and asset strategy, not from one noun in the transcript. Check identity, time, place, product, and causal relevance before inserting.

### Placing B-roll from a review

inspect_media mode:editorial returns, per source, candidate ranges with a verdict (strong / usable / reject), refined startSec/endSec, scores and notes. For a talking head the speaker's footage is the picture; the review only serves the B-roll, so:

- Leave compareOpenings off: the opening is the speaker, not a picture.
- Place only strong or usable ranges, inside their refined bounds; no score overrides a reject.
- Put each cutaway on the spoken moment it supports, in one add_clips batch, muted (source audio was excluded from the review); full-frame B-roll never overlaps. Do not review again or retry the selection after placing; leave rejected sources unused.

## Step 9: Direct captions, sound, and transitions

### Captions

Use captions for accessibility and retention. Keep segmentation readable, placement stable, and emphasis restrained. Reflow or relocate captions when speaker placement, evidence, or graphics would collide with them.

Do not make the subtitle layer compete with a second full transcript rendered as graphics. Highlight only words whose emphasis helps meaning.

### Dialogue

Keep speech intelligible, consistent, and natural. Use denoise when noise masks speech, not merely because the control exists. Check cut boundaries for clipped consonants, doubled ambience, sudden room-tone changes, and unnatural breaths.

### Music

Choose music from the video's emotional and editorial arc. Let it establish or support momentum, then yield to dialogue. Change or remove it when the story changes, not at arbitrary intervals. Avoid using a high-energy bed to disguise a weak structure.

### Transitions and effects

Use a cut by default. Add a transition only when it communicates a real change of time, place, chapter, source, or emotional mode. Sound effects should clarify a meaningful event or reinforce a deliberate style; do not punctuate every graphic.

## Step 10: Execute with tool discipline

Use only the tools needed for the current judgment.

For conservative speech cleanup, read the `speech-cleanup` skill once, use real audio and the transcript, apply supported silence and semantic cuts in batches, enable or reflow captions when requested, and review the resulting speech. Run this path directly without a proposal, persisted planning artifacts, or whole-film visual analysis.

For a complete edit, usually:

1. Gather transcript and visual evidence with `get_transcript` and `inspect_media` as needed. If `get_transcript` fails while transcribing, do not retry it in the same user request.
2. Proceed directly; `ask_user` (kind approval) only under the condition in Step 6.
3. Place the narration spine first, then run `remove_silence` when dead-air cleanup or tighter pacing is in scope; it uses the real audio and does not need transcript arithmetic. Initial transcript reading is inspection; this still happens before transcript-driven timeline mutations.
4. Shape speech semantically with `remove_words` — segment ranges for whole ideas, retakes and dead passages, word ids for exact words — only where the transcript supports it. Word ids shift after each cut; re-read `get_transcript` words before another word cut.
5. Retrieve evidence with `search_media` and `search_assets` in the permitted scope.
6. Compile each meaningful beat directly with the lightest fitting mix of native timeline atoms and designed graphics. Use `get_state` when lane or clip identity matters. Project-library media is already registered: inspect it with `inspect_media`, then place only the chosen footage, stills, or audio by asset id with `add_clips`/`insert_clips` at real timing. Use `register_media` followed by `add_clips` only for newly generated or remote evidence carrying an exact returned locator; never construct a locator by hand. Use `set_texts` for ordinary native titles and `compose_component` → `apply_component` for custom designed graphics. Combine these with framing (`set_clip_framing`, `apply_layout`), captions, audio, and transitions as needed.
7. Before reporting done, check once against the brief from the receipts you already hold; look at frames with `inspect_timeline` only where a visual could be wrong (a component's box, an overlay, caption legibility). Repair fragmented ideas or abrupt handoffs in the affected range rather than adding indiscriminate decoration.

This is guidance, not a mandatory call sequence. Reuse evidence already present in the conversation. Batch related changes when that preserves clarity. Keep source-second transcript ranges distinct from timeline frames. Ordinary complete edits do not create or depend on persisted planning artifacts.

## Content-specific directing patterns

Use these as examples of reasoning, not presets.

### Opinion or commentary

Let the face carry conviction. Use evidence for named events, people, documents, or examples; use designed contrast for the central disagreement; return cleanly to the speaker for judgment and payoff. Avoid generic lifestyle footage that softens a precise argument.

### Lesson or explainer

Turn definitions, mechanisms, steps, and comparisons into visible structure. Keep the speaker as guide, not wallpaper. Alternate explanation with examples and resets. Hold diagrams long enough to understand; do not animate every label.

### Interview or personal story

Protect emotion, reactions, silence, and interpersonal timing. Use archival or contextual media when it deepens place, memory, or stakes. Prefer restraint around vulnerability. A clean close-up can be the strongest designed choice.

### Podcast or multi-speaker conversation

Preserve turn-taking, response timing, and speaker identity. Reframe or change layout on conversational shifts, not every sentence. Use topic cards sparingly for chapters or complex references. Avoid covering reactions with irrelevant B-roll.

### Demonstration inside a talking-head video

Let the actual screen, object, document, or process become primary evidence when discussed. Synchronize explanation with the visible state. Use split layouts only while simultaneous speaker presence adds value; otherwise give the evidence enough room to read.

## Failure patterns to reject

Reject these results even when every individual element is technically valid:

- **Cardification:** every scene is the same registered Motion Graphic with replaced text.
- **Wallpaper B-roll:** footage is semantically adjacent but does not explain, prove, orient, or deepen the spoken idea.
- **Timer editing:** punch-ins, B-roll, transitions, or graphics appear at fixed intervals without narrative cause.
- **Subtitle soup:** captions, keywords, cards, and labels repeat the same sentence simultaneously.
- **Unsupported proof:** stock or generated imagery appears to demonstrate a real claim, result, place, person, or product behavior.
- **Uniform intensity:** every sentence receives the same visual weight, leaving no hierarchy or payoff.
- **Speaker erasure:** graphics dominate moments where expression, authority, humor, or vulnerability is the actual content.
- **Theme drift:** colors, typography, motion, and Motion Graphic language change scene by scene without an intentional reason.
- **Patchwork repair:** continuity problems are hidden beneath arbitrary overlays instead of being solved through edit, framing, evidence, or sound.
- **Checklist completion:** the video contains captions, music, B-roll, and graphics but still lacks a clear argument and scene progression.

## Validation

Review the rendered result, not only the timeline data. Inspect the opening, every major scene boundary, every consequential cut, the densest visual moment, all factual evidence moments, and the ending.

### Story

- Does the opening make a truthful promise?
- Can a first-time viewer follow the progression without missing context?
- Does every scene advance understanding, belief, feeling, recall, or action?
- Does the ending deliver the promised payoff?

### Meaning and truth

- Did any cut change qualification, causality, chronology, attribution, or tone?
- Is every claimed proof actually supported by supplied material?
- Are illustration and generated imagery clearly non-evidentiary where needed?

### Visual direction

- Does every visual have a specific job?
- Do neighboring scenes create purposeful contrast?
- Does the theme remain coherent without collapsing into one repeated layout?
- Are speaker, evidence, typography, captions, and platform safe areas legible?
- Is any visual change happening only because time passed?

### Sound and continuity

- Is dialogue clear and natural across cuts?
- Do room tone, music, and effects support rather than expose seams?
- Do pauses and transitions match the emotional rhythm?

### Finish

- Remove elements that add clutter without value.
- Revise scenes whose treatment does not match their purpose.
- Re-review after timing, layout, asset, caption, or audio changes.
- Declare completion only when the whole piece feels intentional, not when the tool list has been exhausted.
