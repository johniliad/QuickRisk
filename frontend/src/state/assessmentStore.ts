/**
 * Assessment state.
 *
 * Zustand is used WITHOUT any persistence middleware. The entire assessment lives
 * in JavaScript memory for the lifetime of the page: there is no browser storage,
 * no cookie, no URL state, no autosave and no resume. Refreshing or closing the page
 * intentionally discards everything, which is the documented behaviour.
 */

import { create } from 'zustand';
import { publicModel } from '../../shared/publicModel';
import type { CalculationRequest, OrganisationAnswers, ScenarioAnswers } from '@/domain/answers';
import { EMPTY_ORGANISATION_EVIDENCE, type OrganisationEvidence } from '@/domain/evidence';
import {
  activeStepsFor,
  answerForStep,
  buildQuestionSteps,
  type AssessmentScope,
  type QuestionStep,
  type View,
} from '@/domain/assessment';
import type { CalculationResponse } from '@/domain/results';
import { buildSampleAssessment } from '@/content/sampleAssessment';
import { CalculationError, describeCalculationError, requestCalculation } from '@/api/calculate';

export type AssessmentStatus = 'idle' | 'calculating' | 'ready' | 'error';

/** Invalidates a calculation that was running when the assessment was reset or restarted. */
let submissionGeneration = 0;

/**
 * Clears Live's in-memory simulation when the base assessment lifecycle changes.
 *
 * The dynamic import keeps the Live engine out of the base questionnaire's initial bundle and
 * avoids a module cycle between the two stores.
 */
function resetDependentLiveState(): void {
  void import('@/live/state/liveStore')
    .then(({ useLiveStore }) => useLiveStore.getState().resetSimulation())
    .catch(() => undefined);
}

export const questionSteps: readonly QuestionStep[] = buildQuestionSteps(publicModel);

interface AssessmentState {
  view: View;
  stepIndex: number;
  /** Full five-scenario assessment, or a one-scenario quick check. */
  scope: AssessmentScope;
  /** The single scenario a quick check asks about; null in a full assessment. */
  quickScenarioCode: string | null;
  disclaimerAcknowledged: boolean;
  organisationAnswers: OrganisationAnswers;
  scenarioAnswers: ScenarioAnswers;
  organisationEvidence: OrganisationEvidence;
  status: AssessmentStatus;
  errorMessage: string | null;
  results: CalculationResponse | null;
  selectedScenarioCode: string | null;

  setView: (view: View) => void;
  acknowledgeDisclaimer: (acknowledged: boolean) => void;
  startAssessment: () => void;
  startFullAssessment: () => void;
  startQuickCheck: (scenarioCode: string) => void;
  loadSampleAssessment: () => void;
  calculateLoadedAnswers: () => void;
  answerCurrentStep: (optionCode: string) => void;
  setOrganisationEvidence: (evidence: OrganisationEvidence) => void;
  goToStep: (index: number) => void;
  nextStep: () => void;
  previousStep: () => void;
  submitAssessment: () => Promise<void>;
  selectScenario: (scenarioCode: string) => void;
  dismissError: () => void;
  discardAssessment: () => void;
}

/** The ordered steps the current scope asks. */
export function stepsForScope(
  scope: AssessmentScope,
  quickScenarioCode: string | null,
): readonly QuestionStep[] {
  return activeStepsFor(questionSteps, scope, quickScenarioCode);
}

function stepAt(
  scope: AssessmentScope,
  quickScenarioCode: string | null,
  index: number,
): QuestionStep | undefined {
  const steps = stepsForScope(scope, quickScenarioCode);
  return steps[Math.min(Math.max(index, 0), Math.max(steps.length - 1, 0))];
}

function withAnswer(
  state: AssessmentState,
  step: QuestionStep,
  optionCode: string,
): Pick<AssessmentState, 'organisationAnswers' | 'scenarioAnswers'> {
  if (step.kind === 'profile') {
    return {
      organisationAnswers: { ...state.organisationAnswers, [step.questionCode]: optionCode },
      scenarioAnswers: state.scenarioAnswers,
    };
  }

  const scenarioCode = step.scenarioCode ?? '';
  return {
    organisationAnswers: state.organisationAnswers,
    scenarioAnswers: {
      ...state.scenarioAnswers,
      [scenarioCode]: { ...(state.scenarioAnswers[scenarioCode] ?? {}), [step.questionCode]: optionCode },
    },
  };
}

