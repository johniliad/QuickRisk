import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ExecutiveReport } from '@/live/components/ExecutiveReport';
import { liveApi, LiveApiError, type LiveAssessmentDetail } from '@/live/api/liveClient';
import { useLiveStore } from '@/live/state/liveStore';
import { useAssessmentStore } from '@/state/assessmentStore';

/**
 * Executive view for a saved assessment.
 *
 * It loads the stored assessment from the PHP API and renders it. No value is recalculated
 * here, so the report always matches what was saved.
 */
export function LiveExecutiveView() {
  const setView = useAssessmentStore((state) => state.setView);
  const currentPublicId = useLiveStore((state) => state.currentPublicId);
  const initSession = useLiveStore((state) => state.initSession);

  const [assessment, setAssessment] = useState<LiveAssessmentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (currentPublicId === null) {
        setError('Save the assessment before opening the executive report.');

        return;
      }
      const csrfToken = await initSession();
      if (csrfToken === null) {
        setError('The anonymous session could not be prepared.');

        return;
      }
      try {
        const detail = await liveApi.getAssessment(currentPublicId, csrfToken);
        if (!cancelled) {
          setAssessment(detail);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof LiveApiError ? caught.message : 'The assessment could not be loaded.');
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [currentPublicId, initSession]);

  return (
    <div className="grid gap-6">
      <div className="qk-no-print flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={() => setView('live')}>
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to the simulator
        </Button>
        <Button size="sm" onClick={() => globalThis.print()} disabled={assessment === null}>
          <Printer aria-hidden="true" className="size-4" />
          Print / save as PDF
        </Button>
      </div>

      {error === null ? null : (
        <Alert tone="info" title="Executive report">
          <p className="m-0">{error}</p>
          <p className="m-0 mt-2">
            <button
              type="button"
              className="text-small font-semibold text-accent-strong underline"
              onClick={() => setView('live')}
            >
              Return to the simulator to save an assessment
            </button>
          </p>
        </Alert>
      )}

      {assessment === null ? null : <ExecutiveReport assessment={assessment} />}
    </div>
  );
}
