import { describe, expect, it } from 'vitest';
import { probabilityCriterionDisabled, withAnnualLossLimit } from '@/decision/domain/appetite';
import type { Appetite } from '@/decision/domain/decisionTypes';

const base = (overrides: Partial<Appetite> = {}): Appetite => ({
  annualLossLimit: null,
  highEndLimit: null,
  maxExceedanceProbability: null,
  ...overrides,
});

describe('Decision Lab probability appetite', () => {
  it('disables the probability criterion until a positive annual limit exists', () => {
    expect(probabilityCriterionDisabled(base())).toBe(true);
    expect(probabilityCriterionDisabled(base({ annualLossLimit: 0 }))).toBe(true);
    expect(probabilityCriterionDisabled(base({ annualLossLimit: 250000 }))).toBe(false);
  });

  it('clears a previously configured probability when the annual limit is cleared', () => {
    const configured = base({ annualLossLimit: 250000, maxExceedanceProbability: 0.25 });

    expect(withAnnualLossLimit(configured, null).maxExceedanceProbability).toBeNull();
    expect(withAnnualLossLimit(configured, 0).maxExceedanceProbability).toBeNull();
  });

  it('preserves the probability while the annual limit remains valid', () => {
    const configured = base({ annualLossLimit: 250000, maxExceedanceProbability: 0.25 });

    expect(withAnnualLossLimit(configured, 500000)).toEqual({
      annualLossLimit: 500000,
      highEndLimit: null,
      maxExceedanceProbability: 0.25,
    });
  });
});
