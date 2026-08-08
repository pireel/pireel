/**
 * What a generation round produces, and what it becomes on a block.
 *
 * Two shapes come back from the composer — a markup fragment (the free-form path) or a component
 * choice (the kit path) — and every call site has to land one of them on a block. That mapping
 * lives here once: a call site that forgets the kit branch would silently write an empty custom
 * block, which looks like a model failure rather than a wiring bug.
 */

import type { KitChoice } from '@pireel/studio-engine/compose';

/** Which contract to generate against. Explicit at every call site: whether a moment gets a
 *  component or hand-written markup is a product decision, never an inferred default. */
export interface ComposeMode {
  kit?: boolean;
  /** kit only: the component this block already shows, so an edit keeps unmentioned props. */
  current?: KitChoice | null;
}

/**
 * A planned scene needs bespoke visual reasoning even if frame attachment failed. The small,
 * themeless local-edit path may still use the compact component kit as a deliberate fallback.
 */
export function newBlockComposeMode(input: { hasFrame: boolean; hasDirectorScene: boolean }): ComposeMode | undefined {
  return input.hasFrame || input.hasDirectorScene ? undefined : { kit: true };
}

export interface ComposedBlock {
  innerHtml: string;
  timelineBody: string;
  note: string;
  /** Present on the kit path — the block stores props, not markup. */
  kit?: KitChoice;
  /** Kit path only: the model deliberately answered null — this moment deserves no graphic. The
   *  fields above are just the seed echoed back; do NOT store them. What a veto means belongs to
   *  the caller: a batch fill drops the placeholder, an explicit user request retries free-form. */
  declined?: boolean;
}

/** The block fields a result becomes. Spread onto a block: `{ ...b, ...composedBlockFields(r) }`. */
export function composedBlockFields(r: ComposedBlock): { templateId: string; slots: Record<string, unknown> } {
  return r.kit
    ? { templateId: `kit:${r.kit.component}`, slots: { props: r.kit.props } }
    : { templateId: 'custom', slots: { innerHtml: r.innerHtml, timelineBody: r.timelineBody } };
}

/** The component a block currently shows, for an edit round. Null for non-kit blocks. */
export function kitChoiceOf(b: { templateId: string; slots?: Record<string, unknown> }): KitChoice | null {
  if (!b.templateId.startsWith('kit:')) return null;
  const props = b.slots?.props;
  return { component: b.templateId.slice(4), props: typeof props === 'object' && props !== null ? (props as Record<string, unknown>) : {} };
}
