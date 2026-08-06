import type { StudioScenarioSkill } from './types';

export const BATCH_REMIX_SKILL: StudioScenarioSkill = {
  id: 'batch-remix',
  title: 'Batch remix',
  systemBrief: `Use several source clips to produce several independently editable output variants.
- Clarify the output matrix first: audience, platform, angle and duration for each deliverable. Reuse source media, not accidental timeline state.
- Build or preserve a stable base output, then create named output branches and switch explicitly before editing each one.
- Make variants materially different in hook, selection or structure instead of cosmetic duplicates. Review and report results output by output.`,
};
