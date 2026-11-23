import { Suspense, useEffect, useState } from 'react';
import { LandingView } from '@/app/LandingView';
import { CalculatingView } from '@/components/assessment/CalculatingView';
import { DisclaimerGate } from '@/components/assessment/DisclaimerGate';
import { QuestionnaireView } from '@/components/assessment/QuestionnaireView';
import { DataLifecycleModal } from '@/components/layout/DataLifecycleModal';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { PageShell } from '@/components/layout/SectionHeading';
import { SessionStatusBar } from '@/components/layout/SessionStatusBar';
import { StartOverConfirmModal } from '@/components/layout/StartOverConfirmModal';
import { MethodologyView } from '@/components/results/MethodologyView';
import { Alert } from '@/components/ui/alert';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { ViewLoadingFallback } from '@/components/ui/view-loading-fallback';
import { questionnaireProgress } from '@/domain/assessment';
import { lazyWithRetry } from '@/lib/lazyChunk';
import { questionSteps, useAssessmentStore } from '@/state/assessmentStore';
import { publicModel } from '@/model';

/**
 * Result views are loaded on demand so that the landing page and the questionnaire do
 * not carry the charting library in their initial bundle.
 *
 * `lazyWithRetry` retries a failed chunk once and, if it still fails, throws to the
 * error boundary below, so a chunk that cannot be downloaded is reported instead of
 * leaving the loading notice on screen.
 */
const ResultsDashboard = lazyWithRetry(() =>
  import('@/components/results/ResultsDashboard').then((module) => ({ default: module.ResultsDashboard })),
);
const ScenarioDetailPanel = lazyWithRetry(() =>
  import('@/components/results/ScenarioDetailPanel').then((module) => ({ default: module.ScenarioDetailPanel })),
);
const ReportView = lazyWithRetry(() =>
  import('@/components/results/ReportView').then((module) => ({ default: module.ReportView })),
);
const LiveSimulatorView = lazyWithRetry(() =>
  import('@/live/LiveSimulatorView').then((module) => ({ default: module.LiveSimulatorView })),
);
const LiveHistoryView = lazyWithRetry(() =>
  import('@/live/LiveHistoryView').then((module) => ({ default: module.LiveHistoryView })),
);
const LiveExecutiveView = lazyWithRetry(() =>
  import('@/live/LiveExecutiveView').then((module) => ({ default: module.LiveExecutiveView })),
);
const LiveMethodologyView = lazyWithRetry(() =>
  import('@/live/LiveMethodologyView').then((module) => ({ default: module.LiveMethodologyView })),
);
const DecisionLabView = lazyWithRetry(() =>
  import('@/decision/DecisionLabView').then((module) => ({ default: module.DecisionLabView })),
);
const DecisionHistoryView = lazyWithRetry(() =>
  import('@/decision/DecisionHistoryView').then((module) => ({ default: module.DecisionHistoryView })),
);
const UnifiedHistoryView = lazyWithRetry(() =>
  import('@/history/UnifiedHistoryView').then((module) => ({ default: module.UnifiedHistoryView })),
);

/**
 * Starts downloading the result chunks while the calculation is still running.
 *
 * The result view is the one place where the visitor waits twice — once for the
 * simulation and once for the charting chunk. Fetching the chunk during the
 * calculation means the results usually render as soon as the response arrives, and it
 * keeps the largest download off the critical path. Failures are ignored here: the
 * real load in the view reports them.
 */
function preloadResultViews(): void {
  // Rejections are handled by the real load in the view; here they must not surface as
  // unhandled promise rejections, so each preload absorbs its own failure.
  void import('@/components/results/ResultsDashboard').catch(() => undefined);
  void import('@/components/results/ScenarioDetailPanel').catch(() => undefined);
  void import('@/components/results/ReportView').catch(() => undefined);
}

/**
 * Application shell.
 *
 * Views are held in memory only: there is no client-side router, no route contains
 * assessment data and there is no persistent results URL. Refresh or tab close discards
 * the assessment, which is the documented zero-retention behaviour.
 */
