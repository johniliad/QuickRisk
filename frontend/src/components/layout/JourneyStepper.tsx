import { Check, ChevronRight, Lock } from 'lucide-react';
import { useAssessmentStore } from '@/state/assessmentStore';
import { resolveJourneySteps, type JourneyStep, type JourneyStepStatus } from '@/lib/journey';
import { cn } from '@/lib/cn';

/**
 * The three-step journey: Assess → Results → Explore.
 *
 * The header used to list Overview, Live, Decision Lab, History and Methodology as
 * equal destinations, which left visitors unable to tell that Live and Decision Lab
 * need a completed assessment. The stepper states the order, marks the current step,
 * and disables the two dependent destinations until a baseline exists.
 */
const chipClass: Record<JourneyStepStatus, string> = {
  done: 'border-success/40 bg-success/5 text-heading',
  active: 'border-accent-strong bg-accent-soft text-heading',
  todo: 'border-border bg-paper text-heading',
  locked: 'border-border bg-canvas text-muted',
};

const badgeClass: Record<JourneyStepStatus, string> = {
  done: 'bg-success text-white',
  active: 'bg-accent-strong text-white',
  todo: 'border border-border bg-canvas text-muted',
  locked: 'border border-border bg-canvas text-muted',
};

const statusWord: Record<JourneyStepStatus, string> = {
  done: 'completed',
  active: 'current step',
  todo: 'available',
  locked: 'needs an earlier step',
};

function StepBadge({ step }: { step: JourneyStep }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full text-micro font-bold leading-none',
        badgeClass[step.status],
      )}
    >
      {step.status === 'done' ? (
        <Check className="size-3" />
      ) : step.status === 'locked' ? (
        <Lock className="size-3" />
      ) : (
        step.position
      )}
    </span>
  );
}

export function JourneyStepper() {
  const view = useAssessmentStore((state) => state.view);
  const setView = useAssessmentStore((state) => state.setView);
  const organisationAnswers = useAssessmentStore((state) => state.organisationAnswers);
  const scenarioAnswers = useAssessmentStore((state) => state.scenarioAnswers);
  const results = useAssessmentStore((state) => state.results);

  const hasAnswers =
    Object.keys(organisationAnswers).length > 0 || Object.keys(scenarioAnswers).length > 0;
  const hasResults = results !== null;
  const steps = resolveJourneySteps({ view, hasAnswers, hasResults });

  return (
    <nav aria-label="Assessment journey" className="flex flex-wrap items-center gap-1.5">
      {steps.map((step, index) => (
        <div key={step.key} className="flex items-center gap-1.5">
          {index === 0 ? null : <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted" />}
          <div
            aria-current={step.status === 'active' ? 'step' : undefined}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-control border px-2 py-1 text-small font-semibold',
              chipClass[step.status],
            )}
          >
            <StepBadge step={step} />
            <span>{step.label}</span>
            <span className="qk-visually-hidden"> — {statusWord[step.status]}</span>

            {step.key === 'assess' && step.status === 'todo' && hasAnswers ? (
              <button
                type="button"
                className="ml-0.5 rounded-control px-1.5 py-0.5 text-micro font-bold uppercase tracking-[0.06em] text-accent-strong underline hover:bg-accent-soft"
                onClick={() => setView('questionnaire')}
              >
                Continue assessment
              </button>
            ) : null}

            {step.key === 'results' && step.status === 'done' ? (
              <button
                type="button"
                className="ml-0.5 rounded-control px-1.5 py-0.5 text-micro font-bold uppercase tracking-[0.06em] text-accent-strong underline hover:bg-accent-soft"
                onClick={() => setView('results')}
              >
                Results
              </button>
            ) : null}

            {step.key === 'explore' ? (
              <span className="flex items-center gap-1">
                <span className="qk-visually-hidden">Two independent branches:</span>
                <button
                  type="button"
                  title={
                    hasResults
                      ? 'Branch A — quickrisk live: overlay synthetic SOC evidence on this assessment'
                      : 'Complete the assessment to unlock QuickRisk Live (SOC overlay)'
                  }
                  className="rounded-control border border-accent-strong/40 px-1.5 py-0.5 text-micro font-bold uppercase tracking-[0.06em] text-accent-strong hover:bg-accent-soft"
                  onClick={() => setView('live')}
                >
                  Live
                </button>
                <span aria-hidden="true" className="text-micro font-bold text-muted">
                  │
                </span>
                <button
                  type="button"
                  title={
                    hasResults
                      ? 'Branch B — decision lab: compare risk treatments against this assessment'
                      : 'Complete the assessment to unlock Decision Lab (treatment comparison)'
                  }
                  className="rounded-control border border-accent-strong/40 px-1.5 py-0.5 text-micro font-bold uppercase tracking-[0.06em] text-accent-strong hover:bg-accent-soft"
                  onClick={() => setView('decision-lab')}
                >
                  Decision Lab
                </button>
              </span>
            ) : null}
          </div>
        </div>
      ))}
      {hasResults ? null : (
        <span className="text-micro text-muted">Complete the assessment to unlock both tools; each screen explains what it needs.</span>
      )}
    </nav>
  );
}
