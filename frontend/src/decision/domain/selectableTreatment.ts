/**
 * Decision Lab — selectable treatment adapter.
 *
 * Curated and user-defined treatments share one UI shape, but they do not share a wire shape:
 * curated treatments are referenced by id, while a custom treatment's complete definition is
 * revalidated by the server. This module is the only place that conversion happens.
 */

import type { TreatmentIdentity } from '@/decision/domain/analysisIdentity';
import type {
  CustomTreatmentDefinition,
  TreatmentCatalogue,
  TreatmentDefinition,
} from '@/decision/domain/decisionTypes';
import { canonicalJson } from '@/lib/canonicalJson';

export type SelectableTreatment =
  | {
      readonly source: 'curated';
      readonly key: string;
      readonly definition: TreatmentDefinition;
    }
  | {
      readonly source: 'custom';
      readonly key: string;
      readonly publicId: string;
      readonly definition: TreatmentDefinition;
    };

/** Converts a stored definition back to the fields the custom-treatment endpoint validates. */
export function customDefinitionInput(definition: TreatmentDefinition): CustomTreatmentDefinition {
  const assumptionNotes = definition.assumptions.join(' ').trim();

  return {
    name: definition.name,
    businessOutcome: definition.businessOutcome,
    shortDescription: definition.shortDescription,
    applicableScenarios: [...definition.applicableScenarios],
    causalEffects: {
      frequency: definition.causalEffects.frequency,
      magnitude: definition.causalEffects.magnitude,
    },
    implementationDelayDays: definition.implementationDelayDays,
    initialCost: definition.initialCost.amount,
    annualOperatingCost: definition.annualOperatingCost.amount,
    evidenceQuality: definition.evidenceQuality,
    mechanismGroup: definition.mechanismGroup,
    assumptionNotes: assumptionNotes === '' ? 'No assumption note was recorded.' : assumptionNotes,
  };
}

/** The exact payload the compute endpoint expects for this selection. */
export function selectionForCompute(treatment: SelectableTreatment): Record<string, unknown> {
  return treatment.source === 'curated'
    ? { source: 'curated', id: treatment.definition.id }
    : { source: 'custom', definition: customDefinitionInput(treatment.definition) };
}

/** The identity used by the client-side analysis-input key. */
export function selectionIdentity(treatment: SelectableTreatment): TreatmentIdentity {
  return treatment.source === 'curated'
    ? { source: 'curated', id: treatment.definition.id, version: treatment.definition.version }
    : {
        source: 'custom',
        definition: treatment.definition as unknown as Readonly<Record<string, unknown>>,
      };
}

/** The stable UI key for a selection. */
export function selectionKey(treatment: SelectableTreatment): string {
  return treatment.source === 'curated'
    ? `curated:${treatment.definition.id}`
    : `custom:${treatment.publicId}`;
}

/** Merges the curated library and this session's custom treatments into one keyed list. */
export function catalogueSelections(catalogue: TreatmentCatalogue): SelectableTreatment[] {
  const curated: SelectableTreatment[] = catalogue.curated.map((definition) => ({
    source: 'curated',
    key: `curated:${definition.id}`,
    definition,
  }));
  const custom: SelectableTreatment[] = catalogue.custom.map((entry) => ({
    source: 'custom',
    key: `custom:${entry.publicId}`,
    publicId: entry.publicId,
    definition: entry.definition,
  }));

  return [...curated, ...custom];
}

/** Finds the selection named by a portfolio or comparison treatment id. */
export function findSelectionByTreatmentId(
  selections: readonly SelectableTreatment[],
  treatmentId: string,
): SelectableTreatment | undefined {
  return selections.find((entry) => entry.definition.id === treatmentId);
}

/**
 * Compares definition content without the identity field.
 *
 * A custom treatment saved before the definition-based id scheme still has its old catalogue id,
 * while the server correctly returns the new content-derived id. The content comparison lets the
 * UI resolve that treatment without trusting or rewriting either id.
 */
export function sameTreatmentDefinition(left: TreatmentDefinition, right: TreatmentDefinition): boolean {
  const content = (definition: TreatmentDefinition): string =>
    canonicalJson({
      name: definition.name,
      shortDescription: definition.shortDescription,
      businessOutcome: definition.businessOutcome,
      applicableScenarios: [...definition.applicableScenarios].sort(),
      causalEffects: definition.causalEffects,
      implementationDelayDays: definition.implementationDelayDays,
      initialCost: definition.initialCost,
      annualOperatingCost: definition.annualOperatingCost,
      evidenceQuality: definition.evidenceQuality,
      mechanismGroup: definition.mechanismGroup,
      assumptions: definition.assumptions,
    });

  return content(left) === content(right);
}

/** Resolves a treatment id from a computed result to the selection that produced it. */
export function findSelectionForResultTreatment(
  selections: readonly SelectableTreatment[],
  resultTreatment: TreatmentDefinition,
): SelectableTreatment | undefined {
  return (
    findSelectionByTreatmentId(selections, resultTreatment.id) ??
    selections.find(
      (entry) => entry.source === 'custom' && sameTreatmentDefinition(entry.definition, resultTreatment),
    )
  );
}
