import { describe, expect, it } from 'vitest';
import type { ScenarioResult } from '@/domain/results';
import {
  hasZeroExceedance,
  thresholdExceedanceCount,
  thresholdProbability,
  usesUnknownMixture,
} from '@/domain/results';

/**
 * Builds the smallest scenario result the helpers need. Only the fields used by the helpers
 * are populated; the rest of the response contract is covered by the Zod schema tests.
 */
function scenario(overrides: {
  probabilities?: Record<string, number>;
  counts?: Record<string, number>;
  iterations?: number;
  inputs?: Record<string, unknown>;
}): ScenarioResult {
  return {
    statistics: {
      iterations: overrides.iterations ?? 5000,
      thresholdProbabilities: overrides.probabilities ?? {},
      thresholdExceedanceCounts: overrides.counts ?? {},
    },
    inputs: overrides.inputs ?? {},
  } as unknown as ScenarioResult;
}

describe('threshold exceedance reporting', () => {
  it('reads the reported count when the server supplies one', () => {
    const result = scenario({ probabilities: { '1000000': 0.0004 }, counts: { '1000000': 2 } });
    expect(thresholdExceedanceCount(result, 1_000_000)).toBe(2);
    expect(hasZeroExceedance(result, 1_000_000)).toBe(false);
  });

  it('reports zero exceedances as a count of zero trials rather than as impossible', () => {
    const result = scenario({ probabilities: { '5000000': 0 }, counts: { '5000000': 0 } });
    expect(thresholdExceedanceCount(result, 5_000_000)).toBe(0);
    expect(hasZeroExceedance(result, 5_000_000)).toBe(true);
    expect(thresholdProbability(result, 5_000_000)).toBe(0);
  });

  it('falls back to the probability when no count was supplied', () => {
    const result = scenario({ probabilities: { '100000': 0.7668 }, iterations: 5000 });
    expect(thresholdExceedanceCount(result, 100_000)).toBe(3834);
  });

  it('treats a missing threshold as zero without throwing', () => {
    const result = scenario({});
    expect(thresholdExceedanceCount(result, 1_000_000)).toBe(0);
    expect(thresholdProbability(result, 1_000_000)).toBe(0);
  });
});

describe('unknown-answer mixtures', () => {
  it('detects a mixture input', () => {
    const mixture = scenario({
      inputs: {
        threatEventFrequency: { kind: 'mixture', min: 0, mode: 1, max: 10, components: [] },
      },
    });
    expect(usesUnknownMixture(mixture)).toBe(true);
  });

  it('reports no mixture when every input is a direct answer', () => {
    const triangular = scenario({
      inputs: {
        threatEventFrequency: { kind: 'triangular', min: 0.2, mode: 0.5, max: 1, components: [] },
        impactMultiplier: { kind: 'triangular', min: 1, mode: 2.2, max: 5, components: [] },
      },
    });
    expect(usesUnknownMixture(triangular)).toBe(false);
  });
});
