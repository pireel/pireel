import './editor-product-commands';
/**
 * Editing skills: what the creator switched on for this project, applied by whichever agent edits it.
 * The choice is stored in the document (semantics.editingSkills), so the in-app chat, an external
 * agent over MCP and a later session all see the same switches. Each switch names an outcome and
 * where its craft lives (a skill to read, or the tool that does it); how to do it stays in the skill.
 */

export interface EditingSkill {
  id: string;
  /** For the agent: what this switch asks for and where the craft is. */
  instruction: string;
  /** A tool the instruction depends on; where it is not attached, `otherwise` is said instead. */
  requires?: string;
  otherwise?: string;
}

export const EDITING_SKILLS = [
  { id: 'cover', instruction: 'Automatically create one cover in the independent cover scene (generate_cover). Enabling this capability authorizes cover analysis and generation without another confirmation. Keep cover prompts, frames and results out of the main chat; finish_edit starts it if it has not run.', requires: 'generate_cover', otherwise: 'A cover for this video. It is made in Pireel Studio; offer it as a next step.' },
  { id: 'graphics', instruction: 'Motion graphics designed for this video, timed to the speech (read_skill video-graphics).' },
  { id: 'captions', instruction: 'Word-synced captions (set_captions).' },
  { id: 'rough-cut', instruction: 'Cut filler words, false starts, failed retakes and dead air while keeping the meaning: rough_cut makes the first pass; read_skill speech-cleanup for judgment beyond it.' },
  { id: 'voice-cleanup', instruction: 'Cleaner narration: remove background noise (denoise_audio).' },
  { id: 'b-roll', instruction: 'B-roll where the speech names something that can be shown: the creator\'s own media first, then stock (search_assets). Follow the normal generation approval policy when new footage is needed (read_skill talking-head-edit).' },
  { id: 'sound', instruction: 'Sound effects where a point lands. Add background music only when requested (read_skill audio-and-music).' },
] as const satisfies readonly EditingSkill[];

export type EditingSkillId = (typeof EDITING_SKILLS)[number]['id'];

/** The skills a brand turns on by default. Voice cleanup is left out: whether narration needs it depends
 *  on how each recording sounds, not on the creator's style (their finished videos are already clean). */
export const BRAND_EDITING_SKILL_IDS: readonly EditingSkillId[] = ['cover', 'graphics', 'captions', 'rough-cut', 'b-roll', 'sound'];

export const EDITING_SKILL_IDS: readonly EditingSkillId[] = EDITING_SKILLS.map((skill) => skill.id);

export const isEditingSkillId = (value: unknown): value is EditingSkillId =>
  typeof value === 'string' && (EDITING_SKILL_IDS as readonly string[]).includes(value);

/** The switched-on skills, in catalog order, as the agent reads them: given the tools attached on
 *  its surface, an instruction that needs a missing tool is replaced by its fallback. */
export function editingSkillsOf(ids: readonly string[] | undefined, tools?: ReadonlySet<string>): { id: string; instruction: string }[] {
  const on = new Set(ids ?? []);
  return EDITING_SKILLS.filter((skill) => on.has(skill.id)).map((skill: EditingSkill) => ({
    id: skill.id,
    instruction: skill.requires && tools && !tools.has(skill.requires) && skill.otherwise ? skill.otherwise : skill.instruction,
  }));
}

/** One note for an agent turn: which skills are on and how they apply. Empty when none is on. */
export function editingSkillsHint(ids: readonly string[] | undefined, tools?: ReadonlySet<string>): string {
  const on = editingSkillsOf(ids, tools);
  if (!on.length) return '';
  return [
    'Editing capabilities enabled for this project. Use them when useful for a whole-video edit, not as quotas or a requirement to add something from every category. For a narrow request, do only what was asked. The current explicit request takes precedence over brand defaults.',
    ...on.map((skill) => `- ${skill.id}: ${skill.instruction}`),
  ].join('\n');
}
