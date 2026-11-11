import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-control font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
  {
    variants: {
      variant: {
        primary:
          'border border-accent-strong bg-accent-strong text-white hover:bg-accent-hover hover:text-white',
        secondary:
          'border border-accent-strong bg-transparent text-accent-strong hover:bg-accent-soft',
        subtle: 'border border-border bg-paper text-ink hover:bg-accent-soft',
        ghost: 'border border-transparent bg-transparent text-accent-strong hover:bg-accent-soft',
      },
      size: {
        md: 'min-h-11 px-4 py-2 text-[0.95rem]',
        lg: 'min-h-12 px-5 py-3 text-base',
        sm: 'min-h-9 px-3 py-1.5 text-sm',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
