import { ChevronRight } from 'lucide-react';
import { ILIADIS_SUITE_NOTE, ILIADIS_SUITE_STAGES, ILIADIS_SUITE_TITLE } from '@/content/iliadisSuite';
import { cn } from '@/lib/cn';

/**
 * Suite attribution strip.
 *
 * One understated line in the footer, not a second navigation: it names the six-stage suite
 * QuickRisk belongs to and marks the stage this tool is. Nothing here is a link to another
 * product, and no data passes between the stages.
 */
export function IliadisSuiteFooter() {
  return (
    <section aria-labelledby="suite-heading" className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="suite-heading" className="m-0 text-micro font-bold uppercase tracking-[0.09em] text-muted">
          {ILIADIS_SUITE_TITLE}
        </h2>
        <p className="m-0 text-micro text-muted">QuickRisk is stage 3 of 6</p>
      </div>

      <ol className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-6">
        {ILIADIS_SUITE_STAGES.map((stage, index) => (
          <li key={stage.order} className="flex items-center gap-1">
            <div
              className={cn(
                'w-full rounded-control border px-2.5 py-1.5',
                stage.current ? 'border-accent-strong/50 bg-accent-soft' : 'border-border bg-paper',
              )}
            >
              <p
                className={cn(
                  'm-0 text-micro font-bold uppercase tracking-[0.08em]',
                  stage.current ? 'text-accent-strong' : 'text-muted',
                )}
              >
                {stage.order}. {stage.verb}
              </p>
              <p className={cn('m-0 text-small font-semibold', stage.current ? 'text-heading' : 'text-ink')}>
                {stage.name}
                {stage.current ? <span className="qk-visually-hidden"> — current tool</span> : null}
              </p>
            </div>
            {index === ILIADIS_SUITE_STAGES.length - 1 ? null : (
              <ChevronRight aria-hidden="true" className="hidden size-3.5 shrink-0 text-muted lg:block" />
            )}
          </li>
        ))}
      </ol>

      <p className="m-0 max-w-[52rem] text-micro text-muted">{ILIADIS_SUITE_NOTE}</p>
    </section>
  );
}
