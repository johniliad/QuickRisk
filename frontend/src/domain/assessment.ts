/**
 * Assessment flow types and progress calculation.
 *
 * The questionnaire is one flat, ordered sequence: the organisation-profile
 * questions first, then the two questions of each scenario in model order. That
 * keeps the navigation model (Back/Next over in-memory answers) simple and makes
 * the progress indicator exact.
 */

import type { PublicModel } from './model';

export type View =
  | 'landing'
  | 'disclaimer'
  | 'questionnaire'
  | 'calculating'
  | 'results'
  | 'scenario-detail'
  | 'methodology'
  | 'report'
  | 'live'
  | 'live-history'
  | 'live-executive'
  | 'live-methodology'
  | 'decision-lab';

export interface QuestionStep {
  readonly key: string;
  readonly kind: 'profile' | 'scenario';
  readonly questionCode: string;
  readonly optionSet: string;
  readonly text: string;
  readonly help: string;
  readonly required: boolean;
  readonly scenarioCode?: string;
  readonly sectionLabel: string;
  readonly questionLabel: string;
}

export interface QuestionnaireProgress {
  readonly position: number;
  readonly total: number;
  readonly percent: number;
  readonly answered: number;
  readonly sectionLabel: string;
  readonly questionLabel: string;
}

export function buildQuestionSteps(model: PublicModel): readonly QuestionStep[] {
  const steps: QuestionStep[] = [];

  model.profileQuestions.forEach((question, index) => {
    steps.push({
      key: `profile:${question.code}`,
      kind: 'profile',
      questionCode: question.code,
      optionSet: question.optionSet,
      text: question.text,
      help: question.help,
      required: question.required,
      sectionLabel: 'Organisation profile',
      questionLabel: `Question ${index + 1} of ${model.profileQuestions.length}`,
    });
  });

  for (const scenario of model.scenarios) {
    const scenarioQuestions = [scenario.likelihoodQuestion, scenario.impactQuestion];
    scenarioQuestions.forEach((question, index) => {
      steps.push({
        key: `scenario:${scenario.code}:${question.code}`,
        kind: 'scenario',
        questionCode: question.code,
        optionSet: question.optionSet,
        text: question.text,
        help: question.help,
        required: true,
        scenarioCode: scenario.code,
        sectionLabel: scenario.name,
        questionLabel: `Question ${index + 1} of ${scenarioQuestions.length}`,
      });
    });
  }

  return steps;
}

export function questionnaireProgress(
  steps: readonly QuestionStep[],
  organisationAnswers: Readonly<Record<string, string>>,
  scenarioAnswers: Readonly<Record<string, Readonly<Record<string, string>>>>,
  currentStepIndex: number,
): QuestionnaireProgress {
  let answered = 0;
  for (const step of steps) {
    const optionCode =
      step.kind === 'profile'
        ? organisationAnswers[step.questionCode]
        : scenarioAnswers[step.scenarioCode ?? '']?.[step.questionCode];
    if (optionCode !== undefined) {
      answered += 1;
    }
  }

  const current = steps[Math.min(Math.max(currentStepIndex, 0), Math.max(steps.length - 1, 0))];
  const total = steps.length;
  const position = Math.min(currentStepIndex + 1, Math.max(total, 1));

  return {
    position,
    total,
    percent: total === 0 ? 0 : Math.round(((position - 1) / total) * 100),
    answered,
    sectionLabel: current?.sectionLabel ?? '',
    questionLabel: current?.questionLabel ?? '',
  };
}

export function answerForStep(
  step: QuestionStep,
  organisationAnswers: Readonly<Record<string, string>>,
  scenarioAnswers: Readonly<Record<string, Readonly<Record<string, string>>>>,
): string | undefined {
  return step.kind === 'profile'
    ? organisationAnswers[step.questionCode]
    : scenarioAnswers[step.scenarioCode ?? '']?.[step.questionCode];
}

export function isQuestionnaireComplete(
  steps: readonly QuestionStep[],
  organisationAnswers: Readonly<Record<string, string>>,
  scenarioAnswers: Readonly<Record<string, Readonly<Record<string, string>>>>,
): boolean {
  return steps.every((step) => {
    const optionCode = answerForStep(step, organisationAnswers, scenarioAnswers);
    if (optionCode === undefined) {
      return !step.required;
    }
    return true;
  });
}
