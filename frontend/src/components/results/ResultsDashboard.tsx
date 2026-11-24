import { ArrowRight } from 'lucide-react';
import { LossDistributionChart } from '@/components/charts/LossDistributionChart';
import { ModelledComponentsChart } from '@/components/charts/ModelledComponentsChart';
import { PercentileRangeChart } from '@/components/charts/PercentileRangeChart';
import { ScenarioRankingChart } from '@/components/charts/ScenarioRankingChart';
import { SensitivityChart } from '@/components/charts/SensitivityChart';
import { BranchDivider, ForkArms, FORK_GRID } from '@/components/layout/BranchDivider';
import { DisclaimerBlock, PrivacyNotice } from '@/components/layout/DisclaimerBlock';
import { DataProvenance } from '@/components/layout/DataProvenance';
import { DataStatusNote } from '@/components/layout/DataStatusNote';
import { HowNumbersAreProduced } from '@/components/layout/HowNumbersAreProduced';
import { JourneyMap } from '@/components/layout/JourneyMap';
import { ExecutiveSummary } from '@/components/results/ExecutiveSummary';
import { ScenarioTable } from '@/components/results/ScenarioTable';
import { ThresholdTable } from '@/components/results/ThresholdTable';
import { Alert } from '@/components/ui/alert';
import { Badge, ConfidenceBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CORE_DISCLOSURE, precisionFor } from '@/content/plainLanguage';
import { RESULTS_MEMORY_NOTE, resultsScenarioEalProvenance } from '@/content/dataLifecycle';
import type { CalculationResponse } from '@/domain/results';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';
import { publicModel } from '@/model';

/**
 * Results dashboard.
 *
 * Rendered entirely from the transient JSON response. There is no persistent results
 * URL and no server-side results record: refreshing the page discards the assessment by
 * design.
 */
