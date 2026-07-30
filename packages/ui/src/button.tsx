import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from './cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 focus-visible:ring-offset-1 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // brand
        default: 'border border-line-2 bg-panel text-ink shadow-sm hover:border-line-2 hover:bg-panel-2',
        primary: 'border border-ink bg-ink text-white shadow-sm hover:opacity-90',
        accent: 'border border-accent bg-accent text-white shadow-sm hover:brightness-95',
        lime: 'border border-lime bg-lime text-[#1F2A00] hover:brightness-95',
        ghost: 'bg-transparent hover:bg-panel-2 text-ink',
        // shadcn compat
        destructive: 'border border-rose bg-rose text-white hover:brightness-95',
        outline: 'border border-line-2 bg-transparent hover:bg-panel-2 text-ink',
        secondary: 'border border-line bg-panel-2 text-ink hover:border-line-2 hover:bg-panel',
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
