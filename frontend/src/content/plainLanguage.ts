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
// Percentiles, in business words. Scenario percentiles come from scenario annual
// totals; portfolio percentiles come from jointly simulated annual totals and
// depend on the documented shared-posterior dependence model.
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
    business: 'Indicative annual exposure — €X / year',
    model: 'Posterior-predictive mean annual total loss',
    formula:
      'For each simulated year, draw a Poisson material-event count and per-event severities, sum the event losses, then average across years. The portfolio mean is the sum of scenario means.',
    source: 'portfolio.expectedAnnualLoss — QkPosteriorEngine / server/includes/posterior_engine.php',
  },
  {
    business: 'Typical year — €X',
    model: 'Median annual total for one scenario (P50)',
    formula: 'The middle simulated year: 50% of that scenario’s simulated annual totals are below it, 50% above.',
    source: 'scenario.statistics.p50 — 50th percentile of simulated annual totals',
  },
  {
    business: 'Bad year (1 in 10) — €X',
    model: '90th percentile annual total for one scenario (P90)',
    formula: '10% of that scenario’s simulated years are worse than this.',
    source: 'scenario.statistics.p90 — 90th percentile of simulated annual totals',
  },
  {
    business: 'Worst scenario’s bad-year figure — €X',
    model: 'Largest single-scenario P90',
    formula: 'The highest of the five per-scenario P90 values.',
    source: 'portfolio.highestP90.p90 — largest scenario P90; portfolio.p90 is the separate joint P90',
  },
  {
    business: 'Portfolio bad year (1 in 10) — €X',
    model: 'Joint portfolio P90',
    formula: '10% of jointly simulated portfolio annual totals are worse than this under the documented dependence model.',
    source: 'portfolio.p90 — joint annual totals from shared posterior draws',
  },
  {
    business: 'Chance a single year exceeds €1M',
    model: 'Threshold exceedance probability',
    formula: 'Number of simulated years above the threshold ÷ number of simulated years, with Wilson uncertainty diagnostics.',
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
    model: 'Posterior scenario rate × materiality × event severity',
    formula:
      'Shared posterior draws supply attack frequency, material-loss probability and severity. Annual material-event counts are Poisson; each event severity is sampled from the positive severity distribution.',
    source: 'QkPosteriorEngine: scenario event rate × materiality × per-event severity',
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
    formula: 'real-time = baseline × SOC multiplier, where baseline is the scenario’s indicative annual exposure.',
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
      'Scales the material-event rate and redraws the Poisson count from the same uniform (common random numbers).',
    source: 'treatment.causalEffects.frequency',
  },
  {
    business: 'Reduces the size of a loss by X–Y%',
    model: 'Magnitude treatment effect',
    formula: 'Scales each sampled event severity in the paired annual total.',
    source: 'treatment.causalEffects.magnitude',
  },
  {
    business: 'Within / above appetite',
    model: 'Appetite verdict against the modelled distribution',
    formula:
      'Exposure limit vs indicative annual exposure; high-end limit vs P90; exceedance probability vs the threshold probability.',
    source: 'AppetiteEvaluation.status',
  },
  {
    business: 'Value for money (RRE)',
    model: 'Risk Reduction Efficiency',
    formula:
      '(baseline indicative annual exposure − treated indicative annual exposure) ÷ annualised treatment cost. Not a financial return.',
    source: 'riskReductionEfficiency',
  },
];
