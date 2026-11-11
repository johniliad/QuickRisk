import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LiveDisclaimer, SimulationBadge } from '@/live/components/SimulationBadge';
import { LIVE_METHODOLOGY_VERSION, STAGE_LABELS, STAGE_ORDER } from '@/live/domain/socTypes';

/**
 * QuickRisk Live methodology.
 *
 * Documents the baseline, telemetry, mitigation, multiplier, real-time EAL, risk index, bands,
 * a worked example, the timeline, anonymous sessions, history, sharing, the scenario library,
 * executive mode and the limitations — as required by the base requirements.
 */
export function LiveMethodologyView() {
  return (
    <div className="grid gap-6">
      <SimulationBadge />
      <header className="grid gap-2">
        <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">
          Methodology v{LIVE_METHODOLOGY_VERSION}
        </p>
        <h1 className="m-0 text-[var(--text-title)] font-bold text-heading">How QuickRisk Live works</h1>
        <p className="m-0 max-w-[52rem] text-muted">
          QuickRisk Live adds a deterministic operational layer to the QuickRisk quantitative baseline. It
          converts synthetic SOC observations and response actions into a Real-Time Risk Index, a bounded SOC
          Threat Multiplier and an illustrative real-time exposure overlay.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. Two analytical layers</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-small">
          <p className="m-0">
            <strong>Baseline.</strong> The existing QuickRisk model produces the annual expected loss for the
            selected scenario from your questionnaire answers. QuickRisk Live consumes that number and never
            recalculates it.
          </p>
          <p className="m-0">
            <strong>Live overlay.</strong> The SOC state you enter is converted into a telemetry score, a
            mitigation factor and a multiplier that scales the baseline. The overlay is illustrative: it is not
            a probability that a real incident is happening.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Telemetry score</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-small">
          <p className="m-0 font-mono">
            telemetry = min(100, IOCs × 12 × confidence + stage + (velocity − 1) × 10)
          </p>
          <p className="m-0">Stage scores:</p>
          <ul className="m-0 grid gap-1 pl-5">
            {STAGE_ORDER.map((stage) => (
              <li key={stage}>
                {STAGE_LABELS[stage]}:{' '}
                {stage === 'none' ? 0 : stage === 'triage' ? 20 : stage === 'anomaly' ? 45 : 75}
              </li>
            ))}
          </ul>
          <p className="m-0 text-muted">
            Bounds: IOC count 0–15, confidence 0.10–1.00, alert velocity 1.0–5.0. Values outside these ranges
            are rejected by both the browser and the API.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Mitigation and the SOC Threat Multiplier</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-small">
          <p className="m-0 font-mono">
            mitigation = (1 − EDR) (1 − network) (1 − identity) · EDR 75%, network 50%, identity 60%
          </p>
          <p className="m-0 font-mono">
            multiplier = clamp(1 + telemetry/100 × (4 × mitigation − 1), 0.20, 4.00)
          </p>
          <ul className="m-0 grid gap-1 pl-5">
            <li>No active telemetry → 1.00x, whatever the controls (the baseline is preserved).</li>
            <li>Maximum telemetry without mitigation → 4.00x.</li>
            <li>Maximum telemetry with all controls → 0.20x.</li>
          </ul>
          <p className="m-0 text-muted">
            The coefficients are application-defined demonstration parameters. They are not FAIR, NIST, CVSS or
            MITRE ATT&amp;CK values, and they are not claims about the real effectiveness of any product.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Real-Time Risk Index and real-time EAL</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-small">
          <p className="m-0 font-mono">risk index = min(100, round(telemetry × mitigation))</p>
          <p className="m-0 font-mono">real-time EAL = baseline EAL × multiplier</p>
          <p className="m-0">Bands: 0–19 Low · 20–44 Medium · 45–74 High · 75–100 Critical.</p>
          <p className="m-0 text-muted">
            The index is not a percentage probability. A value of 82 means “82 on a 0–100 application-defined
            index”, never “82% probability of compromise”.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5. Worked example</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-small">
          <p className="m-0">
            Baseline EAL €125,000; 6 IOCs at 80% confidence; active compromise; velocity 3.0x; no controls.
          </p>
          <p className="m-0 font-mono">6 × 12 × 0.80 = 57.6 · stage 75 · velocity 20 → raw 152.6 → capped 100</p>
          <p className="m-0 font-mono">mitigation 1.00 → multiplier 4.00x → real-time EAL €500,000</p>
          <p className="m-0 font-mono">risk index 100 / 100 — Critical</p>
          <p className="m-0">
            With all three controls active: mitigation 0.05, multiplier 0.20x, real-time EAL €25,000, risk index
            5 / 100 — Low.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>6. Timeline, history, sharing and scenarios</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-small">
          <p className="m-0">
            Recording a timeline step stores the synthetic SOC state together with the result the engine
            produced at that moment. Replay applies the same engine to the same sequence, so the trajectory is
            reproducible and no randomness or clock is involved.
          </p>
          <p className="m-0">
            History is a private list owned by the anonymous session. Sharing creates a high-entropy read-only
            token; the database stores only its hash, and the link can be revoked at any time.
          </p>
          <p className="m-0">
            The demonstration library is stored in MySQL and served read-only by the API. Applying a preset
            loads its state; the score is always recalculated by the engine.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>7. Anonymous sessions and privacy</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-small">
          <p className="m-0">
            There is no login, no account, no email address and no name. Each visitor receives an anonymous
            session cookie that the browser cannot read; only a hash of its token is stored. Saved assessments
            are owned by that session, and only that session can list, update, share or archive them.
          </p>
          <p className="m-0">
            Live state stays in the browser's memory until you explicitly save it. The application does not use
            browser storage for assessment data.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>8. Limitations</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-small">
          <ul className="m-0 grid gap-1 pl-5">
            <li>No production SIEM, EDR, SOAR, SOC or incident-management feed is connected.</li>
            <li>The SOC data is synthetic and the coefficients are application-defined.</li>
            <li>The index is not a probability of compromise and is not empirically calibrated.</li>
            <li>The mitigation percentages are modelling choices, not measured effectiveness.</li>
            <li>Real-time EAL is an illustrative overlay on the QuickRisk baseline, not a forecast.</li>
            <li>
              Assessments recorded with methodology v{LIVE_METHODOLOGY_VERSION} keep that version, so a later
              methodology change cannot silently rewrite them.
            </li>
            <li>
              A future integration would normalise a real feed into the same internal SOC state; the TypeScript
              engine remains the only numerical authority.
            </li>
          </ul>
        </CardContent>
      </Card>

      <LiveDisclaimer />
      <Alert tone="neutral">
        <p className="m-0 text-micro">
          QuickRisk Live Methodology v{LIVE_METHODOLOGY_VERSION}. Changing any formula, coefficient, range or
          band requires a new methodology version, updated tests and updated documentation.
        </p>
      </Alert>
    </div>
  );
}
