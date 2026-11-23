import { RotateCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LIVE_SESSION_RETENTION_DAYS } from '@/content/dataLifecycle';
import { stepsForScope, useAssessmentStore } from '@/state/assessmentStore';

/**
 * Persistent state line.
 *
 * The visitor previously had no way of knowing what the application was holding: the
 * zero-retention rule was stated in small print, and "Start over" discarded data with no
 * confirmation. This bar states, on every screen, what is currently in the tab, and it
 * exposes the two lifecycle controls (data explanation and discard).
 */
export function SessionStatusBar({
  onStartOver,
  onShowDataHandling,
}: {
  onStartOver: () => void;
  onShowDataHandling: () => void;
}) {
  const view = useAssessmentStore((state) => state.view);
  const scope = useAssessmentStore((state) => state.scope);
  const quickScenarioCode = useAssessmentStore((state) => state.quickScenarioCode);
  const organisationAnswers = useAssessmentStore((state) => state.organisationAnswers);
  const scenarioAnswers = useAssessmentStore((state) => state.scenarioAnswers);
  const results = useAssessmentStore((state) => state.results);

  const totalSteps = stepsForScope(scope, quickScenarioCode).length;
  const answered =
    Object.keys(organisationAnswers).length +
    Object.values(scenarioAnswers).reduce((count, answers) => count + Object.keys(answers).length, 0);
  const hasAnything = answered > 0 || results !== null;

  const message =
    results !== null
      ? 'Results computed in this tab only — not saved.'
      : view === 'calculating'
        ? 'Calculating on the server. Your answers stay in this tab.'
        : answered > 0
          ? `Assessment in progress — ${answered} of ${totalSteps} answered in this tab only.`
          : 'No assessment in this tab.';

  return (
    <div className="border-b border-border bg-canvas">
      <div className="qk-shell flex flex-wrap items-center justify-between gap-2 py-1.5">
        <p className="m-0 max-w-[62rem] text-small text-muted" role="status">
          {message}
          <span className="inline">
            {' '}
            Saved work expires with the anonymous session after {LIVE_SESSION_RETENTION_DAYS} days.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onShowDataHandling}>
            <ShieldCheck aria-hidden="true" className="size-4" />
            How your data works
          </Button>
          <Button variant="ghost" size="sm" onClick={onStartOver} disabled={!hasAnything}>
            <RotateCcw aria-hidden="true" className="size-4" />
            Discard assessment…
          </Button>
        </div>
      </div>
    </div>
  );
}
