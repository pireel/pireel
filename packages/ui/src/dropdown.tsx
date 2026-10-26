'use client';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu';

interface DropdownItem {
  key: string;
  label: string;
  description?: string;
  onSelect: () => void;
  disabled?: boolean;
}

interface Props {
  /** A single focusable element (usually a button); it becomes the menu trigger. */
  trigger: React.ReactElement;
  items: DropdownItem[];
  align?: 'left' | 'right';
}

/** `DropdownMenu` from a list of items, each with an optional second line. */
export function Dropdown({ trigger, items, align = 'right' }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align === 'right' ? 'end' : 'start'} className="min-w-[200px]">
        {items.map((it) => (
          <DropdownMenuItem key={it.key} disabled={it.disabled} onSelect={it.onSelect} className="flex-col items-start gap-0.5 text-[12.5px]">
            <span className="text-ink font-semibold">{it.label}</span>
            {it.description && <span className="text-ink-4 text-[11px]">{it.description}</span>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
