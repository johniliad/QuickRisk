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
import { answerForStep, buildQuestionSteps, type QuestionStep, type View } from '@/domain/assessment';
import type { CalculationResponse } from '@/domain/results';
import { CalculationError, describeCalculationError, requestCalculation } from '@/api/calculate';

export type AssessmentStatus = 'idle' | 'calculating' | 'ready' | 'error';

export const questionSteps: readonly QuestionStep[] = buildQuestionSteps(publicModel);

interface AssessmentState {
  view: View;
  stepIndex: number;
  disclaimerAcknowledged: boolean;
  organisationAnswers: OrganisationAnswers;
  scenarioAnswers: ScenarioAnswers;
  status: AssessmentStatus;
  errorMessage: string | null;
  results: CalculationResponse | null;
  selectedScenarioCode: string | null;

  setView: (view: View) => void;
  acknowledgeDisclaimer: (acknowledged: boolean) => void;
  startAssessment: () => void;
  answerCurrentStep: (optionCode: string) => void;
  goToStep: (index: number) => void;
  nextStep: () => void;
  previousStep: () => void;
  submitAssessment: () => Promise<void>;
  selectScenario: (scenarioCode: string) => void;
  dismissError: () => void;
  discardAssessment: () => void;
}

function stepAt(index: number): QuestionStep | undefined {
  return questionSteps[Math.min(Math.max(index, 0), Math.max(questionSteps.length - 1, 0))];
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
  disclaimerAcknowledged: false,
  organisationAnswers: {},
  scenarioAnswers: {},
  status: 'idle',
  errorMessage: null,
  results: null,
  selectedScenarioCode: null,

  setView: (view) => set({ view }),

  acknowledgeDisclaimer: (acknowledged) => set({ disclaimerAcknowledged: acknowledged }),

  startAssessment: () =>
    set({
      view: 'questionnaire',
      stepIndex: 0,
      status: 'idle',
      errorMessage: null,
    }),

  answerCurrentStep: (optionCode) => {
    const state = get();
    const step = stepAt(state.stepIndex);
    if (step === undefined) {
      return;
    }
    set(withAnswer(state, step, optionCode));
  },

  goToStep: (index) => set({ stepIndex: Math.min(Math.max(index, 0), questionSteps.length - 1) }),

  nextStep: () => {
    const state = get();
    const step = stepAt(state.stepIndex);
    if (step !== undefined && step.required) {
      const answer = answerForStep(step, state.organisationAnswers, state.scenarioAnswers);
      if (answer === undefined) {
        set({ errorMessage: 'Please choose an answer before continuing.' });
        return;
      }
    }

    if (state.stepIndex >= questionSteps.length - 1) {
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
    };

    set({ status: 'calculating', view: 'calculating', errorMessage: null });

    try {
      const results = await requestCalculation(request);
      set({
        status: 'ready',
        view: 'results',
        results,
        selectedScenarioCode: results.scenarios[0]?.code ?? null,
        errorMessage: null,
      });
    } catch (error) {
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

  discardAssessment: () =>
    set({
      view: 'landing',
      stepIndex: 0,
      disclaimerAcknowledged: false,
      organisationAnswers: {},
      scenarioAnswers: {},
      status: 'idle',
      errorMessage: null,
      results: null,
      selectedScenarioCode: null,
    }),
}));
