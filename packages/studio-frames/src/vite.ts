/** Vite 入口:glob 吃 content/ 下全部 frame.md,建现成的 frameRegistry。
 *  非 Vite 消费方用 ./registry 的 createFrameRegistry 自带内容表。 */
import { createFrameRegistry } from './registry';

const FRAME_FILES = import.meta.glob('../content/*/frame.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const frameRegistry = createFrameRegistry(FRAME_FILES);
export type { Frame, FrameRegistry } from './registry';
