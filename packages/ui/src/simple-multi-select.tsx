'use client';

import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from './dropdown-menu';
import { cn } from './cn';

/**
 * Several options at once from a list: the trigger looks like a Select and lists what is ticked; the open list
 * stays open while options are ticked. The owner decides what ticking one does to the others.
 */
export function SimpleMultiSelect<T extends string>({ value, options, onToggle, ariaLabel, separator = ', ', disabled, className, contentClassName }: {
  value: readonly T[];
  options: readonly { value: T; label: string }[];
  onToggle: (option: T, checked: boolean) => void;
  ariaLabel?: string;
  /** Between the ticked labels on the trigger. */
  separator?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
}) {
  const shown = options.filter(option => value.includes(option.value)).map(option => option.label).join(separator);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger disabled={disabled} aria-label={ariaLabel} title={shown}
        className={cn('border-line-2 bg-panel hover:bg-panel-2 focus-visible:ring-ring flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-[13px] focus:outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50', className)}>
        <span className="min-w-0 truncate">{shown}</span><ChevronDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={cn('max-h-72 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto', contentClassName)}>
        {options.map(option => (
          <DropdownMenuCheckboxItem key={option.value} checked={value.includes(option.value)}
            onSelect={event => event.preventDefault()} onCheckedChange={checked => onToggle(option.value, checked === true)}>
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
