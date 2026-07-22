'use client';

import { Select as BaseSelect } from '@base-ui/react/select';
import { IconChevDown } from './icons';

interface Option {
  value: string;
  label: string;
}

export function SimpleSelect({
  value,
  onValueChange,
  options,
  placeholder,
  className = '',
}: {
  /**
   * Controlled value. null means unselected (shows placeholder).
   * Never pass undefined — base-ui treats undefined as uncontrolled,
   * and setting a value later throws "changing from uncontrolled to controlled".
   */
  value: string | null;
  onValueChange?: (v: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <BaseSelect.Root value={value} onValueChange={(v) => onValueChange?.(v ?? '')}>
      <BaseSelect.Trigger
        className={`border-line-2 bg-panel hover:bg-panel-2 flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-[13px] outline-none focus:border-[var(--color-accent)] focus:shadow-[0_0_0_3px_rgba(63,75,232,0.12)] ${className}`}
      >
        <BaseSelect.Value placeholder={placeholder} />
        <BaseSelect.Icon>
          <IconChevDown size={14} className="text-ink-3" />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner>
          <BaseSelect.Popup className="bg-panel border-line min-w-[var(--anchor-width)] rounded-md border p-1 shadow-[var(--shadow-md)]">
            {options.map((opt) => (
              <BaseSelect.Item
                key={opt.value}
                value={opt.value}
                className="hover:bg-panel-2 data-[highlighted]:bg-panel-2 cursor-pointer rounded-md px-2.5 py-1.5 text-[13px] outline-none"
              >
                <BaseSelect.ItemText>{opt.label}</BaseSelect.ItemText>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
