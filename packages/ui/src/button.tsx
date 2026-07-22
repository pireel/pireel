import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // brand
        default: 'border border-line-2 bg-panel hover:bg-panel-2 text-ink',
        primary: 'bg-ink text-white border border-ink hover:bg-black',
        accent: 'bg-accent text-white border border-accent hover:brightness-110',
        lime: 'bg-lime text-[#1F2A00] border border-lime hover:brightness-95',
        ghost: 'bg-transparent hover:bg-panel-2 text-ink',
        // shadcn compat
        destructive: 'bg-rose text-white border border-rose hover:brightness-110',
        outline: 'border border-line-2 bg-transparent hover:bg-panel-2 text-ink',
        secondary: 'bg-panel-2 text-ink border border-line hover:bg-panel',
        link: 'text-accent underline-offset-4 hover:underline bg-transparent',
      },
      size: {
        default: 'px-3.5 py-2 text-[13px]',
        sm: 'px-2.5 py-1 text-[12px]',
        md: 'px-3.5 py-2 text-[13px]',
        lg: 'px-4.5 py-2.5 text-[14px]',
        icon: 'h-9 w-9 p-0',
        'icon-sm': 'h-7 w-7 p-0 text-[12px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
});

export { Button, buttonVariants };
