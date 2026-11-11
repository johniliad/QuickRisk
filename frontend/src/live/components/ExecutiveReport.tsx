import { HowNumbersAreProduced } from '@/components/layout/HowNumbersAreProduced';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LIVE_DISCLOSURE } from '@/content/plainLanguage';
import { formatMoney } from '@/lib/format';
import { STAGE_LABELS } from '@/live/domain/socTypes';
import type { LiveAssessmentDetail } from '@/live/api/liveClient';

const formatDate = (isoTimestamp: string): string => {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return isoTimestamp;
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(parsed);
};

/**
 * Executive report.
 *
 * A pure presentation of one stored assessment: it receives the saved state and the saved
 * result and performs no risk calculation at all, so the same assessment always produces the
 * same report. Everything numeric comes from the stored record.
 */
export function ExecutiveReport({
  assessment,
  symbol = '€',
}: {
  assessment: LiveAssessmentDetail;
  symbol?: string;
}) {
  const state = assessment.inputState;
  const result = assessment.result;
  const delta = result.realTimeEal - result.baselineEal;
  const deltaText = `${delta >= 0 ? 'increase' : 'reduction'} of ${formatMoney(Math.abs(delta), symbol)}`;

  const controls: string[] = [];
  if (state.isEdrIsolated) controls.push('EDR host isolation active');
  if (state.isNetworkBlocked) controls.push('network blocking active');
  if (state.isIdentityRevoked) controls.push('identity response active');

  const drivers = [
    `Incident stage in the simulation: ${STAGE_LABELS[state.incidentStage]} (telemetry score ${result.telemetryScore.toFixed(1)})`,
    `${state.iocCount} matching IOC observation(s) at ${(state.iocConfidence * 100).toFixed(0)}% confidence`,
    `Alert velocity ${state.alertVelocity.toFixed(1)}x`,
    controls.length === 0 ? 'No simulated containment actions active' : controls.join('; '),
  ];

  return (
    <article className="grid gap-5">
      <header className="grid gap-2 border-b border-border pb-4">
        <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">
          QuickRisk Live — Executive Risk Assessment
        </p>
        <h1 className="m-0 text-[var(--text-title)] font-bold text-heading">
          {assessment.title === '' ? assessment.scenarioName : assessment.title}
        </h1>
        <p className="m-0 text-small text-muted">
          {assessment.scenarioName} · generated {formatDate(assessment.createdAt)} UTC · Methodology QuickRisk
          Live v{assessment.methodologyVersion} · Data status: synthetic SOC simulation · Assessment: anonymous
          · Report: informational / demonstration
        </p>
      </header>

      <Alert tone="warning" title="SIMULATION MODE — Synthetic SOC Data">
        <p className="m-0">
          No production SIEM, EDR, SOC or incident-management feed is connected. The selected QuickRisk
          scenario is being evaluated against a simulated SOC sequence.
        </p>
      </Alert>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Current risk</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-[2rem] font-bold leading-none text-heading">{result.realTimeRisk} / 100</p>
            <p className="m-0 text-small font-bold uppercase tracking-[0.1em] text-heading">{result.riskBand}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>SOC multiplier</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-[2rem] font-bold leading-none text-heading">
              {result.socMultiplier.toFixed(2)}x
            </p>
            <p className="m-0 text-small text-muted">Bounded 0.20x–4.00x</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Telemetry</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="m-0 text-[2rem] font-bold leading-none text-heading">
              {result.telemetryScore.toFixed(1)}
            </p>
            <p className="m-0 text-small text-muted">Mitigation factor {result.mitigationFactor.toFixed(3)}</p>
          </CardContent>
        </Card>
      </div>


      <Card>
        <CardHeader>
          <CardTitle>Financial exposure overlay</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-small">
          <p className="m-0">
            Baseline EAL: <strong>{formatMoney(result.baselineEal, symbol)} / year</strong>
          </p>
          <p className="m-0">
            Real-Time EAL: <strong>{formatMoney(result.realTimeEal, symbol)} / year</strong> ({deltaText})
          </p>
          <p className="m-0 text-micro text-muted">
            The overlay is an illustrative application of the SOC multiplier to the stored QuickRisk baseline.
            It is not the organization's real annual loss.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top drivers observed in this simulation</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="m-0 grid gap-1 pl-5 text-small">
            {drivers.map((driver) => (
              <li key={driver}>{driver}</li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recommended response focus</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1 text-small">
          <p className="m-0">
            These are demonstration prompts derived from the simulated controls that are not active. They are
            not professional incident-response advice.
          </p>
          <ul className="m-0 grid gap-1 pl-5">
            {state.isEdrIsolated ? null : <li>Consider isolating affected endpoints in the simulation.</li>}
            {state.isNetworkBlocked ? null : <li>Consider blocking malicious communication in the simulation.</li>}
            {state.isIdentityRevoked ? null : <li>Consider revoking compromised identities in the simulation.</li>}
            {state.isEdrIsolated && state.isNetworkBlocked && state.isIdentityRevoked ? (
              <li>All modelled containment actions are active in this simulation.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      {assessment.timeline.length === 0 ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="m-0 grid gap-1 pl-5 text-small">
              {assessment.timeline.map((event) => (
                <li key={`${event.sequenceNo}-${event.offsetMs}`}>
                  <span className="font-semibold">+{Math.round(event.offsetMs / 1000)}s</span> {event.label} —
                  risk {event.result.realTimeRisk} ({event.result.riskBand}),{' '}
                  {event.result.socMultiplier.toFixed(2)}x, {formatMoney(event.result.realTimeEal, symbol)}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <Alert tone="neutral" title="Interpretation and limitations">
        <p className="m-0">
          QuickRisk Live uses synthetic SOC data and application-defined deterministic coefficients. The
          displayed values are illustrative and are not a probability of compromise or a substitute for
          production SOC telemetry, formal risk assessment or professional cybersecurity advice. The
          Real-Time Risk Index is an application-defined 0–100 index, and the SOC Threat Multiplier is a
          bounded analytical overlay applied to the QuickRisk baseline.
        </p>
      </Alert>

      <HowNumbersAreProduced rows={LIVE_DISCLOSURE} />
    </article>
  );
}
