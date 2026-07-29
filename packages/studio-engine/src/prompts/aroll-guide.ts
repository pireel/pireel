/**
 * A-roll speech-editing judgment playbook — a standalone skill content pack, read
 * into the feed on demand via read_editing_guide, not placed in system (keeps the
 * cache prefix intact, same policy as frame.md). Content is the judgment criteria
 * for A-roll narration editing (pure judgment, tool-agnostic), mapped onto studio's
 * own tool surface (read_script / cut_narration / cut_range / set_captions).
 * Body is English (everything injected into the LLM is English). Change judgment here, one place.
 *
 * After editing: the scoring math + fixtures are pinned free in cleanup-eval.test.ts;
 * then have the user run the live benchmark (burns credits, ~$0.05/round):
 *   STUDIO_EVAL=1 pnpm vitest run src/lib/studio/cleanup.live.test.ts
 */

export const AROLL_GUIDE = `A-ROLL SPEECH-CLEANUP PLAYBOOK
Editing JUDGMENT for cleaning up talking-head narration by the transcript. Read this ONCE before any speech cut, decide the boundaries, THEN cut. This is judgment, not new tools — execute with the tools you already have.

HOW CUTS MAP TO TOOLS
- Main narration: read_script gives sentences in SOURCE-video seconds. Remove spoken passages with cut_narration (pass those source-second ranges; it converts to the edited timeline, compresses overlays, and re-lays captions).
- Inserted [clip X] segments: their own clock — cut with cut_range (edited seconds) or drop the whole segment with delete_shot.
- Explain edits to the user by the actual spoken words ("cut the half-sentence that got re-recorded"), NEVER by [sN] / timestamps / clip ids — the user can't see those.

WORKFLOW (any cleanup / tighten / de-filler request = run this end to end)
1. Orient — read_script if the transcript isn't already in the conversation. Read the whole thing; understand the goal and the content structure, and reconstruct full sentences across ASR rows.
2. Decide the removals by the rules below — for a long transcript work section by section. Collect EVERY source-second range to drop: hesitation fillers, failed retakes, false starts, abandoned fragments, dead pauses that belong to a removed attempt. Keep complete units; when unsure, don't add the range. FIRST look at the very first and very last rows — the recording's pre-roll and post-roll (see HEAD & TAIL); mid-body cleanup alone leaves that junk in.
3. Apply them in ONE cut_narration call (ranges = the whole list) — it converts to the edited timeline, compresses overlays, and re-lays captions. Don't cut one range per call.
4. Review — re-read what the viewer will now hear (broken logic, missing context, over/under-cut, wrong order); fix only clear problems, then tell the user what you cleaned up in plain words.
- For plain cleanup / de-fillering, just run it. For aggressive shortening, restructuring, highlight/short-version, or a generated hook, confirm target length + structure + what to preserve with the user BEFORE step 3.

CORE PRINCIPLE
Remove defects without changing meaning; make speech smoother, not harder. Prefer small local cuts over whole-sentence deletion. Good cleanup keeps the logic coherent, the expression clearer, the delivery natural, and preserves the speaker's intent, tone, and rhythm. When unsure whether a cut harms meaning, logic, or flow — keep it, or make a smaller cut.

EDIT BY COMPLETE SEMANTIC UNITS
- Move / keep / delete complete sentences, ideas, answers, or steps. Do not cut half a sentence just because a few words match.
- read_script rows are ASR segments, NOT semantic units: one sentence / idea / retake may span several rows, and one row may hold only part of a sentence. Reconstruct the full spoken idea across adjacent rows BEFORE choosing the cut boundary.

FILLERS — two tiers
- Tier 1 (safe to remove when they carry no meaning): um, uh, er, ah, 呃, 额.
- Tier 2 (decide by ROLE, never by word list alone): so, like, then, 然后, 就是, 那个, 那, 对, 所以, 但是, 嗯, 啊. Keep it when it carries sequence, continuation, contrast, cause, reference, response, emphasis, or natural tone; remove only pure hesitation / padding. If removing it makes the splice sound hard, keep it. If unsure, keep it.

RETAKES (the speaker retries the same idea)
- Treat as a retake ONLY when multiple attempts say the SAME intended idea — not intentional repetition / emphasis, and not a second pass that adds new info or tone.
- Keep ONE complete, natural version; cut only the failed or fully-covered part. The cut starts at the repeated / failed idea, not automatically at the earlier setup or transition.
- Prefer the later attempt (usually closest to intent) — but if it is missing needed context / subject / conclusion, keep the more complete earlier version or preserve the earlier lead-in.
- Keep one natural lead-in / section marker; drop only the extra restarts. NEVER stitch unfinished fragments from different attempts into one artificial sentence.

FALSE STARTS / UNFINISHED FRAGMENTS
- Remove only when the fragment clearly forms no useful info: an abandoned thought with a complete version later, a dangling phrase ("this is actually…") with no completion, or the leftover start of a failed attempt.
- Keep an imperfect sentence that still carries useful info, and keep a lead-in that supplies the subject / object / context needed later. If only part of a sentence is bad, cut the smallest bad span; if a local cut cannot sound natural, keep the whole thing.

HEAD & TAIL — the recording's pre-roll / post-roll (easy to miss: explicitly scan the very first and very last rows)
- Head, before the real opening line: drop countdowns ("3, 2, 1"), "okay / let me start / let's go / 开始 / 来 / 那我开始了", throat-clears, mic/test phrases, and dead air, plus any abandoned false-start intro that a later take replaces. Start the video on the first real content word.
- Tail, after the real ending: drop "okay / that's it / that's a wrap / cut / 好了 / 就这样 / 停 / 完了吧", "did I get that / was that good / 刚才那条行吗", trailing dead air, and the reach to stop recording. End on the last real content word.
- But KEEP a genuine sign-off / CTA / outro ("thanks for watching, subscribe", 记得点赞关注) — that is content, not logistics. Cut recording-logistics chatter, never a real closing.

PRESERVE CONNECTIVE TISSUE
List labels, contrast words, subjects, verbs, and adjacent words are NOT filler when removing them makes a kept idea ungrammatical, abrupt, or misleading. Trim the smallest span that keeps the line speakable.

PAUSES — tighten, don't erase (the dead-air pass)
- Tightening pauses IS a legitimate pass: the transcript rows carry "(+Xs gap after)" notes — those ARE the inter-sentence gaps (don't redo the row arithmetic, and SKIP any gap already marked CUT: it was tightened before). Remove the chosen ones with ONE cut_narration call, passing the FULL gap ranges plus keepGapSec — the tool leaves that much breathing room at each seam. NEVER do the margin arithmetic yourself; your job is choosing WHICH gaps, the tool's job is the boundary math. When you report the result, quote the receipt's data.cuts / removedTotalSec (seconds ACTUALLY removed after margins) — your raw gap sums overstate the cut and won't match what the user sees in the editor.
- Aggressiveness: keepGapSec 0.35 is the balanced default; 0.15 only when the user asks for a hard-cut punchy rhythm; 0.6 for calm/narrative pacing. Only touch gaps ≥ ~1.0s — sub-second gaps are natural speech rhythm, not dead air.
- KEEP intentional pauses — they are content, not defects: the beat before a key point / punchline / reveal, the stop after a rhetorical question, an emotional beat. Read the sentences on both sides of a gap: if the silence serves the delivery, leave it alone.
- Run the dead-air pass when asked to tighten pacing / remove dead air, or as the LAST step of a full cleanup (after junk/retake/filler cuts — those change the gaps). Don't fold it silently into an unrelated small edit.
- Still never CREATE a gap on the main track as a pacing device (no source playing = black frame): tightening removes footage, never inserts space. If a beat needs more air than the source has, cover it with a graphic instead.

TASKS BEYOND CLEANUP (same principles)
- Highlight / short version / restructure / target-script: when the task NAMES what to keep, trim to that boundary — start and end at the requested words and drop the off-script head / tail of the segment they sit in; do not over-keep a whole segment for one requested sentence. When reordering, move complete units and re-check that connectors ("so / but / next / 这 / 所以") still work.
- Confirm first for aggressive shortening, structural changes, or a generated hook: align target length, structure direction, and what to preserve before editing.

AFTER CUTTING
Re-read what the viewer will now hear: broken logic, missing context, over-deletion, wrong order, delivery too rushed. Fix only clear problems. Captions re-lay automatically from the new timeline — don't hand-fix them for a cut.`;
