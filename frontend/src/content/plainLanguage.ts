/**
 * Plain-language vocabulary and the business ↔ model mapping.
 *
 * Every business phrase shown to an executive resolves to exactly one model quantity.
 * The UI renders the business phrase; the `*_DISCLOSURE` lists below drive the in-app
 * "How these numbers are produced" panel and a test that forbids drift.
 *
 * The calculation engines (`fair_engine.php`, `socRiskEngine.ts`, the Decision Lab
 * backend) are never imported here: this file only *describes* what they produce.
 */

import type { CalculationResponse, ConfidenceLevel } from '@/domain/results';
import { formatMoney } from '@/lib/format';

// ---------------------------------------------------------------------------
// Percentiles, in business words. These are per-scenario figures only: the model
// deliberately exposes no joint portfolio percentile, so "typical/bad year" must
// never be said about the portfolio total.
// ---------------------------------------------------------------------------
export type PercentileKey = 'p10' | 'p50' | 'p90';

export const PERCENTILE_LABELS: Readonly<Record<PercentileKey, string>> = {
  p10: 'best case (1 in 10)',
  p50: 'typical year',
  p90: 'bad year (1 in 10)',
};

export const PERCENTILE_TECHNICAL: Readonly<Record<PercentileKey, string>> = {
  p10: 'P10 · 10th percentile',
  p50: 'P50 · 50th percentile (median)',
  p90: 'P90 · 90th percentile',
};

// ---------------------------------------------------------------------------
// "Confidence" is heuristic input quality, not statistical confidence. The level
// words are renamed for the executive; the /100 score is intentionally unchanged.
// ---------------------------------------------------------------------------
export type PrecisionLevel = 'Good' | 'Moderate' | 'Rough';

export const PRECISION_LABELS: Readonly<Record<ConfidenceLevel, PrecisionLevel>> = {
  High: 'Good',
  Medium: 'Moderate',
  Low: 'Rough',
};

export function precisionFor(level: ConfidenceLevel): PrecisionLevel {
  return PRECISION_LABELS[level];
}

// ---------------------------------------------------------------------------
// The lead sentence. It reads only fields that exist on the response, and it is
// deliberately phrased so it never invents a portfolio-level percentile.
// ---------------------------------------------------------------------------
export interface PlainSummary {
  readonly expectedAnnualLoss: string;
  readonly worstScenarioLabel: string | null;
  readonly worstScenarioBadYear: string | null;
  readonly precision: PrecisionLevel;
}

export function buildPlainSummary(response: CalculationResponse, symbol: string): PlainSummary {
  const { portfolio } = response;

  return {
    expectedAnnualLoss: formatMoney(portfolio.expectedAnnualLoss, symbol),
    worstScenarioLabel: portfolio.highestP90 === null ? null : portfolio.highestP90.shortLabel,
    worstScenarioBadYear: portfolio.highestP90 === null ? null : formatMoney(portfolio.highestP90.p90, symbol),
    precision: precisionFor(portfolio.confidence.level),
  };
}

// ---------------------------------------------------------------------------
// The mapping rendered by the "How these numbers are produced" panel.
// ---------------------------------------------------------------------------
export interface DisclosureRow {
  readonly business: string;
  readonly model: string;
  readonly formula: string;
  readonly source: string;
}

