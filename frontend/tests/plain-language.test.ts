import { describe, expect, it } from 'vitest';
import {
  buildPlainSummary,
  CORE_DISCLOSURE,
  DECISION_DISCLOSURE,
  LIVE_DISCLOSURE,
  PERCENTILE_LABELS,
  PRECISION_LABELS,
  precisionFor,
} from '@/content/plainLanguage';
import type { CalculationResponse, ConfidenceLevel } from '@/domain/results';

function response(level: ConfidenceLevel, p90: number, shortLabel: string): CalculationResponse {
  return {
    status: 'ok',
    meta: { currencySymbol: '€' },
    portfolio: {
      label: 'Indicative annual loss',
      expectedAnnualLoss: 1_250_000,
      annualisationNote: '',
      topScenarios: [],
      highestP90: { code: 'S1', name: 'Ransomware', shortLabel, p90 },
      highestProbabilityAboveThreshold: null,
      confidence: {
        score: 62,
        level,
        reasons: [],
        basis: 'heuristic-input-quality',
        isStatisticalConfidence: false,
        displayLabel: '',
        levelCapApplied: false,
        maximumLevelWhenProvisional: 'Medium',
      },
      summary: '',
      jointPercentilesNote: '',
      sensitivity: {
        factors: [],
        factorCount: 0,
        baselineExpectedAnnualLoss: 1_250_000,
        baselineMethod: '',
        method: '',
        note: '',
        truncated: false,
      },
    },
    scenarios: [],
  } as unknown as CalculationResponse;
}

describe('plain-language vocabulary and mapping', () => {
  it('maps percentiles to business words', () => {
    expect(PERCENTILE_LABELS.p10).toBe('best case (1 in 10)');
    expect(PERCENTILE_LABELS.p50).toBe('typical year');
    expect(PERCENTILE_LABELS.p90).toBe('bad year (1 in 10)');
  });

  it('renames confidence levels to precision, keeping the score semantics intact', () => {
    expect(PRECISION_LABELS.High).toBe('Good');
    expect(precisionFor('Medium')).toBe('Moderate');
    expect(precisionFor('Low')).toBe('Rough');
  });

  it('builds a plain summary from the real response fields', () => {
    const summary = buildPlainSummary(response('Medium', 5_000_000, 'Ransomware'), '€');
    expect(summary.expectedAnnualLoss).toBe('€1.3M');
    expect(summary.worstScenarioLabel).toBe('Ransomware');
    expect(summary.worstScenarioBadYear).toBe('€5M');
    expect(summary.precision).toBe('Moderate');
  });

  it('never invents a portfolio-level percentile', () => {
    const summary = buildPlainSummary(response('Low', 5_000_000, 'Ransomware'), '€');
    // The lead sentence is built from the worst single scenario's P90, not a joint percentile.
    expect(summary).not.toHaveProperty('portfolioP50');
    expect(summary).not.toHaveProperty('portfolioP90');
    expect(summary.worstScenarioBadYear).toBe('€5M');
  });

  it('ships complete disclosure mappings for all three surfaces', () => {
    for (const rows of [CORE_DISCLOSURE, LIVE_DISCLOSURE, DECISION_DISCLOSURE]) {
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.business.length).toBeGreaterThan(0);
        expect(row.model.length).toBeGreaterThan(0);
        expect(row.formula.length).toBeGreaterThan(0);
        expect(row.source.length).toBeGreaterThan(0);
      }
    }
  });
});
