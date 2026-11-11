// Independent FAIR QuickRisk reference model.
// Written for the independent audit; it does not import production PHP logic.
// The model parameters are read directly from fairquickmodel/parameters.json.
import { readFileSync } from 'node:fs';

export const parameters = JSON.parse(
  readFileSync(new URL('../fairquickmodel/parameters.json', import.meta.url), 'utf8'),
);

export const UNKNOWN = 'UNKNOWN';

// Independent implementation of the MT19937 generator used by PHP's mt_rand.
// It uses 32-bit integer operations only; no production sampler is reused.
export class Mt19937 {
  constructor(seed) {
    this.state = new Uint32Array(624);
    this.state[0] = seed >>> 0;
    for (let i = 1; i < 624; i += 1) {
      this.state[i] =
        (Math.imul(1812433253, this.state[i - 1] ^ (this.state[i - 1] >>> 30)) + i) >>> 0;
    }
    this.index = 624;
  }

  nextUint32() {
    if (this.index >= 624) {
      for (let i = 0; i < 624; i += 1) {
        const y = (this.state[i] & 0x80000000) | (this.state[(i + 1) % 624] & 0x7fffffff);
        this.state[i] =
          (this.state[(i + 397) % 624] ^ (y >>> 1) ^ ((y & 1) ? 0x9908b0df : 0)) >>> 0;
      }
      this.index = 0;
    }

    let y = this.state[this.index];
    this.index += 1;
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  uniform() {
    return this.nextUint32() / 4294967296;
  }
}

export const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function normaliseRange(minimum, mode, maximum) {
  let min = minimum;
  let max = maximum;
  if (max < min) {
    [min, max] = [max, min];
  }
  if (![min, mode, max].every(Number.isFinite)) {
    throw new Error('A distribution range contains a non-finite value.');
  }
  return { min, mode: clamp(mode, min, max), max };
}

export function triangularMean(range) {
  const { min, mode, max } = normaliseRange(range.min, range.mode, range.max);
  return (min + mode + max) / 3;
}

export function triangularVariance(range) {
  const { min, mode, max } = normaliseRange(range.min, range.mode, range.max);
  return (min ** 2 + mode ** 2 + max ** 2 - min * mode - min * max - mode * max) / 18;
}

export function triangular(rng, range) {
  const { min, mode, max } = normaliseRange(range.min, range.mode, range.max);
  if (max - min <= 1e-12) return min;
  const u = rng.uniform();
  const split = (mode - min) / (max - min);
  const value =
    u < split
      ? min + Math.sqrt(u * (max - min) * (mode - min))
      : max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  return Number.isFinite(value) ? clamp(value, min, max) : mode;
}

export function scaleRange(range, scale) {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1;
  return { min: range.min * factor, mode: range.mode * factor, max: range.max * factor };
}

/**
 * Independent implementation of the Unknown-answer mixture policy (CAL-1.2).
 *
 * The policy is read from the parameter file as `unknownPolicy`: a set of weights over the
 * available answer codes. Each component is scaled and adjusted exactly like a direct answer,
 * and the returned object carries both the components and their envelope. This is deliberately
 * written from the parameter file, not from the production sampler.
 */
export function unknownMixture(group, scale, multiplier, widen, bounds) {
  const weights = group.unknownPolicy?.weights ?? {};
  const components = [];
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let modeTotal = 0;
  let weightTotal = 0;

  for (const [optionCode, weight] of Object.entries(weights)) {
    const band = group.bands[optionCode];
    if (band === undefined || !(weight > 0)) continue;
    const adjusted = applyRange(scaleRange(band, scale), multiplier, widen, bounds);
    components.push({ optionCode, weight, ...adjusted });
    min = Math.min(min, adjusted.min);
    max = Math.max(max, adjusted.max);
    modeTotal += weight * adjusted.mode;
    weightTotal += weight;
  }

  if (components.length === 0) {
    throw new Error('The Unknown-answer mixture policy has no usable components.');
  }

  return {
    kind: 'mixture',
    min,
    max,
    mode: modeTotal / weightTotal,
    components,
  };
}

/** Weighted mean of a mixture or the mean of a triangular range. */
export function inputMean(input) {
  if (input.kind !== 'mixture') return triangularMean(input);
  const weightTotal = input.components.reduce((sum, component) => sum + component.weight, 0);
  const total = input.components.reduce(
    (sum, component) => sum + component.weight * triangularMean(component),
    0,
  );
  return total / weightTotal;
}

/**
 * Law-of-total-variance decomposition for a mixture: the within-component variance plus the
 * between-component variance caused by the components' differing means.
 */
export function inputVariance(input) {
  if (input.kind !== 'mixture') return triangularVariance(input);
  const weightTotal = input.components.reduce((sum, component) => sum + component.weight, 0);
  const overallMean = inputMean(input);
  const total = input.components.reduce((sum, component) => {
    const weight = component.weight / weightTotal;
    return sum + weight * (triangularVariance(component) + (triangularMean(component) - overallMean) ** 2);
  }, 0);
  return total;
}

/** Samples a mixture or a triangular range from an independent random stream. */
export function sampleInput(rng, input) {
  if (input.kind !== 'mixture') return triangular(rng, input);
  const draw = rng.uniform();
  let cumulative = 0;
  for (const component of input.components) {
    cumulative += component.weight;
    if (draw < cumulative) return triangular(rng, component);
  }
  return triangular(rng, input.components[input.components.length - 1]);
}

/**
 * Applies a multiplier and a widening factor, with the model's widening mean-shift cap.
 *
 * Widening a right-skewed range raises its arithmetic mean, so an unbounded widening factor
 * would let an Unknown answer inflate the central estimate instead of only widening the
 * distribution. The cap (sampling.wideningMeanShiftCap) bounds that effect; the effective
 * widening is reduced until the mean constraint holds and is never increased.
 */
export function applyRange(range, multiplier, widen, bounds, meanShiftCap = wideningMeanShiftCap()) {
  const m = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const w = Number.isFinite(widen) && widen >= 1 ? widen : 1;
  const cap = Number.isFinite(meanShiftCap) && meanShiftCap >= 1 ? meanShiftCap : 1;

  const build = (factor) =>
    normaliseRange(
      clamp((range.min * m) / factor, bounds.min, bounds.max),
      clamp(range.mode * m, bounds.min, bounds.max),
      clamp(range.max * m * factor, bounds.min, bounds.max),
    );

  let result = build(1);
  if (w > 1 && cap > 1) {
    const allowedMean = ((result.min + result.mode + result.max) / 3) * cap;
    let effective = w;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const candidate = build(effective);
      const candidateMean = (candidate.min + candidate.mode + candidate.max) / 3;
      result = candidate;
      if (candidateMean <= allowedMean + 1e-9 || effective <= 1) break;
      effective = Math.max(1, 1 + (effective - 1) * 0.85);
    }
  }

