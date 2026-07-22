import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-px text-[11.5px] font-medium [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // brand
        default: 'bg-panel-2 border-line text-ink-2',
        solid: 'bg-ink border-ink text-white',
        accent: 'bg-accent/8 border-accent/18 text-accent',
        orange: 'bg-accent-2/8 border-accent-2/20 text-accent-2',
        teal: 'bg-teal/10 border-teal/22 text-teal',
        rose: 'bg-rose/8 border-rose/20 text-rose',
        violet: 'bg-violet/8 border-violet/20 text-violet',
        amber: 'bg-amber/9 border-amber/25 text-[#B87800]',
        lime: 'bg-lime-soft border-[#D9F08E] text-lime-ink',
        // shadcn compat
        secondary: 'bg-panel-2 border-line-2 text-ink',
        destructive: 'bg-rose/10 border-rose/30 text-rose',
        outline: 'border-line-2 bg-transparent text-ink',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean;
  mono?: boolean;
  dot?: boolean;
}

export function Badge({
  className,
  variant,
  asChild = false,
  mono = false,
  dot = false,
  children,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : 'span';
  return (
    <Comp
      className={cn(badgeVariants({ variant }), mono && 'font-mono', className)}
      {...props}
    >
      {dot && <span className="inline-block h-[5px] w-[5px] rounded-full bg-current" />}
      {children}
    </Comp>
  );
}

export { badgeVariants };
