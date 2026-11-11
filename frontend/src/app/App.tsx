import { lazy, Suspense, useEffect } from 'react';
import { LandingView } from '@/app/LandingView';
import { CalculatingView } from '@/components/assessment/CalculatingView';
import { DisclaimerGate } from '@/components/assessment/DisclaimerGate';
import { QuestionnaireView } from '@/components/assessment/QuestionnaireView';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { PageShell } from '@/components/layout/SectionHeading';
import { MethodologyView } from '@/components/results/MethodologyView';
import { Alert } from '@/components/ui/alert';
import { useAssessmentStore } from '@/state/assessmentStore';
import { publicModel } from '@/model';

/**
 * Result views are loaded on demand so that the landing page and the questionnaire do
 * not carry the charting library in their initial bundle.
 */
const ResultsDashboard = lazy(() =>
  import('@/components/results/ResultsDashboard').then((module) => ({ default: module.ResultsDashboard })),
);
const ScenarioDetailPanel = lazy(() =>
  import('@/components/results/ScenarioDetailPanel').then((module) => ({ default: module.ScenarioDetailPanel })),
);
const ReportView = lazy(() =>
  import('@/components/results/ReportView').then((module) => ({ default: module.ReportView })),
);
const LiveSimulatorView = lazy(() =>
  import('@/live/LiveSimulatorView').then((module) => ({ default: module.LiveSimulatorView })),
);
const LiveHistoryView = lazy(() =>
  import('@/live/LiveHistoryView').then((module) => ({ default: module.LiveHistoryView })),
);
const LiveExecutiveView = lazy(() =>
  import('@/live/LiveExecutiveView').then((module) => ({ default: module.LiveExecutiveView })),
);
const LiveMethodologyView = lazy(() =>
  import('@/live/LiveMethodologyView').then((module) => ({ default: module.LiveMethodologyView })),
);
const DecisionLabView = lazy(() =>
  import('@/decision/DecisionLabView').then((module) => ({ default: module.DecisionLabView })),
);

/**
 * Application shell.
 *
 * Views are held in memory only: there is no client-side router, no route contains
 * assessment data and there is no persistent results URL. Refresh or tab close discards
 * the assessment, which is the documented zero-retention behaviour.
 */
export function App() {
  const view = useAssessmentStore((state) => state.view);
  const results = useAssessmentStore((state) => state.results);
  const selectedScenarioCode = useAssessmentStore((state) => state.selectedScenarioCode);
  const organisationAnswers = useAssessmentStore((state) => state.organisationAnswers);
  const scenarioAnswers = useAssessmentStore((state) => state.scenarioAnswers);
  const selectScenario = useAssessmentStore((state) => state.selectScenario);
  const setView = useAssessmentStore((state) => state.setView);
  const discardAssessment = useAssessmentStore((state) => state.discardAssessment);

  const assessmentInProgress =
    view === 'questionnaire' &&
    (Object.keys(organisationAnswers).length > 0 || Object.keys(scenarioAnswers).length > 0);

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
      default:
        return <LandingView />;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <Header />
      <Suspense
        fallback={
          <PageShell>
            <Alert tone="info" role="status">
              Loading the results view…
            </Alert>
          </PageShell>
        }
      >
        {renderView()}
      </Suspense>
      <Footer />
    </div>
  );
}