  return result;
}

/** The model's configured widening mean-shift cap. */
export function wideningMeanShiftCap() {
  return parameters.sampling.wideningMeanShiftCap ?? 1;
}

function appliesTo(modifier, scenarioCode) {
  return modifier.appliesTo.includes('ALL') || modifier.appliesTo.includes(scenarioCode);
}

function conditionSatisfied(modifier, profile) {
  if (modifier.condition?.questionUnknown) {
    return (profile[modifier.condition.questionUnknown] ?? UNKNOWN) === UNKNOWN;
  }
  return true;
}

export function resolveModifiers(profile, scenarioCode, target) {
  let multiplier = 1;
  let widen = 1;
  const applied = [];
  for (const modifier of parameters.modifiers) {
    if (modifier.target !== target || !appliesTo(modifier, scenarioCode)) continue;
    if (!conditionSatisfied(modifier, profile)) continue;
    const answer = profile[modifier.questionCode] ?? UNKNOWN;
    const answerMultiplier = Number.isFinite(modifier.values[answer]) ? modifier.values[answer] : 1;
    const answerWiden = answer === UNKNOWN ? Math.max(1, modifier.unknownWiden) : 1;
    multiplier *= answerMultiplier;
    widen *= answerWiden;
    applied.push({
      modifier: modifier.code,
      questionCode: modifier.questionCode,
      answerCode: answer,
      multiplier: answerMultiplier,
      widen: answerWiden,
    });
  }
  return { multiplier, widen, applied };
}

