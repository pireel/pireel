import type { StudioScenarioSkill } from './types';

export const LONG_TO_SHORTS_SKILL: StudioScenarioSkill = {
  id: 'long-to-shorts',
  title: 'Long video to shorts',
  systemBrief: `Turn one long master source into several independently editable short outputs.
- First understand the master and identify distinct, self-contained moments with a hook, useful body and clean ending; do not split only by equal duration.
- Keep the master output intact. Create and name one output per approved short, switch to it before editing, and make each cut understandable without hidden context.
- Vary framing, captions and graphics for each short while preserving what the source actually says. Review every output separately.`,
};
