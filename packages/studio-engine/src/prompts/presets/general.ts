/**
 * Scenario-neutral editorial judgment for Motion Graphic generation.
 *
 * The default must work for speech-led edits, demonstrations, montages, product footage,
 * interfaces, data, music-led pieces and future user Skills. Scenario expertise belongs in the
 * active Skill and persisted Scene design, not in this fallback generation layer.
 */

import { components } from '@pireel/studio-kit';
import { ON_SCREEN_LANGUAGE } from '../l0-editor';
import type { Preset } from './spoken';

export const GENERAL_EDITORIAL = `WHAT EARNS A MOTION GRAPHIC
Start from the authored Scene, its source evidence and viewer task. A Motion Graphic exists only
when abstraction, annotation, comparison, sequence, emphasis or explanation communicates the beat
better than the source picture alone. It may share the frame with footage, media, type and captions;
it is not automatically the Scene or a full-screen card. A clean source-led moment is a complete
design decision. Never add a graphic to satisfy a quota or fill uncovered time.

WHAT IT SAYS
- Use only wording, figures, identities and claims supported by the instruction and supplied
  evidence. Never invent or silently round factual content.
- Give the layer one clear communicative job that can be understood at delivery size during its
  actual on-screen duration.
- LANGUAGE: ${ON_SCREEN_LANGUAGE}
- Do not turn narration into a running subtitle or generic lower third unless the user or Scene
  design explicitly asks for that form.

RELATIONSHIP TO THE SCENE
- Preserve the Scene's visual anchor, protected zones and whole-canvas hierarchy. Design the layer
  for its real occupied region and backdrop rather than as an isolated widget to resize later.
- Coordinate with existing source, media, type, captions and neighboring Scenes. Repetition is
  useful only when it develops structure, comparison, memory or continuity; otherwise it reads as
  a template leak.
- The active Frame supplies visible art direction. The Skill and Director decide story, evidence,
  medium, timing and whether this graphic exists.

TIMING
- Enter, develop, emphasize, hold and clear according to real speech, action, evidence or music
  beats. Do not reveal the complete final state at time 0 when the content has an order.
- When exact beats are supplied, attach each state change to its first meaningful beat. Without
  exact beats, distribute genuinely sequential content across the available duration and give the
  payoff enough time to register.
- Motion directs attention and carries continuity. A deliberate still hold is valid; perpetual
  motion and independent fades on every child are not.

VARIETY
Vary visible form only when the meaning, evidence or surrounding composition changes. Do not choose
a worse communicative form merely to look different, and do not repeat a convenient card geometry
when another relationship better expresses the Scene.`;

export const GENERAL_PRESET: Preset = {
  id: 'general',
  title: 'General video',
  editorial: GENERAL_EDITORIAL,
  components: Object.keys(components),
};
