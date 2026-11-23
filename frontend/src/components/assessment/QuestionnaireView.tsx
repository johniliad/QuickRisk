import { useEffect } from 'react';
import { ProgressIndicator } from '@/components/assessment/ProgressIndicator';
import { QuestionCard } from '@/components/assessment/QuestionCard';
import { PageShell, SectionHeading } from '@/components/layout/SectionHeading';
import { Alert } from '@/components/ui/alert';
import { ASSESSMENT_MEMORY_BANNER } from '@/content/dataLifecycle';
import { answerForStep, questionnaireProgress } from '@/domain/assessment';
import { optionSetFor, publicModel } from '@/model';
import { stepsForScope, useAssessmentStore } from '@/state/assessmentStore';

/**
 * Questionnaire view.
 *
 * Renders one question at a time from the authoritative model. Answers are held in
 * memory; there is no autosave, no resume and no per-answer request. The complete
 * assessment is submitted once, at the end.
 *
 * In a quick check the same component renders the reduced sequence — organisation profile
 * plus one scenario — and states on screen that the other four scenarios will be submitted
 * as Unknown.
 */
export function QuestionnaireView() {
  const stepIndex = useAssessmentStore((state) => state.stepIndex);
  const scope = useAssessmentStore((state) => state.scope);
  const quickScenarioCode = useAssessmentStore((state) => state.quickScenarioCode);
  const organisationAnswers = useAssessmentStore((state) => state.organisationAnswers);
  const scenarioAnswers = useAssessmentStore((state) => state.scenarioAnswers);
  const errorMessage = useAssessmentStore((state) => state.errorMessage);
  const answerCurrentStep = useAssessmentStore((state) => state.answerCurrentStep);
  const nextStep = useAssessmentStore((state) => state.nextStep);
  const previousStep = useAssessmentStore((state) => state.previousStep);
  const dismissError = useAssessmentStore((state) => state.dismissError);

  const steps = stepsForScope(scope, quickScenarioCode);
  const step = steps[stepIndex];
  const progress = questionnaireProgress(steps, organisationAnswers, scenarioAnswers, stepIndex);
  const quickScenario =
    scope === 'quick'
      ? publicModel.scenarios.find((scenario) => scenario.code === quickScenarioCode)?.name ?? null
      : null;


  // Move focus to the question heading when the step changes, so keyboard and
  // screen-reader users are not left at the bottom of the page.
  useEffect(() => {
    if (step === undefined) {
      return;
    }
    const heading = document.getElementById(`${step.key}-heading`);
    heading?.focus({ preventScroll: false });
  }, [step]);

  if (step === undefined) {
    return (
      <PageShell>
        <Alert tone="warning" title="Questionnaire unavailable">
          The questionnaire could not be built from the active model. Please reload the page.
        </Alert>
      </PageShell>
    );
  }

  const isLast = stepIndex === steps.length - 1;

  return (
    <PageShell>
      <SectionHeading
        as="h1"
        eyebrow={step.kind === 'profile' ? 'Organisation profile' : 'Scenario questions'}
        title={step.kind === 'profile' ? 'Your organisation in eight questions' : 'Five scenarios, two questions each'}
        lede={
          <p className="m-0">
            Answer from your organisation's current position rather than an aspiration. If you do not know, choose
            Unknown: the model will widen the range and lower confidence instead of assuming a favourable value.
          </p>
        }
      />

      <div className="mt-6 grid gap-6">
        <ProgressIndicator
          progress={progress}
          stepIndex={stepIndex}
          profileCount={publicModel.profileQuestions.length}
        />

        <Alert tone="neutral" title="Your answers stay in this tab">
          <p className="m-0">{ASSESSMENT_MEMORY_BANNER}</p>
        </Alert>

        {quickScenario === null ? null : (
          <Alert tone="info" title="Quick check — one scenario">
            <p className="m-0">
              This path asks the organisation profile and {quickScenario} only. The other four scenarios are
              submitted as Unknown, which widens their range and lowers the estimate precision rather than
              assuming a value for them.
            </p>
          </Alert>
        )}

        {errorMessage === null ? null : (
          <Alert tone="danger" role="alert" title="The calculation did not complete">
            <p className="m-0">{errorMessage}</p>
            <p className="m-0 mt-2">
              Your answers are still in this page. You can go back, adjust an answer and try again.
            </p>
            <button
              type="button"
              className="mt-2 text-small font-semibold text-accent-strong underline"
              onClick={dismissError}
            >
              Dismiss
            </button>
          </Alert>
        )}

        <QuestionCard
          step={step}
          optionSet={optionSetFor(publicModel, step.optionSet)}
          value={answerForStep(step, organisationAnswers, scenarioAnswers)}
          error={null}
          isLast={isLast}
          onSelect={answerCurrentStep}
          onBack={previousStep}
          onNext={nextStep}
        />
      </div>
    </PageShell>
  );
}