export function App() {
  const view = useAssessmentStore((state) => state.view);
  const status = useAssessmentStore((state) => state.status);
  const results = useAssessmentStore((state) => state.results);
  const selectedScenarioCode = useAssessmentStore((state) => state.selectedScenarioCode);
  const organisationAnswers = useAssessmentStore((state) => state.organisationAnswers);
  const scenarioAnswers = useAssessmentStore((state) => state.scenarioAnswers);
  const selectScenario = useAssessmentStore((state) => state.selectScenario);
  const setView = useAssessmentStore((state) => state.setView);
  const discardAssessment = useAssessmentStore((state) => state.discardAssessment);

  const assessmentInProgress =
    (view === 'questionnaire' || view === 'calculating') &&
    (Object.keys(organisationAnswers).length > 0 || Object.keys(scenarioAnswers).length > 0);

  // Lifecycle dialogs. Both are driven from the header and from the persistent status
  // bar, so they live in the shell rather than in a single screen.
  const [startOverOpen, setStartOverOpen] = useState(false);
  const [dataHandlingOpen, setDataHandlingOpen] = useState(false);

  const answered = questionnaireProgress(questionSteps, organisationAnswers, scenarioAnswers, 0).answered;
  const hasAnswers = Object.keys(organisationAnswers).length > 0 || Object.keys(scenarioAnswers).length > 0;

  // Warn before an accidental refresh or close while answers exist in memory only.
  useEffect(() => {
    if (!assessmentInProgress) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    globalThis.addEventListener('beforeunload', handleBeforeUnload);
    return () => globalThis.removeEventListener('beforeunload', handleBeforeUnload);
  }, [assessmentInProgress]);

  // Fetch the result chunks while the simulation runs, not after it. The visitor then
  // waits once instead of twice, and a slow download no longer strands the results view
  // behind the loading notice after the calculation has already finished.
  useEffect(() => {
    if (status === 'calculating') {
      preloadResultViews();
    }
  }, [status]);

  const renderView = () => {
    if (view === 'results' || view === 'scenario-detail' || view === 'report') {
      if (results === null) {
        return (
          <PageShell>
            <Alert tone="info" title="No assessment in memory">
              <p className="m-0">
                Results exist only while this page is open. Start a new assessment to produce a fresh indicative
                estimate.
              </p>
              <p className="m-0 mt-2">
                <button
                  type="button"
                  className="text-small font-semibold text-accent-strong underline"
                  onClick={() => setView('disclaimer')}
                >
                  Go to the disclaimer and start
                </button>
              </p>
            </Alert>
          </PageShell>
        );
      }

      if (view === 'report') {
        return (
          <PageShell>
            <ReportView response={results} onBack={() => setView('results')} />
          </PageShell>
        );
      }

      if (view === 'scenario-detail') {
        const scenario =
          results.scenarios.find((entry) => entry.code === selectedScenarioCode) ?? results.scenarios[0];
        if (scenario === undefined) {
          return null;
        }
        return (
          <PageShell>
            <ScenarioDetailPanel
              scenario={scenario}
              thresholds={publicModel.version.lossThresholds}
              symbol={results.meta.currencySymbol === '' ? publicModel.version.currencySymbol : results.meta.currencySymbol}
              onBack={() => setView('results')}
            />
          </PageShell>
        );
      }

      return (
        <PageShell>
          <div className="grid gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">
                Indicative results
              </p>
              <button
                type="button"
                className="text-small font-semibold text-accent-strong underline"
                onClick={() => setView('report')}
              >
                Open the printable report
              </button>
            </div>
            <ResultsDashboard
              response={results}
              onSelectScenario={selectScenario}
              onRestart={discardAssessment}
              onOpenLive={() => setView('live')}
              onOpenDecisionLab={() => setView('decision-lab')}
            />
          </div>
        </PageShell>
      );
    }

    switch (view) {
      case 'disclaimer':
        return <DisclaimerGate />;
      case 'questionnaire':
        return <QuestionnaireView />;
      case 'calculating':
        return <CalculatingView />;
      case 'methodology':
        return <MethodologyView />;
      case 'live':
        return (
          <PageShell>
            <LiveSimulatorView />
          </PageShell>
        );
      case 'live-history':
        return (
          <PageShell>
            <LiveHistoryView />
          </PageShell>
        );
      case 'live-executive':
        return (
          <PageShell>
            <LiveExecutiveView />
          </PageShell>
        );
      case 'live-methodology':
        return (
          <PageShell>
            <LiveMethodologyView />
          </PageShell>
        );
      case 'decision-lab':
        return (
          <PageShell>
            <DecisionLabView />
          </PageShell>
        );
      case 'decision-history':
        return (
          <PageShell>
            <DecisionHistoryView />
          </PageShell>
        );
      case 'history':
        return (
          <PageShell>
            <UnifiedHistoryView />
          </PageShell>
        );
      default:
        return <LandingView />;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Header
        onStartOver={() => setStartOverOpen(true)}
        onShowDataHandling={() => setDataHandlingOpen(true)}
      />
      <SessionStatusBar
        onStartOver={() => setStartOverOpen(true)}
        onShowDataHandling={() => setDataHandlingOpen(true)}
      />
      <ErrorBoundary resetKey={view}>
        <Suspense fallback={<ViewLoadingFallback />}>
          {renderView()}
        </Suspense>
      </ErrorBoundary>
      <Footer />

      <DataLifecycleModal
        open={dataHandlingOpen}
        onClose={() => setDataHandlingOpen(false)}
        onStartOver={() => {
          setDataHandlingOpen(false);
          setStartOverOpen(true);
        }}
        onOpenHistory={() => {
          setDataHandlingOpen(false);
          setView('history');
        }}
      />
      <StartOverConfirmModal
        open={startOverOpen}
        answered={answered}
        total={questionSteps.length}
        hasAnswers={hasAnswers}
        hasResults={results !== null}
        onCancel={() => setStartOverOpen(false)}
        onConfirm={() => {
          setStartOverOpen(false);
          discardAssessment();
        }}
      />
    </div>
  );
}