export const useAssessmentStore = create<AssessmentState>((set, get) => ({
  view: 'landing',
  stepIndex: 0,
  scope: 'full',
  quickScenarioCode: null,
  disclaimerAcknowledged: false,
  organisationAnswers: {},
  scenarioAnswers: {},
  organisationEvidence: EMPTY_ORGANISATION_EVIDENCE,
  status: 'idle',
  errorMessage: null,
  results: null,
  selectedScenarioCode: null,

  setView: (view) => set({ view }),

  acknowledgeDisclaimer: (acknowledged) => set({ disclaimerAcknowledged: acknowledged }),

  startAssessment: () => {
    submissionGeneration++;
    resetDependentLiveState();
    set({
      view: 'questionnaire',
      stepIndex: 0,
      status: 'idle',
      errorMessage: null,
      results: null,
      selectedScenarioCode: null,
    });
  },

  /**
   * Entry paths from the landing page.
   *
   * All three stop at the disclaimer gate: none of them acknowledges the disclaimer on the
   * visitor's behalf, and none of them calculates without that acknowledgement. What they
   * change is how much of the questionnaire stands between the gate and a result.
   */
  startFullAssessment: () =>
    set({
      scope: 'full',
      quickScenarioCode: null,
      view: 'disclaimer',
      stepIndex: 0,
      errorMessage: null,
    }),

  startQuickCheck: (scenarioCode) =>
    set({
      scope: 'quick',
      quickScenarioCode: scenarioCode,
      view: 'disclaimer',
      stepIndex: 0,
      errorMessage: null,
    }),

  loadSampleAssessment: () => {
    const sample = buildSampleAssessment(publicModel);
    set({
      scope: 'full',
      quickScenarioCode: null,
      organisationAnswers: sample.organisationAnswers,
      scenarioAnswers: sample.scenarioAnswers,
      view: 'disclaimer',
      stepIndex: 0,
      status: 'idle',
      errorMessage: null,
      results: null,
      selectedScenarioCode: null,
    });
  },

  /** Calculates answers that are already complete, without walking the questionnaire again. */
  calculateLoadedAnswers: () => {
    set({ view: 'calculating', errorMessage: null });
    void get().submitAssessment();
  },

  answerCurrentStep: (optionCode) => {
    const state = get();
    const step = stepAt(state.scope, state.quickScenarioCode, state.stepIndex);
    if (step === undefined) {
      return;
    }
    set(withAnswer(state, step, optionCode));
  },

  setOrganisationEvidence: (evidence) => set({ organisationEvidence: evidence }),

  goToStep: (index) => {
    const state = get();
    set({ stepIndex: Math.min(Math.max(index, 0), stepsForScope(state.scope, state.quickScenarioCode).length - 1) });
  },

  nextStep: () => {
    const state = get();
    const steps = stepsForScope(state.scope, state.quickScenarioCode);
    const step = stepAt(state.scope, state.quickScenarioCode, state.stepIndex);
    if (step !== undefined && step.required) {
      const answer = answerForStep(step, state.organisationAnswers, state.scenarioAnswers);
      if (answer === undefined) {
        set({ errorMessage: 'Please choose an answer before continuing.' });
        return;
      }
    }

    if (state.stepIndex >= steps.length - 1) {
      void get().submitAssessment();
      return;
    }

    set({ stepIndex: state.stepIndex + 1, errorMessage: null });
  },

  previousStep: () => {
    const state = get();
    if (state.stepIndex === 0) {
      set({ view: 'disclaimer', errorMessage: null });
      return;
    }
    set({ stepIndex: state.stepIndex - 1, errorMessage: null });
  },

  submitAssessment: async () => {
    const state = get();

    if (!state.disclaimerAcknowledged) {
      set({ view: 'disclaimer', errorMessage: 'The disclaimer must be acknowledged before calculating.' });
      return;
    }

    if (state.status === 'calculating') {
      return;
    }

    const request: CalculationRequest = {
      schemaVersion: publicModel.version.schemaVersion,
      modelId: publicModel.version.modelId,
      disclaimer: { acknowledged: true, version: publicModel.version.disclaimerVersion },
      organisationAnswers: Object.entries(state.organisationAnswers).map(([questionCode, optionCode]) => ({
        questionCode,
        optionCode,
      })),
      scenarioAnswers: publicModel.scenarios.map((scenario) => ({
        scenarioCode: scenario.code,
        answers: [scenario.likelihoodQuestion, scenario.impactQuestion].map((question) => ({
          questionCode: question.code,
          optionCode: state.scenarioAnswers[scenario.code]?.[question.code] ?? publicModel.unknownCode,
        })),
      })),
      organisationEvidence: state.organisationEvidence,
    };

    const generation = ++submissionGeneration;
    set({ status: 'calculating', view: 'calculating', errorMessage: null });

    try {
      const results = await requestCalculation(request);
      if (generation !== submissionGeneration) {
        return;
      }
      set({
        status: 'ready',
        view: 'results',
        results,
        selectedScenarioCode: results.scenarios[0]?.code ?? null,
        errorMessage: null,
      });
    } catch (error) {
      if (generation !== submissionGeneration) {
        return;
      }
      const message =
        error instanceof CalculationError || error instanceof Error
          ? describeCalculationError(error)
          : 'The calculation could not be completed. Please try again.';
      set({
        status: 'error',
        view: 'questionnaire',
        errorMessage: message,
        results: null,
      });
    }
  },

  selectScenario: (scenarioCode) => set({ selectedScenarioCode: scenarioCode, view: 'scenario-detail' }),

  dismissError: () => set({ errorMessage: null }),

  discardAssessment: () => {
    submissionGeneration++;
    resetDependentLiveState();
    set({
      view: 'landing',
      stepIndex: 0,
      scope: 'full',
      quickScenarioCode: null,
      disclaimerAcknowledged: false,
      organisationAnswers: {},
      scenarioAnswers: {},
      organisationEvidence: EMPTY_ORGANISATION_EVIDENCE,
      status: 'idle',
      errorMessage: null,
      results: null,
      selectedScenarioCode: null,
    });
  },
}));
