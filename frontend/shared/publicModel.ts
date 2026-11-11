/**
 * Build-time adapter for the authoritative model.
 *
 * The model lives in version-controlled JSON outside the public web root. This
 * module imports the PUBLIC presentation files at build time and validates them
 * with Zod, so a malformed model fails the build instead of producing a broken
 * questionnaire.
 *
 * The calibration file is deliberately NOT imported here: it is server-only and is
 * excluded by tools/verify-frontend-boundary.mjs, which fails the build if any browser
 * source references it.
 */

import answerOptionsJson from '@model/answer-options.json';
import contentJson from '@model/content.json';
import manifestJson from '@model/manifest.json';
import questionsJson from '@model/questions.json';
import scenariosJson from '@model/scenarios.json';
import { z } from 'zod';
import type {
  AnswerOption,
  ContentBundle,
  ModelVersionMeta,
  OptionSet,
  ProfileQuestion,
  PublicModel,
  Scenario,
} from '@/domain/model';

const answerOptionSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  order: z.number().int(),
  unknown: z.boolean().optional(),
});

const optionSetSchema = z.object({
  label: z.string(),
  options: z.array(answerOptionSchema).min(2),
});

const profileQuestionSchema = z.object({
  code: z.string().min(1),
  order: z.number().int(),
  text: z.string().min(1),
  help: z.string().min(1),
  optionSet: z.string().min(1),
  required: z.boolean(),
  unknownAllowed: z.boolean(),
  profileFactor: z.string().min(1),
  purpose: z.string().min(1),
  /** Short factor name used by the sensitivity analysis. */
  shortLabel: z.string().min(1),
});

const scenarioQuestionSchema = z.object({
  code: z.string().min(1),
  template: z.string().min(1),
  optionSet: z.string().min(1),
  text: z.string().min(1),
  help: z.string().min(1),
});

const scenarioSchema = z.object({
  code: z.string().min(1),
  order: z.number().int(),
  name: z.string().min(1),
  shortLabel: z.string().min(1),
  shortDescription: z.string().min(1),
  statement: z.string().min(1),
  likelihoodQuestion: scenarioQuestionSchema,
  impactQuestion: scenarioQuestionSchema,
  drivers: z.array(z.object({ code: z.string(), label: z.string(), detail: z.string() })).min(1),
  investigationPrompts: z.array(z.string().min(1)).min(1),
  interpretationNote: z.string().min(1),
  doesNotMean: z.string().min(1),
});

const methodologySectionSchema = z.object({
  id: z.string().min(1),
  heading: z.string().min(1),
  paragraphs: z.array(z.string()).optional(),
  bullets: z.array(z.string()).optional(),
});

const manifestSchema = z.object({
  modelId: z.string().min(1),
  modelVersion: z.string().min(1),
  schemaVersion: z.string().min(1),
  calibrationVersion: z.string().min(1),
  applicationVersion: z.string().min(1),
  releaseStatus: z.string().min(1),
  currency: z.string().min(1),
  currencySymbol: z.string().min(1),
  defaultIterations: z.number().int().positive(),
  maxIterations: z.number().int().positive(),
  allowedIterations: z.array(z.number().int().positive()).min(1),
  lossThresholds: z.array(z.number().positive()).min(1),
  methodologyVersion: z.string().min(1),
  disclaimerVersion: z.string().min(1),
  privacyNoticeVersion: z.string().min(1),
  retentionMode: z.string().min(1),
  /** Declared by the model so the browser cannot present percentiles as realised totals. */
  realisedAnnualTotalsModelled: z.literal(false),
  annualisationMethod: z.string().min(1),
  sensitivityAvailable: z.boolean(),
  requiredProfileQuestions: z.array(z.string().min(1)),
  optionalProfileQuestions: z.array(z.string().min(1)),
  scenarioOrder: z.array(z.string().min(1)).length(5),
});

const questionsSchema = z.object({
  profileQuestions: z.array(profileQuestionSchema).min(7),
  scenarioQuestionTemplates: z.array(z.object({ template: z.string().min(1) })).min(2),
});

const answerOptionsSchema = z.object({
  unknownCode: z.string().min(1),
  optionSets: z.record(z.string(), optionSetSchema),
});

const scenariosSchema = z.object({
  scenarios: z.array(scenarioSchema).length(5),
});