export function buildScenarioInputs(scenarioCode, profile, answers) {
  const scaling = parameters.scenarioScaling.scenarios[scenarioCode];
  const clamps = parameters.sampling.clamps;
  const likelihood = answers.likelihood ?? UNKNOWN;
  const impact = answers.impact ?? UNKNOWN;

  const frequencyModifiers = resolveModifiers(profile, scenarioCode, 'threatEventFrequency');
  // An Unknown likelihood answer is an equal-weight mixture over the available answers
  // (CAL-1.2). It widens the range without shifting the central estimate to an extreme.
  const tefInput = likelihood === UNKNOWN
    ? unknownMixture(
        parameters.frequency,
        scaling.frequencyScale,
        frequencyModifiers.multiplier,
        frequencyModifiers.widen,
        clamps.threatEventFrequency,
      )
    : applyRange(
        scaleRange(parameters.frequency.bands[likelihood], scaling.frequencyScale),
        frequencyModifiers.multiplier,
        frequencyModifiers.widen,
        clamps.threatEventFrequency,
      );
  const tefRange = tefInput;

  const susceptibilityModifiers = resolveModifiers(profile, scenarioCode, 'susceptibility');
  const susceptibilityRange = applyRange(
    scaling.susceptibility,
    susceptibilityModifiers.multiplier,
    susceptibilityModifiers.widen,
    clamps.susceptibility,
  );

  const anchorAnswer = profile[parameters.disruptionCostAnchor.questionCode] ?? UNKNOWN;
  const anchorFromFallback = parameters.disruptionCostAnchor.bands[anchorAnswer] === undefined;
  let anchorRange;
  if (anchorFromFallback) {
    const fallbackModifiers = resolveModifiers(profile, scenarioCode, 'disruptionCostAnchorFallback');
    anchorRange = applyRange(
      parameters.disruptionCostAnchor.fallback,
      fallbackModifiers.multiplier,
      fallbackModifiers.widen,
      clamps.lossMagnitude,
    );
  } else {
    anchorRange = parameters.disruptionCostAnchor.bands[anchorAnswer];
  }
  const lossModifiers = resolveModifiers(profile, scenarioCode, 'primaryLossMagnitude');
  anchorRange = applyRange(anchorRange, lossModifiers.multiplier, lossModifiers.widen, clamps.lossMagnitude);

  // An Unknown impact answer is also an equal-weight mixture over the available answers.
  const impactInput = impact === UNKNOWN
    ? unknownMixture(parameters.impactMultiplier, scaling.impactScale, 1, 1, clamps.impactMultiplier)
    : applyRange(scaleRange(parameters.impactMultiplier.bands[impact], scaling.impactScale), 1, 1, clamps.impactMultiplier);
  const impactRange = impactInput;

  let secondaryWiden = 1;
  if (impact === UNKNOWN) {
    secondaryWiden *= parameters.secondaryLoss.probabilityWideningWhenImpactUnknown;
  }
  if ((profile.QP7 ?? UNKNOWN) === UNKNOWN) {
    secondaryWiden *= parameters.secondaryLoss.probabilityWideningWhenControlMaturityUnknown;
  }
  const secondaryModifiers = resolveModifiers(profile, scenarioCode, 'secondaryLossProbability');
  const secondaryProbabilityRange = applyRange(
    scaling.secondaryLossProbability,
    secondaryModifiers.multiplier,
    secondaryModifiers.widen * secondaryWiden,
    clamps.secondaryLossProbability,
  );

  const secondaryMultiplierRange = applyRange(
    scaling.secondaryLossMultiplier,
    1,
    1,
    clamps.impactMultiplier,
  );

  return {
    scenarioCode,
    tefRange,
    susceptibilityRange,
    anchorRange,
    impactRange,
    secondaryProbabilityRange,
    secondaryMultiplierRange,
    anchorFromFallback,
    likelihoodUnknown: likelihood === UNKNOWN,
    impactUnknown: impact === UNKNOWN,
  };
}

