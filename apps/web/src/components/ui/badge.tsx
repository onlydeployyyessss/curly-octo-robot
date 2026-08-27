import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary/15 text-primary',
        green: 'border-transparent bg-emerald-500/15 text-emerald-400',
        yellow: 'border-transparent bg-amber-500/15 text-amber-400',
        blue: 'border-transparent bg-sky-500/15 text-sky-400',
        violet: 'border-transparent bg-violet-500/15 text-violet-400',
        red: 'border-transparent bg-red-500/15 text-red-400',
        orange: 'border-transparent bg-orange-500/15 text-orange-400',
        gray: 'border-border bg-muted text-muted-foreground',
        outline: 'text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
