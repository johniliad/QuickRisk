import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

/**
 * Mandatory simulation-mode label.
 *
 * The label must remain visible in the simulator, a saved assessment, the timeline, the
 * share page and the executive report, so it is a single component rather than ad-hoc text.
 */
export function SimulationBadge({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return <Badge tone="warning">SIMULATION MODE — Synthetic SOC Data</Badge>;
  }

  return (
    <Alert tone="warning" title="SIMULATION MODE — Synthetic SOC Data">
      <p className="m-0">
        No production SIEM, EDR, SOC or incident-management feed is connected. Every SOC value on this
        page is synthetic and is used to demonstrate how current security observations and response
        actions can influence a cyber-risk assessment.
      </p>
    </Alert>
  );
}

/** The disclaimer required wherever QuickRisk Live results are shown. */
export function LiveDisclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <Alert tone="neutral" title="About QuickRisk Live results">
      <p className="m-0">
        QuickRisk Live is an independently developed analytical simulation intended for informational,
        educational and demonstration purposes. It uses synthetic SOC data and application-defined
        deterministic coefficients to illustrate how current security observations and response actions
        can influence a cyber-risk assessment. Its Real-Time Risk Index and SOC Threat Multiplier are not
        probabilities of compromise, are not a substitute for a production SOC, SIEM, EDR, formal risk
        assessment or professional cybersecurity advice, and do not represent an official FAIR, NIST,
        CVSS, MITRE ATT&CK or regulatory scoring methodology.
        {compact
          ? null
          : ' Real-world decisions should be based on appropriate organizational evidence, professional judgement and validated risk analysis.'}
      </p>
    </Alert>
  );
}
