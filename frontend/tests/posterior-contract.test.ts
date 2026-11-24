import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { publicModel } from '../shared/publicModel';
import { calculationRequestSchema, calculationResponseSchema } from '@/validation/schemas';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/posterior-response.json', import.meta.url), 'utf8'),
) as unknown;

describe('posterior response contract', () => {
  it('accepts the real posterior response shape', () => {
    const parsed = calculationResponseSchema.parse(fixture);
    expect(parsed.meta.inference?.active).toBe(true);
    expect(parsed.meta.inference?.mode).toBe('posterior-reference-class');
    expect(parsed.meta.annualisationMethod).toBe('posterior-predictive-compound-poisson-annual-total');
    expect(parsed.meta.realisedAnnualTotalsModelled).toBe(true);
    expect(parsed.meta.simulationSeed).toBeGreaterThan(0);
    expect(parsed.meta.seedPersisted).toBe(false);
    expect(parsed.portfolio.p90).toBeGreaterThanOrEqual(0);
    expect(parsed.portfolio.thresholdIntervals).toBeDefined();
  });

  it('marks every scenario input as a posterior and carries diagnostics', () => {
    const parsed = calculationResponseSchema.parse(fixture);
    for (const scenario of parsed.scenarios) {
      expect(scenario.inputs.threatEventFrequency?.kind).toBe('posterior');
      expect(scenario.inputs.susceptibility?.kind).toBe('posterior');
      expect(scenario.inputs.lossMagnitudeAnchor?.kind).toBe('posterior');
      expect(scenario.statistics.meanStandardError).toBeGreaterThanOrEqual(0);
      expect(Object.keys(scenario.statistics.thresholdIntervals ?? {}).length).toBeGreaterThan(0);
    }
  });

  it('accepts the optional material-loss count and rejects an invalid count', () => {
    const request = {
      schemaVersion: publicModel.version.schemaVersion,
      modelId: publicModel.version.modelId,
      disclaimer: { acknowledged: true, version: publicModel.version.disclaimerVersion },
      organisationAnswers: publicModel.profileQuestions.map((question) => ({
        questionCode: question.code,
        optionCode: publicModel.optionSets[question.optionSet]?.options[0]?.code ?? publicModel.unknownCode,
      })),
      scenarioAnswers: publicModel.scenarios.map((scenario) => ({
        scenarioCode: scenario.code,
        answers: [
          { questionCode: scenario.likelihoodQuestion.code, optionCode: publicModel.unknownCode },
          { questionCode: scenario.impactQuestion.code, optionCode: publicModel.unknownCode },
        ],
      })),
      organisationEvidence: { materialLossEventCount: 3 },
    };
    expect(calculationRequestSchema.safeParse(request).success).toBe(true);
    expect(
      calculationRequestSchema.safeParse({
        ...request,
        organisationEvidence: { materialLossEventCount: 1001 },
      }).success,
    ).toBe(false);
  });
});
