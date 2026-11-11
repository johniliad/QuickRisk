import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import type { DisclosureRow } from '@/content/plainLanguage';

/**
 * "How these numbers are produced" — the in-app bridge between business language and
 * the model. It renders the machine-readable mapping from `content/plainLanguage.ts`,
 * so the explanation can never drift from the labels shown on the page.
 */
export function HowNumbersAreProduced({
  rows,
  title = 'How these numbers are produced',
}: {
  rows: readonly DisclosureRow[];
  title?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="text-small font-semibold text-heading">{title}</span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <CardContent className="grid gap-3 border-t border-border pt-4">
          {rows.map((row) => (
            <div key={row.business} className="grid gap-0.5">
              <p className="m-0 text-small font-semibold text-ink">{row.business}</p>
              <p className="m-0 text-small text-muted">
                <span className="font-semibold text-ink">{row.model}</span> — {row.formula}
              </p>
              <p className="m-0 text-micro text-muted">Source: {row.source}</p>
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
