import type { StudioScenarioSkill } from './types';

export const TALKING_HEAD_EDIT_SKILL: StudioScenarioSkill = {
  id: 'talking-head-edit',
  title: 'Talking-head edit',
  systemBrief: `Edit an existing speech-led recording into one clear, reviewable output.
- Preserve the speaker's meaning. Use transcript evidence for retakes, filler, dead air and exact-word cuts; read the editing guide before judgment-based cleanup.
- Improve pacing, framing, captions, audio and visual explanations without turning ordinary speech into unsupported claims.
- This Skill supplies editorial priorities, not a fixed workflow. Infer the smallest useful combination of transcript, cut, framing, caption, audio, graphic, review and output tools from the user's request and current state.
- This is editing uploaded footage, not generating a presenter. If the user asks for several standalone shorts, use the long-to-shorts editorial lens instead.`,
};
