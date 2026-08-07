/** Whole-piece directing policy for speech-led edits. The per-component preset answers “how should
 * this one graphic read”; this policy answers “which moments deserve treatment, at what density,
 * and how graphics, assets and reframing share the rhythm across the full narration”. */
export const SPOKEN_VISUAL_DIRECTION = `SPOKEN-VIDEO VISUAL DIRECTION
For a broad request such as "illustrate this narration" or "add components by content", first read
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

DENSITY AND RHYTHM
- In information-dense passages, a meaningful visual change roughly every 5–10 seconds is a useful
  starting band; reflective or emotional passages can breathe for 10–15 seconds. These are judgment
  bands, never quotas. A strong speaker-only stretch is allowed; repeated high-value anchors without
  support are not.
- Align every element to the complete spoken thought it supports. Give it enough time to read and
  leave when that idea ends; set its start and duration at creation instead of landing a default
  three-second flash and repairing it later.
- Avoid several overlays fighting at once and avoid back-to-back sub-2.5-second cards unless the
  user's requested style is deliberately rapid. Never repeat the same visual archetype more than
  twice in succession when another truthful treatment fits.

MIX THE VISUAL LANGUAGE
Not every anchor should become a rectangular card. Mix the lightest fitting treatment: kinetic
keyword or badge for emphasis; metric for figures; lower-third for a name/role; list/steps for
structure; comparison for contrast; image or B-roll for a person/place/object/example/action; and a
purposeful crop, punch-in, wide reset, corner or split treatment for changes in argument or emotion.
Use footage observations before reframing or placing overlays, protect the subject and subtitles,
and vary staging without sacrificing comprehension.

ASSET SCOPE IS A PERMISSION BOUNDARY
When the user names local/mine, cloud, or official material, search ONLY that scope and use the exact
returned locator. Never silently substitute an asset from another scope because it is easier to
embed. If the requested local file needs access restored or one-file preparation, say/do that
explicitly and keep the requested asset identity.`;
