import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { axisProps, chartColours, ChartFrame } from '@/components/charts/ChartFrame';
import { Table, TableHead, TableBody, TableCell, TableHeaderCell, TableRow, TableWrap } from '@/components/ui/table';
import type { ScenarioResult } from '@/domain/results';
import { formatMoney } from '@/lib/format';

interface RangePoint {
  code: string;
  label: string;
  offset: number;
  range: number;
  p10: number;
  p50: number;
  p90: number;
  mean: number;
}

function RangeTooltip({
  active,
  payload,
  symbol,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown }>;
  symbol: string;
}) {
  if (active !== true || payload === undefined || payload.length === 0) {
    return null;
  }
  const point = payload[0]?.payload as RangePoint | undefined;
  if (point === undefined) {
    return null;
  }

  return (
    <div className="grid gap-1 rounded-control border border-border bg-paper p-3 text-small shadow-card">
      <p className="m-0 font-semibold text-heading">{point.label}</p>
      <p className="m-0 text-muted">
        P10 {formatMoney(point.p10, symbol)} · P50 {formatMoney(point.p50, symbol)} · P90{' '}
        {formatMoney(point.p90, symbol)}
      </p>
      <p className="m-0 text-muted">Expected annual loss {formatMoney(point.mean, symbol)}</p>
    </div>
  );
}

/**
 * P10–P90 range per scenario with the median and the expected value marked.
 *
 * The bar shows the modelled range; the marker shows the expected annual loss. The
 * chart is deliberately a range rather than a single value, so that uncertainty is
 * communicated rather than hidden.
 */
export function PercentileRangeChart({
  scenarios,
  symbol,
}: {
  scenarios: readonly ScenarioResult[];
  symbol: string;
}) {
  const data: RangePoint[] = scenarios.map((scenario) => ({
    code: scenario.code,
    label: scenario.shortLabel,
    offset: scenario.statistics.p10,
    range: Math.max(scenario.statistics.p90 - scenario.statistics.p10, 0),
    p10: scenario.statistics.p10,
    p50: scenario.statistics.p50,
    p90: scenario.statistics.p90,
    mean: scenario.statistics.expectedAnnualLoss,
  }));

  const summary = data
    .map(
      (point) =>
        `${point.label}: P10 ${formatMoney(point.p10, symbol)}, P50 ${formatMoney(point.p50, symbol)}, P90 ${formatMoney(point.p90, symbol)}, expected annual loss ${formatMoney(point.mean, symbol)}.`,
    )
    .join(' ');

  return (
    <ChartFrame
      id="percentile-range"
      title="Modelled annual loss range by scenario (P10–P90)"
      description="The bar spans the modelled P10–P90 range. The marker shows the expected annual loss. A long bar means the model is genuinely uncertain about that scenario."
      summary={summary}
      height={320}
      table={
        <TableWrap>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Scenario</TableHeaderCell>
                <TableHeaderCell>P10</TableHeaderCell>
                <TableHeaderCell>P50</TableHeaderCell>
                <TableHeaderCell>P90</TableHeaderCell>
                <TableHeaderCell>Expected</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((point) => (
                <TableRow key={point.code}>
                  <TableCell>{point.label}</TableCell>
                  <TableCell>{formatMoney(point.p10, symbol)}</TableCell>
                  <TableCell>{formatMoney(point.p50, symbol)}</TableCell>
                  <TableCell>{formatMoney(point.p90, symbol)}</TableCell>
                  <TableCell>{formatMoney(point.mean, symbol)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableWrap>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} layout="vertical" margin={{ top: 8, right: 28, bottom: 8, left: 8 }}>
          <CartesianGrid stroke={chartColours.border} horizontal={false} />
          <XAxis
            type="number"
            {...axisProps}
            tickFormatter={(value: number) => formatMoney(value, symbol)}
          />
          <YAxis type="category" dataKey="label" {...axisProps} width={140} />
          <Tooltip content={<RangeTooltip symbol={symbol} />} />
          <Bar dataKey="offset" stackId="range" fill="transparent" isAnimationActive={false} />
          <Bar
            dataKey="range"
            stackId="range"
            fill={chartColours.accent}
            radius={2}
            isAnimationActive={false}
          />
          <Scatter dataKey="mean" fill={chartColours.accentStrong} shape="diamond" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
