/**
 * QuickRisk Live — deterministic SOC risk engine.
 *
 * This module is the single numerical implementation of the QuickRisk Live overlay.
 * It is pure: no randomness, no clock, no network, no hidden state. The same input and
 * baseline always produce the same output. PHP and MySQL never reimplement it.
 *
 * Methodology (v1.0):
 *
 *   telemetry  = min(100, IOCs x 12 x confidence + stageScore + (velocity - 1) x 10)
 *   mitigation = (1 - EDR)(1 - network)(1 - identity)
 *   multiplier = clamp(1 + telemetry/100 x (4 x mitigation - 1), 0.20, 4.00)
 *   risk index = min(100, round(telemetry x mitigation))
 *   real-time  = baseline EAL x multiplier
 */

import {
  IOC_WEIGHT,
  LIVE_METHODOLOGY_VERSION,
  MITIGATION_EFFECT,
  RISK_BANDS,
  SOC_LIMITS,
  SOC_MULTIPLIER_MAX,
  SOC_MULTIPLIER_MIN,
  STAGE_SCORES,
  STAGE_ORDER,
  VELOCITY_WEIGHT,
  type CalculationTrace,
  type IncidentStage,
  type RealTimeRiskResult,
  type RiskBand,
  type SOCInputState,
} from '@/live/domain/socTypes';

export class SocInputError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(problems.join(' '));
    this.name = 'SocInputError';
    this.problems = problems;
  }
}

