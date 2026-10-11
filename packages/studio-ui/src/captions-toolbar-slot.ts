import { createContext, type ReactNode } from 'react';

/** Caption-layer controls the captions panel hands to the transcript editor, so both share one toolbar row. */
export interface CaptionsToolbarSlot {
  /** Sits with the transcript tools (translation). */
  tools: ReactNode;
  /** Right end of the row (re-extract, captions on/off). */
  end: ReactNode;
}

export const CaptionsToolbarContext = createContext<CaptionsToolbarSlot | null>(null);

/** One look for every button on the transcript toolbar. */
export const TRANSCRIPT_TOOL_CLASS = 'text-ink-2 hover:bg-panel-2/20 hover:text-ink flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[11.5px] transition-colors disabled:opacity-40';

/** Toolbar row: a size container so secondary labels can drop to icon-only in a narrow column. */
export const TRANSCRIPT_TOOLBAR_CLASS = '@container flex shrink-0 items-center gap-1 px-3 pb-2 pt-3';
/** A label that hides when the toolbar is narrower than ~22rem (the button keeps its title). */
export const TRANSCRIPT_TOOL_LABEL_CLASS = 'hidden @[22rem]:inline';