export const CORE_DISCLOSURE: readonly DisclosureRow[] = [
  {
    business: 'Expected annual loss — €X / year',
    model: 'Portfolio mean exposure',
    formula:
      'The five scenarios added together, where each scenario is the mean of (loss-event frequency × loss magnitude) over 5,000 simulated years.',
    source: 'portfolio.expectedAnnualLoss — FAIR engine (server/includes/fair_engine.php)',
  },
  {
    business: 'Typical year — €X',
    model: 'Median exposure for one scenario (P50)',
    formula: 'The middle simulated year: 50% of that scenario’s simulated years are below it, 50% above.',
    source: 'scenario.statistics.p50 — 50th percentile of the Monte Carlo trials',
  },
  {
    business: 'Bad year (1 in 10) — €X',
    model: '90th percentile for one scenario (P90)',
    formula: '10% of that scenario’s simulated years are worse than this.',
    source: 'scenario.statistics.p90 — 90th percentile of the Monte Carlo trials',
  },
  {
    business: 'Worst scenario’s bad-year figure — €X',
    model: 'Largest single-scenario P90',
    formula: 'The highest of the five per-scenario P90 values.',
    source: 'portfolio.highestP90.p90 — no joint portfolio percentile exists, so this is used instead',
  },
  {
    business: 'Chance a single year exceeds €1M',
    model: 'Threshold exceedance probability',
    formula: 'Number of simulated years above the threshold ÷ number of simulated years.',
    source: 'scenario.statistics.thresholdProbabilities[threshold] / thresholdExceedanceCounts',
  },
  {
    business: 'Estimate precision — Good / Moderate / Rough',
    model: 'Heuristic input quality (renamed from High / Medium / Low)',
    formula:
      'Reflects how many answers were left “Unknown” and how wide the resulting range is. Not statistical confidence.',
    source: 'portfolio.confidence.level / score / reasons',
  },
  {
    business: 'How likely · How ready · How costly',
    model: 'Threat-event frequency × susceptibility × loss magnitude',
    formula:
      'How often an attempt occurs × how often it succeeds × (primary loss + a possible knock-on loss).',
    source: 'FAIR engine chain: TEF × susceptibility = loss-event frequency; × loss magnitude = exposure',
  },
];

export const LIVE_DISCLOSURE: readonly DisclosureRow[] = [
  {
    business: 'Risk now — Low / Medium / High / Critical',
    model: 'Risk band of the Real-Time Risk Index',
    formula:
      'Band of min(100, round(telemetry × mitigation)); bands 0–19 Low, 20–44 Medium, 45–74 High, 75–100 Critical.',
    source: 'result.riskBand — socRiskEngine.ts',
  },
  {
    business: 'Exposure €X → €Y with current controls',
    model: 'Baseline exposure vs real-time exposure',
    formula: 'real-time = baseline × SOC multiplier, where baseline is the scenario’s expected annual loss.',
    source: 'result.baselineEal / result.realTimeEal',
  },
  {
    business: '(analyst) SOC multiplier',
    model: 'Threat multiplier applied to the baseline',
    formula: 'clamp(1 + telemetry/100 × (4 × mitigation − 1), 0.20, 4.00).',
    source: 'result.socMultiplier',
  },
  {
    business: '(analyst) Telemetry score',
    model: 'Synthetic signal strength',
    formula: 'min(100, IOC count × 12 × IOC confidence + stage score + (alert velocity − 1) × 10).',
    source: 'result.telemetryScore',
  },
  {
    business: '(analyst) Mitigation factor',
    model: 'Control effectiveness',
    formula: '(1 − EDR)(1 − network)(1 − identity), with EDR 0.75, network 0.5, identity 0.6.',
    source: 'result.mitigationFactor',
  },
];

export const DECISION_DISCLOSURE: readonly DisclosureRow[] = [
  {
    business: 'For consideration / highest value',
    model: 'Portfolio selection',
    formula: 'The non-dominated combination that satisfies your stated appetite and budget.',
    source: 'Decision Lab portfolio rule — server/decision engine',
  },
  {
    business: 'Reduces how often an attempt succeeds by X–Y%',
    model: 'Frequency treatment effect',
    formula:
      'Scales the susceptibility input up or down each simulated year, then reruns the same FAIR chain (common random numbers).',
    source: 'treatment.causalEffects.frequency',
  },
  {
    business: 'Reduces the size of a loss by X–Y%',
    model: 'Magnitude treatment effect',
    formula: 'Scales the loss-magnitude anchor.',
    source: 'treatment.causalEffects.magnitude',
  },
  {
    business: 'Within / above appetite',
    model: 'Appetite verdict against the modelled distribution',
    formula:
      'Annual loss limit vs expected annual loss; high-end limit vs P90; exceedance probability vs the threshold probability.',
    source: 'AppetiteEvaluation.status',
  },
  {
    business: 'Value for money (RRE)',
    model: 'Risk Reduction Efficiency',
    formula:
      '(baseline expected annual loss − treated expected annual loss) ÷ annualised treatment cost. Not a financial return.',
    source: 'riskReductionEfficiency',
  },
];
