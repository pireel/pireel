/**
 * Frame stagings — registered with the engine on import.
 *
 * Only two frames carry stagings today. The rest render components in their built-in variants with
 * the frame's palette applied: a theme with no stagings is a colour scheme, which is a real and
 * honest degradation, not a broken state.
 */

import { registerBlueprints } from '@pireel/studio-engine/blueprint-registry';
import { MEMPHIS_BLUEPRINTS } from './memphis-pop';
import { SCRAPBOOK_BLUEPRINTS } from './scrapbook-tape';

export { MEMPHIS_BLUEPRINTS } from './memphis-pop';
export { SCRAPBOOK_BLUEPRINTS } from './scrapbook-tape';

export const FRAME_BLUEPRINTS: Record<string, typeof MEMPHIS_BLUEPRINTS> = {
  'memphis-pop': MEMPHIS_BLUEPRINTS,
  'scrapbook-tape': SCRAPBOOK_BLUEPRINTS,
};

for (const [frameId, blueprints] of Object.entries(FRAME_BLUEPRINTS)) registerBlueprints(frameId, blueprints);
