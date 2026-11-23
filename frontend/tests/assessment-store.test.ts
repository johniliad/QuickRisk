import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requestCalculation: vi.fn(),
}));

vi.mock('@/api/calculate', () => ({
  requestCalculation: mocks.requestCalculation,
  CalculationError: class CalculationError extends Error {},
  describeCalculationError: (error: Error) => error.message,
}));

import { useAssessmentStore } from '@/state/assessmentStore';

describe('assessment lifecycle', () => {
  beforeEach(() => {
    mocks.requestCalculation.mockReset();
    useAssessmentStore.setState(useAssessmentStore.getInitialState(), true);
  });

  it('ignores a calculation response that arrives after the assessment is discarded', async () => {
    let resolveCalculation: ((value: unknown) => void) | undefined;
    mocks.requestCalculation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCalculation = resolve;
        }),
    );

    useAssessmentStore.setState({ disclaimerAcknowledged: true });
    const pending = useAssessmentStore.getState().submitAssessment();
    expect(useAssessmentStore.getState().status).toBe('calculating');

    useAssessmentStore.getState().discardAssessment();
    resolveCalculation?.({ scenarios: [] });
    await pending;

    const current = useAssessmentStore.getState();
    expect(current.view).toBe('landing');
    expect(current.status).toBe('idle');
    expect(current.results).toBeNull();
  });

  it('clears an earlier result when a new assessment starts', () => {
    useAssessmentStore.setState({
      results: { status: 'ok' } as never,
      selectedScenarioCode: 'S1',
      view: 'results',
    });

    useAssessmentStore.getState().startAssessment();

    const current = useAssessmentStore.getState();
    expect(current.view).toBe('questionnaire');
    expect(current.results).toBeNull();
    expect(current.selectedScenarioCode).toBeNull();
  });
});
