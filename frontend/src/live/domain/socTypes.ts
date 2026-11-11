/**
 * QuickRisk Live — SOC domain model.
 *
 * These constants are the application-defined parameters of the QuickRisk Live
 * methodology (version 1.0). They are deliberately NOT attributed to FAIR, NIST, CVSS,
 * MITRE ATT&CK or any other standard.
 *
 * Changing any value here is a methodology change: bump LIVE_METHODOLOGY_VERSION, update
 * the tests, the public methodology documentation and the seeded scenario presets.
 */

export const LIVE_METHODOLOGY_VERSION = '1.0';
export const LIVE_PRODUCT_NAME = 'QuickRisk Live';

/** Incident stages acknowledged by the model, in ascending severity order. */
export const STAGE_ORDER = ['none', 'triage', 'anomaly', 'compromise'] as const;
export type IncidentStage = (typeof STAGE_ORDER)[number];

/** Stage scores used by the telemetry formula. */
export const STAGE_SCORES: Readonly<Record<IncidentStage, number>> = {
  none: 0,
  triage: 20,
  anomaly: 45,
  compromise: 75,
};

export const STAGE_LABELS: Readonly<Record<IncidentStage, string>> = {
  none: 'No incident signal',
  triage: 'Triage / alerting',
  anomaly: 'Confirmed anomaly',
  compromise: 'Active compromise',
};

/** Weight applied to each matching IOC observation, before confidence. */
export const IOC_WEIGHT = 12;
/** Weight applied to each unit of alert velocity above 1.0. */
export const VELOCITY_WEIGHT = 10;

/** Modelled exposure reduction of each simulated response control. */
export const MITIGATION_EFFECT = {
  edr: 0.75,
  network: 0.5,
  identity: 0.6,
} as const;

export const SOC_MULTIPLIER_MIN = 0.2;
export const SOC_MULTIPLIER_MAX = 4.0;

/** Application-defined risk bands. */
export type RiskBand = 'Low' | 'Medium' | 'High' | 'Critical';

export const RISK_BANDS: readonly { readonly max: number; readonly band: RiskBand }[] = [
  { max: 19, band: 'Low' },
  { max: 44, band: 'Medium' },
  { max: 74, band: 'High' },
  { max: 100, band: 'Critical' },
];

/** Allowed input ranges, enforced in the browser and again by the PHP API. */
export const SOC_LIMITS = {
  iocCount: { min: 0, max: 15, step: 1 },
  iocConfidence: { min: 0.1, max: 1, step: 0.01 },
  alertVelocity: { min: 1, max: 5, step: 0.1 },
} as const;

export interface SOCInputState {
  /** QuickRisk scenario code (S1–S5) or a scenario-library slug. */
  readonly scenarioId: string;
  readonly incidentStage: IncidentStage;
  readonly iocCount: number;
  readonly iocConfidence: number;
  readonly alertVelocity: number;
  readonly isEdrIsolated: boolean;
  readonly isNetworkBlocked: boolean;
  readonly isIdentityRevoked: boolean;
}

/** Structured, explainable output of the deterministic engine. */
export interface RealTimeRiskResult {
  readonly telemetryScore: number;
  readonly mitigationFactor: number;
  readonly socMultiplier: number;
  readonly realTimeRisk: number;
  readonly riskBand: RiskBand;
  readonly baselineEal: number;
  readonly realTimeEal: number;
  readonly methodologyVersion: string;
  readonly trace: CalculationTrace;
}

/**
 * A risk result as persisted and replayed. The full trace is retained for the calculation
 * that produced it, but older or externally supplied records may carry it as opaque data,
 * which is why the field is loosely typed here.
 */
export interface StoredRiskResult {
  readonly telemetryScore: number;
  readonly mitigationFactor: number;
  readonly socMultiplier: number;
  readonly realTimeRisk: number;
  readonly riskBand: RiskBand;
  readonly baselineEal: number;
  readonly realTimeEal: number;
  readonly methodologyVersion: string;
  readonly trace?: unknown;
}

export interface CalculationTrace {
  readonly iocCount: number;
  readonly iocConfidence: number;
  readonly iocContribution: number;
  readonly stage: IncidentStage;
  readonly stageContribution: number;
  readonly alertVelocity: number;
  readonly velocityContribution: number;
  readonly rawTelemetry: number;
  readonly cappedTelemetry: number;
  readonly edrReduction: number;
  readonly networkReduction: number;
  readonly identityReduction: number;
  readonly mitigationFactor: number;
  readonly multiplierUnclamped: number;
  readonly multiplierClamped: number;
  readonly multiplierApplied: number;
  readonly realTimeRisk: number;
  readonly riskBand: RiskBand;
  readonly baselineEal: number;
  readonly realTimeEal: number;
}

/** A recorded point on the simulation timeline. */
export interface TimelineEntry {
  readonly offsetMs: number;
  readonly label: string;
  readonly state: SOCInputState;
  readonly result: StoredRiskResult;
}

export const DEFAULT_SOC_STATE: SOCInputState = {
  scenarioId: 'S1',
  incidentStage: 'none',
  iocCount: 0,
  iocConfidence: 0.5,
  alertVelocity: 1,
  isEdrIsolated: false,
  isNetworkBlocked: false,
  isIdentityRevoked: false,
};
