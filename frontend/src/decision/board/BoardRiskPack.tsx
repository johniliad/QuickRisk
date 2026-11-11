/**
 * QuickRisk Decision Lab — five-page Board Risk Pack.
 *
 * A presentation-only renderer: it receives an already-built BoardReportModel and prints the
 * values, never a calculation (requirements 40, 44, 45). Each page declares its acronyms, and the
 * definition appears once, at the first use on that page (requirement 42).
 */

import { Printer } from 'lucide-react';
import { HowNumbersAreProduced } from '@/components/layout/HowNumbersAreProduced';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DECISION_DISCLOSURE } from '@/content/plainLanguage';
import {
  acronymDefinitions,
  type BoardMetric,
  type BoardPage,
  type BoardReportModel,
} from '@/decision/board/boardModel';
import '@/decision/board/board.css';

export const formatBoardMoney = (value: number, symbol: string): string => {
  const rounded = Math.round(value);
  if (rounded >= 1_000_000) {
    return `${symbol}${(rounded / 1_000_000).toFixed(2)}M`;
  }
  if (rounded >= 1_000) {
    return `${symbol}${Math.round(rounded / 1_000)}K`;
  }

  return `${symbol}${rounded}`;
};

const statusClass = (status: BoardMetric['status']): string =>
  status === 'within'
    ? 'qk-board-status qk-board-status--within'
    : status === 'above'
      ? 'qk-board-status qk-board-status--above'
      : 'qk-board-status qk-board-status--undefined';

function Metric({ metric, symbol }: { metric: BoardMetric; symbol: string }) {
  return (
    <div className="qk-board-metric">
      <span className="qk-board-metric-label">{metric.label}</span>
      <span className="qk-board-metric-value">{formatBoardMoney(metric.value, symbol)}</span>
      {metric.previousValue === undefined ? null : (
        <span className="qk-board-metric-previous">
          Previously {formatBoardMoney(metric.previousValue, symbol)}
        </span>
      )}
      {metric.appetite === null || metric.appetite === undefined ? (
        <span className={statusClass('undefined')}>No appetite limit configured</span>
      ) : (
        <span className={statusClass(metric.status)}>
          Appetite {formatBoardMoney(metric.appetite, symbol)} ·{' '}
          {metric.status === 'within' ? 'Within' : metric.status === 'above' ? 'Above' : 'Not defined'}
        </span>
      )}
      <span className="qk-board-metric-previous">{metric.technicalLabel}</span>
    </div>
  );
}

/** Before/after bars with the appetite marker, in business language (no statistical chart). */
function ComparisonBars({ page, symbol }: { page: BoardPage; symbol: string }) {
  const measurable = page.metrics.filter((metric) => metric.value > 0);
  if (measurable.length === 0) {
    return null;
  }

  const maximum = Math.max(
    ...measurable.map((metric) =>
      Math.max(metric.value, metric.previousValue ?? 0, metric.appetite ?? 0),
    ),
  );
  if (maximum <= 0) {
    return null;
  }

  const rows = measurable.flatMap((metric) => {
    const entries: { key: string; label: string; value: number; treated: boolean }[] = [];
    if (metric.previousValue !== undefined) {
      entries.push({
        key: `${metric.label}-current`,
        label: `${metric.label} — current`,
        value: metric.previousValue,
        treated: false,
      });
    }
    entries.push({
      key: `${metric.label}-after`,
      label: `${metric.label} — ${metric.previousValue === undefined ? 'current' : 'after treatment'}`,
      value: metric.value,
      treated: metric.previousValue !== undefined,
    });

    return entries.map((entry) => ({ ...entry, appetite: metric.appetite ?? null }));
  });

  return (
    <div className="qk-board-bars">
      {rows.map((row) => (
        <div className="qk-board-bar" key={row.key}>
          <span>{row.label}</span>
          <span className="qk-board-bar-track">
            <span
              className={`qk-board-bar-fill${row.treated ? ' qk-board-bar-fill--treated' : ''}`}
              style={{ width: `${Math.round((row.value / maximum) * 100)}%`, display: 'block' }}
            />
            {row.appetite === null ? null : (
              <span
                className="qk-board-bar-marker"
                style={{ left: `${Math.min(100, Math.round((row.appetite / maximum) * 100))}%` }}
                aria-hidden="true"
              />
            )}
          </span>
          <span>{formatBoardMoney(row.value, symbol)}</span>
        </div>
      ))}
    </div>
  );
}

