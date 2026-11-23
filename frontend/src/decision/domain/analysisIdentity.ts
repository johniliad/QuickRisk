/**
 * QuickRisk Decision Lab — canonical analysis-input identity.
 *
 * The identity is a deterministic string over every input that can change a computed result.
 * It is deliberately not hashed: a collision would silently equate two different analyses.
 *
 * Pure: no React, no network, no clock.
 */

import type { Appetite } from '@/decision/domain/decisionTypes';
import { canonicalJson, compareText, isPlainObject, type CanonicalNormaliser } from '@/lib/canonicalJson';

export type TreatmentIdentity =
  | { readonly source: 'curated'; readonly id: string; readonly version: string }
  | { readonly source: 'custom'; readonly definition: Readonly<Record<string, unknown>> };

export interface AnalysisIdentityInputs {
  readonly answers: Readonly<Record<string, unknown>>;
  readonly treatments: readonly TreatmentIdentity[];
  readonly appetite: Appetite;
  readonly seed: number;
  readonly iterations: number;
  readonly decisionMethodologyVersion: string;
}

const isQuestionAnswer = (value: unknown): value is { questionCode: string } =>
  isPlainObject(value) && typeof value.questionCode === 'string';

const isScenarioAnswer = (value: unknown): value is { scenarioCode: string } =>
  isPlainObject(value) && typeof value.scenarioCode === 'string';

/** Sorts the arrays that represent sets, not sequences, before serialisation. */
const normaliseAnalysisSets: CanonicalNormaliser = (value, key) => {
  if (!Array.isArray(value)) {
    return value;
  }

  if (key === 'applicableScenarios' && value.every((entry) => typeof entry === 'string')) {
    return [...value].sort(compareText);
  }
  if (value.every(isQuestionAnswer)) {
    return [...value].sort((left, right) => compareText(left.questionCode, right.questionCode));
  }
  if (value.every(isScenarioAnswer)) {
    return [...value].sort((left, right) => compareText(left.scenarioCode, right.scenarioCode));
  }

  return value;
};

const canonicalTreatment = (treatment: TreatmentIdentity): string =>
  treatment.source === 'curated'
    ? canonicalJson({ source: 'curated', id: treatment.id, version: treatment.version })
    : canonicalJson({ source: 'custom', definition: treatment.definition }, normaliseAnalysisSets);

/** Returns the canonical identity of an analysis input set. Deterministic; no hashing. */
export function analysisInputKey(inputs: AnalysisIdentityInputs): string {
  const treatments = inputs.treatments.map(canonicalTreatment).sort(compareText);

  return canonicalJson(
    {
      answers: inputs.answers,
      treatments,
      appetite: inputs.appetite,
      seed: inputs.seed,
      iterations: inputs.iterations,
      decisionMethodologyVersion: inputs.decisionMethodologyVersion,
    },
    normaliseAnalysisSets,
  );
}

/** Clarity helper; comparing the strings directly is equally correct. */
export function analysisInputKeyMatches(left: string, right: string): boolean {
  return left === right;
}
