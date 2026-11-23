import { Info } from 'lucide-react';
import type { EalProvenance } from '@/content/dataLifecycle';

/**
 * Provenance for one expected-annual-loss figure.
 *
 * Collapsed by default so it never competes with the number itself, but always present and
 * keyboard-reachable. It answers the three questions a visitor actually asks when two
 * screens disagree: where did this come from, how was it produced, and what is it not
 * connected to.
 */
export function DataProvenance({ provenance }: { provenance: EalProvenance }) {
  return (
    <details className="rounded-control border border-border bg-canvas px-3 py-2 text-micro text-muted">
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-ink">
        <Info aria-hidden="true" className="size-3.5 shrink-0" />
        <span>Where this number comes from — {provenance.label}</span>
      </summary>
      <div className="mt-2 grid gap-1.5">
        <p className="m-0">
          <strong className="font-semibold text-ink">Source.</strong> {provenance.source}
        </p>
        <p className="m-0">
          <strong className="font-semibold text-ink">Method.</strong> {provenance.method}
        </p>
        <div>
          <p className="m-0 font-semibold text-ink">Not connected to:</p>
          <ul className="m-0 mt-0.5 grid gap-1 pl-4">
            {provenance.independentOf.map((statement) => (
              <li key={statement}>{statement}</li>
            ))}
          </ul>
        </div>
      </div>
    </details>
  );
}
