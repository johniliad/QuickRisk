import { describe, expect, it } from 'vitest';
import { publicModel } from '../shared/publicModel';
import { calculationRequestSchema, calculationResponseSchema, errorResponseSchema } from '@/validation/schemas';
import { useAssessmentStore } from '@/state/assessmentStore';

function validRequest() {
  return {
    schemaVersion: publicModel.version.schemaVersion,
    modelId: publicModel.version.modelId,
    disclaimer: { acknowledged: true as const, version: publicModel.version.disclaimerVersion },
    organisationAnswers: publicModel.profileQuestions.map((question) => ({
      questionCode: question.code,
      optionCode: publicModel.optionSets[question.optionSet]?.options[0]?.code ?? 'UNKNOWN',
    })),
    scenarioAnswers: publicModel.scenarios.map((scenario) => ({
      scenarioCode: scenario.code,
      answers: [
        { questionCode: scenario.likelihoodQuestion.code, optionCode: 'POSSIBLE' },
        { questionCode: scenario.impactQuestion.code, optionCode: 'SIGNIFICANT' },
      ],
    })),
  };
}

describe('calculation request schema', () => {
  it('accepts a complete assessment', () => {
    expect(calculationRequestSchema.safeParse(validRequest()).success).toBe(true);
  });

  it('rejects an unacknowledged disclaimer', () => {
    const request = { ...validRequest(), disclaimer: { acknowledged: false, version: 'DISC-1.2' } };
    expect(calculationRequestSchema.safeParse(request).success).toBe(false);
  });

  it('rejects unsupported answer codes and malformed scenario blocks', () => {
    const request = validRequest();
    request.scenarioAnswers[0]!.answers[0]!.optionCode = 'lower-case';
    expect(calculationRequestSchema.safeParse(request).success).toBe(false);

    const short = validRequest();
    short.scenarioAnswers.pop();
    expect(calculationRequestSchema.safeParse(short).success).toBe(false);
  });

  it('rejects an attempt to add an assessment identifier', () => {
    const request = { ...validRequest(), assessmentId: 'abc' } as Record<string, unknown>;
    expect(calculationRequestSchema.safeParse(request).success).toBe(true); // extra keys are stripped, not trusted
    expect(Object.keys(calculationRequestSchema.parse(request))).not.toContain('assessmentId');
  });
});

describe('calculation response schema', () => {
  it('rejects a truncated response', () => {
    expect(calculationResponseSchema.safeParse({ status: 'ok' }).success).toBe(false);
  });

  it('rejects a response that claims the seed was persisted', () => {
    const response = {
      status: 'ok',
      meta: { seedPersisted: true, seedDisclosed: false, jointPercentilesAvailable: false },
      portfolio: {},
      scenarios: [],
    };
    expect(calculationResponseSchema.safeParse(response).success).toBe(false);
  });

  it('rejects a response that claims realised annual totals are modelled', () => {
    const response = {
      status: 'ok',
      meta: {
        seedPersisted: false,
        seedDisclosed: false,
        jointPercentilesAvailable: false,
        realisedAnnualTotalsModelled: true,
      },
      portfolio: {},
      scenarios: [],
    };
    expect(calculationResponseSchema.safeParse(response).success).toBe(false);
  });

  it('rejects a response that presents confidence as statistical confidence', () => {
    const parsed = calculationResponseSchema.safeParse({
      status: 'ok',
      meta: {},
      portfolio: { confidence: { isStatisticalConfidence: true } },
      scenarios: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('parses the documented error shape', () => {
    const parsed = errorResponseSchema.safeParse({
      status: 'error',
      error: { code: 'RATE_LIMITED', message: 'Too many calculation requests from this client.' },
    });
    expect(parsed.success).toBe(true);
  });
});

describe('in-memory assessment store', () => {
  it('starts on the landing view with no answers', () => {
    const state = useAssessmentStore.getState();
    expect(state.view).toBe('landing');
    expect(state.results).toBeNull();
    expect(state.disclaimerAcknowledged).toBe(false);
    expect(Object.keys(state.organisationAnswers)).toHaveLength(0);
  });

  it('holds answers in memory and moves backwards and forwards without losing them', () => {
    const store = useAssessmentStore.getState();
    store.discardAssessment();
    store.acknowledgeDisclaimer(true);
    store.startAssessment();
    store.answerCurrentStep('50_250M');

    expect(useAssessmentStore.getState().organisationAnswers['QP1']).toBe('50_250M');
    expect(useAssessmentStore.getState().view).toBe('questionnaire');

    useAssessmentStore.getState().nextStep();
    expect(useAssessmentStore.getState().stepIndex).toBe(1);

    useAssessmentStore.getState().previousStep();
    expect(useAssessmentStore.getState().stepIndex).toBe(0);
    expect(useAssessmentStore.getState().organisationAnswers['QP1']).toBe('50_250M');
  });

  it('does not advance past an unanswered required question', () => {
    const store = useAssessmentStore.getState();
    store.discardAssessment();
    store.startAssessment();
    useAssessmentStore.getState().nextStep();

    expect(useAssessmentStore.getState().stepIndex).toBe(0);
    expect(useAssessmentStore.getState().errorMessage).toBe('Please choose an answer before continuing.');
  });

  it('refuses to calculate when the disclaimer has not been acknowledged', async () => {
    const store = useAssessmentStore.getState();
    store.discardAssessment();
    await useAssessmentStore.getState().submitAssessment();

    expect(useAssessmentStore.getState().view).toBe('disclaimer');
    expect(useAssessmentStore.getState().results).toBeNull();
  });

  it('discards everything on request', () => {
    const store = useAssessmentStore.getState();
    store.acknowledgeDisclaimer(true);
    store.startAssessment();
    store.answerCurrentStep('50_250M');
    store.discardAssessment();

    const state = useAssessmentStore.getState();
    expect(state.view).toBe('landing');
    expect(state.stepIndex).toBe(0);
    expect(state.disclaimerAcknowledged).toBe(false);
    expect(Object.keys(state.organisationAnswers)).toHaveLength(0);
    expect(Object.keys(state.scenarioAnswers)).toHaveLength(0);
    expect(state.results).toBeNull();
  });
});