function PageBody({ page, symbol }: { page: BoardPage; symbol: string }) {
  const definitions = acronymDefinitions(page.acronyms);

  return (
    <section className="qk-board-page" aria-labelledby={`board-page-${page.number}`}>
      <header style={{ display: 'grid', gap: '0.35rem' }}>
        <span className="qk-board-eyebrow">Page {page.number} of 5</span>
        <h2 id={`board-page-${page.number}`}>{page.title}</h2>
        <p className="qk-board-question">{page.question}</p>
      </header>

      <p className="qk-board-narrative">{page.narrative}</p>

      {page.metrics.length === 0 ? null : (
        <div className="qk-board-metrics">
          {page.metrics.map((metric) => (
            <Metric key={`${page.number}-${metric.label}`} metric={metric} symbol={symbol} />
          ))}
        </div>
      )}

      <ComparisonBars page={page} symbol={symbol} />

      {page.treatments.length === 0 ? null : (
        <table className="qk-board-table">
          <thead>
            <tr>
              <th scope="col">Treatment</th>
              <th scope="col">Investment</th>
              <th scope="col">Annual cost</th>
              <th scope="col">Modeled effect</th>
              <th scope="col">Time to effect</th>
              <th scope="col">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {page.treatments.map((treatment) => (
              <tr key={treatment.name}>
                <td>
                  {treatment.name}
                  {treatment.origin === 'custom' ? (
                    <span className="qk-board-metric-label" style={{ display: 'block' }}>
                      User-defined
                    </span>
                  ) : null}
                </td>
                <td>{formatBoardMoney(treatment.investment, symbol)}</td>
                <td>{formatBoardMoney(treatment.annualCost, symbol)}</td>
                <td>{treatment.modeledEffect}</td>
                <td>{treatment.timeToEffect}</td>
                <td>{treatment.evidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {page.notes.length === 0 ? null : (
        <ul className="qk-board-notes">
          {page.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      )}

      {definitions.length === 0 ? null : (
        <div className="qk-board-acronyms">
          {definitions.map((definition) => (
            <span key={definition.term}>
              <strong>{definition.term}</strong> — {definition.definition}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}


export function BoardRiskPack({ report, readOnly = false }: { report: BoardReportModel; readOnly?: boolean }) {
  return (
    <div className="qk-board">
      <header className="qk-board-page qk-no-print">
        <span className="qk-board-eyebrow">QuickRisk Decision Lab</span>
        <h2 style={{ fontSize: '1.9rem' }}>{report.title}</h2>
        <p className="qk-board-question">{report.subtitle}</p>
        <p className="qk-board-question">Generated {report.generatedAt}.</p>
        {readOnly ? (
          <Alert tone="info" title="Shared Board Risk Pack — read only">
            <p className="m-0">
              This report is based on the selected QuickRisk assessment and its stated assumptions. It is a
              read-only view of one saved decision analysis.
            </p>
          </Alert>
        ) : (
          <div>
            <Button size="sm" onClick={() => globalThis.print()}>
              <Printer aria-hidden="true" className="size-4" />
              Print / save as PDF
            </Button>
          </div>
        )}
      </header>

      {report.pages.map((page) => (
        <PageBody key={page.number} page={page} symbol={report.currencySymbol} />
      ))}

      <section className="qk-board-page" aria-labelledby="board-decision-requested">
        <header style={{ display: 'grid', gap: '0.35rem' }}>
          <span className="qk-board-eyebrow">Decision</span>
          <h2 id="board-decision-requested">Decision for consideration</h2>
        </header>
        <div className="qk-board-callout">
          <strong>{report.decisionRequested}</strong>
          {report.recommendation === null ? null : (
            <>
              <span>Highest value under your stated constraints: {report.recommendation.names.join(' + ')}.</span>
              <span>
                Under the stated assumptions the modeled annual loss exposure falls from{' '}
                {formatBoardMoney(report.recommendation.baselineEal, report.currencySymbol)} to{' '}
                {formatBoardMoney(report.recommendation.treatedEal, report.currencySymbol)}.
              </span>
            </>
          )}
        </div>
        <ul className="qk-board-notes">
          {report.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </section>

      <div className="qk-no-print">
        <HowNumbersAreProduced rows={DECISION_DISCLOSURE} />
      </div>
    </div>
  );
}

