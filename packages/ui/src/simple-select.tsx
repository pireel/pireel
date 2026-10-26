'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { cn } from './cn';

interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

/** A select item cannot carry an empty value, so an empty option travels under this stand-in. */
const EMPTY = '\u0000empty';
const encode = (value: string) => (value === '' ? EMPTY : value);
const decode = (value: string) => (value === EMPTY ? '' : value);

/** `Select` from a list of options, for forms and filters that need nothing more. */
export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  ariaLabel,
  className,
}: {
  /** Controlled value. null means unselected (shows placeholder). */
  value: string | null;
  onValueChange?: (v: string) => void;
  options: readonly Option[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <Select value={value === null ? '' : encode(value)} disabled={disabled} onValueChange={(v) => onValueChange?.(decode(v))}>
      <SelectTrigger aria-label={ariaLabel} className={cn('border-line-2 bg-panel hover:bg-panel-2 h-auto px-3 py-2 text-[13px] shadow-none', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={encode(opt.value)} disabled={opt.disabled} className="text-[13px]">
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
