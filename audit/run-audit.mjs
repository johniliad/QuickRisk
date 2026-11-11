// Independent audit driver.
// Compares the production baseline with an independently implemented reference model,
// analytic expectations, convergence, Monte Carlo error, sensitivity and extreme cases.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  Mt19937,
  analyticExpectedAnnualLoss,
  buildScenarioInputs,
  defaultProfile,
  defaultScenarioAnswers,
  parameters as referenceParameters,
  simulateAssessment,
  simulateScenario,
  summarise,
  triangular,
  triangularMean,
  triangularVariance,
} from './reference-model.mjs';

const SEED = 20261029;
// The audit compares against the active model version's baseline file.
const baseline = JSON.parse(readFileSync(new URL('../tests/expected/baseline-1.3.0.json', import.meta.url), 'utf8'));
const modelParameters = JSON.parse(readFileSync(new URL('../fairquickmodel/parameters.json', import.meta.url), 'utf8'));
const relativeDifference = (actual, expected) => expected === 0 ? 0 : (actual - expected) / expected;
const profile = { ...defaultProfile };
const answers = defaultScenarioAnswers();
const audit = { generatedAt: new Date().toISOString(), seed: SEED };

// 1. Cross-implementation comparison against the production engine's recorded baseline.
const referenceDefault = simulateAssessment(profile, answers, SEED, 5000);
audit.crossImplementation = referenceDefault.scenarios.map((scenario) => {
  const expected = baseline.scenarios[scenario.code];
  const analytic = analyticExpectedAnnualLoss(scenario.code, profile, answers[scenario.code]);
  return {
    scenario: scenario.code,
    production: {
      expectedAnnualLoss: expected.expectedAnnualLoss,
      p10: expected.p10,
      p50: expected.p50,
      p90: expected.p90,
    },
    reference: {
      expectedAnnualLoss: scenario.statistics.expectedAnnualLoss,
      p10: scenario.statistics.p10,
      p50: scenario.statistics.p50,
      p90: scenario.statistics.p90,
    },
    relativeDifference: {
      expectedAnnualLoss: relativeDifference(scenario.statistics.expectedAnnualLoss, expected.expectedAnnualLoss),
      p10: relativeDifference(scenario.statistics.p10, expected.p10),
      p50: relativeDifference(scenario.statistics.p50, expected.p50),
      p90: relativeDifference(scenario.statistics.p90, expected.p90),
    },
    analyticExpectedAnnualLoss: analytic,
    analyticVsReference: relativeDifference(scenario.statistics.expectedAnnualLoss, analytic),
  };
});
audit.portfolioComparison = {
  production: baseline.portfolio.expectedAnnualLoss,
  reference: referenceDefault.portfolio.expectedAnnualLoss,
  relativeDifference: relativeDifference(referenceDefault.portfolio.expectedAnnualLoss, baseline.portfolio.expectedAnnualLoss),
};

// 2. Convergence: same seed and model, increasing sample size.
audit.convergence = {};
for (const iterations of [1000, 5000, 10000, 50000, 100000]) {
  const result = simulateAssessment(profile, answers, SEED, iterations);
  const s1 = result.scenarios[0].statistics;
  audit.convergence[iterations] = {
    s1: {
      mean: s1.expectedAnnualLoss,
      p10: s1.p10,
      p50: s1.p50,
      p90: s1.p90,
      sd: s1.standardDeviation,
      monteCarloMeanStandardError: s1.standardDeviation / Math.sqrt(iterations),
    },
    portfolioExpectedAnnualLoss: result.portfolio.expectedAnnualLoss,
  };
}

// 3. Monte Carlo sampling error across independent seeds, not just one seed sequence.
audit.monteCarloError = {};
for (const iterations of [5000, 50000]) {
  const replicates = Array.from({ length: 20 }, (_, index) => index).map((index) =>
    simulateScenario('S1', profile, answers.S1, SEED + index * 9973, iterations).statistics,
  );
  const statisticError = (key) => {
    const values = replicates.map((entry) => entry[key]);
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1));
    return { mean: average, standardDeviationAcrossSeeds: sd, min: Math.min(...values), max: Math.max(...values) };
  };
  audit.monteCarloError[iterations] = {
    replicates: replicates.length,
    mean: statisticError('expectedAnnualLoss'),
    p50: statisticError('p50'),
    p90: statisticError('p90'),
  };
}

