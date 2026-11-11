import { Table, TableHead, TableBody, TableCell, TableHeaderCell, TableRow, TableWrap } from '@/components/ui/table';
import type { ScenarioResult } from '@/domain/results';
import { thresholdExceedanceCount, thresholdProbability } from '@/domain/results';
import { formatCount, formatMoney, formatPercent } from '@/lib/format';

/**
 * Threshold exceedance probabilities.
 *
 * Each cell is the share of simulated trials in which that scenario's annualised exposure
 * approximation exceeded the threshold. A zero is reported as an explicit count of simulated
 * trials ("0 of 5,000") rather than as a bare zero, so that it reads as "no simulated trial
 * exceeded this level in this run" and not as an impossibility. The values are read from the
 * server response; the browser never recomputes them.
 */
export function ThresholdTable({
  scenarios,
  thresholds,
  symbol,
}: {
  scenarios: readonly ScenarioResult[];
  thresholds: readonly number[];
  symbol: string;
}) {
  const iterations = scenarios[0]?.statistics.iterations ?? 0;

  return (
    <TableWrap>
      <Table>
        <caption className="mb-2 text-left text-small text-muted">
          Chance that a single simulated year exceeds each level, for each scenario. A zero means no simulated year
          reached it in this run — not that it is impossible.
        </caption>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Threshold</TableHeaderCell>
            {scenarios.map((scenario) => (
              <TableHeaderCell key={scenario.code}>{scenario.shortLabel}</TableHeaderCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {thresholds.map((threshold) => (
            <TableRow key={threshold}>
              <TableHeaderCell scope="row" className="normal-case tracking-normal text-ink">
                {formatMoney(threshold, symbol)}
              </TableHeaderCell>
              {scenarios.map((scenario) => {
                const probability = thresholdProbability(scenario, threshold);
                const count = thresholdExceedanceCount(scenario, threshold);
                const scenarioIterations = scenario.statistics.iterations;
                return (
                  <TableCell key={`${scenario.code}-${threshold}`}>
                    {count === 0 ? (
                      <span className="text-muted">
                        0 of {formatCount(scenarioIterations)} simulated trials
                      </span>
                    ) : (
                      <>
                        <span className="font-semibold">{formatPercent(probability)}</span>
                        <span className="block text-micro text-muted">
                          {formatCount(count)} of {formatCount(scenarioIterations)} simulated trials
                        </span>
                      </>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="m-0 mt-2 text-micro text-muted">
        Each scenario was simulated with {formatCount(iterations)} trials.
      </p>
    </TableWrap>
  );
}
