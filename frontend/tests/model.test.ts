import { describe, expect, it } from 'vitest';
import { publicModel } from '../shared/publicModel';
import { buildQuestionSteps, isQuestionnaireComplete, questionnaireProgress } from '@/domain/assessment';
import { countUnknownAnswers } from '@/domain/answers';

describe('public model adapter', () => {
  it('exposes the frozen model metadata', () => {
    expect(publicModel.version.modelId).toBe('FAIR-QK-1.3');
    expect(publicModel.version.modelVersion).toBe('1.3.0');
    expect(publicModel.version.calibrationVersion).toBe('CAL-1.3');
    expect(publicModel.version.defaultIterations).toBe(5000);
    expect(publicModel.version.retentionMode).toBe('zero-retention');
    expect(publicModel.version.lossThresholds).toContain(1_000_000);
  });

  it('publishes the annualisation and input-confidence limitations', () => {
    expect(publicModel.content.annualisationNotice.statement).toContain('annualised exposure');
    expect(publicModel.content.annualisationNotice.statement).toContain('not percentiles of realised annual loss');
    expect(publicModel.content.confidenceNotice.statement).toContain('not statistical confidence');
    expect(publicModel.content.reportLabels.annualisationNote).toContain('annualised exposure');
    expect(publicModel.content.reportLabels.confidenceNote).toContain('not statistical confidence');
    expect(publicModel.content.limitations.items.join(' ')).toContain('realised annual loss totals');
  });

  it('asks for threat event frequency before control effectiveness', () => {
    for (const scenario of publicModel.scenarios) {
      expect(scenario.likelihoodQuestion.text.toLowerCase()).toContain('before considering');
      expect(scenario.likelihoodQuestion.text.toLowerCase()).not.toContain('existing controls');
      expect(scenario.likelihoodQuestion.help.toLowerCase()).toContain('applied separately');
    }
  });

  it('names a short factor label for every organisation-profile question', () => {
    for (const question of publicModel.profileQuestions) {
      expect(question.shortLabel.length).toBeGreaterThan(0);
    }
  });

  it('defines exactly five scenarios in model order, each with two questions', () => {
    expect(publicModel.scenarios.map((scenario) => scenario.code)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5']);
    for (const scenario of publicModel.scenarios) {
      expect(scenario.likelihoodQuestion.text.length).toBeGreaterThan(0);
      expect(scenario.impactQuestion.text.length).toBeGreaterThan(0);
      expect(scenario.investigationPrompts.length).toBeGreaterThan(1);
      expect(scenario.likelihoodQuestion.code).not.toBe(scenario.impactQuestion.code);
    }
  });

  it('defines eight organisation-profile questions, one of them optional', () => {
    expect(publicModel.profileQuestions).toHaveLength(8);
    expect(publicModel.profileQuestions.filter((question) => question.required)).toHaveLength(7);
    expect(publicModel.profileQuestions.filter((question) => !question.required).map((q) => q.code)).toEqual(['QP8']);
  });

  it('resolves every option set referenced by the model', () => {
    for (const question of publicModel.profileQuestions) {
      expect(publicModel.optionSets[question.optionSet]).toBeDefined();
      expect(publicModel.optionSets[question.optionSet]?.options.length).toBeGreaterThan(1);
    }
    for (const scenario of publicModel.scenarios) {
      for (const question of [scenario.likelihoodQuestion, scenario.impactQuestion]) {
        expect(publicModel.optionSets[question.optionSet]).toBeDefined();
      }
    }
  });

  it('always offers an Unknown option and documents the retention claim', () => {
    expect(publicModel.unknownCode).toBe('UNKNOWN');
    for (const question of publicModel.profileQuestions) {
      const codes = publicModel.optionSets[question.optionSet]?.options.map((option) => option.code) ?? [];
      expect(codes).toContain('UNKNOWN');
    }
    expect(publicModel.content.disclaimer.paragraphs.length).toBeGreaterThanOrEqual(10);
    expect(publicModel.content.privacyNotice.statement).toContain('does not store');
    expect(publicModel.content.reportLabels.title).toBe('Indicative FAIR QuickRisk Assessment');
  });

  it('does not expose calibration values to the browser', () => {
    const serialised = JSON.stringify(publicModel);
    expect(serialised).not.toContain('frequencyScale');
    expect(serialised).not.toContain('unknownWiden');
    expect(serialised).not.toContain('secondaryLossMultiplier');
  });
});

describe('questionnaire flow', () => {
  const steps = buildQuestionSteps(publicModel);

  it('builds a flat sequence of profile questions followed by scenario questions', () => {
    expect(steps).toHaveLength(8 + 5 * 2);
    expect(steps.slice(0, 8).every((step) => step.kind === 'profile')).toBe(true);
    expect(steps[8]?.scenarioCode).toBe('S1');
    expect(steps[17]?.scenarioCode).toBe('S5');
    expect(steps[17]?.sectionLabel).toBe('DDoS / service disruption');
  });

  it('computes progress from the model, not from an estimate', () => {
    const progress = questionnaireProgress(steps, {}, {}, 0);
    expect(progress.total).toBe(18);
    expect(progress.position).toBe(1);
    expect(progress.percent).toBe(0);

    const answered = questionnaireProgress(steps, { QP1: '50_250M', QP2: 'HIGH' }, {}, 3);
    expect(answered.answered).toBe(2);
    expect(answered.percent).toBe(17);
  });

  it('requires every required answer before the questionnaire is complete', () => {
    const partial: Record<string, string> = {};
    for (const question of publicModel.profileQuestions.filter((entry) => entry.required)) {
      partial[question.code] = publicModel.optionSets[question.optionSet]?.options[0]?.code ?? 'UNKNOWN';
    }
    expect(isQuestionnaireComplete(steps, partial, {})).toBe(false);

    const scenarioAnswers: Record<string, Record<string, string>> = {};
    for (const scenario of publicModel.scenarios) {
      scenarioAnswers[scenario.code] = {
        [scenario.likelihoodQuestion.code]: 'POSSIBLE',
        [scenario.impactQuestion.code]: 'SIGNIFICANT',
      };
    }
    expect(isQuestionnaireComplete(steps, partial, scenarioAnswers)).toBe(true);
  });

  it('counts unknown answers for the confidence explanation', () => {
    expect(countUnknownAnswers({ QP1: 'UNKNOWN', QP2: 'HIGH' }, { S1: { S1A: 'UNKNOWN' } }, 'UNKNOWN')).toBe(2);
  });
});
