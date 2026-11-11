import { ArrowRight } from 'lucide-react';
import { ConfidenceBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHead, TableBody, TableCell, TableHeaderCell, TableRow, TableWrap } from '@/components/ui/table';
import type { ScenarioResult } from '@/domain/results';
import { thresholdExceedanceCount, thresholdProbability } from '@/domain/results';
import { formatCount, formatMoney, formatPercent } from '@/lib/format';

/**
 * Scenario results table: rank, expected annual loss, P10/P50/P90, the probability of
 * exceeding €1 million (reported with the number of simulated trials) and the input-confidence
 * indicator for each scenario.
 */
export function ScenarioTable({
  scenarios,
  symbol,
  millionThreshold,
  onSelect,
}: {
  scenarios: readonly ScenarioResult[];
  symbol: string;
  millionThreshold: number;
  onSelect: (scenarioCode: string) => void;
}) {
  const ranked = [...scenarios].sort(
    (left, right) => right.statistics.expectedAnnualLoss - left.statistics.expectedAnnualLoss,
  );

  return (
    <TableWrap>
      <Table>
        <caption className="mb-2 text-left text-small text-muted">
          Ordered by expected annual loss. “Typical year” is the median (P50); “bad year” is the 1-in-10 figure (P90).
          Values are model estimates, not forecasts.
        </caption>
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
            <TableHeaderCell>Detail</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {ranked.map((scenario, index) => (
            <TableRow key={scenario.code}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <span className="font-semibold text-heading">{scenario.shortLabel}</span>
                <span className="block text-micro text-muted">{scenario.shortDescription}</span>
              </TableCell>
              <TableCell className="font-semibold">
                {formatMoney(scenario.statistics.expectedAnnualLoss, symbol)}
              </TableCell>
              <TableCell>{formatMoney(scenario.statistics.p10, symbol)}</TableCell>
              <TableCell>{formatMoney(scenario.statistics.p50, symbol)}</TableCell>
              <TableCell>{formatMoney(scenario.statistics.p90, symbol)}</TableCell>
              <TableCell>
                {thresholdExceedanceCount(scenario, millionThreshold) === 0 ? (
                  <span className="text-muted">
                    0 of {formatCount(scenario.statistics.iterations)} trials
                  </span>
                ) : (
                  <>
                    <span className="font-semibold">
                      {formatPercent(thresholdProbability(scenario, millionThreshold))}
                    </span>
                    <span className="block text-micro text-muted">
                      {formatCount(thresholdExceedanceCount(scenario, millionThreshold))} of{' '}
                      {formatCount(scenario.statistics.iterations)} trials
                    </span>
                  </>
                )}
              </TableCell>
              <TableCell>
                <ConfidenceBadge level={scenario.confidence.level} score={scenario.confidence.score} />
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => onSelect(scenario.code)}>
                  View
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                  <span className="qk-visually-hidden">detail for {scenario.name}</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableWrap>
  );
}