export function ResultsDashboard({
  response,
  onSelectScenario,
  onRestart,
  onOpenLive,
  onOpenDecisionLab,
}: {
  response: CalculationResponse;
  onSelectScenario: (scenarioCode: string) => void;
  onRestart: () => void;
  onOpenLive: () => void;
  onOpenDecisionLab: () => void;
}) {
  const thresholds = publicModel.version.lossThresholds;
  const symbol = response.meta.currencySymbol === '' ? publicModel.version.currencySymbol : response.meta.currencySymbol;
  const millionThreshold = thresholds.find((value) => value === 1_000_000) ?? thresholds[thresholds.length - 1] ?? 1_000_000;

  const handlePrint = () => {
    globalThis.print();
  };

  return (
    <div className="grid gap-10">
      <ExecutiveSummary
        response={response}
        millionThreshold={millionThreshold}
        onPrint={handlePrint}
        onRestart={onRestart}
      />

      <section className="grid gap-4" aria-labelledby="next-steps-heading">
        <div className="grid gap-2">
          <h2 id="next-steps-heading" className="m-0 text-section font-semibold text-heading">
            Your exposure is ready. What next?
          </h2>
          <DataStatusNote label="In this tab only" detail={RESULTS_MEMORY_NOTE} />
          <p className="m-0 text-small text-muted">
            Both tools start from this result and neither one feeds the other. Pick a branch now —
            you can come back and open the other one at any time.
          </p>
        </div>

        <ForkArms className="-mb-4" />

        <div className={cn('grid gap-3', FORK_GRID)}>
          <Card className="border-accent-strong/40">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>QuickRisk Live</CardTitle>
                <Badge tone="accent">Branch A</Badge>
              </div>
              <p className="m-0 text-micro font-semibold uppercase tracking-[0.08em] text-muted">
                SOC overlay on one scenario
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 text-small">
              <p className="m-0">
                Overlay synthetic SOC evidence and simulated response actions on this baseline. It is a
                deterministic demonstration: no production SOC feed is connected and the result above does not
                change.
              </p>
              <p className="m-0 text-micro text-muted">
                Carries across: one scenario's expected annual loss — not the portfolio total — plus the scenario
                you select. Uses: a browser-side SOC overlay on that one number. Does not carry: the other
                scenarios, your answers, or anything Decision Lab does. Nothing is stored until you save a
                snapshot.
              </p>
              <p className="m-0 text-micro font-semibold text-ink">
                Does not use Decision Lab, and Decision Lab does not use it.
              </p>
              <div>
                <Button variant="secondary" size="sm" onClick={onOpenLive}>
                  Open QuickRisk Live
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <BranchDivider className="lg:min-h-full" />

          <Card className="border-success/40">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Decision Lab</CardTitle>
                <Badge tone="success">Branch B</Badge>
              </div>
              <p className="m-0 text-micro font-semibold uppercase tracking-[0.08em] text-muted">
                Treatment comparison on the portfolio baseline
              </p>
            </CardHeader>
            <CardContent className="grid gap-3 text-small">
              <p className="m-0">
                Compare risk treatments, evaluate portfolios against a stated risk appetite and produce a
                printable Board Risk Pack. The comparison starts from the portfolio figure above, replays the
                same simulated years and applies the treatments you select.
              </p>
              <p className="m-0 text-micro text-muted">
                Carries across: this page's portfolio estimate, plus your answers re-sent for the treated
                calculation. Uses: the same seed and iteration count as this page, so the baseline agrees
                with the figure above to within Monte Carlo noise. Does not carry: anything from QuickRisk
                Live or your saved Live snapshots. If an answer changes after this page was calculated,
                Decision Lab says the baseline no longer matches. A saved analysis keeps the result, not the
                answers.
              </p>
              <p className="m-0 text-micro font-semibold text-ink">
                Does not read QuickRisk Live or your saved Live snapshots.
              </p>
              <div>
                <Button variant="secondary" size="sm" onClick={onOpenDecisionLab}>
                  Open Decision Lab
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <JourneyMap currentSurface="results" />
      </section>

      <section className="grid gap-4" aria-labelledby="scenario-table-heading">
        <h2 id="scenario-table-heading" className="m-0 text-section font-semibold text-heading">
          Scenario results
        </h2>
        <ScenarioTable
          scenarios={response.scenarios}
          symbol={symbol}
          millionThreshold={millionThreshold}
          onSelect={onSelectScenario}
        />
        <DataProvenance provenance={resultsScenarioEalProvenance(response.meta)} />
        <p className="m-0 text-micro text-muted">
          Input quality is a heuristic indicator of answer completeness and of how wide the resulting distribution
          is. It is not statistical confidence and not a probability that the result is correct.
        </p>
      </section>

      <section className="grid gap-4" aria-labelledby="thresholds-heading">
        <h2 id="thresholds-heading" className="m-0 text-section font-semibold text-heading">
          Probability of exceeding financial thresholds
        </h2>
        <ThresholdTable scenarios={response.scenarios} thresholds={thresholds} symbol={symbol} />
      </section>

      <section className="grid gap-6" aria-labelledby="charts-heading">
        <h2 id="charts-heading" className="m-0 text-section font-semibold text-heading">
          Visualisation
        </h2>
        <Alert tone="info" title={publicModel.content.annualisationNotice.title}>
          <p className="m-0">{publicModel.content.annualisationNotice.statement}</p>
        </Alert>
        <Card>
          <CardContent>
            <PercentileRangeChart scenarios={response.scenarios} symbol={symbol} />
          </CardContent>
        </Card>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <CardContent>
              <ScenarioRankingChart scenarios={response.scenarios} symbol={symbol} />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <ModelledComponentsChart scenarios={response.scenarios} />
            </CardContent>
          </Card>
        </div>
        <p className="m-0 text-micro text-muted">
          Charts are presentation only: every number is produced by the server-side simulation.
        </p>
      </section>

      <section className="grid gap-6" aria-labelledby="sensitivity-heading">
        <h2 id="sensitivity-heading" className="m-0 text-section font-semibold text-heading">
          Sensitivity: which inputs matter most
        </h2>
        <Card>
          <CardContent>
            <SensitivityChart sensitivity={response.portfolio.sensitivity} symbol={symbol} />
          </CardContent>
        </Card>
        <p className="m-0 text-small text-muted">{response.portfolio.sensitivity.note}</p>
      </section>

      <section className="grid gap-4" aria-labelledby="scenario-cards-heading">
        <h2 id="scenario-cards-heading" className="m-0 text-section font-semibold text-heading">
          Scenario summaries
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {response.scenarios.map((scenario) => (
            <Card key={scenario.code}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>{scenario.name}</CardTitle>
                  <ConfidenceBadge level={scenario.confidence.level} score={scenario.confidence.score} />
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                <p className="m-0 text-small text-muted">{scenario.shortDescription}</p>
                <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div>
                    <dt className="text-micro uppercase tracking-[0.06em] text-muted">Expected</dt>
                    <dd className="m-0 font-semibold text-accent-strong">
                      {formatMoney(scenario.statistics.expectedAnnualLoss, symbol)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-micro uppercase tracking-[0.06em] text-muted">P10</dt>
                    <dd className="m-0">{formatMoney(scenario.statistics.p10, symbol)}</dd>
                  </div>
                  <div>
                    <dt className="text-micro uppercase tracking-[0.06em] text-muted">P50</dt>
                    <dd className="m-0">{formatMoney(scenario.statistics.p50, symbol)}</dd>
                  </div>
                  <div>
                    <dt className="text-micro uppercase tracking-[0.06em] text-muted">P90</dt>
                    <dd className="m-0">{formatMoney(scenario.statistics.p90, symbol)}</dd>
                  </div>
                </dl>
                <p className="m-0 text-small">{scenario.interpretation.summary}</p>
                <div>
                  <Button variant="secondary" size="sm" onClick={() => onSelectScenario(scenario.code)}>
                    Scenario detail
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="distribution-heading">
        <h2 id="distribution-heading" className="m-0 text-section font-semibold text-heading">
          Simulated loss distribution by scenario
        </h2>
        <div className="grid gap-6 xl:grid-cols-2">
          {response.scenarios.map((scenario) => (
            <Card key={scenario.code}>
              <CardContent>
                <LossDistributionChart scenario={scenario} symbol={symbol} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-4" aria-labelledby="uncertainty-heading">
        <h2 id="uncertainty-heading" className="m-0 text-section font-semibold text-heading">
          Uncertainty and estimate precision
        </h2>
        <Alert
          tone="info"
          title={`Estimate precision: ${precisionFor(response.portfolio.confidence.level)} (input quality ${response.portfolio.confidence.score}/100)`}
        >
          <ul className="m-0 grid gap-1 pl-5">
            {response.portfolio.confidence.reasons.map((reason) => (
              <li key={reason.slice(0, 40)}>{reason}</li>
            ))}
          </ul>
        </Alert>
        <div className="grid gap-2">
          <p className="m-0 text-small text-muted">{publicModel.content.confidenceNotice.statement}</p>
          <ul className="m-0 grid gap-1 pl-5 text-micro text-muted">
            {publicModel.content.confidenceNotice.bullets.map((bullet) => (
              <li key={bullet.slice(0, 40)}>{bullet}</li>
            ))}
          </ul>
        </div>
        <p className="m-0 text-small text-muted">
          The interface deliberately avoids phrases such as “95% confidence that your loss is €X”. The model reports
          posterior-predictive P10–P90 annual total losses under the evidence and assumptions provided. Because
          counts are zero-inflated and severity is heavy-tailed, P50 can be zero and the mean can exceed P90. The
          input-confidence indicator describes answer completeness and distribution width, not the probability that
          the estimate is correct.
        </p>
      </section>

      <section className="grid gap-6" aria-labelledby="results-disclaimer-heading">
        <h2 id="results-disclaimer-heading" className="m-0 text-section font-semibold text-heading">
          Disclaimer and retention
        </h2>
        <DisclaimerBlock variant="short" />
        <PrivacyNotice />
      </section>

      <HowNumbersAreProduced rows={CORE_DISCLOSURE} />
    </div>
  );
}