const contentSchema = z.object({
  contentVersion: z.string().min(1),
  disclaimerVersion: z.string().min(1),
  disclaimer: z.object({
    title: z.string().min(1),
    acknowledgementLabel: z.string().min(1),
    shortForm: z.string().min(1),
    paragraphs: z.array(z.string().min(1)).min(8),
    legalReviewNote: z.string(),
  }),
  privacyNotice: z.object({
    version: z.string().min(1),
    title: z.string().min(1),
    statement: z.string().min(1),
    detail: z.array(z.string().min(1)).min(1),
  }),
  positioning: z.object({
    version: z.string(),
    productName: z.string().min(1),
    tagline: z.string().min(1),
    headline: z.string().min(1),
    subheadline: z.string().min(1),
    attribution: z.object({
      before: z.string().min(1),
      name: z.string().min(1),
      url: z.string().url(),
      after: z.string().min(1),
    }),
    timeEstimate: z.string().min(1),
  }),
  methodology: z.object({
    version: z.string(),
    title: z.string().min(1),
    summary: z.string().min(1),
    sections: z.array(methodologySectionSchema).min(12),
  }),
  terminology: z.object({
    intro: z.string().min(1),
    terms: z.array(z.object({ term: z.string().min(1), plain: z.string().min(1) })).min(8),
  }),
  limitations: z.object({
    title: z.string().min(1),
    items: z.array(z.string().min(1)).min(1),
    investigationPromptNote: z.string().min(1),
  }),
  /** Published so that the browser states the same input-confidence limitation as the engine. */
  confidenceNotice: z.object({
    title: z.string().min(1),
    statement: z.string().min(1),
    bullets: z.array(z.string().min(1)).min(1),
  }),
  /** Published so that the browser states the same annualisation limitation as the engine. */
  annualisationNotice: z.object({
    title: z.string().min(1),
    statement: z.string().min(1),
  }),
  outOfScope: z.array(z.string().min(1)).min(1),
  evidenceSources: z
    .array(
      z.object({
        name: z.string().min(1),
        publisher: z.string().min(1),
        url: z.string().min(1),
        note: z.string().min(1),
      }),
    )
    .min(1),
  reportLabels: z.object({
    title: z.string().min(1),
    subtitle: z.string().min(1),
    generatedNote: z.string().min(1),
    prohibitedTitleNote: z.string().min(1),
    annualisationNote: z.string().min(1),
    confidenceNote: z.string().min(1),
    sections: z.record(z.string(), z.string()),
  }),
});

function parsePublicModel(raw: unknown): PublicModel {
  const manifest = manifestSchema.parse((raw as { manifest: unknown }).manifest);
  const content = contentSchema.parse((raw as { content: unknown }).content);
  const questions = questionsSchema.parse((raw as { questions: unknown }).questions);
  const answerOptions = answerOptionsSchema.parse((raw as { answerOptions: unknown }).answerOptions);
  const scenarios = scenariosSchema.parse((raw as { scenarios: unknown }).scenarios);

  const scenarioOrder = manifest.scenarioOrder;
  const orderedScenarios = [...scenarios.scenarios].sort((left, right) => left.order - right.order);
  const modelOrderMatches =
    orderedScenarios.length === scenarioOrder.length &&
    orderedScenarios.every((scenario, index) => scenario.code === scenarioOrder[index]);

  if (!modelOrderMatches) {
    throw new Error('The model scenario order does not match the manifest scenario order.');
  }

  for (const scenario of orderedScenarios) {
    for (const question of [scenario.likelihoodQuestion, scenario.impactQuestion]) {
      if (answerOptions.optionSets[question.optionSet] === undefined) {
        throw new Error(`Scenario ${scenario.code} references unknown option set ${question.optionSet}`);
      }
    }
  }

  for (const question of questions.profileQuestions) {
    if (answerOptions.optionSets[question.optionSet] === undefined) {
      throw new Error(`Question ${question.code} references unknown option set ${question.optionSet}`);
    }
  }

  const version: ModelVersionMeta = {
    modelId: manifest.modelId,
    modelVersion: manifest.modelVersion,
    schemaVersion: manifest.schemaVersion,
    calibrationVersion: manifest.calibrationVersion,
    applicationVersion: manifest.applicationVersion,
    methodologyVersion: manifest.methodologyVersion,
    disclaimerVersion: manifest.disclaimerVersion,
    privacyNoticeVersion: manifest.privacyNoticeVersion,
    releaseStatus: manifest.releaseStatus,
    retentionMode: manifest.retentionMode,
    currency: manifest.currency,
    currencySymbol: manifest.currencySymbol,
    defaultIterations: manifest.defaultIterations,
    maximumIterations: manifest.maxIterations,
    allowedIterations: manifest.allowedIterations,
    lossThresholds: manifest.lossThresholds,
    requiredProfileQuestions: manifest.requiredProfileQuestions,
    optionalProfileQuestions: manifest.optionalProfileQuestions,
  };

  const contentBundle: ContentBundle = {
    disclaimerVersion: content.disclaimerVersion,
    disclaimer: content.disclaimer,
    privacyNotice: content.privacyNotice,
    positioning: content.positioning,
    methodology: content.methodology,
    terminology: content.terminology,
    limitations: content.limitations,
    confidenceNotice: content.confidenceNotice,
    annualisationNotice: content.annualisationNotice,
    outOfScope: content.outOfScope,
    evidenceSources: content.evidenceSources,
    reportLabels: content.reportLabels,
  };

  const optionSets: Record<string, OptionSet> = {};
  for (const [name, optionSet] of Object.entries(answerOptions.optionSets)) {
    optionSets[name] = {
      label: optionSet.label,
      options: [...optionSet.options]
        .sort((left, right) => left.order - right.order)
        .map<AnswerOption>((option) => ({
          code: option.code,
          label: option.label,
          order: option.order,
          unknown: option.unknown ?? false,
        })),
    };
  }

  return {
    version,
    content: contentBundle,
    profileQuestions: [...questions.profileQuestions].sort(
      (left, right) => left.order - right.order,
    ) as readonly ProfileQuestion[],
    optionSets,
    scenarios: orderedScenarios as readonly Scenario[],
    unknownCode: answerOptions.unknownCode,
  };
}

export const publicModel: PublicModel = parsePublicModel({
  manifest: manifestJson,
  content: contentJson,
  questions: questionsJson,
  answerOptions: answerOptionsJson,
  scenarios: scenariosJson,
});
