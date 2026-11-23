import { describe, expect, it } from 'vitest';
import { activeStepsFor } from '@/domain/assessment';
import { buildSampleAssessment } from '@/content/sampleAssessment';
import { publicModel } from '@/model';
import { stepsForScope, questionSteps } from '@/state/assessmentStore';
import type { OptionSet } from '@/domain/model';

/**
 * The 60-second sample and the quick check both reduce what the visitor must supply. Both
 * must stay honest: the sample uses the model's own options, and the quick check leaves
 * the scenarios it did not ask as Unknown rather than assuming a value.
 */
function middleConcreteCode(optionSet: OptionSet): string {
  const concrete = [...optionSet.options]
    .filter((option) => option.unknown !== true)
    .sort((left, right) => left.order - right.order);

  return concrete[Math.floor((concrete.length - 1) / 2)].code;
}

describe('60-second sample answers', () => {
  const sample = buildSampleAssessment(publicModel);

  it('answers every profile question with the middle option of its own set', () => {
    for (const question of publicModel.profileQuestions) {
      const expected = middleConcreteCode(publicModel.optionSets[question.optionSet]);
      expect(sample.organisationAnswers[question.code]).toBe(expected);
    }
  });

  it('answers both questions of every scenario', () => {
    for (const scenario of publicModel.scenarios) {
      const answers = sample.scenarioAnswers[scenario.code];
      expect(answers).toBeDefined();
      expect(answers[scenario.likelihoodQuestion.code]).toBe(
        middleConcreteCode(publicModel.optionSets[scenario.likelihoodQuestion.optionSet]),
      );
      expect(answers[scenario.impactQuestion.code]).toBe(
        middleConcreteCode(publicModel.optionSets[scenario.impactQuestion.optionSet]),
      );
    }
  });

  it('never chooses Unknown, which would show the widest possible range', () => {
    const chosen = [
      ...Object.values(sample.organisationAnswers),
      ...Object.values(sample.scenarioAnswers).flatMap((answers) => Object.values(answers)),
    ];

    expect(chosen.length).toBeGreaterThan(0);
    expect(chosen).not.toContain(publicModel.unknownCode);
  });

  it('is deterministic, so the sample is the same demonstration every time', () => {
    const again = buildSampleAssessment(publicModel);
    expect(again).toEqual(sample);
  });
});

describe('assessment scope', () => {
  it('asks every step in a full assessment', () => {
    const quickScenarioCode = publicModel.scenarios[0].code;
    expect(activeStepsFor(questionSteps, 'full', quickScenarioCode)).toHaveLength(questionSteps.length);
  });

  it('asks the profile and one scenario in a quick check', () => {
    const scenario = publicModel.scenarios[0];
    const quick = activeStepsFor(questionSteps, 'quick', scenario.code);

    expect(quick).toHaveLength(publicModel.profileQuestions.length + 2);
    expect(quick.filter((step) => step.kind === 'profile')).toHaveLength(publicModel.profileQuestions.length);
    expect(quick.filter((step) => step.kind === 'scenario').every((step) => step.scenarioCode === scenario.code)).toBe(
      true,
    );
  });

  it('falls back to the full sequence when no quick scenario is chosen', () => {
    expect(activeStepsFor(questionSteps, 'quick', null)).toHaveLength(questionSteps.length);
  });

  it('exposes the same sequence through the store helper the screens use', () => {
    const scenario = publicModel.scenarios[2];
    expect(stepsForScope('quick', scenario.code)).toEqual(activeStepsFor(questionSteps, 'quick', scenario.code));
    expect(stepsForScope('full', null)).toEqual(questionSteps);
  });
});
