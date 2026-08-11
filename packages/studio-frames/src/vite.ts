/// <reference types="vite/client" />
/** Vite entry for the optional public/example packs under content/.
 * Hosted shells may instead use createFrameRegistry from ./registry with private content maps. */
import { createFrameRegistry } from './registry';

const FRAME_FILES = import.meta.glob('../content/*/frame.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const frameRegistry = createFrameRegistry(FRAME_FILES);
export type {
  Frame,
  FrameRegistry,
  FrameRegistryConflictPolicy,
  FrameRegistryLayer,
} from './registry';
