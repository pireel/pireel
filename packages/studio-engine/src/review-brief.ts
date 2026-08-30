/**
 * Skill-declared review brief.
 *
 * Visual review (analyze_visual mode=editorial) is a platform primitive; the selection criteria
 * it judges by belong to the active Skill. When the model re-authors those criteria each turn it
 * drifts — a real run invented a topical frame the Skill never asked for and then fought its own
 * assembly over it. A Skill therefore ships its criteria as DATA: a fenced ```review-brief block
 * in its markdown, applied to the review verbatim. The model's own brief text is demoted to
 * bounded supplementary session notes. Skills without a block keep the model-authored brief.
 */

const REVIEW_BRIEF_FENCE = /```review-brief[^\S\n]*\n([\s\S]*?)```/;

/** Extract the first ```review-brief fenced block from Skill markdown; null when absent/empty. */
export function extractSkillReviewBrief(markdown: string | null | undefined): string | null {
  if (!markdown) return null;
  const brief = REVIEW_BRIEF_FENCE.exec(markdown)?.[1]?.trim() ?? '';
  return brief || null;
}

export const MAX_REVIEW_SESSION_NOTES_CHARS = 500;

/** Compose the effective review brief: Skill criteria verbatim, model text as subordinate notes. */
export function composeEditorialBrief(template: string, sessionNotes: string): string {
  const notes = sessionNotes.trim().slice(0, MAX_REVIEW_SESSION_NOTES_CHARS);
  if (!notes || template.includes(notes)) return template;
  return `${template}\n\nSession notes (supplementary context only; the criteria above always take precedence): ${notes}`;
}