// 4. Unknown priors: expected value and variance, to test whether they merely widen
// uncertainty or also move the central estimate.
//
// From CAL-1.2 an Unknown answer is an equal-weight mixture over the available answers rather
// than a single wide band, so the mean and variance of the mixture are computed here by the
// law of total variance from the model's own weights.
const unknownInputFor = (group, optionSetBounds) => ({
  kind: 'mixture',
  ...(() => {
    const weights = group.unknownPolicy.weights;
    const components = Object.entries(weights).map(([optionCode, weight]) => ({
      optionCode,
      weight,
      ...group.bands[optionCode],
    }));
    const weightTotal = components.reduce((sum, component) => sum + component.weight, 0);
    const mean = components.reduce(
      (sum, component) => sum + (component.weight / weightTotal) * triangularMean(component),
      0,
    );
    const variance = components.reduce((sum, component) => {
      const weight = component.weight / weightTotal;
      return sum + weight * (triangularVariance(component) + (triangularMean(component) - mean) ** 2);
    }, 0);
    return {
      components,
      min: Math.min(...components.map((component) => component.min)),
      max: Math.max(...components.map((component) => component.max)),
      mode: mean,
      mean,
      variance,
      bounds: optionSetBounds,
    };
  })(),
});

const unknownPolicySummary = (group) => {
  const mixture = unknownInputFor(group);
  const known = Object.entries(group.bands).map(([code, band]) => ({
    code,
    mean: triangularMean(band),
    variance: triangularVariance(band),
  }));
  const knownMeans = known.map((entry) => entry.mean);
  const midRangeMean = knownMeans.reduce((sum, value) => sum + value, 0) / knownMeans.length;

  return {
    policy: group.unknownPolicy.type,
    weights: group.unknownPolicy.weights,
    components: mixture.components,
    mixtureMean: mixture.mean,
    mixtureVariance: mixture.variance,
    mixtureStandardDeviation: Math.sqrt(mixture.variance),
    // Neutrality test: the mixture mean must sit inside the range of the available answers.
    minimumKnownMean: Math.min(...knownMeans),
    maximumKnownMean: Math.max(...knownMeans),
    averageKnownMean: midRangeMean,
    ratioToAverageKnownMean: mixture.mean / midRangeMean,
    insideKnownRange: mixture.mean >= Math.min(...knownMeans) && mixture.mean <= Math.max(...knownMeans),
    known,
    previousBehaviour: group.unknownPolicy.previousBehaviour,
  };
};

audit.unknownPriors = {
  frequency: unknownPolicySummary(modelParameters.frequency),
  impact: unknownPolicySummary(modelParameters.impactMultiplier),
  neutralityVerdict: null,
};
audit.unknownPriors.neutralityVerdict = [
  audit.unknownPriors.frequency.insideKnownRange && audit.unknownPriors.impact.insideKnownRange
    ? 'PASS: both Unknown mixtures keep the central estimate inside the range of the available answers.'
    : 'FAIL: an Unknown mixture moves the central estimate outside the range of the available answers.',
  `Frequency mixture mean / average known mean = ${audit.unknownPriors.frequency.ratioToAverageKnownMean.toFixed(3)}.`,
  `Impact mixture mean / average known mean = ${audit.unknownPriors.impact.ratioToAverageKnownMean.toFixed(3)}.`,
].join(' ');

