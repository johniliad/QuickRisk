/**
 * Calculation response types.
 *
 * Every numeric value rendered by the dashboard, the charts and the report comes
 * from this server response. The browser never performs an authoritative
 * calculation.
 */

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export type DriverUnit = 'events/year' | 'probability' | 'currency';

export interface LossRange {
  readonly min: number;
  readonly mode: number;
  readonly max: number;
}

export type InputKind = 'triangular' | 'mixture';

/** One component of an Unknown-answer mixture, for example LIKELY at 20%. */
export interface MixtureComponent {
  readonly optionCode: string;
  readonly weight: number;
  readonly min: number;
  readonly mode: number;
  readonly max: number;
}

/**
 * A modelled input. `kind` is 'triangular' for a direct answer and 'mixture' when the
 * answer was Unknown, in which case the model samples one of the available answers and
 * `components` lists them. For a mixture, `mode` is the weighted average of the component
 * modes — a representative central value rather than a true mode.
 */
export interface InputRange extends LossRange {
  readonly kind: InputKind;
  readonly components: readonly MixtureComponent[];
}

export interface ConfidenceResult {
  readonly score: number;
  readonly level: ConfidenceLevel;
  readonly reasons: readonly string[];
  /** Always 'heuristic-input-quality'. Input confidence is not statistical confidence. */
  readonly basis: string;
  readonly isStatisticalConfidence: boolean;
  readonly displayLabel: string;
  readonly levelCapApplied: boolean;
  readonly maximumLevelWhenProvisional: string;
}

export interface ScenarioStatistics {
  readonly minimum: number;
  readonly p10: number;
  readonly p25: number;
  readonly p50: number;
  readonly p75: number;
  readonly p90: number;
  readonly maximum: number;
  readonly expectedAnnualLoss: number;
  readonly standardDeviation: number;
  readonly coefficientOfVariation: number;
  readonly expectedThreatEventFrequency: number;
  readonly meanSusceptibility: number;
  readonly expectedLossEventFrequency: number;
  readonly expectedLossMagnitude: number;
  readonly expectedPrimaryLossMagnitude: number;
  readonly expectedSecondaryLossMagnitude: number;
  readonly secondaryLossShare: number;
  readonly secondaryLossOccurrenceRate: number;
  readonly iterations: number;
  readonly thresholdProbabilities: Readonly<Record<string, number>>;
  /** Number of simulated trials that exceeded each threshold. */
  readonly thresholdExceedanceCounts: Readonly<Record<string, number>>;
}

export interface LossDistribution {
  readonly binEdges: readonly number[];
  readonly counts: readonly number[];
  readonly overflowFrom: number;
  readonly overflowCount: number;
  readonly binWidth: number;
}

export interface ScenarioAnswerView {
  readonly questionCode: string;
  readonly questionText: string;
  readonly optionCode: string;
  readonly label: string;
  readonly unknown: boolean;
}

export interface AppliedModifier {
  readonly modifier: string;
  readonly questionCode: string;
  readonly answerCode: string;
  readonly multiplier: number;
  readonly widen: number;
  readonly unknown: boolean;
}

export interface ScenarioDriverValue {
  readonly code: string;
  readonly label: string;
  readonly value: number;
  readonly unit: DriverUnit;
  readonly detail: string;
}

export interface ScenarioInterpretation {
  readonly summary: string;
  readonly rangeStatement: string;
  readonly thresholdStatement: string;
  /** States that percentiles describe an annualised exposure approximation. */
  readonly annualisationStatement: string;
  /** Present when an Unknown answer was modelled as a mixture. */
  readonly unknownStatement: string;
  readonly doesNotMean: string;
  readonly investigationPromptNote: string;
}

export interface ScenarioDriverIndex {
  readonly frequency: number;
  readonly magnitude: number;
  readonly secondary: number;
}

export type LossAnchorSource = 'reported-daily-disruption-cost' | 'derived-from-profile';

export interface ScenarioResult {
  readonly code: string;
  readonly order: number;
  readonly name: string;
  readonly shortLabel: string;
  readonly shortDescription: string;
  readonly statement: string;
  readonly answers: readonly ScenarioAnswerView[];
  readonly inputs: Readonly<Record<string, InputRange>>;
  readonly appliedModifiers: readonly AppliedModifier[];
  readonly lossAnchorSource: LossAnchorSource;
  readonly statistics: ScenarioStatistics;
  readonly distribution: LossDistribution;
  readonly confidence: ConfidenceResult;
  readonly drivers: readonly ScenarioDriverValue[];
  readonly driverIndex: ScenarioDriverIndex;
  readonly interpretation: ScenarioInterpretation;
  readonly investigationPrompts: readonly string[];
}

