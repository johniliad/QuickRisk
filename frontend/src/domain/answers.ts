/**
 * Answer and request types.
 *
 * Answer state lives in a single in-memory object for the lifetime of the page.
 * Nothing here is written to any storage medium.
 */

import type { OptionCode } from './model';

/** questionCode -> optionCode */
export type OrganisationAnswers = Readonly<Record<string, OptionCode>>;

/** scenarioCode -> questionCode -> optionCode */
export type ScenarioAnswers = Readonly<Record<string, Readonly<Record<string, OptionCode>>>>;

export interface OrganisationAnswerEntry {
  readonly questionCode: string;
  readonly optionCode: OptionCode;
}

export interface ScenarioAnswerEntry {
  readonly scenarioCode: string;
  readonly answers: readonly OrganisationAnswerEntry[];
}

export interface DisclaimerAcknowledgement {
  readonly acknowledged: true;
  readonly version: string;
}

export interface CalculationRequest {
  readonly schemaVersion: string;
  readonly modelId: string;
  readonly disclaimer: DisclaimerAcknowledgement;
  readonly organisationAnswers: readonly OrganisationAnswerEntry[];
  readonly scenarioAnswers: readonly ScenarioAnswerEntry[];
}

export function isUnknownAnswer(optionCode: OptionCode | undefined, unknownCode: string): boolean {
  return optionCode === undefined || optionCode === unknownCode;
}

export function countUnknownAnswers(
  organisationAnswers: OrganisationAnswers,
  scenarioAnswers: ScenarioAnswers,
  unknownCode: string,
): number {
  let total = 0;
  for (const optionCode of Object.values(organisationAnswers)) {
    if (optionCode === unknownCode) {
      total += 1;
    }
  }
  for (const perScenario of Object.values(scenarioAnswers)) {
    for (const optionCode of Object.values(perScenario)) {
      if (optionCode === unknownCode) {
        total += 1;
      }
    }
  }
  return total;
}
