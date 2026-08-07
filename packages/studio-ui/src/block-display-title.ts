/**
 * Human-facing block titles for chat receipts and references.
 *
 * Persisted `Block.label` is an authoring hint and older generated blocks often store a
 * style description there ("theme + shape"). UI titles should instead describe what the
 * viewer can read. This extractor is deliberately schema-agnostic so adding another kit
 * component does not require another title switch statement.
 */

import { type Block, blockKind, getTemplate } from '@pireel/studio-engine/composition';
import { t } from './i18n';

const MAX_TITLE_CHARS = 34;
const SKIP_KEYS = new Set([
  'variant', 'motion', 'effect', 'animation', 'surface', 'surfacecolor', 'radius', 'outline',
  'ghost', 'trend', 'winner', 'highlight', 'color', 'background', 'bg', 'border', 'opacity',
  'timelinebody', 'innerhtml', 'url', 'src', 'type', 'fit', 'scale', 'width', 'height',
]);

const compact = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? whole;
    const hex = entity[1]?.toLowerCase() === 'x';
    const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
  });
}

function shorten(value: string): string {
  const chars = Array.from(compact(value));
  return chars.length <= MAX_TITLE_CHARS ? chars.join('') : `${chars.slice(0, MAX_TITLE_CHARS - 1).join('')}…`;
}

function usefulText(value: unknown): string | null {
  const text = compact(value);
  if (!text || text === '—' || text === '…') return null;
  if (/^(?:https?:|data:|blob:|#[\da-f]{3,8}$)/i.test(text)) return null;
  return text;
}

function keyPriority(key: string): number {
  const k = key.toLowerCase();
  if (/^(?:title|headline|heading|text|quote|name)$/.test(k) || /(?:title|headline|heading|text|name)$/.test(k)) return 0;
  if (/^(?:label|value|amount|number|metric)$/.test(k) || /(?:label|value)$/.test(k)) return 1;
  if (/^(?:subtitle|support|sub|note|kicker|unit|index)$/.test(k)) return 2;
  return 5;
}

/** Collect meaningful copy from arbitrary JSON props/slots. Presentation controls are ignored. */
function structuredText(value: unknown): string[] {
  const found: { text: string; priority: number; order: number }[] = [];
  let order = 0;
  const walk = (node: unknown, key = '', depth = 0) => {
    if (depth > 5 || node == null) return;
    const normalizedKey = key.toLowerCase();
    if (SKIP_KEYS.has(normalizedKey)) return;
    if (typeof node === 'string' || typeof node === 'number') {
      const text = usefulText(node);
      if (text) found.push({ text, priority: keyPriority(key), order: order++ });
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 6)) walk(item, key, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    for (const [childKey, child] of Object.entries(node as Record<string, unknown>)) walk(child, childKey, depth + 1);
  };
  walk(value);
  found.sort((a, b) => a.priority - b.priority || a.order - b.order);
  const seen = new Set<string>();
  return found.flatMap(({ text }) => {
    const key = text.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}

/** Extract visible copy from generated markup without needing DOMParser (keeps tests/server rendering deterministic). */
function htmlText(html: string): string[] {
  const plain = decodeHtmlEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(?:style|script|template|noscript)\b[^>]*>[\s\S]*?<\/(?:style|script|template|noscript)>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, ' · ')
      .replace(/<[^>]+>/g, ' · '),
  );
  return plain.split(/\s*·\s*/).map(compact).filter((text) => !!usefulText(text));
}

export function blockContentTitle(block: Block): string | null {
  if (blockKind(block) === 'media') return usefulText(block.label);
  const slots = block.slots as Record<string, unknown>;
  const pieces = block.templateId === 'custom' && typeof slots.innerHtml === 'string'
    ? htmlText(slots.innerHtml)
    : structuredText(block.templateId.startsWith('kit:') ? slots.props : slots);
  return pieces.length ? shorten(pieces.slice(0, 4).join(' · ')) : null;
}

/** Content first; if a block has no readable copy, fall back to its semantic template role, never its style-description label. */
export function blockDisplayTitle(block: Block): string {
  const content = blockContentTitle(block);
  if (content) return content;
  try {
    return t(getTemplate(block.templateId).name);
  } catch {
    const fallbackKey = {
      caption: 'panels.captions',
      title: 'common.title',
      stat: 'common.number',
      list: 'panels.list',
      transition: 'tools.add_transition.label',
      media: 'common.media',
      custom: 'panels.element',
    }[blockKind(block)];
    return t(fallbackKey);
  }
}
