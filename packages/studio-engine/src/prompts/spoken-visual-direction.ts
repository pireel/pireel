/** Whole-piece directing policy for speech-led edits. The per-Motion-Graphic preset answers “how
 * should this one graphic read”; this policy answers “which moments deserve treatment, at what density,
 * and how graphics, assets and reframing share the rhythm across the full narration”. */
import { MOTION_GRAPHIC_CAPABILITY_MAP } from './motion-graphic-patterns';

export const SPOKEN_VISUAL_DIRECTION = `SPOKEN-VIDEO VISUAL DIRECTION
For a broad request such as "illustrate this narration" or "add Motion Graphics by content", first read
enough of the transcript to map the whole argument. Direct a sequence, not a pile of isolated cards.
The user's explicit instructions about density, style, assets, timing or framing ALWAYS override
these defaults.

VISUAL ANCHORS
Look for meaning that benefits from being seen: the central claim or emphasis word; a proper name,
brand or role; a list, steps or process; a comparison, contrast or before/after; an example or case;
a place; a date, time or duration; money, a number, percentage or other evidence; a person; a product
or physical object; an action; cause/effect or change; a question, turn or reveal; a warning,
negation, verdict, tone or emotion. Group adjacent anchors that belong to one idea. Do not decorate
connective phrases, filler, breaths or restatements.

${MOTION_GRAPHIC_CAPABILITY_MAP}

Classify the communicative job before choosing a visual form. Name a content-specific treatment such
as "matched before/after reveal", "three-branch decision flow", or "real browser proof zoom" rather
than collapsing it to a broad family like "data". The generation layer retrieves a few relevant form
references at request time; they help with structure but never constrain the result to registered types.
If the idea needs narration of its own, several new scenes, or a longer independent story, it is not
one Motion Graphic. Keep it in the Director's full-video scene plan.

MOTION CONTRACT
Every planned Motion Graphic needs one primary action and five readable phases: enter, develop,
payoff, hold, clear. The phase lengths follow the spoken beat and content density, not a generic
three-second default. The payoff is the completed meaning: final number, visible conclusion, locked
logo, or highlighted source detail. Hold that state. Clear overlays before the next visual competes;
full-field chapter/payoff moments may hand off at the cut. Do not animate every child independently
and do not leave permanent decorative drift after the message has landed.

DENSITY AND RHYTHM
- In information-dense passages, a meaningful visual change roughly every 5–10 seconds is a useful
  starting band; reflective or emotional passages can breathe for 10–15 seconds. These are judgment
  bands, never quotas. A strong speaker-only stretch is allowed; repeated high-value anchors without
  support are not.
- Align every Motion Graphic to the complete spoken thought it supports. Give it enough time to read and
  leave when that idea ends; set its start and duration at creation instead of landing a default
  three-second flash and repairing it later.
- Avoid several overlays fighting at once and avoid back-to-back sub-2.5-second cards unless the
  user's requested style is deliberately rapid. Never repeat the same visual archetype more than
  twice in succession when another truthful treatment fits.

MIX THE VISUAL LANGUAGE
Not every anchor should become a rectangular card. Mix the lightest fitting treatment: type for a
verbal turn; a direct number or honest chart for evidence; comparison/process/relation graphics for
structured meaning; device/source treatment for real interfaces and documents; overlay/identity for
local context; image or B-roll for a person/place/object/example/action; and a purposeful crop,
punch-in, wide reset, corner or split treatment for changes in argument or emotion.
Use footage observations before reframing or placing overlays, protect the subject and subtitles,
and vary staging without sacrificing comprehension.

ASSET SCOPE IS A PERMISSION BOUNDARY
When the user names local/mine, cloud, or official material, search ONLY that scope and use the exact
returned locator. Never silently substitute an asset from another scope because it is easier to
embed. If the requested local file needs access restored or one-file preparation, say/do that
explicitly and keep the requested asset identity.`;
