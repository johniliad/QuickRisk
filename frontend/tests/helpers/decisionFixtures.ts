/**
 * Test fixtures for the Decision Lab domain tests.
 *
 * These build structurally complete domain objects. They are deliberately plain data: no
 * network, no clock and no random values.
 */

import type {
  AppetiteEvaluation,
  DecisionProvenance,
  DistributionSummary,
  Portfolio,
  PortfolioSearch,
  TreatmentComparison,
  TreatmentDefinition,
} from '@/decision/domain/decisionTypes';

export const testProvenance = (overrides: Partial<DecisionProvenance> = {}): DecisionProvenance => ({
  quickriskModelId: 'FAIR-QK-1.3',
  quickriskModelVersion: '1.3.0',
  decisionMethodologyVersion: '1.0',
  boardPackVersion: '1.0',
  effectModel: 'paired-driver-multiplicative',
  simulationSeed: 20261107,
  inputFingerprint: 'a'.repeat(64),
  iterations: 2000,
  planningHorizonYears: 3,
  sameGroupIndependentCoverage: 0.65,
  generatedAt: '2026-11-22T00:00:00Z',
  ...overrides,
});

export const testSummary = (eal: number, p90 = eal * 2): DistributionSummary => ({
  expectedAnnualLoss: eal,
  p10: eal * 0.4,
  p25: eal * 0.6,
  p50: eal * 0.8,
  p75: eal * 1.2,
  p90,
  minimum: 0,
  maximum: p90 * 2,
  iterations: 2000,
  thresholdProbabilities: { '100000': 0.5 },
  thresholdExceedanceCounts: { '100000': 1000 },
  scenarioContributions: [],
});

export const testAppetite = (status: AppetiteEvaluation['status'] = 'within'): AppetiteEvaluation => ({
  status,
  label:
    status === 'within'
      ? 'Within appetite'
      : status === 'above'
        ? 'Above appetite'
        : 'Risk appetite has not been defined',
  message: '',
  criteria: [],
});

export const testTreatment = (
  id: string,
  overrides: Partial<TreatmentDefinition> = {},
): TreatmentDefinition => ({
  id,
  version: '1.0',
  name: id.toUpperCase(),
  shortDescription: `${id} description`,
  businessOutcome: `${id} outcome`,
  applicableScenarios: ['S1'],
  causalEffects: { frequency: null, magnitude: { min: 0.1, mostLikely: 0.2, max: 0.3 } },
  implementationDelayDays: 30,
  initialCost: { amount: 10000, currency: 'EUR' },
  annualOperatingCost: { amount: 2000, currency: 'EUR' },
  evidenceQuality: 'industry',
  mechanismGroup: 'endpoint',
  interactionDefaults: { sameGroupIndependentCoverage: 0.65 },
  assumptions: ['Assumption'],
  reviewedAt: '2026-11-22',
  reviewOwner: 'Reviewer',
  evidenceReference: 'Reference',
  origin: 'curated',
  enabled: true,
  ...overrides,
});

export const testComparison = (input: {
  readonly treatments: readonly TreatmentDefinition[];
  readonly baselineEal?: number;
  readonly treatedEal?: number;
  readonly p90?: number;
  readonly provenance?: DecisionProvenance;
  readonly appetiteStatus?: AppetiteEvaluation['status'];
}): TreatmentComparison => {
  const baselineEal = input.baselineEal ?? 100000;
  const treatedEal = input.treatedEal ?? baselineEal * 0.8;
  const p90 = input.p90 ?? baselineEal * 2;
  const provenance = input.provenance ?? testProvenance();
  const appetite = testAppetite(input.appetiteStatus ?? 'within');
  const initialInvestment = input.treatments.reduce((sum, entry) => sum + entry.initialCost.amount, 0);
  const annualOperatingCost = input.treatments.reduce(
    (sum, entry) => sum + entry.annualOperatingCost.amount,
    0,
  );
  const annualisedTreatmentCost = annualOperatingCost + initialInvestment / 3;
  const delta = baselineEal - treatedEal;

  return {
    baseline: testSummary(baselineEal, p90),
    treated: testSummary(treatedEal, p90 * 0.8),
    delta: {
      expectedAnnualLoss: delta,
      p90: p90 - p90 * 0.8,
      reductionShare: baselineEal > 0 ? delta / baselineEal : 0,
    },
    appetite: { baseline: appetite, treated: appetite, improved: true },
    cost: {
      initialInvestment,
      annualOperatingCost,
      horizonYears: 3,
      annualisedTreatmentCost,
      implementationDelayDays: Math.max(0, ...input.treatments.map((entry) => entry.implementationDelayDays)),
    },
    delayPhases: {
      implementationDelayDays: 30,
      currentEal: baselineEal,
      transitionYearEal: (baselineEal + treatedEal) / 2,
      steadyStateEal: treatedEal,
      effectiveWithinOneYear: true,
    },
    riskReductionEfficiency: annualisedTreatmentCost > 0 ? delta / annualisedTreatmentCost : null,
    factors: { byScenario: {}, notes: [], clampWarning: false },
    effects: { effects: {}, draws: [] },
    treatments: input.treatments,
    provenance,
  };
};

export const testPortfolio = (
  id: string,
  treatments: readonly TreatmentDefinition[],
  overrides: Partial<Portfolio> = {},
): Portfolio => {
  const initialInvestment = treatments.reduce((sum, entry) => sum + entry.initialCost.amount, 0);
  const annualOperatingCost = treatments.reduce(
    (sum, entry) => sum + entry.annualOperatingCost.amount,
    0,
  );
  const annualisedTreatmentCost = annualOperatingCost + initialInvestment / 3;

  return {
    id,
    treatmentIds: treatments.map((entry) => entry.id),
    cost: {
      initialInvestment,
      annualOperatingCost,
      horizonYears: 3,
      annualisedTreatmentCost,
      implementationDelayDays: Math.max(0, ...treatments.map((entry) => entry.implementationDelayDays)),
    },
    treated: testSummary(80000, 160000),
    deltaEal: 20000,
    reductionShare: 0.2,
    appetite: testAppetite('within'),
    withinAppetite: true,
    constraintViolations: [],
    clampWarning: false,
    label: 'recommended',
    labelText: 'Recommended',
    labelReason: 'Lowest cost',
    ...overrides,
  };
};

export const testPortfolioSearch = (input: {
  readonly portfolios: readonly Portfolio[];
  readonly recommendedId: string | null;
  readonly baselineEal?: number;
  readonly noneSatisfies?: boolean;
  readonly provenance?: DecisionProvenance;
}): PortfolioSearch => ({
  baseline: testSummary(input.baselineEal ?? 100000, (input.baselineEal ?? 100000) * 2),
  portfolios: input.portfolios,
  recommendedId: input.recommendedId,
  paretoIds: input.portfolios.map((entry) => entry.id),
  noneSatisfies: input.noneSatisfies ?? false,
  noneSatisfiesMessage: input.noneSatisfies
    ? 'No evaluated portfolio meets the indicative-exposure criterion within the stated constraints.'
    : '',
  evaluated: input.portfolios.length,
  truncated: false,
  candidatesConsidered: input.portfolios.length,
  appetiteDefined: true,
  portfolioAppetiteDefined: true,
  appetiteBasis: 'expected-annual-loss-only',
  portfolioCriteria: ['annualLoss'],
  excludedCriteria: [],
  notes: [],
  provenance: input.provenance ?? testProvenance(),
});

