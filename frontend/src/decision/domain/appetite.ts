/**
 * Decision Lab — appetite helpers.
 *
 * A probability-of-exceedance criterion has no meaning without a loss threshold. The UI requires
 * an annual loss limit and clears the probability when that limit is removed; the server enforces
 * the same rule independently.
 */

import type { Appetite } from '@/decision/domain/decisionTypes';

export function probabilityCriterionDisabled(appetite: Appetite): boolean {
  return appetite.annualLossLimit === null || appetite.annualLossLimit <= 0;
}

/** Applies an annual limit, clearing the probability when the threshold is removed. */
export function withAnnualLossLimit(appetite: Appetite, value: number | null): Appetite {
  const hasThreshold = value !== null && value > 0;

  return {
    ...appetite,
    annualLossLimit: value,
    maxExceedanceProbability: hasThreshold ? appetite.maxExceedanceProbability : null,
  };
}