// 5. One-at-a-time sensitivity with paired random streams (same seed).
audit.sensitivity = {};
const baseS1 = simulateScenario('S1', profile, answers.S1, SEED, 20000).statistics.expectedAnnualLoss;
const sensitivityVariant = (group, value) => {
  const variantProfile = { ...profile };
  const variantAnswers = { ...answers.S1 };
  if (group === 'likelihood' || group === 'impact') variantAnswers[group] = value;
  else variantProfile[group] = value;
  const result = simulateScenario('S1', variantProfile, variantAnswers, SEED, 20000).statistics.expectedAnnualLoss;
  return { value, expectedAnnualLoss: result, ratioToBase: result / baseS1 };
};
const sensitivityGroups = {
  likelihood: ['VERY_UNLIKELY', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'VERY_LIKELY', 'UNKNOWN'],
  impact: ['MINOR', 'MODERATE', 'SIGNIFICANT', 'SEVERE', 'CRITICAL', 'UNKNOWN'],
  QP8: ['LT25K', '25_100K', '100_500K', '500K_2M', '2_10M', 'GT10M', 'UNKNOWN'],
  QP7: ['VERY_LIMITED', 'LIMITED', 'MODERATE', 'STRONG', 'VERY_STRONG', 'UNKNOWN'],
  QP6: ['VERY_LOW', 'LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', 'UNKNOWN'],
  QP4: ['LIMITED', 'MODERATE', 'SIGNIFICANT', 'VERY_SIGNIFICANT', 'CRITICAL', 'UNKNOWN'],
  QP2: ['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', 'EXTREME', 'UNKNOWN'],
  QP3: ['LIMITED', 'MODERATE', 'SIGNIFICANT', 'EXTENSIVE', 'VERY_EXTENSIVE', 'UNKNOWN'],
  QP1: ['LT10M', '10_50M', '50_250M', '250M_1B', 'GT1B', 'UNKNOWN'],
  QP5: ['LOW', 'MODERATE', 'HIGH', 'VERY_HIGH', 'EXTREME', 'UNKNOWN'],
};
for (const [group, values] of Object.entries(sensitivityGroups)) {
  audit.sensitivity[group] = values.map((value) => sensitivityVariant(group, value));
}

// 6. Extreme and pathological cases.
const extremeCases = {
  allMinimum: {
    profile: { QP1: 'LT10M', QP2: 'LOW', QP3: 'LIMITED', QP4: 'LIMITED', QP5: 'LOW', QP6: 'VERY_HIGH', QP7: 'VERY_STRONG', QP8: 'LT25K' },
    answers: defaultScenarioAnswers('VERY_UNLIKELY', 'MINOR'),
  },
  allMaximum: {
    profile: { QP1: 'GT1B', QP2: 'EXTREME', QP3: 'VERY_EXTENSIVE', QP4: 'CRITICAL', QP5: 'EXTREME', QP6: 'VERY_LOW', QP7: 'VERY_LIMITED', QP8: 'GT10M' },
    answers: defaultScenarioAnswers('VERY_LIKELY', 'CRITICAL'),
  },
  allUnknown: {
    profile: Object.fromEntries(Object.keys(profile).map((key) => [key, 'UNKNOWN'])),
    answers: defaultScenarioAnswers('UNKNOWN', 'UNKNOWN'),
  },
  qp8Unknown: {
    profile: { ...profile, QP8: 'UNKNOWN' },
    answers,
  },
};
audit.extremeCases = Object.fromEntries(Object.entries(extremeCases).map(([name, testCase]) => {
  const result = simulateAssessment(testCase.profile, testCase.answers, SEED, 10000);
  return [name, {
    portfolioExpectedAnnualLoss: result.portfolio.expectedAnnualLoss,
    scenarios: result.scenarios.map((scenario) => ({
      code: scenario.code,
      mean: scenario.statistics.expectedAnnualLoss,
      p10: scenario.statistics.p10,
      p50: scenario.statistics.p50,
      p90: scenario.statistics.p90,
      minimum: scenario.statistics.minimum,
      maximum: scenario.statistics.maximum,
      finite: Object.values(scenario.statistics).filter((value) => typeof value === 'number').every(Number.isFinite),
    nonNegative: scenario.statistics.minimum >= 0,
    })),
  }];
}));