export class BaselineEalError extends Error {
  constructor(message = 'Select a valid QuickRisk scenario before using QuickRisk Live.') {
    super(message);
    this.name = 'BaselineEalError';
  }
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Returns every problem found in the input state; an empty array means valid. */
export function validateSocInput(state: SOCInputState): string[] {
  const problems: string[] = [];

  if (!STAGE_ORDER.includes(state.incidentStage)) {
    problems.push('The incident stage is not recognised.');
  }
  if (!isFiniteNumber(state.iocCount) || state.iocCount < SOC_LIMITS.iocCount.min || state.iocCount > SOC_LIMITS.iocCount.max) {
    problems.push(`Matching IOC count must be between ${SOC_LIMITS.iocCount.min} and ${SOC_LIMITS.iocCount.max}.`);
  }
  if (!Number.isInteger(state.iocCount)) {
    problems.push('Matching IOC count must be a whole number.');
  }
  if (
    !isFiniteNumber(state.iocConfidence) ||
    state.iocConfidence < SOC_LIMITS.iocConfidence.min ||
    state.iocConfidence > SOC_LIMITS.iocConfidence.max
  ) {
    problems.push(
      `IOC confidence must be between ${SOC_LIMITS.iocConfidence.min.toFixed(2)} and ${SOC_LIMITS.iocConfidence.max.toFixed(2)}.`,
    );
  }
  if (
    !isFiniteNumber(state.alertVelocity) ||
    state.alertVelocity < SOC_LIMITS.alertVelocity.min ||
    state.alertVelocity > SOC_LIMITS.alertVelocity.max
  ) {
    problems.push(
      `Alert velocity must be between ${SOC_LIMITS.alertVelocity.min.toFixed(1)} and ${SOC_LIMITS.alertVelocity.max.toFixed(1)}.`,
    );
  }
  for (const key of ['isEdrIsolated', 'isNetworkBlocked', 'isIdentityRevoked'] as const) {
    if (typeof state[key] !== 'boolean') {
      problems.push(`The ${key} control state must be true or false.`);
    }
  }

  return problems;
}

/** Maps a risk index to its application-defined band. */
export function bandForRisk(risk: number): RiskBand {
  const safe = clamp(Number.isFinite(risk) ? risk : 0, 0, 100);
  for (const entry of RISK_BANDS) {
    if (safe <= entry.max) {
      return entry.band;
    }
  }

  return 'Critical';
}

/** Decimal places used for monetary values, so stored and displayed values agree. */
const roundMoney = (value: number): number => Math.round(value * 100) / 100;

/**
 * Calculates the Real-Time Risk Index, the SOC Threat Multiplier and the real-time EAL
 * overlay for one synthetic SOC state and one QuickRisk baseline.
 *
 * @throws SocInputError when the state is out of range
 * @throws BaselineEalError when the QuickRisk baseline is missing or not a positive number
 */
export function calculateRealTimeRisk(state: SOCInputState, baselineEal: number): RealTimeRiskResult {
  const problems = validateSocInput(state);
  if (problems.length > 0) {
    throw new SocInputError(problems);
  }
  if (!isFiniteNumber(baselineEal) || baselineEal < 0) {
    throw new BaselineEalError();
  }

  const iocContribution = state.iocCount * IOC_WEIGHT * state.iocConfidence;
  const stageContribution = STAGE_SCORES[state.incidentStage as IncidentStage];
  const velocityContribution = (state.alertVelocity - 1) * VELOCITY_WEIGHT;

  const rawTelemetry = iocContribution + stageContribution + velocityContribution;
  // The telemetry score is bounded to 0–100 so a large IOC count cannot exceed the index range.
  const telemetryScore = clamp(rawTelemetry, 0, 100);

  const edrReduction = state.isEdrIsolated ? MITIGATION_EFFECT.edr : 0;
  const networkReduction = state.isNetworkBlocked ? MITIGATION_EFFECT.network : 0;
  const identityReduction = state.isIdentityRevoked ? MITIGATION_EFFECT.identity : 0;

  const mitigationFactor = (1 - edrReduction) * (1 - networkReduction) * (1 - identityReduction);

  const multiplierUnclamped = 1 + (telemetryScore / 100) * (4 * mitigationFactor - 1);
  const multiplierClamped = clamp(multiplierUnclamped, SOC_MULTIPLIER_MIN, SOC_MULTIPLIER_MAX);

  // Two-decimal rounding keeps the multiplier reproducible in JSON and in MySQL DECIMAL columns.
  const socMultiplier = Math.round(multiplierClamped * 100) / 100;

  const realTimeRisk = Math.min(100, Math.round(telemetryScore * mitigationFactor));
  const riskBand = bandForRisk(realTimeRisk);
  const realTimeEal = roundMoney(baselineEal * socMultiplier);

  const trace: CalculationTrace = {
    iocCount: state.iocCount,
    iocConfidence: state.iocConfidence,
    iocContribution,
    stage: state.incidentStage,
    stageContribution,
    alertVelocity: state.alertVelocity,
    velocityContribution,
    rawTelemetry,
    cappedTelemetry: telemetryScore,
    edrReduction,
    networkReduction,
    identityReduction,
    mitigationFactor,
    multiplierUnclamped,
    multiplierClamped,
    multiplierApplied: socMultiplier,
    realTimeRisk,
    riskBand,
    baselineEal,
    realTimeEal,
  };

  return {
    telemetryScore,
    mitigationFactor,
    socMultiplier,
    realTimeRisk,
    riskBand,
    baselineEal,
    realTimeEal,
    methodologyVersion: LIVE_METHODOLOGY_VERSION,
    trace,
  };
}

/** Active controls, for display. */
export function activeControls(state: SOCInputState): { key: string; label: string; reduction: number }[] {
  const controls: { key: string; label: string; reduction: number }[] = [];
  if (state.isEdrIsolated) {
    controls.push({ key: 'edr', label: 'EDR host isolation', reduction: MITIGATION_EFFECT.edr });
  }
  if (state.isNetworkBlocked) {
    controls.push({ key: 'network', label: 'Network / perimeter blocking', reduction: MITIGATION_EFFECT.network });
  }
  if (state.isIdentityRevoked) {
    controls.push({ key: 'identity', label: 'Identity response', reduction: MITIGATION_EFFECT.identity });
  }

  return controls;
}
