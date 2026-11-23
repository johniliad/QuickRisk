/**
 * The 60-second sample.
 *
 * The sample exists so a visitor can see a dashboard without answering eighteen questions.
 * It is not fabricated output: it is a complete, valid set of answers, so the same server
 * calculation that produces a real result produces the sample. Every answer is the middle
 * option of the question's own option set — lower-middle where an option set has an even
 * number of choices — and `Unknown` is never chosen, so the sample shows a fully specified
 * organisation rather than the widest possible range.
 *
 * Nothing here is a calibration value: the numbers still come from the server.
 */

import type { OrganisationAnswers, ScenarioAnswers } from '@/domain/answers';
import type { AnswerOption, OptionSet, PublicModel } from '@/domain/model';

/** Label shown next to a loaded sample so it can never be mistaken for the visitor's own data. */
export const SAMPLE_ASSESSMENT_LABEL = 'Sample organisation';

export const SAMPLE_ASSESSMENT_NOTE =
  'Every question is answered with the middle option of its own option set. This is a complete set of answers, not a stored result: the server calculates it exactly as it would calculate yours. Start over discards it, and nothing about it is saved.';

/**
 * The middle option of an option set, excluding `Unknown`.
 *
 * `Unknown` is skipped deliberately: choosing it everywhere would produce the widest
 * possible range and the lowest precision, which is the least useful possible demonstration.
 */
function middleOption(optionSet: OptionSet): AnswerOption {
  const concrete = [...optionSet.options]
    .filter((option) => option.unknown !== true)
    .sort((left, right) => left.order - right.order);

  if (concrete.length === 0) {
    throw new Error(`Option set "${optionSet.label}" has no concrete option to sample.`);
  }

  return concrete[Math.floor((concrete.length - 1) / 2)];
}

function optionSetOf(model: PublicModel, name: string): OptionSet {
  const optionSet = model.optionSets[name];
  if (optionSet === undefined) {
    throw new Error(`Unknown option set referenced by the model: ${name}`);
  }

  return optionSet;
}

export interface SampleAssessment {
  readonly organisationAnswers: OrganisationAnswers;
  readonly scenarioAnswers: ScenarioAnswers;
}

/** A complete, deterministic answer set derived from the model's own options. */
export function buildSampleAssessment(model: PublicModel): SampleAssessment {
  const organisationAnswers: Record<string, string> = {};
  for (const question of model.profileQuestions) {
    organisationAnswers[question.code] = middleOption(optionSetOf(model, question.optionSet)).code;
  }

  const scenarioAnswers: Record<string, Record<string, string>> = {};
  for (const scenario of model.scenarios) {
    scenarioAnswers[scenario.code] = {
      [scenario.likelihoodQuestion.code]: middleOption(
        optionSetOf(model, scenario.likelihoodQuestion.optionSet),
      ).code,
      [scenario.impactQuestion.code]: middleOption(
        optionSetOf(model, scenario.impactQuestion.optionSet),
      ).code,
    };
  }

  return { organisationAnswers, scenarioAnswers };
}
