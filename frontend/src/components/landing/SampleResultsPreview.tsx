import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  SAMPLE_PREVIEW_DISCLOSURE,
  SAMPLE_SCENARIO_RESULTS,
  SAMPLE_THRESHOLDS,
  SAMPLE_THRESHOLD_ROWS,
} from '@/content/landingJourney';
import { cn } from '@/lib/cn';
import { formatMoney, formatPercent } from '@/lib/format';
import { publicModel } from '@/model';

/**
 * What the results look like, before the visitor commits to ten minutes of questions.
 *
 * Collapsed by default so it never competes with the hero, and it is labelled as a sample
 * in the heading, the subtitle and an explicit warning: a sample that reads like a result is
 * the easiest way to mislead a reader about what the model can say.
 */
export function SampleResultsPreview() {
  const [expanded, setExpanded] = useState(false);
  const symbol = publicModel.version.currencySymbol;

  return (
    <section aria-labelledby="preview-heading" className="mt-10 grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-2">
          <h2 id="preview-heading" className="m-0 text-title font-bold text-heading">
            See a sample dashboard
          </h2>
          <p className="m-0 max-w-[48rem] text-muted">
            A sample of the dashboard built from a mid-sized organisation. It is here so you can judge
            the output before answering anything.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={expanded ? 'sample-preview-content' : undefined}
        >
          {expanded ? 'Hide sample' : 'Show sample'}
          {expanded ? (
            <ChevronUp aria-hidden="true" className="size-4" />
          ) : (
            <ChevronDown aria-hidden="true" className="size-4" />
          )}
        </Button>
      </div>

      {expanded ? (
        <div id="sample-preview-content" className="grid gap-4">
          <Alert tone="warning" title="Illustrative sample, not a result">
            <p className="m-0">{SAMPLE_PREVIEW_DISCLOSURE}</p>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Sample scenario exposure</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-small">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="pb-2 pr-4 font-semibold text-muted">Scenario</th>
                      <th scope="col" className="pb-2 pr-4 text-right font-semibold text-muted">Expected</th>
                      <th scope="col" className="pb-2 pr-4 text-right font-semibold text-muted">P10</th>
                      <th scope="col" className="pb-2 text-right font-semibold text-muted">P90</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SAMPLE_SCENARIO_RESULTS.map((scenario) => (
                      <tr key={scenario.name} className="border-b border-border/60 last:border-b-0">
                        <th scope="row" className="py-2 pr-4 text-left font-medium text-ink">
                          {scenario.name}
                        </th>
                        <td className="py-2 pr-4 text-right font-semibold text-accent-strong">
                          {formatMoney(scenario.expectedAnnualLoss, symbol)}
                        </td>
                        <td className="py-2 pr-4 text-right text-muted">
                          {formatMoney(scenario.p10, symbol)}
                        </td>
                        <td className="py-2 text-right text-muted">{formatMoney(scenario.p90, symbol)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sample probability of exceeding thresholds</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-small">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="pb-2 pr-4 font-semibold text-muted">Scenario</th>
                      {SAMPLE_THRESHOLDS.map((threshold) => (
                        <th key={threshold} scope="col" className="pb-2 pr-4 text-right font-semibold text-muted">
                          {formatMoney(threshold, symbol)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SAMPLE_THRESHOLD_ROWS.map((row) => (
                      <tr key={row.scenario} className="border-b border-border/60 last:border-b-0">
                        <th scope="row" className="py-2 pr-4 text-left font-medium text-ink">
                          {row.scenario}
                        </th>
                        {row.probabilities.map((probability, index) => (
                          <td
                            key={SAMPLE_THRESHOLDS[index] ?? index}
                            className={cn(
                              'py-2 pr-4 text-right',
                              probability >= 0.7
                                ? 'font-semibold text-warning'
                                : probability >= 0.4
                                  ? 'text-heading'
                                  : 'text-muted',
                            )}
                          >
                            {formatPercent(probability, 0)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="m-0 text-micro text-muted">
                Threshold probabilities are the chance that a single year exceeds each amount. They are
                not a prediction of the year ahead.
              </p>
            </CardContent>
          </Card>

          <p className="m-0 text-small text-muted">
            Your results also include the scenario ranking, the simulated loss distribution, an
            input-sensitivity ranking and a printable executive report.
          </p>
        </div>
      ) : null}
    </section>
  );
}