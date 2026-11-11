import { Clock, Info, Printer, RotateCcw, TrendingUp } from 'lucide-react';
import { MetricCard } from '@/components/layout/SectionHeading';
import { Alert } from '@/components/ui/alert';
import { ConfidenceBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, DefinitionItem, DefinitionList } from '@/components/ui/card';
import type { CalculationResponse } from '@/domain/results';
import { formatIterations, formatMoney, formatPercent, formatTimestamp } from '@/lib/format';
import { buildPlainSummary, precisionFor } from '@/content/plainLanguage';
import { publicModel } from '@/model';

/**
 * Executive summary.
 *
 * The principal result, the top scenarios, the highest P90, the scenario most likely to
 * exceed the million-euro threshold, the overall confidence and the model version are
 * all visible near the top of the results view.
 */
export function ExecutiveSummary({
  response,
  millionThreshold,
  onPrint,
  onRestart,
}: {
  response: CalculationResponse;
  millionThreshold: number;
  onPrint: () => void;
  onRestart: () => void;
}) {
  const { portfolio, meta } = response;
  const symbol = meta.currencySymbol === '' ? publicModel.version.currencySymbol : meta.currencySymbol;
  const { limitations } = publicModel.content;
  const summary = buildPlainSummary(response, symbol);

  return (
    <section className="grid gap-4" aria-labelledby="executive-summary-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">
            Executive summary
          </p>
          <h2 id="executive-summary-heading" className="m-0 text-[var(--text-title)] font-bold text-heading">
            Indicative annual cyber-loss exposure
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onPrint}>
            <Printer aria-hidden="true" className="size-4" />
            Print / save as PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={onRestart}>
            <RotateCcw aria-hidden="true" className="size-4" />
            New assessment
          </Button>
        </div>
      </div>

      <p className="m-0 max-w-[46rem] text-[1.02rem] leading-relaxed text-ink">
        Based on your answers, expected annual loss across the five scenarios is{' '}
        <strong>{summary.expectedAnnualLoss}</strong> a year.
        {summary.worstScenarioLabel === null ? null : (
          <>
            {' '}
            The worst single scenario is <strong>{summary.worstScenarioLabel}</strong>, whose bad year (1 in 10) reaches{' '}
            <strong>{summary.worstScenarioBadYear}</strong>.
          </>
        )}{' '}
        This is a <strong>{summary.precision}</strong> estimate.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          emphasis
          label={portfolio.label}
          value={formatMoney(portfolio.expectedAnnualLoss, symbol)}
          detail="Mean of the modelled annualised exposure across the five scenarios, summed. Percentiles describe an annualised exposure approximation, not realised annual loss totals, and dependencies between scenarios are not modelled, so no joint portfolio percentile is presented."
        />
        <MetricCard
          label="Worst scenario — bad year (1 in 10)"
          value={portfolio.highestP90 === null ? '—' : formatMoney(portfolio.highestP90.p90, symbol)}
          detail={
            portfolio.highestP90 === null
              ? undefined
              : `${portfolio.highestP90.shortLabel} — 10% of simulated years are worse than this.`
          }
        />
        <MetricCard
          label={`Most likely to exceed ${formatMoney(millionThreshold, symbol)}`}
          value={
            portfolio.highestProbabilityAboveThreshold === null
              ? '—'
              : formatPercent(portfolio.highestProbabilityAboveThreshold.probability)
          }
          detail={
            portfolio.highestProbabilityAboveThreshold === null
              ? undefined
              : `${portfolio.highestProbabilityAboveThreshold.shortLabel} — share of simulated trials above the threshold.`
          }
        />
        <MetricCard
          label="Estimate precision"
          value={precisionFor(portfolio.confidence.level)}
          detail={
            <span>
              Input quality score {portfolio.confidence.score}/100 (technical level {portfolio.confidence.level}).
              It describes answer completeness and how wide the resulting distribution is. It is not statistical
              confidence and not the probability that the result is correct.
              {portfolio.confidence.levelCapApplied
                ? ` The level is capped at ${portfolio.confidence.maximumLevelWhenProvisional} while the calibration remains provisional.`
                : ''}
            </span>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Top scenarios by expected annual loss</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <ol className="m-0 grid gap-2 pl-5">
              {portfolio.topScenarios.map((scenario) => (
                <li key={scenario.code} className="text-ink">
                  <span className="font-semibold">{scenario.shortLabel}</span>{' '}
                  <span className="font-semibold text-accent-strong">
                    {formatMoney(scenario.expectedAnnualLoss, symbol)}
                  </span>{' '}
                  <ConfidenceBadge level={scenario.confidence} />
                </li>
              ))}
            </ol>
            {portfolio.summary === '' ? null : (
              <p className="m-0 text-small text-muted">
                <TrendingUp aria-hidden="true" className="mr-1 inline size-4 align-[-2px]" />
                {portfolio.summary}
              </p>
            )}
            <p className="m-0 text-small text-muted">{portfolio.jointPercentilesNote}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How to read this</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <DefinitionList>
              <DefinitionItem term="Model">
                {meta.modelId} (model {meta.modelVersion}, schema {meta.schemaVersion})
              </DefinitionItem>
              <DefinitionItem term="Calibration">{meta.calibrationVersion}</DefinitionItem>
              <DefinitionItem term="Simulation">
                {formatIterations(meta.iterations)} iterations per scenario × {meta.scenarioCount} scenarios
              </DefinitionItem>
              <DefinitionItem term="Calculated (UTC)">
                <span className="inline-flex items-center gap-1">
                  <Clock aria-hidden="true" className="size-3.5" />
                  {formatTimestamp(meta.calculatedAt)}
                </span>
              </DefinitionItem>
            </DefinitionList>
            <Alert tone="warning">
              <p className="m-0">
                {limitations.title}: results are model estimates under the assumptions you provided. They are not
                a forecast, not an audit and not professional advice.
              </p>
              <p className="m-0 mt-2 inline-flex items-start gap-1 text-micro">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  This assessment was processed transiently and has not been stored by the application
                  (retention mode: {meta.retentionMode}).
                </span>
              </p>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
