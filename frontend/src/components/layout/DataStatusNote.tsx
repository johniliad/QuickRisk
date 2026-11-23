import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';

/**
 * Compact "where am I" strip used on the results page, in QuickRisk Live and in
 * Decision Lab.
 *
 * The label states what the screen is showing and the detail states whether it is
 * stored. It is deliberately quiet: the full explanation lives in the data-handling
 * dialog, and this strip only prevents the question "did that save?".
 */
export function DataStatusNote({
  label,
  detail,
  tone = 'neutral',
}: {
  label: string;
  detail: string;
  tone?: 'neutral' | 'warning';
}) {
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-muted">
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-control border px-2 py-0.5 font-bold uppercase tracking-[0.08em]',
          tone === 'warning'
            ? 'border-warning/35 bg-warning/5 text-warning'
            : 'border-border bg-canvas text-muted',
        )}
      >
        <Info aria-hidden="true" className="size-3" />
        {label}
      </span>
      <span>{detail}</span>
    </p>
  );
}
