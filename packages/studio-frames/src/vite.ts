/// <reference types="vite/client" />
/** Vite entry: globs every frame.md under content/ and builds a ready frameRegistry.
 *  Non-Vite consumers use createFrameRegistry from ./registry with their own content map. */
import { createFrameRegistry } from './registry';

const FRAME_FILES = import.meta.glob('../content/*/frame.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const frameRegistry = createFrameRegistry(FRAME_FILES);
export type { Frame, FrameRegistry } from './registry';