export interface ResponseMeta {
  readonly applicationVersion: string;
  readonly modelId: string;
  readonly modelVersion: string;
  readonly schemaVersion: string;
  readonly calibrationVersion: string;
  readonly methodologyVersion: string;
  readonly disclaimerVersion: string;
  readonly privacyNoticeVersion: string;
  readonly releaseStatus: string;
  readonly retentionMode: string;
  readonly currency: string;
  readonly currencySymbol: string;
  readonly iterations: number;
  readonly scenarioCount: number;
  readonly calculatedAt: string;
  readonly seedPersisted: boolean;
  readonly seedDisclosed: boolean;
  readonly jointPercentilesAvailable: boolean;
  /** Always 'frequency-times-severity-annualised-exposure' in this model version. */
  readonly annualisationMethod: string;
  /** Always false: the model reports an annualised exposure approximation, not realised totals. */
  readonly realisedAnnualTotalsModelled: boolean;
  readonly annualisationLimitation: string;
  readonly calibrationStatus: string;
}

export interface RankedScenario {
  readonly rank: number;
  readonly code: string;
  readonly name: string;
  readonly shortLabel: string;
  readonly expectedAnnualLoss: number;
  readonly confidence: ConfidenceLevel;
}

export interface HighestP90 {
  readonly code: string;
  readonly name: string;
  readonly shortLabel: string;
  readonly p90: number;
}

export interface HighestThresholdProbability {
  readonly code: string;
  readonly name: string;
  readonly shortLabel: string;
  readonly threshold: number;
  readonly probability: number;
}

export type SensitivityFactorKind = 'profile' | 'scenario';

/**
 * One factor in the one-at-a-time sensitivity analysis of the expected annualised exposure.
 * The model is re-evaluated for every answer option of the factor with all other answers
 * held fixed; `spreadRatio` is the ratio of the highest to the lowest resulting exposure.
 */
export interface SensitivityFactor {
  readonly kind: SensitivityFactorKind;
  readonly questionCode: string;
  readonly scenarioCode: string | null;
  readonly label: string;
  readonly lowOption: string;
  readonly lowExpectedAnnualLoss: number;
  readonly highOption: string;
  readonly highExpectedAnnualLoss: number;
  readonly spreadRatio: number;
  readonly baselineExpectedAnnualLoss: number;
}

export interface SensitivityAnalysis {
  readonly factors: readonly SensitivityFactor[];
  /** Total number of factors assessed, which may exceed the number returned. */
  readonly factorCount: number;
  readonly baselineExpectedAnnualLoss: number;
  readonly baselineMethod: string;
  readonly method: string;
  readonly note: string;
  readonly truncated: boolean;
}

export interface PortfolioSummary {
  readonly label: string;
  readonly expectedAnnualLoss: number;
  /** States that the percentiles are an annualised exposure approximation. */
  readonly annualisationNote: string;
  readonly topScenarios: readonly RankedScenario[];
  readonly highestP90: HighestP90 | null;
  readonly highestProbabilityAboveThreshold: HighestThresholdProbability | null;
  readonly confidence: ConfidenceResult;
  readonly summary: string;
  readonly jointPercentilesNote: string;
  readonly sensitivity: SensitivityAnalysis;
}

export interface CalculationResponse {
  readonly status: 'ok';
  readonly meta: ResponseMeta;
  readonly portfolio: PortfolioSummary;
  readonly scenarios: readonly ScenarioResult[];
}

export function thresholdProbability(
  scenario: ScenarioResult,
  threshold: number,
): number {
  return scenario.statistics.thresholdProbabilities[String(Math.trunc(threshold))] ?? 0;
}

/**
 * Number of simulated trials that exceeded a threshold.
 *
 * Reported alongside the probability so that a zero reads as "no simulated trial exceeded
 * this level in this run" rather than as an impossibility.
 */
export function thresholdExceedanceCount(
  scenario: ScenarioResult,
  threshold: number,
): number {
  const key = String(Math.trunc(threshold));
  const reported = scenario.statistics.thresholdExceedanceCounts[key];
  if (typeof reported === 'number' && Number.isFinite(reported)) {
    return reported;
  }

  return Math.round(thresholdProbability(scenario, threshold) * scenario.statistics.iterations);
}

/** True when no simulated trial exceeded the threshold in this run. */
export function hasZeroExceedance(scenario: ScenarioResult, threshold: number): boolean {
  return thresholdExceedanceCount(scenario, threshold) === 0;
}

/** Finds the modelled input for a driver code, if the server returned one. */
export function inputFor(scenario: ScenarioResult, code: string): InputRange | undefined {
  return scenario.inputs[code];
}

/** True when an Unknown answer was modelled as a mixture for this scenario. */
export function usesUnknownMixture(scenario: ScenarioResult): boolean {
  return Object.values(scenario.inputs).some((input) => input.kind === 'mixture');
}
