import { describe, expect, it } from 'vitest';
import {
  catalogueSelections,
  customDefinitionInput,
  findSelectionByTreatmentId,
  findSelectionForResultTreatment,
  sameTreatmentDefinition,
  selectionForCompute,
  selectionIdentity,
  selectionKey,
} from '@/decision/domain/selectableTreatment';
import type { TreatmentCatalogue } from '@/decision/domain/decisionTypes';
import { testTreatment } from './helpers/decisionFixtures';

const customDefinition = () =>
  testTreatment('custom-old-name-hash', {
    name: 'Phishing-resistant MFA',
    origin: 'custom',
    assumptions: ['Assumes full rollout within one quarter.'],
    initialCost: { amount: 25000, currency: 'EUR' },
    annualOperatingCost: { amount: 5000, currency: 'EUR' },
    applicableScenarios: ['S1', 'S2'],
  });

const catalogue = (): TreatmentCatalogue => ({
  curated: [testTreatment('edr')],
  custom: [
    {
      publicId: 'CUSTOM-PUBLIC-1',
      treatmentId: 'custom-old-name-hash',
      name: 'Phishing-resistant MFA',
      mechanismGroup: 'endpoint',
      evidenceQuality: 'industry',
      definition: customDefinition(),
      createdAt: '2026-11-22 10:00:00',
    },
  ],
  mechanismGroups: { endpoint: 'Endpoint' },
  evidenceLevels: { industry: { label: 'Industry evidence', confidence: 'MEDIUM', definition: 'Industry' } },
  methodologyVersion: '1.0',
});

describe('Decision Lab selectable treatments', () => {
  it('keys curated and custom selections without relying on their definitions', () => {
    const selections = catalogueSelections(catalogue());

    expect(selections).toHaveLength(2);
    expect(selections[0].key).toBe('curated:edr');
    expect(selections[1].key).toBe('custom:CUSTOM-PUBLIC-1');
    expect(selections.map(selectionKey)).toEqual(['curated:edr', 'custom:CUSTOM-PUBLIC-1']);
    expect(new Set(selections.map((entry) => entry.key)).size).toBe(2);
  });

  it('references a curated treatment by id only', () => {
    const curated = catalogueSelections(catalogue())[0];

    expect(selectionForCompute(curated)).toEqual({ source: 'curated', id: 'edr' });
    expect(selectionIdentity(curated)).toEqual({ source: 'curated', id: 'edr', version: '1.0' });
  });

  it('sends the complete validated definition for a custom treatment', () => {
    const custom = catalogueSelections(catalogue())[1];
    const payload = selectionForCompute(custom);

    expect(payload).toEqual({
      source: 'custom',
      definition: {
        name: 'Phishing-resistant MFA',
        businessOutcome: 'custom-old-name-hash outcome',
        shortDescription: 'custom-old-name-hash description',
        applicableScenarios: ['S1', 'S2'],
        causalEffects: {
          frequency: null,
          magnitude: { min: 0.1, mostLikely: 0.2, max: 0.3 },
        },
        implementationDelayDays: 30,
        initialCost: 25000,
        annualOperatingCost: 5000,
        evidenceQuality: 'industry',
        mechanismGroup: 'endpoint',
        assumptionNotes: 'Assumes full rollout within one quarter.',
      },
    });
    expect(selectionIdentity(custom).source).toBe('custom');
  });

  it('converts a stored definition to the custom endpoint shape', () => {
    const input = customDefinitionInput(customDefinition());

    expect(input.initialCost).toBe(25000);
    expect(input.annualOperatingCost).toBe(5000);
    expect(input.assumptionNotes).toBe('Assumes full rollout within one quarter.');
    expect(input.applicableScenarios).toEqual(['S1', 'S2']);
  });

  it('compares definitions by content, not by their id field', () => {
    const left = customDefinition();
    const renamedId = { ...left, id: 'custom-new-content-hash' };
    const changedEffect = {
      ...left,
      id: 'custom-new-content-hash',
      causalEffects: { frequency: null, magnitude: { min: 0.2, mostLikely: 0.3, max: 0.4 } },
    };

    expect(sameTreatmentDefinition(left, renamedId)).toBe(true);
    expect(sameTreatmentDefinition(left, changedEffect)).toBe(false);
  });

  it('resolves a pre-migration custom id through the computed definition', () => {
    const selections = catalogueSelections(catalogue());
    const resolvedByServer = testTreatment('custom-definition-hash', {
      ...customDefinition(),
      id: 'custom-definition-hash',
    });

    expect(findSelectionByTreatmentId(selections, resolvedByServer.id)).toBeUndefined();
    expect(findSelectionForResultTreatment(selections, resolvedByServer)?.key).toBe(
      'custom:CUSTOM-PUBLIC-1',
    );
  });
});
