import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Page controls that belong at the start of the host's top bar (a scene's way back). A host marks
 * the place with `data-studio-topbar-start`; without one the controls render where they are.
 */
export function TopBarStart({ children }: { children: (placement: 'bar' | 'inline') => ReactNode }) {
  const [target, setTarget] = useState<Element | null>(null);
  useLayoutEffect(() => { setTarget(document.querySelector('[data-studio-topbar-start]')); }, []);
  return target ? createPortal(children('bar'), target) : <>{children('inline')}</>;
}

/** The back control's look in either place. */
export const topBarBackClass = (placement: 'bar' | 'inline') => placement === 'bar'
  ? 'text-ink-3 hover:bg-panel-2 hover:text-ink inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] disabled:opacity-40'
  : 'text-ink-3 mb-3 inline-flex shrink-0 self-start items-center gap-2 text-sm disabled:opacity-40';
