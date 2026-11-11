import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisProps, chartColours, ChartFrame } from '@/components/charts/ChartFrame';
import { Table, TableHead, TableBody, TableCell, TableHeaderCell, TableRow, TableWrap } from '@/components/ui/table';
import type { SensitivityAnalysis } from '@/domain/results';
import { formatMoney } from '@/lib/format';

/**
 * Sensitivity of the expected annualised exposure to each input.
 *
 * This is a genuine one-at-a-time sensitivity: the server re-evaluates the model's analytic
 * expected annual loss for every answer option of every factor while holding the other
 * answers fixed, and reports the ratio of the highest to the lowest resulting exposure. It is
 * a sensitivity of the expected value, not a variance-based attribution, not a causal
 * analysis and not a guarantee that changing a control will produce the modelled change.
 */
export function SensitivityChart({
  sensitivity,
  symbol,
}: {
  sensitivity: SensitivityAnalysis;
  symbol: string;
}) {
  const factors = sensitivity.factors;
  if (factors.length === 0) {
    return null;
  }

  const data = factors.map((factor) => ({
    label: factor.label,
    spreadRatio: factor.spreadRatio,
    spreadMultiple: Math.max(1, factor.spreadRatio),
    low: factor.lowExpectedAnnualLoss,
    high: factor.highExpectedAnnualLoss,
  }));

  const summary = factors
    .map(
      (factor) =>
        `${factor.label}: expected annual loss ranges from ${formatMoney(factor.lowExpectedAnnualLoss, symbol)} to ${formatMoney(factor.highExpectedAnnualLoss, symbol)} across its answer options.`,
    )
    .join(' ');

  return (
    <ChartFrame
      id="sensitivity"
      title="Sensitivity of the expected annual loss to each input"
      description="One-at-a-time sensitivity of the modelled expected annual loss. Each factor is re-evaluated across all of its answer options with every other answer held fixed; the bar shows the ratio of the highest to the lowest resulting exposure."
      summary={summary}
      height={360}
      table={
        <TableWrap>
          <Table>
            <caption className="mb-2 text-left text-micro text-muted">
              {sensitivity.method}
              {sensitivity.truncated
                ? ` Showing the ${factors.length} largest of ${sensitivity.factorCount} factors assessed.`
                : ` All ${sensitivity.factorCount} factors assessed.`}
            </caption>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Factor</TableHeaderCell>
                <TableHeaderCell>Lowest expected annual loss</TableHeaderCell>
                <TableHeaderCell>Highest expected annual loss</TableHeaderCell>
                <TableHeaderCell>Spread ratio</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {factors.map((factor) => (
                <TableRow key={`${factor.kind}-${factor.questionCode}`}>
                  <TableCell>
                    <span className="font-semibold text-heading">{factor.label}</span>
                    <span className="block text-micro text-muted">
                      {factor.kind === 'profile' ? 'Organisation profile' : `Scenario ${factor.scenarioCode}`}
                    </span>
                  </TableCell>
                  <TableCell>{formatMoney(factor.lowExpectedAnnualLoss, symbol)}</TableCell>
                  <TableCell>{formatMoney(factor.highExpectedAnnualLoss, symbol)}</TableCell>
                  <TableCell>{factor.spreadRatio.toFixed(1)}×</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 40, left: 4 }}>
          <CartesianGrid stroke={chartColours.border} vertical={false} />
          <XAxis dataKey="label" {...axisProps} angle={-30} textAnchor="end" height={96} interval={0} />
          <YAxis {...axisProps} width={48} />
          <Tooltip
            formatter={(value, _name, entry) => {
              const factor = factors.find((candidate) => candidate.label === entry?.payload?.label);
              if (factor === undefined) {
                return [`${Number(value).toFixed(1)}×`, 'Spread ratio'];
              }
              return [
                `${factor.spreadRatio.toFixed(1)}× (${formatMoney(factor.lowExpectedAnnualLoss, symbol)} to ${formatMoney(factor.highExpectedAnnualLoss, symbol)})`,
                'Spread ratio',
              ];
            }}
            contentStyle={{ borderRadius: 4, borderColor: chartColours.border, fontSize: 12 }}
          />
          <Bar
            dataKey="spreadMultiple"
            name="Spread ratio (highest ÷ lowest)"
            fill={chartColours.accent}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
