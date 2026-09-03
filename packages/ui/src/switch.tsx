import * as React from 'react';
import { cn } from './cn';

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: 'sm' | 'md';
}

/** Theme-aware switch using the product's original blue active state. */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  {
    checked,
    onCheckedChange,
    size = 'sm',
    className,
    disabled,
    onClick,
    type = 'button',
    ...props
  },
  ref,
) {
  const compact = size === 'sm';

  return (
    <button
      {...props}
      ref={ref}
      type={type}
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange?.(!checked);
      }}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-full border transition-[background-color,border-color,box-shadow,transform] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-switch-focus/35 focus-visible:ring-offset-2 focus-visible:ring-offset-panel',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        compact ? 'h-[18px] w-8' : 'h-6 w-11',
        checked
          ? 'border-switch-on bg-switch-on'
          : 'border-switch-border bg-switch-off',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          // Centered on the track's padding box (absolute offsets ignore the 1px border, so a
          // top-[2px] thumb in an 18px track sat 2px high); translate-y composes with the
          // horizontal travel below.
          'pointer-events-none absolute top-1/2 -translate-y-1/2 rounded-full shadow-sm transition-[transform,background-color] duration-150',
          compact
            ? 'left-[1px] size-[14px]'
            : 'left-[3px] size-4',
          checked
            ? cn(
                'bg-switch-thumb-on',
                compact ? 'translate-x-[14px]' : 'translate-x-5',
              )
            : 'translate-x-0 bg-switch-thumb-off',
        )}
      />
    </button>
  );
});

export { Switch };
