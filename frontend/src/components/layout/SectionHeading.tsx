import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function SectionHeading({
  eyebrow,
  title,
  lede,
  as: Tag = 'h2',
  id,
  className,
}: {
  eyebrow?: string;
  title: string;
  lede?: ReactNode;
  as?: 'h1' | 'h2' | 'h3';
  id?: string;
  className?: string;
}) {
  const size = Tag === 'h1' ? 'text-[var(--text-display)]' : Tag === 'h2' ? 'text-[var(--text-title)]' : 'text-[var(--text-section)]';

  return (
    <div className={cn('grid gap-2', className)}>
      {eyebrow === undefined ? null : (
        <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">{eyebrow}</p>
      )}
      <Tag id={id} className={cn('m-0 max-w-[46rem] font-bold tracking-[-0.02em] text-heading', size)}>
        {title}
      </Tag>
      {lede === undefined ? null : (
        <div className="max-w-[48rem] text-[1.02rem] text-muted">{lede}</div>
      )}
    </div>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="qk-shell py-8 sm:py-10">
      {children}
    </main>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string;
  value: string;
  detail?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-card border p-4',
        emphasis ? 'border-accent-strong/30 bg-accent-soft' : 'border-border bg-paper',
      )}
    >
      <p className="m-0 text-micro font-bold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p
        className={cn(
          'm-0 font-bold leading-tight text-heading',
          emphasis ? 'text-[clamp(1.9rem,4vw,2.6rem)]' : 'text-[clamp(1.4rem,2.6vw,1.9rem)]',
        )}
      >
        {value}
      </p>
      {detail === undefined ? null : <p className="m-0 mt-1 text-small text-muted">{detail}</p>}
    </div>
  );
}
