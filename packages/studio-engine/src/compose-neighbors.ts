/** The "other fragments in this video" list the component generator reads, so a new or edited
 *  Motion Graphic can differ from its neighbours instead of repeating the same staging. */

import type { Block } from './composition-core';

const MAX_NEIGHBORS = 8;
const TEXT_CHARS = 48;

function isMotionGraphic(block: Block): boolean {
  return block.templateId === 'custom' || block.templateId.startsWith('kit:');
}

function visibleText(block: Block): string {
  const html = typeof block.slots?.innerHtml === 'string' ? block.slots.innerHtml : '';
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > TEXT_CHARS ? `${text.slice(0, TEXT_CHARS)}…` : text;
}

/**
 * Motion Graphics of the composition in play order, each as one line, with «THIS» on the fragment
 * being made. `target` is the block being edited, or the start time of a new one. Only the
 * nearest fragments are listed. Empty when there is nothing to compare against.
 */
export function motionGraphicNeighbors(blocks: readonly Block[], target: { blockId: string } | { atSec: number }): string[] {
  const graphics = blocks.filter(isMotionGraphic).slice().sort((a, b) => a.startSec - b.startSec);
  const lines = graphics.map((block) => ({
    at: block.startSec,
    id: block.id,
    text: `[${block.templateId === 'custom' ? 'custom' : block.templateId.slice(4)}] ${[block.label, visibleText(block)].filter(Boolean).join(' — ') || 'untitled'}`,
  }));
  let index: number;
  if ('blockId' in target) {
    index = lines.findIndex((line) => line.id === target.blockId);
    if (index < 0) return [];
  } else {
    index = lines.findIndex((line) => line.at > target.atSec);
    if (index < 0) index = lines.length;
    lines.splice(index, 0, { at: target.atSec, id: '', text: '(new fragment)' });
  }
  if (lines.length < 2) return [];
  const from = Math.max(0, Math.min(index - Math.floor(MAX_NEIGHBORS / 2), lines.length - MAX_NEIGHBORS));
  return lines.slice(from, from + MAX_NEIGHBORS).map((line, offset) => `${from + offset + 1}. ${line.text}${from + offset === index ? '  «THIS»' : ''}`);
}
