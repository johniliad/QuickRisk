import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisProps, chartColours, ChartFrame } from '@/components/charts/ChartFrame';
import { Table, TableHead, TableBody, TableCell, TableHeaderCell, TableRow, TableWrap } from '@/components/ui/table';
import type { ScenarioResult } from '@/domain/results';
import { formatMoney, formatPercent } from '@/lib/format';

interface Bin {
  label: string;
  lower: number;
  upper: number;
  count: number;
  probability: number;
}

function buildBins(scenario: ScenarioResult, symbol: string): { bins: Bin[]; overflowBin: Bin | null } {
  const { binEdges, counts, overflowCount, overflowFrom } = scenario.distribution;
  const total = counts.reduce((sum, count) => sum + count, 0) + overflowCount;
  const bins: Bin[] = [];

  for (let index = 0; index < counts.length; index += 1) {
    const lower = binEdges[index] ?? 0;
    const upper = binEdges[index + 1] ?? overflowFrom;
    const count = counts[index] ?? 0;
    bins.push({
      label: `${formatMoney(lower, symbol)}–${formatMoney(upper, symbol)}`,
      lower,
      upper,
      count,
      probability: total === 0 ? 0 : count / total,
    });
  }

  const overflowBin: Bin | null =
    overflowCount > 0
      ? {
          label: `> ${formatMoney(overflowFrom, symbol)}`,
          lower: overflowFrom,
          upper: Number.POSITIVE_INFINITY,
          count: overflowCount,
          probability: total === 0 ? 0 : overflowCount / total,
        }
      : null;

  return { bins, overflowBin };
}

function binLabelFor(value: number, bins: readonly Bin[]): string {
  for (const bin of bins) {
    if (value >= bin.lower && value < bin.upper) {
      return bin.label;
    }
  }
  return bins.length > 0 ? (bins[bins.length - 1] as Bin).label : '';
}

/**
 * Loss distribution histogram for one scenario.
 *
 * The final bar is an overflow bin that collects every simulated year above the 99th
 * percentile, so the tail is visible rather than silently discarded.
 */
export function LossDistributionChart({ scenario, symbol }: { scenario: ScenarioResult; symbol: string }) {
  const { bins, overflowBin } = buildBins(scenario, symbol);
  const data = overflowBin === null ? bins : [...bins, overflowBin];
  const meanLabel = binLabelFor(scenario.statistics.expectedAnnualLoss, bins);
  const p90Label = binLabelFor(scenario.statistics.p90, bins);

  const summary =
    `Histogram of ${scenario.statistics.iterations.toLocaleString('en-GB')} simulated annualised losses for ` +
    `${scenario.shortLabel}. Expected annual loss ${formatMoney(scenario.statistics.expectedAnnualLoss, symbol)}, ` +
    `P10 ${formatMoney(scenario.statistics.p10, symbol)}, P90 ${formatMoney(scenario.statistics.p90, symbol)}. ` +
    `The final bar is an overflow bin for outcomes above ${formatMoney(scenario.distribution.overflowFrom, symbol)}.`;

  return (
    <ChartFrame
      id={`distribution-${scenario.code}`}
      title={`${scenario.shortLabel}: simulated annual loss distribution`}
      description="Each bar shows the share of simulated years falling in that loss band. A wide spread means the inputs carry real uncertainty."
      summary={summary}
      table={
        <TableWrap>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Loss band</TableHeaderCell>
                <TableHeaderCell>Simulated years</TableHeaderCell>
                <TableHeaderCell>Share</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((bin) => (
                <TableRow key={bin.label}>
                  <TableCell>{bin.label}</TableCell>
                  <TableCell>{bin.count.toLocaleString('en-GB')}</TableCell>
                  <TableCell>{formatPercent(bin.probability)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 24, left: 4 }}>
          <CartesianGrid stroke={chartColours.border} vertical={false} />
          <XAxis dataKey="label" {...axisProps} angle={-35} textAnchor="end" height={64} interval="preserveStartEnd" />
          <YAxis {...axisProps} width={48} />
          <Tooltip
            formatter={(value) => [Number(value).toLocaleString('en-GB'), 'Simulated years']}
            labelFormatter={(label) => `Loss band ${String(label)}`}
            contentStyle={{ borderRadius: 4, borderColor: chartColours.border, fontSize: 12 }}
          />
          <ReferenceLine x={meanLabel} stroke={chartColours.accentStrong} strokeDasharray="4 3" label={{ value: 'mean', position: 'insideTopRight', fill: chartColours.accentStrong, fontSize: 11 }} />
          <ReferenceLine x={p90Label} stroke={chartColours.warning} strokeDasharray="2 3" label={{ value: 'P90', position: 'insideTopLeft', fill: chartColours.warning, fontSize: 11 }} />
          <Bar dataKey="count" fill={chartColours.accent} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
