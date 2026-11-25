import { describe, expect, it } from 'vitest';
import type { StoredDecision } from '@/decision/api/decisionClient';
import { buildStoredBoardReport } from '@/decision/board/storedReport';
import {
  testComparison,
  testPortfolio,
  testPortfolioSearch,
  testTreatment,
} from './helpers/decisionFixtures';

const treatment = testTreatment('edr');
const comparison = testComparison({ treatments: [treatment] });
const portfolio = testPortfolio('portfolio-1', [treatment]);

const record = (overrides: Partial<StoredDecision> = {}): StoredDecision => ({
  publicId: 'SAVEDDECISION00000000000',
  title: 'Ransomware treatment decision',
  appetiteStatus: 'above',
  baselineEal: comparison.baseline.expectedAnnualLoss,
  treatedEal: comparison.treated.expectedAnnualLoss,
  initialInvestment: comparison.cost.initialInvestment,
  annualOperatingCost: comparison.cost.annualOperatingCost,
  decisionMethodologyVersion: '1.0',
  boardPackVersion: '1.0',
  quickriskModelId: 'FAIR-QK-1.3',
  quickriskModelVersion: '1.3.0',
  simulationSeed: 20261107,
  iterations: 2000,
  status: 'saved',
  createdAt: '2026-11-22T10:00:00Z',
  selection: {
    treatments: [treatment],
    comparison,
    portfolios: testPortfolioSearch({ portfolios: [portfolio], recommendedId: portfolio.id }),
    reportBasis: {
      kind: 'comparison',
      inputKey: 'stored-input-key',
      recommendationState: 'not-evaluated',
      treatmentIds: [treatment.id],
    },
  },
  ...overrides,
});

describe('stored Decision Lab report projection', () => {
  it('replays the stored comparison and metadata without recalculating', () => {
    const report = buildStoredBoardReport(record());

    expect(report).not.toBeNull();
    expect(report?.subtitle).toBe('Ransomware treatment decision');
    expect(report?.generatedAt).toBe('2026-11-22');
    expect(report?.pages).toHaveLength(5);
    expect(report?.pages[0].metrics[0].value).toBe(comparison.treated.expectedAnnualLoss);
    expect(report?.pages[0].metrics[0].previousValue).toBe(comparison.baseline.expectedAnnualLoss);
  });

  it('shows a recommendation only when the stored record contains it', () => {
    const withRecommendation = record({
      selection: {
        ...record().selection,
        reportBasis: { recommendationState: 'recommended', kind: 'recommended-portfolio' },
      },
      recommendedPortfolio: portfolio,
    });
    const report = buildStoredBoardReport(withRecommendation);

    expect(report?.recommendation).not.toBeNull();
    expect(report?.recommendation?.names).toEqual([treatment.name]);
  });

  it('fails closed when a recommended state has no stored portfolio', () => {
    const inconsistent = record({
      selection: {
        ...record().selection,
        reportBasis: { recommendationState: 'recommended', kind: 'recommended-portfolio' },
      },
      recommendedPortfolio: undefined,
    });
    const report = buildStoredBoardReport(inconsistent);

    expect(report?.recommendation).toBeNull();
    expect(report?.pages[3].narrative).toContain('different combination was recommended');
  });

  it('distinguishes none-satisfies, evaluated-other and not-evaluated', () => {
    const none = buildStoredBoardReport(
      record({
        selection: {
          ...record().selection,
          portfolios: testPortfolioSearch({
            portfolios: [portfolio],
            recommendedId: null,
            noneSatisfies: true,
          }),
          reportBasis: { recommendationState: 'none-satisfies' },
        },
      }),
    );
    const other = buildStoredBoardReport(
      record({
        selection: {
          ...record().selection,
          reportBasis: { recommendationState: 'evaluated-other' },
        },
      }),
    );
    const notEvaluated = buildStoredBoardReport(
      record({
        selection: {
          treatments: [treatment],
          comparison,
          reportBasis: { recommendationState: 'not-evaluated' },
        },
      }),
    );

    expect(none?.recommendation).toBeNull();
    expect(none?.pages[3].narrative).toContain('No evaluated portfolio meets the indicative-exposure criterion');
    expect(other?.pages[3].narrative).toContain('different combination was recommended');
    expect(notEvaluated?.pages[3].narrative).toContain('No portfolio search has been performed');
  });

  it('falls back to the comparison treatments and keeps the custom-origin label', () => {
    const custom = testTreatment('custom-definition-hash', { origin: 'custom' });
    const customComparison = testComparison({ treatments: [custom] });
    const report = buildStoredBoardReport(
      record({
        selection: {
          comparison: customComparison,
          reportBasis: { recommendationState: 'not-evaluated' },
        },
      }),
    );

    expect(report?.pages[2].treatments[0].origin).toBe('custom');
    expect(report?.pages[2].treatments[0].name).toBe(custom.name);
  });

  it('returns null when no comparison was stored', () => {
    const report = buildStoredBoardReport(
      record({
        selection: {
          reportBasis: { recommendationState: 'not-evaluated' },
        },
      }),
    );

    expect(report).toBeNull();
  });
});
