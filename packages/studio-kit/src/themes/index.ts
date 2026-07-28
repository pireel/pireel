/** Bundled themes. A project picks one; a host may register its own — they are plain data. */

import type { Theme } from '../theme';
import { press } from './press';
import { slab } from './slab';
import { consoleTheme } from './console';

export const themes: Record<string, Theme> = {
  press,
  slab,
  console: consoleTheme,
};

export { press, slab, consoleTheme };
