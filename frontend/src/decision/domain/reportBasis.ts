/**
 * QuickRisk Decision Lab — report basis.
 *
 * A report describes exactly one analysis. `ReportBasis` is the only input the Board Pack
 * builder accepts, and it is derived from an immutable snapshot, never from live form state.
 */

import type { BoardModelInput, RecommendationState } from '@/decision/board/boardModel';
import type { Portfolio, TreatmentComparison } from '@/decision/domain/decisionTypes';
import {
  sameProvenance,
  type DecisionSnapshot,
  type ReportTarget,
} from '@/decision/domain/analysisSnapshot';

export interface ReportBasis {
  readonly kind: ReportTarget;
  readonly inputKey: string;
  readonly comparison: TreatmentComparison;
  /** Present only when the basis describes a recommended portfolio. */
  readonly portfolio: Portfolio | null;
  /** What the report may claim about a portfolio recommendation. */
  readonly recommendationState: RecommendationState;
}

const sortedTreatmentIds = (comparison: TreatmentComparison): string[] =>
  comparison.treatments.map((treatment) => treatment.id).sort();

const sameIdSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((id, index) => id === right[index]);

/** The basis for a report about the treatment set the user selected. */
export function comparisonBasis(snapshot: DecisionSnapshot): ReportBasis {
  const recommendationState: RecommendationState =
    snapshot.portfolios === null
      ? 'not-evaluated'
      : snapshot.portfolios.noneSatisfies
        ? 'none-satisfies'
        : 'evaluated-other';

  return {
    kind: 'comparison',
    inputKey: snapshot.inputKey,
    comparison: snapshot.comparison,
    portfolio: null,
    recommendationState,
  };
}

/**
 * The basis for a report about the optimizer's recommended portfolio.
 *
 * Returns null unless an exact comparison exists for the recommended subset and it was produced
 * by the same model, versions, seed and iteration count as the portfolio search.
 */
export function recommendedBasis(snapshot: DecisionSnapshot): ReportBasis | null {
  if (snapshot.portfolios === null || snapshot.recommendedComparison === null) {
    return null;
  }

  const recommendedId = snapshot.portfolios.recommendedId;
  if (recommendedId === null) {
    return null;
  }

  const portfolio = snapshot.portfolios.portfolios.find((entry) => entry.id === recommendedId);
  if (portfolio === undefined) {
    return null;
  }

  if (!sameIdSet(sortedTreatmentIds(snapshot.recommendedComparison), [...portfolio.treatmentIds].sort())) {
    return null;
  }

  if (!sameProvenance(snapshot.recommendedComparison.provenance, snapshot.portfolios.provenance)) {
    return null;
  }

  if (
    Math.abs(
      snapshot.recommendedComparison.baseline.expectedAnnualLoss -
        snapshot.portfolios.baseline.expectedAnnualLoss,
    ) > 1.0e-6
  ) {
    return null;
  }

  return {
    kind: 'recommended-portfolio',
    inputKey: snapshot.inputKey,
    comparison: snapshot.recommendedComparison,
    portfolio,
    recommendationState: 'recommended',
  };
}

/** Projects one basis into the Board Pack model. Every number comes from the basis comparison. */
export function boardModelInputFromBasis(
  basis: ReportBasis,
  currencySymbol: string,
  generatedAt: string,
): BoardModelInput {
  const comparison = basis.comparison;
  const title =
    comparison.treatments.length === 0
      ? 'No treatment (baseline)'
      : comparison.treatments.map((treatment) => treatment.name).join(' + ');

  return {
    title,
    currencySymbol,
    generatedAt,
    baseline: comparison.baseline,
    treated: comparison.treated,
    appetiteBaseline: comparison.appetite.baseline,
    appetiteTreated: comparison.appetite.treated,
    initialInvestment: comparison.cost.initialInvestment,
    annualOperatingCost: comparison.cost.annualOperatingCost,
    treatments: comparison.treatments,
    recommended: basis.kind === 'recommended-portfolio' ? basis.portfolio : null,
    recommendationState: basis.recommendationState,
    reductionShare: comparison.delta.reductionShare,
    riskReductionEfficiency: comparison.riskReductionEfficiency,
    implementationDelayDays: comparison.cost.implementationDelayDays,
    clampWarning: comparison.factors.clampWarning,
    clampNotes: comparison.factors.notes,
    provenance: {
      decisionMethodologyVersion: comparison.provenance.decisionMethodologyVersion,
      boardPackVersion: comparison.provenance.boardPackVersion,
      quickriskModelVersion: comparison.provenance.quickriskModelVersion,
      iterations: comparison.provenance.iterations,
      simulationSeed: comparison.provenance.simulationSeed,
      effectModel: comparison.provenance.effectModel,
    },
  };
}
