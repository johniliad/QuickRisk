import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Label } from '@/components/ui/field';
import {
  SOC_LIMITS,
  STAGE_LABELS,
  STAGE_ORDER,
  type IncidentStage,
  type SOCInputState,
} from '@/live/domain/socTypes';

/**
 * Synthetic SOC input panel.
 *
 * Every control is labelled, keyboard operable and updates the local engine immediately.
 * No API request is sent while the user moves a control.
 */
export function SocInputs({
  soc,
  onChange,
  disabled = false,
}: {
  soc: SOCInputState;
  onChange: (patch: Partial<SOCInputState>) => void;
  disabled?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Synthetic SOC inputs</CardTitle>
        <p className="m-0 text-small text-muted">
          Adjust these observations and actions. The risk result, multiplier and explanation update
          instantly in this page.
        </p>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-1.5">
          <Label htmlFor="live-stage">Incident stage</Label>
          <select
            id="live-stage"
            className="min-h-10 rounded-control border border-border bg-paper px-3 text-small text-ink"
            value={soc.incidentStage}
            disabled={disabled}
            onChange={(event) => onChange({ incidentStage: event.target.value as IncidentStage })}
            aria-describedby="live-stage-help"
          >
            {STAGE_ORDER.map((stage) => (
              <option key={stage} value={stage}>
                {STAGE_LABELS[stage]}
              </option>
            ))}
          </select>
          <p id="live-stage-help" className="m-0 text-micro text-muted">
            Stage scores: none 0, triage 20, confirmed anomaly 45, active compromise 75.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="live-ioc-count">Matching IOC observations: {soc.iocCount}</Label>
          <input
            id="live-ioc-count"
            type="range"
            min={SOC_LIMITS.iocCount.min}
            max={SOC_LIMITS.iocCount.max}
            step={SOC_LIMITS.iocCount.step}
            value={soc.iocCount}
            disabled={disabled}
            onChange={(event) => onChange({ iocCount: Number(event.target.value) })}
            aria-describedby="live-ioc-count-help"
            className="w-full accent-accent-strong"
          />
          <p id="live-ioc-count-help" className="m-0 text-micro text-muted">
            Each observation contributes 12 points before confidence ({SOC_LIMITS.iocCount.min}–
            {SOC_LIMITS.iocCount.max}).
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="live-ioc-confidence">
            IOC confidence: {(soc.iocConfidence * 100).toFixed(0)}%
          </Label>
          <input
            id="live-ioc-confidence"
            type="range"
            min={SOC_LIMITS.iocConfidence.min}
            max={SOC_LIMITS.iocConfidence.max}
            step={SOC_LIMITS.iocConfidence.step}
            value={soc.iocConfidence}
            disabled={disabled}
            onChange={(event) => onChange({ iocConfidence: Number(event.target.value) })}
            aria-describedby="live-ioc-confidence-help"
            className="w-full accent-accent-strong"
          />
          <p id="live-ioc-confidence-help" className="m-0 text-micro text-muted">
            Confidence scales the IOC contribution between 10% and 100%.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="live-alert-velocity">Alert velocity: {soc.alertVelocity.toFixed(1)}x</Label>
          <input
            id="live-alert-velocity"
            type="range"
            min={SOC_LIMITS.alertVelocity.min}
            max={SOC_LIMITS.alertVelocity.max}
            step={SOC_LIMITS.alertVelocity.step}
            value={soc.alertVelocity}
            disabled={disabled}
            onChange={(event) => onChange({ alertVelocity: Number(event.target.value) })}
            aria-describedby="live-alert-velocity-help"
            className="w-full accent-accent-strong"
          />
          <p id="live-alert-velocity-help" className="m-0 text-micro text-muted">
            Each unit above 1.0x adds 10 points to the telemetry score.
          </p>
        </div>

        <fieldset className="m-0 grid gap-3 border-0 p-0">
          <legend className="mb-1 p-0 text-small font-semibold text-heading">Simulated response actions</legend>
          <Checkbox
            id="live-edr"
            checked={soc.isEdrIsolated}
            onCheckedChange={(checked) => onChange({ isEdrIsolated: checked })}
            label="EDR host isolation (75% modelled exposure reduction)"
          />
          <Checkbox
            id="live-network"
            checked={soc.isNetworkBlocked}
            onCheckedChange={(checked) => onChange({ isNetworkBlocked: checked })}
            label="Network / perimeter blocking (50% modelled exposure reduction)"
          />
          <Checkbox
            id="live-identity"
            checked={soc.isIdentityRevoked}
            onCheckedChange={(checked) => onChange({ isIdentityRevoked: checked })}
            label="Identity response (60% modelled exposure reduction)"
          />
          <p className="m-0 text-micro text-muted">
            Controls only modify the active overlay. With no active telemetry the multiplier stays at 1.00x,
            so the baseline exposure is never silently reduced.
          </p>
        </fieldset>
      </CardContent>
    </Card>
  );
}
