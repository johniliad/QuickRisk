import { ArrowLeft, Search } from 'lucide-react';
import { LossDistributionChart } from '@/components/charts/LossDistributionChart';
import { RiskDriverList } from '@/components/results/RiskDriverList';
import { ThresholdTable } from '@/components/results/ThresholdTable';
import { Alert } from '@/components/ui/alert';
import { ConfidenceBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DefinitionItem,
  DefinitionList,
  Separator,
} from '@/components/ui/card';
import type { ScenarioResult } from '@/domain/results';
import { thresholdExceedanceCount, thresholdProbability } from '@/domain/results';
import { formatCount, formatMoney, formatPercent } from '@/lib/format';
import { useViewModeStore } from '@/state/viewModeStore';
import { publicModel } from '@/model';

/**
 * Human-readable name for a modelled input key.
 */
function inputLabel(code: string): string {
  switch (code) {
    case 'threatEventFrequency':
      return 'How often an attempt occurs';
    case 'impactMultiplier':
      return 'How big the impact';
    case 'susceptibility':
      return 'How ready your defences are';
    case 'lossMagnitudeAnchor':
      return 'Typical disruption cost';
    case 'secondaryLossProbability':
      return 'Chance of a knock-on loss';
    default:
      return code.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase()).trim();
  }
}

/**
 * Scenario detail panel.
 *
 * Structure: what we assessed, what you told us, what the model estimated, how to
 * interpret it, what to investigate next, and what the result does not mean.
 */
