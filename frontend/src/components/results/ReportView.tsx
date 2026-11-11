import { ArrowLeft, Printer } from 'lucide-react';
import { DisclaimerBlock, PrivacyNotice } from '@/components/layout/DisclaimerBlock';
import { Button } from '@/components/ui/button';
import { Table, TableHead, TableBody, TableCell, TableHeaderCell, TableRow, TableWrap } from '@/components/ui/table';
import type { CalculationResponse } from '@/domain/results';
import { thresholdExceedanceCount, thresholdProbability } from '@/domain/results';
import { formatCount, formatIterations, formatMoney, formatPercent, formatTimestamp } from '@/lib/format';
import { precisionFor } from '@/content/plainLanguage';
import { publicModel } from '@/model';

/**
 * Printable report.
 *
 * Generated entirely in the browser from the current in-memory results: nothing is
 * uploaded, saved or retained, and no server-side PDF exists. The title remains
 * "Indicative FAIR QuickRisk Assessment" so that the document cannot be mistaken for a
 * certification or assurance report.
 */
export function ReportView({ response, onBack }: { response: CalculationResponse; onBack: () => void }) {
  const { reportLabels, methodology, limitations } = publicModel.content;
  const thresholds = publicModel.version.lossThresholds;
  const symbol =
    response.meta.currencySymbol === '' ? publicModel.version.currencySymbol : response.meta.currencySymbol;
  const millionThreshold =
    thresholds.find((value) => value === 1_000_000) ?? thresholds[thresholds.length - 1] ?? 1_000_000;
  const ranked = [...response.scenarios].sort(
    (left, right) => right.statistics.expectedAnnualLoss - left.statistics.expectedAnnualLoss,
  );

  return (
    <div className="grid gap-6">
      <div className="qk-no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to the dashboard
        </Button>
        <Button onClick={() => globalThis.print()}>
          <Printer aria-hidden="true" className="size-4" />
          Print / save as PDF
        </Button>
      </div>

      <article className="grid gap-6">
        <header className="grid gap-2 border-b border-border pb-4">
          <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">
            {reportLabels.subtitle}
          </p>
          <h1 className="m-0 text-[var(--text-title)] font-bold text-heading">{reportLabels.title}</h1>
          <p className="m-0 max-w-[48rem] text-small text-muted">
            Prepared {formatTimestamp(response.meta.calculatedAt)} UTC · {response.meta.modelId} (model{' '}
            {response.meta.modelVersion}, calibration {response.meta.calibrationVersion}) ·{' '}
            {formatIterations(response.meta.iterations)} iterations per scenario.
          </p>
          <p className="m-0 max-w-[48rem] text-micro text-muted">{reportLabels.generatedNote}</p>
          <p className="m-0 max-w-[48rem] text-micro text-muted">{reportLabels.prohibitedTitleNote}</p>
        </header>

        <section className="qk-print-block grid gap-3" aria-labelledby="report-summary">
          <h2 id="report-summary" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            Executive summary
          </h2>
          <p className="m-0">
            {response.portfolio.label}:{' '}
            <strong>{formatMoney(response.portfolio.expectedAnnualLoss, symbol)}</strong>. Estimate precision:{' '}
            <strong>{precisionFor(response.portfolio.confidence.level)}</strong> (input quality{' '}
            {response.portfolio.confidence.score}/100)
            {response.portfolio.confidence.levelCapApplied
              ? `, capped at ${response.portfolio.confidence.maximumLevelWhenProvisional} while the calibration remains provisional`
              : ''}
            .
          </p>
          {response.portfolio.summary === '' ? null : <p className="m-0">{response.portfolio.summary}</p>}
          <p className="m-0 text-small text-muted">{response.portfolio.annualisationNote}</p>
          <p className="m-0 text-small text-muted">{reportLabels.confidenceNote}</p>
          <p className="m-0 text-small text-muted">{response.portfolio.jointPercentilesNote}</p>
          <ul className="m-0 grid gap-1 pl-5 text-small">
            {response.portfolio.confidence.reasons.map((reason) => (
              <li key={reason.slice(0, 40)}>{reason}</li>
            ))}
          </ul>
        </section>

        <section className="qk-print-block grid gap-3" aria-labelledby="report-ranking">
          <h2 id="report-ranking" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            Scenario ranking
          </h2>
          <TableWrap>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Rank</TableHeaderCell>
                  <TableHeaderCell>Scenario</TableHeaderCell>
                  <TableHeaderCell>Expected annual loss</TableHeaderCell>
                  <TableHeaderCell>
                    Best case
                    <span className="block text-micro font-normal text-muted">P10 · 1 in 10</span>
                  </TableHeaderCell>
                  <TableHeaderCell>
                    Typical year
                    <span className="block text-micro font-normal text-muted">P50 · median</span>
                  </TableHeaderCell>
                  <TableHeaderCell>
                    Bad year
                    <span className="block text-micro font-normal text-muted">P90 · 1 in 10</span>
                  </TableHeaderCell>
                  <TableHeaderCell>P(&gt;{formatMoney(millionThreshold, symbol)})</TableHeaderCell>
                  <TableHeaderCell>Precision</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ranked.map((scenario, index) => (
                  <TableRow key={scenario.code}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell>{scenario.name}</TableCell>
                    <TableCell className="font-semibold">
                      {formatMoney(scenario.statistics.expectedAnnualLoss, symbol)}
                    </TableCell>
                    <TableCell>{formatMoney(scenario.statistics.p10, symbol)}</TableCell>
                    <TableCell>{formatMoney(scenario.statistics.p50, symbol)}</TableCell>
                    <TableCell>{formatMoney(scenario.statistics.p90, symbol)}</TableCell>
                    <TableCell>
                      {thresholdExceedanceCount(scenario, millionThreshold) === 0
                        ? `0 of ${formatCount(scenario.statistics.iterations)} trials`
                        : `${formatPercent(thresholdProbability(scenario, millionThreshold))} (${formatCount(
                            thresholdExceedanceCount(scenario, millionThreshold),
                          )} of ${formatCount(scenario.statistics.iterations)} trials)`}
                    </TableCell>
                    <TableCell>{precisionFor(scenario.confidence.level)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>
        </section>

        <section className="qk-print-block grid gap-3" aria-labelledby="report-sensitivity">
          <h2 id="report-sensitivity" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            Sensitivity of the expected annual loss
          </h2>
          <p className="m-0 text-small text-muted">{response.portfolio.sensitivity.method}</p>
          <TableWrap>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Factor</TableHeaderCell>
                  <TableHeaderCell>Lowest</TableHeaderCell>
                  <TableHeaderCell>Highest</TableHeaderCell>
                  <TableHeaderCell>Spread</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {response.portfolio.sensitivity.factors.map((factor) => (
                  <TableRow key={`${factor.kind}-${factor.questionCode}`}>
                    <TableCell>{factor.label}</TableCell>
                    <TableCell>{formatMoney(factor.lowExpectedAnnualLoss, symbol)}</TableCell>
                    <TableCell>{formatMoney(factor.highExpectedAnnualLoss, symbol)}</TableCell>
                    <TableCell>{factor.spreadRatio.toFixed(1)}×</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>
          <p className="m-0 text-small text-muted">{response.portfolio.sensitivity.note}</p>
        </section>

        <section className="qk-print-page-break grid gap-4" aria-labelledby="report-detail">
          <h2 id="report-detail" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            Scenario detail
          </h2>
          {response.scenarios.map((scenario) => (
            <div key={scenario.code} className="qk-print-block grid gap-2 rounded-card border border-border p-4">
              <h3 className="m-0 text-[1.05rem] font-semibold text-heading">
                {scenario.order}. {scenario.name}
              </h3>
              <p className="m-0 text-small text-muted">{scenario.statement}</p>
              <p className="m-0 text-small">
                <strong>Assumptions:</strong>{' '}
                {scenario.answers.map((answer) => `${answer.questionCode}: ${answer.label}`).join(' · ')}
              </p>
              <p className="m-0 text-small">
                <strong>Modelled:</strong> expected annual loss{' '}
                {formatMoney(scenario.statistics.expectedAnnualLoss, symbol)}; best case{' '}
                {formatMoney(scenario.statistics.p10, symbol)}; typical year {formatMoney(scenario.statistics.p50, symbol)};
                bad year {formatMoney(scenario.statistics.p90, symbol)}; P(&gt;
                {formatMoney(millionThreshold, symbol)}){' '}
                {thresholdExceedanceCount(scenario, millionThreshold) === 0
                  ? `0 of ${formatCount(scenario.statistics.iterations)} simulated trials`
                  : `${formatPercent(thresholdProbability(scenario, millionThreshold))} (${formatCount(
                      thresholdExceedanceCount(scenario, millionThreshold),
                    )} of ${formatCount(scenario.statistics.iterations)} simulated trials)`}
                ; precision {precisionFor(scenario.confidence.level)}.
              </p>
              <p className="m-0 text-small text-muted">{scenario.interpretation.rangeStatement}</p>
              <p className="m-0 text-small text-muted">{scenario.interpretation.annualisationStatement}</p>
              <p className="m-0 text-small">
                <strong>Investigate next:</strong> {scenario.investigationPrompts.join('; ')}.
              </p>
              <p className="m-0 text-micro text-muted">{scenario.interpretation.doesNotMean}</p>
            </div>
          ))}
        </section>

        <section className="qk-print-page-break grid gap-3" aria-labelledby="report-methodology">
          <h2 id="report-methodology" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            Methodology
          </h2>
          <p className="m-0">{methodology.summary}</p>
          {methodology.sections.slice(0, 6).map((section) => (
            <div key={section.id} className="grid gap-1">
              <h3 className="m-0 text-small font-semibold text-heading">{section.heading}</h3>
              {(section.paragraphs ?? []).map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="m-0 text-small text-muted">
                  {paragraph}
                </p>
              ))}
              {(section.bullets ?? []).length === 0 ? null : (
                <ul className="m-0 grid gap-0.5 pl-5 text-small text-muted">
                  {(section.bullets ?? []).map((bullet) => (
                    <li key={bullet.slice(0, 40)}>{bullet}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>

        <section className="qk-print-block grid gap-2" aria-labelledby="report-limitations">
          <h2 id="report-limitations" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            Limitations
          </h2>
          <ul className="m-0 grid gap-1 pl-5 text-small">
            {limitations.items.map((item) => (
              <li key={item.slice(0, 40)}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="qk-print-block grid gap-3" aria-labelledby="report-model-info">
          <h2 id="report-model-info" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            Model and version information
          </h2>
          <ul className="m-0 grid gap-1 pl-5 text-small">
            <li>Application version: {response.meta.applicationVersion}</li>
            <li>
              Model: {response.meta.modelId} (version {response.meta.modelVersion})
            </li>
            <li>Schema version: {response.meta.schemaVersion}</li>
            <li>Calibration version: {response.meta.calibrationVersion}</li>
            <li>Methodology version: {response.meta.methodologyVersion}</li>
            <li>Disclaimer version: {response.meta.disclaimerVersion}</li>
            <li>
              Simulation: {formatIterations(response.meta.iterations)} iterations per scenario ×{' '}
              {response.meta.scenarioCount} scenarios
            </li>
            <li>Calculated: {formatTimestamp(response.meta.calculatedAt)} UTC</li>
            <li>Retention mode: {response.meta.retentionMode} (no seed retained or disclosed)</li>
          </ul>
        </section>

        <section className="qk-print-page-break grid gap-4" aria-labelledby="report-legal">
          <h2 id="report-legal" className="m-0 text-[var(--text-section)] font-semibold text-heading">
            Privacy and disclaimer
          </h2>
          <PrivacyNotice />
          <DisclaimerBlock />
        </section>
      </article>
    </div>
  );
}
