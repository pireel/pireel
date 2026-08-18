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
 * Every newly generated element gets bespoke visual reasoning. A missing Frame means neutral craft,
 * not a fallback to one of the fixed library cards. Kit mode is reserved for editing an existing
 * kit block or for explicit insertion from the component library.
 */
export function newBlockComposeMode(): undefined {
  return undefined;
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
export function composedBlockFields(r: ComposedBlock, authoredDurationSec?: number): { templateId: string; slots: Record<string, unknown> } {
  return r.kit
    ? { templateId: `kit:${r.kit.component}`, slots: { props: r.kit.props } }
    : {
        templateId: 'custom',
        slots: {
          innerHtml: r.innerHtml,
          timelineBody: r.timelineBody,
          ...(typeof authoredDurationSec === 'number' && Number.isFinite(authoredDurationSec) && authoredDurationSec > 0
            ? { authoredDurationSec }
            : {}),
        },
      };
}

/** The component a block currently shows, for an edit round. Null for non-kit blocks. */
export function kitChoiceOf(b: { templateId: string; slots?: Record<string, unknown> }): KitChoice | null {
  if (!b.templateId.startsWith('kit:')) return null;
  const props = b.slots?.props;
  return { component: b.templateId.slice(4), props: typeof props === 'object' && props !== null ? (props as Record<string, unknown>) : {} };
}
