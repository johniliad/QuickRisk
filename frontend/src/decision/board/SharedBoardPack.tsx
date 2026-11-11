/**
 * Shared Board Risk Pack — public, read-only.
 *
 * Reads one stored decision analysis by opaque token and renders the five-page report from the
 * values that were saved with it. No calculation happens here (requirements 44, 45, 62, 63).
 */

import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { decisionApi, DecisionApiError, type StoredDecision } from '@/decision/api/decisionClient';
import { BoardRiskPack } from '@/decision/board/BoardRiskPack';
import { buildBoardReport } from '@/decision/board/boardModel';

export function SharedBoardPack({ token }: { token: string }) {
  const [record, setRecord] = useState<StoredDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const loaded = await decisionApi.shared(token);
        if (!cancelled) {
          setRecord(loaded);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof DecisionApiError && caught.code === 'NOT_FOUND'
              ? 'This shared report is no longer available.'
              : caught instanceof DecisionApiError
                ? caught.message
                : 'This shared report could not be loaded.',
          );
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const report = useMemo(() => {
    const comparison = record?.selection?.comparison;
    if (record === null || comparison === undefined) {
      return null;
    }
    const treatments = record.selection?.treatments ?? [];

    return buildBoardReport({
      title: record.title === '' ? 'Decision analysis' : record.title,
      currencySymbol: '€',
      generatedAt: record.createdAt.slice(0, 10),
      baseline: comparison.baseline,
      treated: comparison.treated,
      appetiteBaseline: comparison.appetite.baseline,
      appetiteTreated: comparison.appetite.treated,
      initialInvestment: comparison.cost.initialInvestment,
      annualOperatingCost: comparison.cost.annualOperatingCost,
      treatments,
      recommended: record.recommendedPortfolio === undefined ? null : record.recommendedPortfolio,
      reductionShare: comparison.delta.reductionShare,
      riskReductionEfficiency: comparison.riskReductionEfficiency,
      implementationDelayDays: comparison.cost.implementationDelayDays,
      provenance: {
        decisionMethodologyVersion: record.decisionMethodologyVersion,
        boardPackVersion: record.boardPackVersion,
        quickriskModelVersion: record.quickriskModelVersion,
        iterations: record.iterations,
        simulationSeed: record.simulationSeed,
        effectModel: comparison.provenance.effectModel,
      },
    });
  }, [record]);

  if (error !== null) {
    return (
      <Alert tone="warning" title="Shared report unavailable">
        <p className="m-0">{error}</p>
      </Alert>
    );
  }

  if (report === null) {
    return (
      <p className="m-0" role="status">
        Loading the shared Board Risk Pack…
      </p>
    );
  }

  return <BoardRiskPack report={report} readOnly />;
}
