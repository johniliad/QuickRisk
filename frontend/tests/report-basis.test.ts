import { describe, expect, it } from 'vitest';
import {
  attachPortfolios,
  attachRecommendedComparison,
  selectReportTarget,
  snapshotAfterComparison,
  type DecisionSnapshot,
} from '@/decision/domain/analysisSnapshot';
import {
  boardModelInputFromBasis,
  comparisonBasis,
  recommendedBasis,
} from '@/decision/domain/reportBasis';
import {
  testAppetite,
  testComparison,
  testPortfolio,
  testPortfolioSearch,
  testTreatment,
} from './helpers/decisionFixtures';

const a = testTreatment('a');
const b = testTreatment('b');
const c = testTreatment('c');

const selectedComparison = testComparison({ treatments: [a, b, c], baselineEal: 100000 });
const recommendedComparison = testComparison({
  treatments: [b],
  baselineEal: 100000,
  treatedEal: 70000,
});
const portfolioB = testPortfolio('p-b', [b]);
const search = testPortfolioSearch({
  portfolios: [testPortfolio('p-abc', [a, b, c]), portfolioB],
  recommendedId: 'p-b',
  baselineEal: 100000,
});

const snapshotWithRecommendation = (): DecisionSnapshot => {
  let snapshot = snapshotAfterComparison('key-1', selectedComparison);
  snapshot = attachPortfolios(snapshot, 'key-1', search);
  snapshot = attachRecommendedComparison(snapshot, 'key-1', recommendedComparison);

  return selectReportTarget(snapshot, 'key-1', 'recommended-portfolio');
};

describe('Decision Lab report basis', () => {
  it('describes the recommended subset, not the selected candidates', () => {
    const basis = recommendedBasis(snapshotWithRecommendation());

    expect(basis).not.toBeNull();
    expect(basis?.kind).toBe('recommended-portfolio');
    expect(basis?.comparison.treatments.map((entry) => entry.id)).toEqual(['b']);
    expect(basis?.portfolio?.id).toBe('p-b');
    expect(basis?.recommendationState).toBe('recommended');
  });

  it('projects every report figure from the recommended comparison', () => {
    const basis = recommendedBasis(snapshotWithRecommendation());
    if (basis === null) {
      throw new Error('The fixture must produce a recommended basis.');
    }

    const model = boardModelInputFromBasis(basis, '€', '2026-11-22');
    expect(model.treated.expectedAnnualLoss).toBe(recommendedComparison.treated.expectedAnnualLoss);
    expect(model.treated.p90).toBe(recommendedComparison.treated.p90);
    expect(model.initialInvestment).toBe(10000);
    expect(model.annualOperatingCost).toBe(2000);
    expect(model.treatments.map((entry) => entry.id)).toEqual(['b']);
    expect(model.recommended?.id).toBe('p-b');
    expect(model.recommendationState).toBe('recommended');
  });

  it('rejects a recommended comparison whose treatment set differs from the portfolio', () => {
    let snapshot = snapshotAfterComparison('key-1', selectedComparison);
    snapshot = attachPortfolios(snapshot, 'key-1', search);
    snapshot = attachRecommendedComparison(
      snapshot,
      'key-1',
      testComparison({ treatments: [a], baselineEal: 100000 }),
    );

    expect(recommendedBasis(snapshot)).toBeNull();
  });

  it('rejects a recommended comparison with a different baseline', () => {
    let snapshot = snapshotAfterComparison('key-1', selectedComparison);
    snapshot = attachPortfolios(snapshot, 'key-1', search);
    snapshot = attachRecommendedComparison(
      snapshot,
      'key-1',
      testComparison({ treatments: [b], baselineEal: 90000 }),
    );

    expect(recommendedBasis(snapshot)).toBeNull();
  });

  it('describes the selected set and says no search ran when portfolios are absent', () => {
    const basis = comparisonBasis(snapshotAfterComparison('key-1', selectedComparison));

    expect(basis.kind).toBe('comparison');
    expect(basis.portfolio).toBeNull();
    expect(basis.recommendationState).toBe('not-evaluated');
  });

  it('distinguishes a search that found nothing from one that recommended another set', () => {
    const none = attachPortfolios(
      snapshotAfterComparison('key-1', selectedComparison),
      'key-1',
      testPortfolioSearch({
        portfolios: [testPortfolio('p-none', [], { withinAppetite: false, appetite: testAppetite('above') })],
        recommendedId: null,
        baselineEal: 100000,
        noneSatisfies: true,
      }),
    );
    expect(comparisonBasis(none).recommendationState).toBe('none-satisfies');

    const other = attachPortfolios(
      snapshotAfterComparison('key-1', selectedComparison),
      'key-1',
      search,
    );
    expect(comparisonBasis(other).recommendationState).toBe('evaluated-other');
  });

  it('handles the empty recommended portfolio explicitly', () => {
    const emptyComparison = testComparison({ treatments: [], baselineEal: 100000, treatedEal: 100000 });
    const emptySearch = testPortfolioSearch({
      portfolios: [testPortfolio('p-empty', [])],
      recommendedId: 'p-empty',
      baselineEal: 100000,
    });

    let snapshot = snapshotAfterComparison('key-1', selectedComparison);
    snapshot = attachPortfolios(snapshot, 'key-1', emptySearch);
    snapshot = attachRecommendedComparison(snapshot, 'key-1', emptyComparison);

    const basis = recommendedBasis(snapshot);
    expect(basis).not.toBeNull();
    if (basis === null) {
      throw new Error('The empty portfolio must produce a recommended basis.');
    }
    const model = boardModelInputFromBasis(basis, '€', '2026-11-22');
    expect(model.treatments).toHaveLength(0);
    expect(model.initialInvestment).toBe(0);
    expect(model.treated.expectedAnnualLoss).toBe(model.baseline.expectedAnnualLoss);
    expect(model.title).toBe('No treatment (baseline)');
  });
});
