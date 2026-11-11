import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-card border border-border bg-paper p-5 shadow-card sm:p-6',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-3 flex flex-col gap-1', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[1.08rem] font-semibold text-heading', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-small text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-ink', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-4 flex flex-wrap items-center gap-3', className)} {...props} />;
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn('my-4 border-0 border-t border-border', className)} />;
}

export function DefinitionList({ children }: { children: ReactNode }) {
  return <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">{children}</dl>;
}

export function DefinitionItem({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="border-b border-border pb-2 last:border-b-0">
      <dt className="text-micro font-semibold uppercase tracking-[0.08em] text-muted">{term}</dt>
      <dd className="m-0 text-ink">{children}</dd>
    </div>
  );
}
