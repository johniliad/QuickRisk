import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow, TableWrap } from '@/components/ui/table';
import { formatMoney } from '@/lib/format';
import { STAGE_LABELS, type RealTimeRiskResult } from '@/live/domain/socTypes';

/**
 * "Why / trace" panel.
 *
 * Every displayed sentence is generated from the structured trace produced by the engine,
 * so the explanation can never drift from the numbers. Values are never hard-coded here.
 */
export function CalculationTrace({ result, symbol }: { result: RealTimeRiskResult; symbol: string }) {
  const trace = result.trace;
  const controls: string[] = [];
  if (trace.edrReduction > 0) controls.push(`EDR isolation −${(trace.edrReduction * 100).toFixed(0)}%`);
  if (trace.networkReduction > 0) controls.push(`network blocking −${(trace.networkReduction * 100).toFixed(0)}%`);
  if (trace.identityReduction > 0) controls.push(`identity response −${(trace.identityReduction * 100).toFixed(0)}%`);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Why this result</CardTitle>
        <p className="m-0 text-small text-muted">
          The same deterministic formula is applied to every state, so these figures can be reproduced
          exactly.
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <TableWrap>
          <Table>
            <caption className="mb-2 text-left text-micro text-muted">
              Calculation trace for the current synthetic SOC state.
            </caption>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Component</TableHeaderCell>
                <TableHeaderCell>Contribution</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell>
                  IOC observations ({trace.iocCount} × 12 × {trace.iocConfidence.toFixed(2)})
                </TableCell>
                <TableCell>{trace.iocContribution.toFixed(1)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Incident stage ({STAGE_LABELS[trace.stage]})</TableCell>
                <TableCell>{trace.stageContribution.toFixed(1)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Alert velocity ({(trace.alertVelocity - 1).toFixed(1)} × 10)</TableCell>
                <TableCell>{trace.velocityContribution.toFixed(1)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  Telemetry score ({trace.rawTelemetry.toFixed(1)} raw, capped at 100)
                </TableCell>
                <TableCell className="font-semibold">{trace.cappedTelemetry.toFixed(1)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Mitigation factor</TableCell>
                <TableCell className="font-semibold">{trace.mitigationFactor.toFixed(4)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  SOC multiplier (1 + {trace.cappedTelemetry.toFixed(1)}/100 × (4 ×{' '}
                  {trace.mitigationFactor.toFixed(3)} − 1))
                </TableCell>
                <TableCell className="font-semibold">
                  {trace.multiplierApplied.toFixed(2)}x
                  {trace.multiplierUnclamped !== trace.multiplierClamped
                    ? ` (bounded from ${trace.multiplierUnclamped.toFixed(2)}x)`
                    : ''}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Real-Time Risk Index</TableCell>
                <TableCell className="font-semibold">
                  {trace.realTimeRisk} / 100 — {trace.riskBand}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Real-Time EAL (baseline × multiplier)</TableCell>
                <TableCell className="font-semibold">
                  {formatMoney(trace.baselineEal, symbol)} × {trace.multiplierApplied.toFixed(2)} ={' '}
                  {formatMoney(trace.realTimeEal, symbol)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableWrap>

        <p className="m-0 text-small text-muted">
          Response actions in effect: {controls.length === 0 ? 'none' : controls.join(', ')}. The
          mitigation factor is the product of the residual exposures, so enabling one control never
          removes the effect of the others.
        </p>
      </CardContent>
    </Card>
  );
}
