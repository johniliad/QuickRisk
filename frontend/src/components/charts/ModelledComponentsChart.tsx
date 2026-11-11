import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { axisProps, chartColours, ChartFrame } from '@/components/charts/ChartFrame';
import { Table, TableHead, TableBody, TableCell, TableHeaderCell, TableRow, TableWrap } from '@/components/ui/table';
import type { ScenarioResult } from '@/domain/results';

/**
 * Modelled components of each scenario.
 *
 * Each component is shown as a relative index (0–100) normalised across the five scenarios,
 * because the underlying units differ (events per year versus euros). These are the model's
 * components, NOT a sensitivity analysis: the index shows how the modelled components compare
 * between scenarios, not how much each input moves the result. The one-at-a-time sensitivity
 * analysis is reported separately by SensitivityChart, and the absolute component values are
 * in the table below and in each scenario's detail panel.
 */
export function ModelledComponentsChart({ scenarios }: { scenarios: readonly ScenarioResult[] }) {
  const data = scenarios.map((scenario) => ({
    code: scenario.code,
    label: scenario.shortLabel,
    frequency: scenario.driverIndex.frequency,
    magnitude: scenario.driverIndex.magnitude,
    secondary: scenario.driverIndex.secondary,
    lossEventFrequency: scenario.statistics.expectedLossEventFrequency,
    lossMagnitude: scenario.statistics.expectedLossMagnitude,
    secondaryShare: scenario.statistics.secondaryLossShare,
  }));

  const summary = data
    .map(
      (entry) =>
        `${entry.label}: relative frequency component ${entry.frequency}, relative loss-magnitude component ${entry.magnitude}, relative secondary-loss component ${entry.secondary}.`,
    )
    .join(' ');

  return (
    <ChartFrame
      id="modelled-components"
      title="Modelled components of each scenario"
      description="Relative index (0–100) normalised across the five scenarios: how often loss events occur, how large a loss event is, and how much of the expected loss comes from consequential (secondary) cost. This shows the modelled components, not how sensitive the result is to each input."
      summary={summary}
      height={320}
      table={
        <TableWrap>
          <Table>
            <caption className="mb-2 text-left text-micro text-muted">
              Modelled components, not a sensitivity analysis. The sensitivity of the expected annual loss to each
              input is reported separately.
            </caption>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Scenario</TableHeaderCell>
                <TableHeaderCell>Loss events per year</TableHeaderCell>
                <TableHeaderCell>Loss per event</TableHeaderCell>
                <TableHeaderCell>Secondary-loss share</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((entry) => (
                <TableRow key={entry.code}>
                  <TableCell>{entry.label}</TableCell>
                  <TableCell>{entry.lossEventFrequency.toFixed(2)}</TableCell>
                  <TableCell>{entry.lossMagnitude.toFixed(0)}</TableCell>
                  <TableCell>{(entry.secondaryShare * 100).toFixed(1)}%</TableCell>
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
          <YAxis {...axisProps} width={40} domain={[0, 100]} />
          <Tooltip
            formatter={(value, name) => [Number(value), `${String(name)} (relative index)`]}
            contentStyle={{ borderRadius: 4, borderColor: chartColours.border, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="frequency" name="Event frequency component" fill={chartColours.accent} isAnimationActive={false} />
          <Bar dataKey="magnitude" name="Loss magnitude component" fill={chartColours.accentStrong} isAnimationActive={false} />
          <Bar dataKey="secondary" name="Secondary loss component" fill={chartColours.warning} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