export function ScenarioDetailPanel({
  scenario,
  thresholds,
  symbol,
  onBack,
}: {
  scenario: ScenarioResult;
  thresholds: readonly number[];
  symbol: string;
  onBack: () => void;
}) {
  const modelScenario = publicModel.scenarios.find((entry) => entry.code === scenario.code);
  const millionThreshold =
    thresholds.find((value) => value === 1_000_000) ?? thresholds[thresholds.length - 1] ?? 1_000_000;
  const isAnalyst = useViewModeStore((state) => state.mode) === 'analyst';

  // Inputs modelled as an Unknown-answer mixture are disclosed explicitly, so that an Unknown
  // answer can never look like a precise assumption.
  const mixtureInputs = Object.entries(scenario.inputs).filter(([, input]) => input.kind === 'mixture');

  return (
    <section className="grid gap-5" aria-labelledby={`detail-${scenario.code}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">
            Scenario {scenario.order} of {publicModel.scenarios.length}
          </p>
          <h2 id={`detail-${scenario.code}`} className="m-0 text-[var(--text-title)] font-bold text-heading">
            {scenario.name}
          </h2>
        </div>
        <Button variant="secondary" size="sm" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to the dashboard
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What we assessed</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <p className="m-0">{scenario.statement}</p>
          {modelScenario === undefined ? null : (
            <p className="m-0 text-small text-muted">{modelScenario.interpretationNote}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What you told us</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <DefinitionList>
              {scenario.answers.map((answer) => (
                <DefinitionItem key={answer.questionCode} term={answer.questionCode}>
                  {answer.label}
                  {answer.unknown ? ' (Unknown — modelled as a mixture of the available answers)' : ''}
                </DefinitionItem>
              ))}
            </DefinitionList>
            <Separator />
            <div className="grid gap-2">
              <p className="m-0 text-micro font-bold uppercase tracking-[0.08em] text-muted">
                Organisation-profile factors applied
              </p>
              {scenario.appliedModifiers.length === 0 ? (
                <p className="m-0 text-small text-muted">
                  No organisation-profile modifier applied to this scenario.
                </p>
              ) : (
                <ul className="m-0 grid gap-1 pl-5 text-small text-muted">
                  {scenario.appliedModifiers.map((modifier) => (
                    <li key={`${modifier.modifier}-${modifier.questionCode}`}>
                      {modifier.modifier}: {modifier.answerCode.replaceAll('_', ' ').toLowerCase()} → ×
                      {modifier.multiplier.toFixed(2)}
                      {modifier.widen > 1 ? `, widened ×${modifier.widen.toFixed(2)}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              <p className="m-0 text-micro text-muted">
                Loss anchor:{' '}
                {scenario.lossAnchorSource === 'reported-daily-disruption-cost'
                  ? 'your reported daily disruption cost'
                  : 'derived from your organisation profile (daily disruption cost was Unknown)'}
                .
              </p>
              {mixtureInputs.length === 0 ? null : (
                <div className="grid gap-2">
                  <p className="m-0 text-micro font-bold uppercase tracking-[0.08em] text-muted">
                    Unknown answers modelled as a mixture
                  </p>
                  {mixtureInputs.map(([code, input]) => (
                    <div key={code} className="grid gap-1">
                      <p className="m-0 text-small text-muted">
                        {inputLabel(code)}: modelled as an equal-weight mixture of the available answers, so the range
                        widens without assuming an adverse extreme. Because the answer bands are multiplicative, this
                        raises the modelled mean above the middle answer while leaving the typical (median) value close
                        to it. Modelled range {input.min.toFixed(2)} to {input.max.toFixed(2)}.
                      </p>
                      <ul className="m-0 grid gap-1 pl-5 text-micro text-muted">
                        {input.components.map((component) => (
                          <li key={component.optionCode}>
                            {component.optionCode.replaceAll('_', ' ').toLowerCase()} —{' '}
                            {(component.weight * 100).toFixed(0)}% weight
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What the model estimated</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <DefinitionList>
              <DefinitionItem term="Expected annual loss">
                <span className="font-semibold text-accent-strong">
                  {formatMoney(scenario.statistics.expectedAnnualLoss, symbol)}
                </span>
              </DefinitionItem>
              <DefinitionItem term="P10 (low end)">{formatMoney(scenario.statistics.p10, symbol)}</DefinitionItem>
              <DefinitionItem term="P50 (median)">{formatMoney(scenario.statistics.p50, symbol)}</DefinitionItem>
              <DefinitionItem term="P90 (high end)">{formatMoney(scenario.statistics.p90, symbol)}</DefinitionItem>
              <DefinitionItem term={`P(> ${formatMoney(millionThreshold, symbol)})`}>
                {thresholdExceedanceCount(scenario, millionThreshold) === 0 ? (
                  <span className="text-muted">
                    0 of {formatCount(scenario.statistics.iterations)} simulated trials
                  </span>
                ) : (
                  <>
                    {formatPercent(thresholdProbability(scenario, millionThreshold))}{' '}
                    <span className="text-muted">
                      ({formatCount(thresholdExceedanceCount(scenario, millionThreshold))} of{' '}
                      {formatCount(scenario.statistics.iterations)} simulated trials)
                    </span>
                  </>
                )}
              </DefinitionItem>
              <DefinitionItem term="Input confidence">
                <ConfidenceBadge level={scenario.confidence.level} score={scenario.confidence.score} />
              </DefinitionItem>
            </DefinitionList>
            <div className="grid gap-1">
              <p className="m-0 text-micro font-bold uppercase tracking-[0.08em] text-muted">Input-confidence notes</p>
              <ul className="m-0 grid gap-1 pl-5 text-small text-muted">
                {scenario.confidence.reasons.map((reason) => (
                  <li key={reason.slice(0, 40)}>{reason}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>How to interpret it</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <p className="m-0">{scenario.interpretation.summary}</p>
          <p className="m-0">{scenario.interpretation.rangeStatement}</p>
          {scenario.interpretation.thresholdStatement === '' ? null : (
            <p className="m-0">{scenario.interpretation.thresholdStatement}</p>
          )}
          <p className="m-0">{scenario.interpretation.annualisationStatement}</p>
          {scenario.interpretation.unknownStatement === '' ? null : (
            <p className="m-0 text-small text-muted">{scenario.interpretation.unknownStatement}</p>
          )}
          <p className="m-0 text-small text-muted">
            The range is simulated from assumptions, not a forecast. A wide range means the model is genuinely
            uncertain about this scenario, usually because an answer was Unknown or because the modelled inputs
            span a broad band.
          </p>
        </CardContent>
      </Card>

      {isAnalyst ? (
        <Card>
          <CardHeader>
            <CardTitle>Modelled components</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <RiskDriverList scenario={scenario} symbol={symbol} />
            <p className="m-0 text-micro text-muted">
              These are the components of the modelled expected annual loss, not a sensitivity analysis. The
              sensitivity of the expected annual loss to each input is reported on the dashboard.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="inline-flex items-center gap-2">
              <Search aria-hidden="true" className="size-4 text-accent-strong" />
              What to investigate next
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <ul className="m-0 grid gap-1 pl-5">
            {scenario.investigationPrompts.map((prompt) => (
              <li key={prompt.slice(0, 40)}>{prompt}</li>
            ))}
          </ul>
          <p className="m-0 text-micro text-muted">{scenario.interpretation.investigationPromptNote}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulated distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <LossDistributionChart scenario={scenario} symbol={symbol} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Threshold exceedance probabilities</CardTitle>
        </CardHeader>
        <CardContent>
          <ThresholdTable scenarios={[scenario]} thresholds={thresholds} symbol={symbol} />
        </CardContent>
      </Card>

      <Alert tone="danger" title="What this result does not mean">
        <p className="m-0">{scenario.interpretation.doesNotMean}</p>
        <ul className="m-0 mt-2 grid gap-1 pl-5">
          {publicModel.content.limitations.items.slice(0, 4).map((item) => (
            <li key={item.slice(0, 40)}>{item}</li>
          ))}
        </ul>
      </Alert>
    </section>
  );
}
