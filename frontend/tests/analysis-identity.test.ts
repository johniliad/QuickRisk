import { describe, expect, it } from 'vitest';
import {
  analysisInputKey,
  analysisInputKeyMatches,
  type AnalysisIdentityInputs,
  type TreatmentIdentity,
} from '@/decision/domain/analysisIdentity';

const answers = () => ({
  schemaVersion: '1.3.0',
  modelId: 'FAIR-QK-1.3',
  disclaimer: { acknowledged: true, version: 'DISC-1.2' },
  organisationAnswers: [
    { questionCode: 'QP2', optionCode: 'HIGH' },
    { questionCode: 'QP1', optionCode: 'LT10M' },
  ],
  scenarioAnswers: [
    {
      scenarioCode: 'S2',
      answers: [
        { questionCode: 'S2B', optionCode: 'HIGH' },
        { questionCode: 'S2A', optionCode: 'POSSIBLE' },
      ],
    },
    {
      scenarioCode: 'S1',
      answers: [
        { questionCode: 'S1B', optionCode: 'SIGNIFICANT' },
        { questionCode: 'S1A', optionCode: 'LIKELY' },
      ],
    },
  ],
});

const base = (overrides: Partial<AnalysisIdentityInputs> = {}): AnalysisIdentityInputs => ({
  answers: answers(),
  treatments: [{ source: 'curated', id: 'edr', version: '1.0' }],
  appetite: { annualLossLimit: null, highEndLimit: null, maxExceedanceProbability: null },
  seed: 20261107,
  iterations: 2000,
  decisionMethodologyVersion: '1.0',
  ...overrides,
});

const custom = (max: number): TreatmentIdentity => ({
  source: 'custom',
  definition: {
    name: 'MFA',
    causalEffects: { frequency: null, magnitude: { min: 0.1, mostLikely: 0.2, max } },
    applicableScenarios: ['S2', 'S1'],
  },
});

describe('Decision Lab analysis-input identity', () => {
  it('is stable across repeated calls with identical inputs', () => {
    expect(analysisInputKey(base())).toBe(analysisInputKey(base()));
    expect(analysisInputKeyMatches(analysisInputKey(base()), analysisInputKey(base()))).toBe(true);
  });

  it('does not depend on answer insertion order', () => {
    const original = answers();
    const reordered = {
      ...original,
      organisationAnswers: [...original.organisationAnswers].reverse(),
      scenarioAnswers: original.scenarioAnswers
        .map((scenario) => ({ ...scenario, answers: [...scenario.answers].reverse() }))
        .reverse(),
    };

    expect(analysisInputKey(base({ answers: reordered }))).toBe(analysisInputKey(base()));
  });

  it('changes when an answer option changes', () => {
    const changed = structuredClone(answers());
    changed.organisationAnswers[0].optionCode = 'LOW';

    expect(analysisInputKey(base({ answers: changed }))).not.toBe(analysisInputKey(base()));
  });

  it('distinguishes an unconfigured appetite from a configured zero-like value', () => {
    const configured = { annualLossLimit: 1000000, highEndLimit: null, maxExceedanceProbability: null };

    expect(analysisInputKey(base({ appetite: configured }))).not.toBe(analysisInputKey(base()));
  });

  it('includes the seed, iteration count and methodology version', () => {
    const original = analysisInputKey(base());

    expect(analysisInputKey(base({ seed: 1 }))).not.toBe(original);
    expect(analysisInputKey(base({ iterations: 1000 }))).not.toBe(original);
    expect(analysisInputKey(base({ decisionMethodologyVersion: '2.0' }))).not.toBe(original);
  });

  it('does not depend on curated treatment selection order', () => {
    const first: TreatmentIdentity[] = [
      { source: 'curated', id: 'edr', version: '1.0' },
      { source: 'curated', id: 'mfa', version: '1.0' },
    ];
    const second = [...first].reverse();

    expect(analysisInputKey(base({ treatments: first }))).toBe(analysisInputKey(base({ treatments: second })));
  });

  it('separates same-named custom definitions with different effects', () => {
    expect(analysisInputKey(base({ treatments: [custom(0.3)] }))).not.toBe(
      analysisInputKey(base({ treatments: [custom(0.4)] })),
    );
  });

  it('does not depend on the order of a custom treatment scenario set', () => {
    const first = custom(0.3);
    if (first.source !== 'custom') {
      throw new Error('The fixture must be a custom treatment.');
    }
    const second: TreatmentIdentity = {
      source: 'custom',
      definition: { ...first.definition, applicableScenarios: ['S1', 'S2'] },
    };

    expect(analysisInputKey(base({ treatments: [first] }))).toBe(
      analysisInputKey(base({ treatments: [second] })),
    );
  });
});
