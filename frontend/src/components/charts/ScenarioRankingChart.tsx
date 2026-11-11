import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisProps, chartColours, ChartFrame } from '@/components/charts/ChartFrame';
import { Table, TableHead, TableBody, TableCell, TableHeaderCell, TableRow, TableWrap } from '@/components/ui/table';
import type { ScenarioResult } from '@/domain/results';
import { formatMoney } from '@/lib/format';

/**
 * Ranked scenario comparison by expected annual loss.
 *
 * The most exposed scenario is highlighted, but the rank is also stated in text and in
 * the accompanying table so the ordering does not depend on colour.
 */
export function ScenarioRankingChart({
  scenarios,
  symbol,
}: {
  scenarios: readonly ScenarioResult[];
  symbol: string;
}) {
  const data = [...scenarios]
    .sort((left, right) => right.statistics.expectedAnnualLoss - left.statistics.expectedAnnualLoss)
    .map((scenario, index) => ({
      code: scenario.code,
      label: scenario.shortLabel,
      rank: index + 1,
      expectedAnnualLoss: scenario.statistics.expectedAnnualLoss,
    }));

  const summary = data
    .map(
      (entry) =>
        `Rank ${entry.rank}: ${entry.label}, expected annual loss ${formatMoney(entry.expectedAnnualLoss, symbol)}.`,
    )
    .join(' ');

  return (
    <ChartFrame
      id="scenario-ranking"
      title="Scenario ranking by expected annual loss"
      description="Expected annual loss is the average of the simulated annualised losses for each scenario. It is not a forecast for a specific year."
      summary={summary}
      table={
        <TableWrap>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Rank</TableHeaderCell>
                <TableHeaderCell>Scenario</TableHeaderCell>
                <TableHeaderCell>Expected annual loss</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((entry) => (
                <TableRow key={entry.code}>
                  <TableCell>{entry.rank}</TableCell>
                  <TableCell>{entry.label}</TableCell>
                  <TableCell>{formatMoney(entry.expectedAnnualLoss, symbol)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 32, left: 4 }}>
          <CartesianGrid stroke={chartColours.border} vertical={false} />
          <XAxis dataKey="label" {...axisProps} angle={-25} textAnchor="end" height={72} interval={0} />
          <YAxis {...axisProps} width={64} tickFormatter={(value: number) => formatMoney(value, symbol)} />
          <Tooltip
            formatter={(value) => [formatMoney(Number(value), symbol), 'Expected annual loss']}
            contentStyle={{ borderRadius: 4, borderColor: chartColours.border, fontSize: 12 }}
          />
          <Bar dataKey="expectedAnnualLoss" isAnimationActive={false} radius={[2, 2, 0, 0]}>
            {data.map((entry) => (
              <Cell
                key={entry.code}
                fill={entry.rank === 1 ? chartColours.accentStrong : chartColours.accent}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
