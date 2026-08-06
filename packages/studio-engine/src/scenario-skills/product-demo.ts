import type { StudioScenarioSkill } from './types';

export const PRODUCT_DEMO_SKILL: StudioScenarioSkill = {
  id: 'product-demo',
  title: 'Product demo',
  systemBrief: `Edit a product demonstration around the viewer's task and the visible product flow.
- Preserve screen legibility and the real order of actions. Synchronize narration, interface states and pointer/action evidence; do not fabricate screens or product behavior.
- Remove waiting and repetition without hiding steps required to understand the result. Use zooms, callouts and captions only where they make an action easier to follow.
- Structure the output as problem or goal, key steps, result and next action. Review all critical screens at readable scale.`,
};
