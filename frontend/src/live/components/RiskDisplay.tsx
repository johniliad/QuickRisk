import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format';
import { useViewModeStore } from '@/state/viewModeStore';
import type { RealTimeRiskResult } from '@/live/domain/socTypes';

const bandTone: Record<string, string> = {
  Low: 'text-success',
  Medium: 'text-warning',
  High: 'text-danger',
  Critical: 'text-danger',
};

/**
 * Current simulated risk.
 *
 * The band is always written out next to the number, so the result never depends on colour
 * alone. The four figures come straight from the engine result passed in.
 */
export function RiskDisplay({
  result,
  symbol,
  scenarioName,
  live = true,
}: {
  result: RealTimeRiskResult;
  symbol: string;
  scenarioName: string;
  live?: boolean;
}) {
  const delta = result.realTimeEal - result.baselineEal;
  const deltaLabel = `${delta >= 0 ? '+' : '−'}${formatMoney(Math.abs(delta), symbol)}`;
  const isAnalyst = useViewModeStore((state) => state.mode) === 'analyst';

  return (
    <Card>
      <CardHeader>
        <CardTitle>{live ? 'Current simulated risk' : 'Saved simulated risk'}</CardTitle>
        <p className="m-0 text-small text-muted">
          QuickRisk baseline scenario: <strong className="text-ink">{scenarioName}</strong>
        </p>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1">
          <p
            className={`m-0 text-[2.6rem] font-bold leading-none ${bandTone[result.riskBand] ?? 'text-heading'}`}
            aria-live={live ? 'polite' : undefined}
          >
            {result.riskBand}
          </p>
          <p className="m-0 text-small font-bold uppercase tracking-[0.12em] text-heading">Current risk level</p>
          {isAnalyst ? (
            <p className="m-0 text-micro text-muted">
              Real-Time Risk Index {result.realTimeRisk}/100 · bands 0–19 Low · 20–44 Medium · 45–74 High · 75–100
              Critical.
            </p>
          ) : null}
        </div>

        {isAnalyst ? (
          <dl className="m-0 grid gap-3 sm:grid-cols-2">
            <div className="rounded-control border border-border p-3">
              <dt className="text-micro font-semibold uppercase tracking-[0.08em] text-muted">SOC Threat Multiplier</dt>
              <dd className="m-0 text-[1.35rem] font-semibold text-heading">{result.socMultiplier.toFixed(2)}x</dd>
              <p className="m-0 text-micro text-muted">Bounded to 0.20x–4.00x.</p>
            </div>
            <div className="rounded-control border border-border p-3">
              <dt className="text-micro font-semibold uppercase tracking-[0.08em] text-muted">Telemetry score</dt>
              <dd className="m-0 text-[1.35rem] font-semibold text-heading">{result.telemetryScore.toFixed(1)}</dd>
              <p className="m-0 text-micro text-muted">Capped at 100.</p>
            </div>
            <div className="rounded-control border border-border p-3">
              <dt className="text-micro font-semibold uppercase tracking-[0.08em] text-muted">Baseline EAL</dt>
              <dd className="m-0 text-[1.35rem] font-semibold text-heading">
                {formatMoney(result.baselineEal, symbol)}
              </dd>
              <p className="m-0 text-micro text-muted">From the QuickRisk quantitative model.</p>
            </div>
            <div className="rounded-control border border-accent-strong/40 bg-accent-soft p-3">
              <dt className="text-micro font-semibold uppercase tracking-[0.08em] text-muted">Real-Time EAL</dt>
              <dd className="m-0 text-[1.35rem] font-semibold text-accent-strong">
                {formatMoney(result.realTimeEal, symbol)}
              </dd>
              <p className="m-0 text-micro text-muted">
                Overlay {deltaLabel} versus baseline ({result.mitigationFactor.toFixed(3)} mitigation factor).
              </p>
            </div>
          </dl>
        ) : (
          <div className="rounded-control border border-accent-strong/40 bg-accent-soft p-3">
            <p className="m-0 text-micro font-semibold uppercase tracking-[0.08em] text-muted">Exposure</p>
            <p className="m-0 text-[1.35rem] font-semibold text-heading">
              {formatMoney(result.baselineEal, symbol)} → {formatMoney(result.realTimeEal, symbol)}
            </p>
            <p className="m-0 text-micro text-muted">
              Current controls change exposure by {deltaLabel} versus the baseline.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
