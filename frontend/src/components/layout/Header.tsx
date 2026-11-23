import { ExternalLink, History, ShieldCheck } from 'lucide-react';
import { JourneyStepper } from '@/components/layout/JourneyStepper';
import { Button } from '@/components/ui/button';
import { useAssessmentStore } from '@/state/assessmentStore';
import { useViewModeStore } from '@/state/viewModeStore';
import { publicModel } from '@/model';

/**
 * Application header.
 *
 * Two rows with distinct jobs. The first states where the visitor is in the journey
 * (Assess → Results → Explore) and is the only place that offers QuickRisk Live and
 * Decision Lab, so their dependency on a completed assessment is visible. The second is
 * the utility navigation: overview, saved work, methodology, view mode, the mandatory
 * disclaimer and the route back to the main site.
 */
export function Header({
  onStartOver,
  onShowDataHandling,
}: {
  onStartOver: () => void;
  onShowDataHandling: () => void;
}) {
  const view = useAssessmentStore((state) => state.view);
  const setView = useAssessmentStore((state) => state.setView);
  const mode = useViewModeStore((state) => state.mode);
  const toggleMode = useViewModeStore((state) => state.toggleMode);

  const inAssessment = view === 'questionnaire' || view === 'calculating';

  return (
    <header className="border-b border-border bg-paper">
      <div className="qk-shell flex min-h-[82px] flex-wrap items-center justify-between gap-3 py-3">
        <a
          href="https://www.iliadis.net/"
          className="inline-flex items-center gap-3 text-ink no-underline"
          aria-label="iliadis.net — FAIR QuickRisk"
        >
          <span
            aria-hidden="true"
            className="grid size-[42px] place-items-center rounded-control bg-accent-strong text-[0.88rem] font-bold tracking-[0.04em] text-white"
          >
            QR
          </span>
          <span className="grid gap-0.5">
            <span className="text-[1.05rem] font-bold leading-tight">
              FAIR <span className="text-accent-strong">QuickRisk</span>
            </span>
            <span className="text-micro font-medium tracking-[0.07em] text-muted">
              RAPID QUANTITATIVE CYBER-RISK ESTIMATION
            </span>
          </span>
        </a>

        <JourneyStepper />
      </div>

      <div className="border-t border-border bg-paper">
        <div className="qk-shell flex flex-wrap items-center justify-between gap-1 py-1.5">
          <nav aria-label="FAIR QuickRisk" className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setView('landing')}>
              Overview
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setView('history')}>
              <History aria-hidden="true" className="size-4" />
              History
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setView('methodology')}>
              Methodology
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setView('live-methodology')}>
              Live methodology
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleMode} aria-pressed={mode === 'analyst'}>
              {mode === 'executive' ? 'Analyst view' : 'Executive view'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onShowDataHandling}>
              <ShieldCheck aria-hidden="true" className="size-4" />
              Your data
            </Button>
          </nav>

          <div className="flex flex-wrap items-center gap-1">
            {inAssessment ? (
              <Button variant="subtle" size="sm" onClick={onStartOver}>
                Start over
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setView('disclaimer')}>
                <ShieldCheck aria-hidden="true" className="size-4" />
                Disclaimer
              </Button>
            )}
            <a
              className="inline-flex min-h-9 items-center gap-1.5 rounded-control px-3 text-small font-semibold text-muted no-underline hover:bg-accent-soft hover:text-accent-strong"
              href="https://www.iliadis.net/"
            >
              iliadis.net
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          </div>
        </div>
      </div>
      <p className="qk-visually-hidden">
        Model {publicModel.version.modelId} · calibration {publicModel.version.calibrationVersion} ·{' '}
        {publicModel.version.retentionMode} questionnaire
      </p>
    </header>
  );
}