// 7. Effect of the widening mean-shift cap (CAL-1.2) on the all-Unknown case.
//
// Widening a right-skewed range raises its mean, so an unbounded widening factor lets an
// Unknown answer inflate the central estimate. This measures the portfolio exposure with the
// model's configured cap and with widening uncapped, for the same seed.
const cappedPortfolio = simulateAssessment(
  extremeCases.allUnknown.profile,
  extremeCases.allUnknown.answers,
  SEED,
  10000,
).portfolio.expectedAnnualLoss;
// Measure the same case with widening effectively uncapped, by temporarily overriding the
// model value. A very large cap means "no bound" rather than "no widening".
const originalCap = referenceParameters.sampling.wideningMeanShiftCap;
referenceParameters.sampling.wideningMeanShiftCap = 1e9;
const uncappedPortfolio = simulateAssessment(
  extremeCases.allUnknown.profile,
  extremeCases.allUnknown.answers,
  SEED,
  10000,
).portfolio.expectedAnnualLoss;
referenceParameters.sampling.wideningMeanShiftCap = originalCap;
audit.wideningMeanShiftCap = {
  configuredCap: modelParameters.sampling.wideningMeanShiftCap ?? null,
  rationale: modelParameters.sampling.wideningMeanShiftCapRationale ?? null,
  allUnknownPortfolioWithCap: cappedPortfolio,
  allUnknownPortfolioWithoutCap: uncappedPortfolio,
  reductionFactor: uncappedPortfolio > 0 ? uncappedPortfolio / cappedPortfolio : null,
  knownAnswerPortfolio: simulateAssessment(profile, answers, SEED, 10000).portfolio.expectedAnnualLoss,
  note: 'The cap only reduces the effective widening factor, so an assessment whose answers are all known is unaffected.',
};

// 8. Alternative annual event-aggregation model. This is a diagnostic, not a
// production change: it shows what changes when each event gets its own severity.
function simulateEventAggregated(scenarioCode, scenarioProfile, scenarioAnswers, seed, iterations) {
  const input = buildScenarioInputs(scenarioCode, scenarioProfile, scenarioAnswers);
  const rng = new Mt19937(seed);
  const annual = [];
  for (let i = 0; i < iterations; i += 1) {
    const tef = triangular(rng, input.tefRange);
    const susceptibility = triangular(rng, input.susceptibilityRange);
    const lambda = tef * susceptibility;
    // Knuth's exact Poisson sampler for the small event rates used here.
    const threshold = Math.exp(-lambda);
    let product = 1;
    let count = 0;
    do {
      count += 1;
      product *= rng.uniform();
    } while (product > threshold && count < 10000);
    const events = Math.max(0, count - 1);
    let annualLoss = 0;
    for (let event = 0; event < events; event += 1) {
      const anchor = triangular(rng, input.anchorRange);
      const impact = triangular(rng, input.impactRange);
      let secondary = 0;
      if (rng.uniform() < triangular(rng, input.secondaryProbabilityRange)) {
        secondary = anchor * triangular(rng, input.secondaryMultiplierRange);
      }
      annualLoss += anchor * impact + secondary;
    }
    annual.push(annualLoss);
  }
  return summarise(annual, {});
}
audit.eventAggregationComparison = {};
for (const [label, likelihood] of [['possible', 'POSSIBLE'], ['veryLikely', 'VERY_LIKELY']]) {
  const scenarioAnswers = { likelihood, impact: 'SIGNIFICANT' };
  const seed = SEED + 104729;
  const production = simulateScenario('S1', profile, scenarioAnswers, seed, 50000).statistics;
  const alternative = simulateEventAggregated('S1', profile, scenarioAnswers, seed, 50000);
  audit.eventAggregationComparison[label] = {
    production: { mean: production.expectedAnnualLoss, p10: production.p10, p50: production.p50, p90: production.p90 },
    eventAggregated: { mean: alternative.expectedAnnualLoss, p10: alternative.p10, p50: alternative.p50, p90: alternative.p90 },
    ratios: {
      mean: alternative.expectedAnnualLoss / production.expectedAnnualLoss,
      p50: alternative.p50 / production.p50,
      p90: alternative.p90 / production.p90,
    },
  };
}

mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
writeFileSync(new URL('./results/reference-audit.json', import.meta.url), JSON.stringify(audit, null, 2));
console.log(JSON.stringify(audit, null, 2));
