import { describe, expect, it } from 'vitest';
import {
  SnapshotKeyMismatchError,
  SnapshotProvenanceMismatchError,
  SnapshotStateError,
  SnapshotFingerprintError,
  attachPortfolios,
  attachRecommendedComparison,
  attachSensitivity,
  sameProvenance,
  selectReportTarget,
  snapshotAfterComparison,
  type DecisionSnapshot,
} from '@/decision/domain/analysisSnapshot';
import type { SensitivityResult } from '@/decision/domain/decisionTypes';
import {
  testComparison,
  testPortfolio,
  testPortfolioSearch,
  testProvenance,
  testTreatment,
} from './helpers/decisionFixtures';

const treatmentA = testTreatment('a');
const comparison = testComparison({ treatments: [treatmentA] });
const portfolioSearch = testPortfolioSearch({
  portfolios: [testPortfolio('p1', [treatmentA])],
  recommendedId: 'p1',
});
const recommendedComparison = testComparison({ treatments: [treatmentA] });
const sensitivity: SensitivityResult = {
  available: true,
  breakEvenEffectiveness: 0.5,
  curve: [],
};

const snapshot = (): DecisionSnapshot => snapshotAfterComparison('key-1', comparison);

describe('Decision Lab analysis snapshot', () => {
  it('starts with exactly one comparison and no other result', () => {
    const value = snapshot();

    expect(value.inputKey).toBe('key-1');
    expect(value.comparison).toBe(comparison);
    expect(value.portfolios).toBeNull();
    expect(value.sensitivity).toBeNull();
    expect(value.recommendedComparison).toBeNull();
    expect(value.reportTarget).toBe('comparison');
  });

  it('rejects a response from another input key without mutating the snapshot', () => {
    const value = snapshot();

    expect(() => attachPortfolios(value, 'key-2', portfolioSearch)).toThrow(SnapshotKeyMismatchError);
    expect(value.portfolios).toBeNull();
  });

  it('attaches portfolios and sensitivity to the same comparison', () => {
    const withPortfolios = attachPortfolios(snapshot(), 'key-1', portfolioSearch);
    const withSensitivity = attachSensitivity(withPortfolios, 'key-1', sensitivity, testProvenance());

    expect(withSensitivity.comparison).toBe(comparison);
    expect(withSensitivity.portfolios).toBe(portfolioSearch);
    expect(withSensitivity.sensitivity).toBe(sensitivity);
  });

  it('replaces the whole snapshot when a new comparison is run', () => {
    const attached = attachPortfolios(snapshot(), 'key-1', portfolioSearch);
    const replacement = snapshotAfterComparison('key-1', recommendedComparison);

    expect(attached.portfolios).not.toBeNull();
    expect(replacement.portfolios).toBeNull();
    expect(replacement.comparison).toBe(recommendedComparison);
  });

  it('requires a portfolio search before a recommended comparison can be attached', () => {
    expect(() => attachRecommendedComparison(snapshot(), 'key-1', recommendedComparison)).toThrow(
      SnapshotStateError,
    );
  });

  it('records a recommended comparison without changing the report target by itself', () => {
    const attached = attachPortfolios(snapshot(), 'key-1', portfolioSearch);
    const withRecommended = attachRecommendedComparison(attached, 'key-1', recommendedComparison);

    expect(withRecommended.recommendedComparison).toBe(recommendedComparison);
    expect(withRecommended.reportTarget).toBe('comparison');

    const selected = selectReportTarget(withRecommended, 'key-1', 'recommended-portfolio');
    expect(selected.reportTarget).toBe('recommended-portfolio');
  });

  it('rejects a portfolio search produced with another seed', () => {
    const other = testPortfolioSearch({
      portfolios: [testPortfolio('p1', [treatmentA])],
      recommendedId: 'p1',
      provenance: testProvenance({ simulationSeed: 999 }),
    });

    expect(() => attachPortfolios(snapshot(), 'key-1', other)).toThrow(SnapshotProvenanceMismatchError);
  });

  it('rejects a comparison without a valid server input fingerprint', () => {
    const comparisonWithoutFingerprint = testComparison({
      treatments: [treatmentA],
      provenance: testProvenance({ inputFingerprint: 'not-a-fingerprint' }),
    });

    expect(() => snapshotAfterComparison('key-1', comparisonWithoutFingerprint)).toThrow(
      SnapshotFingerprintError,
    );
  });

  it('rejects a sensitivity response from another input fingerprint', () => {
    const withPortfolios = attachPortfolios(snapshot(), 'key-1', portfolioSearch);

    expect(() =>
      attachSensitivity(
        withPortfolios,
        'key-1',
        sensitivity,
        testProvenance({ inputFingerprint: 'b'.repeat(64) }),
      ),
    ).toThrow(SnapshotProvenanceMismatchError);
  });

  it('compares provenance on model fields, not the generated timestamp or input fingerprint', () => {
    expect(sameProvenance(testProvenance(), testProvenance({ generatedAt: 'later' }))).toBe(true);
    expect(sameProvenance(testProvenance(), testProvenance({ iterations: 1000 }))).toBe(false);
    expect(
      sameProvenance(testProvenance(), testProvenance({ inputFingerprint: 'b'.repeat(64) })),
    ).toBe(true);
  });
});
