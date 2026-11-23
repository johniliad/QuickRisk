import { describe, expect, it } from 'vitest';
import { DEFAULT_SOC_STATE, type SOCInputState, type TimelineEntry } from '@/live/domain/socTypes';
import { calculateRealTimeRisk } from '@/live/engine/socRiskEngine';
import {
  LiveScenarioMismatchError,
  assertTimelineMatchesBaseline,
  belongsToScenario,
  savedAssessmentScenarioError,
  withScenario,
} from '@/live/domain/scenarioIdentity';
import { buildLivePayload, type LiveBaseline } from '@/live/domain/livePayload';

const state = (scenarioId: string, overrides: Partial<SOCInputState> = {}): SOCInputState => ({
  ...DEFAULT_SOC_STATE,
  scenarioId,
  ...overrides,
});

const baseline = (scenarioCode = 'S2', baselineEal = 500000): LiveBaseline => ({
  scenarioCode,
  scenarioName: `Scenario ${scenarioCode}`,
  baselineEal,
  currencySymbol: '€',
  modelId: 'FAIR-QK-1.3',
  modelVersion: '1.3.0',
});

const entry = (scenarioCode = 'S2', baselineEal = 500000): TimelineEntry => {
  const soc = state(scenarioCode, { incidentStage: 'triage', iocCount: 2 });

  return {
    offsetMs: 0,
    label: `Step ${scenarioCode}`,
    state: soc,
    result: calculateRealTimeRisk(soc, baselineEal),
  };
};

describe('QuickRisk Live scenario identity', () => {
  it('returns a new state with only the scenario changed', () => {
    const original = state('S1');
    const updated = withScenario(original, 'S2');

    expect(updated).not.toBe(original);
    expect(updated).toEqual({ ...original, scenarioId: 'S2' });
    expect(original.scenarioId).toBe('S1');
  });

  it('reports whether a state belongs to a scenario', () => {
    expect(belongsToScenario(state('S2'), 'S2')).toBe(true);
    expect(belongsToScenario(state('S2'), 'S3')).toBe(false);
  });

  it('accepts a timeline that matches the scenario and baseline', () => {
    expect(() => assertTimelineMatchesBaseline([entry('S2', 500000)], 'S2', 500000)).not.toThrow();
    expect(() => assertTimelineMatchesBaseline([], 'S2', 500000)).not.toThrow();
  });

  it('rejects a timeline event from another scenario', () => {
    expect(() => assertTimelineMatchesBaseline([entry('S1', 500000)], 'S2', 500000)).toThrow(
      LiveScenarioMismatchError,
    );
  });

  it('rejects a timeline event from another baseline', () => {
    expect(() => assertTimelineMatchesBaseline([entry('S2', 100000)], 'S2', 500000)).toThrow(
      LiveScenarioMismatchError,
    );
  });

  it('builds a payload whose current state and timeline match the baseline scenario', () => {
    const payload = buildLivePayload({
      baseline: baseline('S2'),
      soc: state('S2', { incidentStage: 'compromise' }),
      timeline: [entry('S2')],
      title: 'Containment rehearsal',
      methodologyVersion: '1.0',
    });

    expect(payload.scenarioId).toBe('S2');
    expect((payload.inputState as SOCInputState).scenarioId).toBe('S2');
    const result = payload.riskResult as { baselineEal: number };
    expect(result.baselineEal).toBe(500000);
  });

  it('refuses to build a payload from a mismatched current state', () => {
    expect(() =>
      buildLivePayload({
        baseline: baseline('S2'),
        soc: state('S1'),
        timeline: [],
        title: '',
        methodologyVersion: '1.0',
      }),
    ).toThrow(LiveScenarioMismatchError);
  });

  it('refuses to build a payload from a foreign timeline event', () => {
    expect(() =>
      buildLivePayload({
        baseline: baseline('S2'),
        soc: state('S2'),
        timeline: [entry('S1')],
        title: '',
        methodologyVersion: '1.0',
      }),
    ).toThrow(LiveScenarioMismatchError);
  });

  it('refuses to build a payload from a timeline calculated on another baseline', () => {
    expect(() =>
      buildLivePayload({
        baseline: baseline('S2', 500000),
        soc: state('S2'),
        timeline: [entry('S2', 100000)],
        title: '',
        methodologyVersion: '1.0',
      }),
    ).toThrow(LiveScenarioMismatchError);
  });

  it('accepts a coherent saved assessment and rejects each form of inconsistency', () => {
    const coherent = {
      scenarioId: 'S2',
      baselineEal: 500000,
      inputState: state('S2'),
      timeline: [entry('S2')],
    };

    expect(savedAssessmentScenarioError(coherent)).toBeNull();
    expect(
      savedAssessmentScenarioError({ ...coherent, inputState: state('S1') }),
    ).toContain('internally inconsistent');
    expect(
      savedAssessmentScenarioError({
        ...coherent,
        timeline: [{ ...entry('S1'), label: 'Foreign' }],
      }),
    ).toContain('another scenario');
    expect(
      savedAssessmentScenarioError({
        ...coherent,
        timeline: [{ ...entry('S2', 100000), label: 'Old baseline' }],
      }),
    ).toContain('another baseline');
  });
});
