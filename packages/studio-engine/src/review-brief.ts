/**
 * Skill-declared review brief.
 *
 * Visual review (analyze_visual mode=editorial) is a platform primitive; the selection criteria
 * it judges by belong to the active Skill. When the model re-authors those criteria each turn it
 * drifts — a real run invented a topical frame the Skill never asked for and then fought its own
 * assembly over it. A Skill therefore ships its criteria as DATA: a fenced ```review-brief block
 * in its markdown, applied to the review verbatim. The model's own brief text is bounded and
 * carries the USER's explicit requirements (quoted, not the model's taste): where the user's
 * words and the Skill's criteria conflict, the user wins — a Skill is a default, an instruction
 * is a decision. Skills without a block keep the model-authored brief.
 */

const REVIEW_BRIEF_FENCE = /```review-brief[^\S\n]*\n([\s\S]*?)```/;

/** Extract the first ```review-brief fenced block from Skill markdown; null when absent/empty. */
export function extractSkillReviewBrief(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  const brief = REVIEW_BRIEF_FENCE.exec(markdown)?.[1]?.trim() ?? '';
  return brief || null;
}

export const MAX_REVIEW_SESSION_NOTES_CHARS = 500;

/** Compose the effective review brief: Skill criteria verbatim, then the user's explicit
 * requirements for this session — authoritative over the criteria above wherever they conflict. */
export function composeEditorialBrief(template: string, sessionNotes: string): string {
  const notes = sessionNotes.trim().slice(0, MAX_REVIEW_SESSION_NOTES_CHARS);
  if (!notes || template.includes(notes)) return template;
  return `${template}\n\nUser requirements (the user's own explicit asks; on conflict these take precedence over the criteria above): ${notes}`;
}
