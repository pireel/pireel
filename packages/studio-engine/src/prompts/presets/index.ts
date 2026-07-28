/**
 * L2 — the preset table.
 *
 * A preset is DATA that names which layers to load, not a plugin system. There is one preset;
 * building a registry, a resolver and a lifecycle around a single entry would only encode
 * guesses about what the second one needs. The seam is here — `getPreset` is the single lookup
 * every assembly goes through — so adding "vlog" later is a new file and a map entry.
 */

import { type Preset, SPOKEN_PRESET } from './spoken';

export type { Preset };
export { SPOKEN_EDITORIAL, SPOKEN_PRESET } from './spoken';

const PRESETS: Record<string, Preset> = { [SPOKEN_PRESET.id]: SPOKEN_PRESET };

export const DEFAULT_PRESET_ID = SPOKEN_PRESET.id;

/** Unknown ids fall back to the default: a stale preset id in a saved project must never break
 *  generation, and a graphic made under the wrong preset beats no graphic at all. */
export function getPreset(id?: string): Preset {
  return (id && PRESETS[id]) || SPOKEN_PRESET;
}

export function listPresets(): Preset[] {
  return Object.values(PRESETS);
}