function percentile(sorted, probability) {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = clamp(probability, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const fraction = position - lower;
  return sorted[lower] + fraction * (sorted[upper] - sorted[lower]);
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values) {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

export function summarise(values, extra) {
  const sorted = [...values].sort((a, b) => a - b);
  const average = mean(values);
  const sd = standardDeviation(values);
  const thresholds = {};
  for (const threshold of [100000, 500000, 1000000, 5000000, 10000000]) {
    thresholds[threshold] = sorted.filter((value) => value > threshold).length / sorted.length;
  }
  return {
    minimum: sorted[0],
    p10: percentile(sorted, 0.1),
    p25: percentile(sorted, 0.25),
    p50: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    p90: percentile(sorted, 0.9),
    maximum: sorted[sorted.length - 1],
    expectedAnnualLoss: average,
    standardDeviation: sd,
    coefficientOfVariation: average > 0 ? sd / average : 0,
    thresholdProbabilities: thresholds,
    iterations: values.length,
    ...extra,
  };
}

export function simulateScenario(scenarioCode, profile, answers, seed, iterations) {
  const input = buildScenarioInputs(scenarioCode, profile, answers);
  const rng = new Mt19937(seed);
  const annual = [];
  const tefValues = [];
  const susceptibilityValues = [];
  const lefValues = [];
  const primaryValues = [];
  const secondaryValues = [];
  const magnitudeValues = [];
  let secondaryOccurrences = 0;

  for (let i = 0; i < iterations; i += 1) {
    const tef = sampleInput(rng, input.tefRange);
    const susceptibility = triangular(rng, input.susceptibilityRange);
    const lef = tef * susceptibility;
    const anchor = triangular(rng, input.anchorRange);
    const impactMultiplier = sampleInput(rng, input.impactRange);
    const primary = anchor * impactMultiplier;

    const secondaryProbability = triangular(rng, input.secondaryProbabilityRange);
    let secondary = 0;
    if (rng.uniform() < secondaryProbability) {
      secondary = anchor * triangular(rng, input.secondaryMultiplierRange);
      secondaryOccurrences += 1;
    }
    const magnitude = primary + secondary;

    tefValues.push(tef);
    susceptibilityValues.push(susceptibility);
    lefValues.push(lef);
    primaryValues.push(primary);
    secondaryValues.push(secondary);
    magnitudeValues.push(magnitude);
    annual.push(lef * magnitude);
  }

  return {
    code: scenarioCode,
    inputs: input,
    statistics: summarise(annual, {
      expectedThreatEventFrequency: mean(tefValues),
      meanSusceptibility: mean(susceptibilityValues),
      expectedLossEventFrequency: mean(lefValues),
      expectedLossMagnitude: mean(magnitudeValues),
      expectedPrimaryLossMagnitude: mean(primaryValues),
      expectedSecondaryLossMagnitude: mean(secondaryValues),
      secondaryLossShare: mean(magnitudeValues) > 0 ? mean(secondaryValues) / mean(magnitudeValues) : 0,
      secondaryLossOccurrenceRate: secondaryOccurrences / iterations,
    }),
    annualLoss: annual,
  };
}

export function simulateAssessment(profile, scenarioAnswers, seed, iterations, scenarioCodes = ['S1', 'S2', 'S3', 'S4', 'S5']) {
  const scenarios = scenarioCodes.map((code, index) =>
    simulateScenario(code, profile, scenarioAnswers[code] ?? {}, (seed + (index + 1) * 104729) % 2147483647, iterations),
  );
  return {
    scenarios,
    portfolio: {
      expectedAnnualLoss: scenarios.reduce((sum, scenario) => sum + scenario.statistics.expectedAnnualLoss, 0),
    },
  };
}

// Analytic expectation of the exact random process implemented above. Because the
// sampled inputs are independent, expectations factor; the shared anchor affects
// primary and secondary terms but does not invalidate this sum of expectations.
export function analyticExpectedAnnualLoss(scenarioCode, profile, answers) {
  const input = buildScenarioInputs(scenarioCode, profile, answers);
  const tef = inputMean(input.tefRange);
  const susceptibility = triangularMean(input.susceptibilityRange);
  const anchor = triangularMean(input.anchorRange);
  const impact = inputMean(input.impactRange);
  const secondaryProbability = triangularMean(input.secondaryProbabilityRange);
  const secondaryMultiplier = triangularMean(input.secondaryMultiplierRange);
  return tef * susceptibility * (anchor * impact + anchor * secondaryMultiplier * secondaryProbability);
}

/**
 * Analytic standard deviation of the modelled annualised exposure, derived independently by
 * law of total variance over the four sampled factors (frequency, susceptibility, anchor and
 * impact multiplier). Used to check that the reported Monte Carlo percentiles are consistent
 * with the model's own first two moments.
 */
export function analyticMoments(scenarioCode, profile, answers) {
  const input = buildScenarioInputs(scenarioCode, profile, answers);
  const meanTef = inputMean(input.tefRange);
  const meanSusceptibility = triangularMean(input.susceptibilityRange);
  const meanAnchor = triangularMean(input.anchorRange);
  const meanImpact = inputMean(input.impactRange);
  const meanSecondaryProbability = triangularMean(input.secondaryProbabilityRange);
  const meanSecondaryMultiplier = triangularMean(input.secondaryMultiplierRange);

  const meanLef = meanTef * meanSusceptibility;
  const meanMagnitude = meanAnchor * (meanImpact + meanSecondaryMultiplier * meanSecondaryProbability);
  const mean = meanLef * meanMagnitude;

  const varianceTef = inputVariance(input.tefRange);
  const varianceSusceptibility = triangularVariance(input.susceptibilityRange);
  const varianceAnchor = triangularVariance(input.anchorRange);
  const varianceImpact = inputVariance(input.impactRange);

  const secondMomentLef =
    (varianceTef + meanTef ** 2) * (varianceSusceptibility + meanSusceptibility ** 2);

  const magnitudeSecondMoment =
    meanAnchor ** 2 * (meanImpact ** 2 + varianceImpact)
    + 2 * meanAnchor ** 2 * meanImpact * meanSecondaryMultiplier * meanSecondaryProbability
    + meanAnchor ** 2 * (meanSecondaryMultiplier ** 2 + triangularVariance(input.secondaryMultiplierRange))
      * meanSecondaryProbability ** 2
    + meanAnchor ** 2 * meanSecondaryMultiplier ** 2 * meanSecondaryProbability * (1 - meanSecondaryProbability);

  const secondMoment = secondMomentLef * magnitudeSecondMoment;
  const variance = Math.max(0, secondMoment - mean ** 2);

  return {
    mean,
    variance,
    standardDeviation: Math.sqrt(variance),
    coefficientOfVariation: mean > 0 ? Math.sqrt(variance) / mean : 0,
    varianceAnchor,
  };
}

export const defaultProfile = Object.freeze({
  QP1: '50_250M',
  QP2: 'HIGH',
  QP3: 'SIGNIFICANT',
  QP4: 'SIGNIFICANT',
  QP5: 'MODERATE',
  QP6: 'MODERATE',
  QP7: 'MODERATE',
  QP8: '100_500K',
});

export function defaultScenarioAnswers(likelihood = 'POSSIBLE', impact = 'SIGNIFICANT') {
  return Object.fromEntries(
    ['S1', 'S2', 'S3', 'S4', 'S5'].map((code) => [code, { likelihood, impact }]),
  );
}
