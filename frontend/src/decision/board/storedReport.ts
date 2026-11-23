/**
 * Projects a stored decision record into the Board Risk Pack.
 *
 * Shared links and the owner's saved-analysis view both use this projection. It copies the saved
 * values and never recalculates, so a reopened report cannot drift from what was shared.
 */

import type { StoredDecision } from '@/decision/api/decisionClient';
import { buildBoardReport, type BoardReportModel, type RecommendationState } from '@/decision/board/boardModel';

/** The application is single-currency; stored decision records do not carry a symbol. */
const DECISION_CURRENCY_SYMBOL = '€';

export function buildStoredBoardReport(record: StoredDecision): BoardReportModel | null {
  const comparison = record.selection?.comparison;
  if (comparison === undefined) {
    return null;
  }

  const treatments = record.selection?.treatments ?? comparison.treatments ?? [];
  const hasStoredRecommendation = typeof record.recommendedPortfolio?.id === 'string';
  const storedState = record.selection?.reportBasis?.recommendationState;
  const recommendationState: RecommendationState =
    storedState === 'recommended' && !hasStoredRecommendation
      ? 'evaluated-other'
      : (storedState ??
        (hasStoredRecommendation
          ? 'recommended'
          : record.selection?.portfolios === undefined
            ? 'not-evaluated'
            : record.selection.portfolios.noneSatisfies
              ? 'none-satisfies'
              : 'evaluated-other'));

  return buildBoardReport({
    title: record.title === '' ? 'Decision analysis' : record.title,
    currencySymbol: DECISION_CURRENCY_SYMBOL,
    generatedAt: record.createdAt.slice(0, 10),
    baseline: comparison.baseline,
    treated: comparison.treated,
    appetiteBaseline: comparison.appetite.baseline,
    appetiteTreated: comparison.appetite.treated,
    initialInvestment: comparison.cost.initialInvestment,
    annualOperatingCost: comparison.cost.annualOperatingCost,
    treatments,
    recommended:
      recommendationState === 'recommended' && hasStoredRecommendation
        ? (record.recommendedPortfolio ?? null)
        : null,
    recommendationState,
    reductionShare: comparison.delta.reductionShare,
    riskReductionEfficiency: comparison.riskReductionEfficiency,
    implementationDelayDays: comparison.cost.implementationDelayDays,
    clampWarning: comparison.factors.clampWarning,
    clampNotes: comparison.factors.notes,
    provenance: {
      decisionMethodologyVersion: record.decisionMethodologyVersion,
      boardPackVersion: record.boardPackVersion,
      quickriskModelVersion: record.quickriskModelVersion,
      iterations: record.iterations,
      simulationSeed: record.simulationSeed,
      effectModel: comparison.provenance.effectModel,
    },
  });
}
