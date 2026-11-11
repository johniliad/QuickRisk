import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { ExecutiveReport } from '@/live/components/ExecutiveReport';
import { liveApi, LiveApiError, type LiveAssessmentDetail } from '@/live/api/liveClient';
import { useAssessmentStore } from '@/state/assessmentStore';

/**
 * Public, read-only shared assessment.
 *
 * The token in the path identifies exactly one assessment. The page shows only public-safe
 * fields: no session identifier, no private history and no internal database identifiers.
 */
export function SharedAssessmentView({ token }: { token: string }) {
  const setView = useAssessmentStore((state) => state.setView);
  const [assessment, setAssessment] = useState<LiveAssessmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const detail = await liveApi.shared(token);
        if (!cancelled) {
          setAssessment(detail);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof LiveApiError && caught.code === 'NOT_FOUND'
              ? 'This shared assessment is no longer available.'
              : caught instanceof LiveApiError
                ? caught.message
                : 'This shared assessment could not be loaded.',
          );
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="grid gap-6">
      <Alert tone="info" title="Shared QuickRisk Live Assessment — Read Only">
        <p className="m-0">
          This assessment is based on synthetic SOC data and represents an analytical demonstration. It is a
          read-only view of one saved assessment; it does not provide access to any session history and cannot
          be edited.
        </p>
      </Alert>

      {error === null ? null : (
        <Alert tone="warning" title="Shared assessment unavailable">
          <p className="m-0">{error}</p>
          <p className="m-0 mt-2">
            <button
              type="button"
              className="text-small font-semibold text-accent-strong underline"
              onClick={() => setView('landing')}
            >
              Open QuickRisk
            </button>
          </p>
        </Alert>
      )}

      {assessment === null ? null : <ExecutiveReport assessment={assessment} />}
    </div>
  );
}
