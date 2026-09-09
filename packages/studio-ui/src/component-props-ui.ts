/**
 * Editable properties, UI side: thin glue over the engine's unified component contract
 * (component-schema.ts) plus the live-preview message a bespoke component's drag needs.
 */
import type { Block } from '@pireel/studio-engine/composition';
import { componentPropsLiveMessage, parseComponentProps, resolveComponentProps, type ComponentPropSpec } from '@pireel/studio-engine/component-props';
import { applyComponentValues } from '@pireel/studio-engine/component-schema';

/** The manifest of a bespoke block, or [] for anything else (kit, media, captions, no manifest). */
export function blockPropSpecs(block: Pick<Block, 'templateId' | 'slots'>): ComponentPropSpec[] {
  if (block.templateId !== 'custom') return [];
  const innerHtml = block.slots.innerHtml;
  return typeof innerHtml === 'string' ? parseComponentProps(innerHtml).specs : [];
}

/** Slots after the user set the form to `next` — one rule for registered and bespoke components. */
export function nextPropsSlots(block: Pick<Block, 'templateId' | 'slots'>, next: Record<string, unknown>): Record<string, unknown> {
  return applyComponentValues(block, next) ?? block.slots;
}

/** The live message a bespoke component's drag paints (kit components re-render on commit instead). */
export function liveMessageFor(block: Pick<Block, 'templateId' | 'slots'>, next: Record<string, unknown>) {
  const specs = blockPropSpecs(block);
  return specs.length ? componentPropsLiveMessage(specs, resolveComponentProps(specs, next)) : null;
}
