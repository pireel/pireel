import type { Block } from '@pireel/studio-engine/composition-core';

/** Never label an untouched source video or a partial board as a finished scene result. */
export function whiteboardSceneReady(blocks: readonly Block[], width: number, height: number, duration: number): boolean {
  if (!(duration > 0)) return false;
  const aspect = width / height;
  const ratios: Record<string, number> = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };
  const boards = blocks.filter(block => {
    if (block.templateId !== 'whiteboard') return false;
    const doc = block.slots.doc as { aspect?: string; board?: { nodes?: unknown[] }; beats?: unknown[] } | undefined;
    return !!doc?.board?.nodes?.length && !!doc.beats?.length && Math.abs((ratios[doc.aspect ?? ''] ?? 0) - aspect) < 0.01
      && (!block.box || block.box.x === 0 && block.box.y === 0 && block.box.w === 1 && block.box.h === 1);
  }).sort((a, b) => a.startSec - b.startSec);
  let covered = 0;
  for (const board of boards) {
    if (board.startSec > covered + 1 / 30) return false;
    covered = Math.max(covered, board.startSec + board.durationSec);
  }
  return covered >= duration - 1 / 30;
}
