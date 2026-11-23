import { BookOpen, ExternalLink, FileText, ShieldCheck } from 'lucide-react';
import { JourneyStepper } from '@/components/layout/JourneyStepper';
import { WorkspaceTabs } from '@/components/layout/WorkspaceTabs';
import { Button } from '@/components/ui/button';
import { useAssessmentStore } from '@/state/assessmentStore';
import { useViewModeStore } from '@/state/viewModeStore';
import { publicModel } from '@/model';

/**
 * Application header.
 *
 * Row one is the workspace: the product mark and the three tabs that own the work
 * (Risk Calculator, Board Brief, Saved Packs). Row two is context and reference: the
 * Assess → Results → Explore stepper, which states the dependency between the screens, and
 * the triggers that open methodology, data handling and the disclaimer as modals.
 *
 * The previous header listed eight equal destinations, so the mandatory disclaimer sat next
 * to a methodology page and a history list, and nothing identified the main workspace.
 */
export function Header({
  onStartOver,
  onShowDataHandling,
  onShowMethodology,
  onShowDisclaimer,
}: {
  onStartOver: () => void;
  onShowDataHandling: () => void;
  onShowMethodology: () => void;
  onShowDisclaimer: () => void;
}) {
  const view = useAssessmentStore((state) => state.view);
  const mode = useViewModeStore((state) => state.mode);
  const toggleMode = useViewModeStore((state) => state.toggleMode);

  const inAssessment = view === 'questionnaire' || view === 'calculating';

  return (
    <header className="border-b border-border bg-paper">
      <div className="qk-shell flex min-h-[72px] flex-wrap items-center justify-between gap-3 py-2.5">
        <a
          href="https://quickrisk.iliadis.net/"
          className="inline-flex items-center gap-3 text-ink no-underline"
          aria-label="FAIR QuickRisk home"
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

        <WorkspaceTabs />
      </div>

      <div className="border-t border-border bg-paper">
        <div className="qk-shell flex flex-wrap items-center justify-between gap-1 py-1">
          <JourneyStepper />

          <div className="flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" onClick={toggleMode} aria-pressed={mode === 'analyst'}>
              {mode === 'executive' ? 'Analyst view' : 'Executive view'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onShowMethodology}>
              <BookOpen aria-hidden="true" className="size-4" />
              Methodology
            </Button>
            <Button variant="ghost" size="sm" onClick={onShowDataHandling}>
              <ShieldCheck aria-hidden="true" className="size-4" />
              Data &amp; privacy
            </Button>
            <Button variant="ghost" size="sm" onClick={onShowDisclaimer}>
              <FileText aria-hidden="true" className="size-4" />
              Disclaimer
            </Button>
            {inAssessment ? (
              <Button variant="subtle" size="sm" onClick={onStartOver}>
                Start over
              </Button>
            ) : null}
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

