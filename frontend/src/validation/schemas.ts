/**
 * Zod schemas for the calculation API.
 *
 * The browser validates the request before sending it and validates the response
 * before rendering it. Neither replaces the server-side validation in PHP, which
 * is the authoritative check.
 */

import { z } from 'zod';
import { organisationEvidenceSchema } from '@/domain/evidence';

export const codeSchema = z.string().regex(/^[A-Z0-9_]{1,32}$/, 'Unexpected answer code format');

export const calculationRequestSchema = z.object({
  schemaVersion: z.string().min(1),
  modelId: z.string().min(1),
  disclaimer: z.object({
    acknowledged: z.literal(true),
    version: z.string().min(1),
  }),
  organisationAnswers: z
    .array(z.object({ questionCode: codeSchema, optionCode: codeSchema }))
    .min(7)
    .max(8),
  scenarioAnswers: z
    .array(
      z.object({
        scenarioCode: codeSchema,
        answers: z.array(z.object({ questionCode: codeSchema, optionCode: codeSchema })).length(2),
      }),
    )
    .length(5),
  organisationEvidence: organisationEvidenceSchema.optional(),
});

const lossRangeSchema = z.object({
  min: z.number(),
  mode: z.number(),
  max: z.number(),
});

const mixtureComponentSchema = z.object({
  optionCode: codeSchema,
  weight: z.number().positive(),
  min: z.number(),
  mode: z.number(),
  max: z.number(),
});

/**
 * A modelled input. `kind` is 'triangular' for a direct answer and 'mixture' when the answer
 * was Unknown; a mixture carries the components it samples from.
 */
const posteriorInputSchema = lossRangeSchema.extend({
  kind: z.literal('posterior'),
  components: z.array(mixtureComponentSchema),
  parameter: z.string().min(1),
  mean: z.number(),
  standardDeviation: z.number().nonnegative(),
  q025: z.number(),
  q500: z.number(),
  q975: z.number(),
  draws: z.number().int().positive(),
  evidenceIds: z.array(z.string()).optional(),
});

const inputRangeSchema = z.union([
  lossRangeSchema.extend({
    kind: z.enum(['triangular', 'mixture']),
    components: z.array(mixtureComponentSchema),
  }),
  posteriorInputSchema,
]);

const confidenceSchema = z.object({
  score: z.number().int().min(0).max(100),
  level: z.enum(['High', 'Medium', 'Low']),
  reasons: z.array(z.string()),
  basis: z.literal('heuristic-input-quality'),
  isStatisticalConfidence: z.literal(false),
  displayLabel: z.string().min(1),
  levelCapApplied: z.boolean(),
  maximumLevelWhenProvisional: z.string(),
});

const thresholdIntervalSchema = z.object({
  lower: z.number(),
  upper: z.number(),
  estimate: z.number(),
  successes: z.number().int().nonnegative(),
  trials: z.number().int().nonnegative(),
  sufficientCount: z.boolean(),
  note: z.string(),
});

const statisticsSchema = z.object({
  minimum: z.number(),
  p10: z.number(),
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
  p90: z.number(),
  maximum: z.number(),
  expectedAnnualLoss: z.number(),
  standardDeviation: z.number(),
  coefficientOfVariation: z.number(),
  expectedThreatEventFrequency: z.number(),
  meanSusceptibility: z.number(),
  expectedLossEventFrequency: z.number(),
  expectedLossMagnitude: z.number(),
  expectedPrimaryLossMagnitude: z.number(),
  expectedSecondaryLossMagnitude: z.number(),
  secondaryLossShare: z.number(),
  secondaryLossOccurrenceRate: z.number(),
  iterations: z.number().int().positive(),
  thresholdProbabilities: z.record(z.string(), z.number()),
  thresholdExceedanceCounts: z.record(z.string(), z.number().int().nonnegative()),
  meanStandardError: z.number().nonnegative().optional(),
  thresholdIntervals: z.record(z.string(), thresholdIntervalSchema).optional(),
});

const distributionSchema = z.object({
  binEdges: z.array(z.number()),
  counts: z.array(z.number().int().nonnegative()),
  overflowFrom: z.number(),
  overflowCount: z.number().int().nonnegative(),
  binWidth: z.number(),
});

const scenarioResultSchema = z.object({
  code: codeSchema,
  order: z.number().int().positive(),
  name: z.string().min(1),
  shortLabel: z.string().min(1),
  shortDescription: z.string(),
  statement: z.string(),
  answers: z.array(
    z.object({
      questionCode: codeSchema,
      questionText: z.string(),
      optionCode: codeSchema,
      label: z.string(),
      unknown: z.boolean(),
    }),
  ),
  inputs: z.record(z.string(), inputRangeSchema),
  appliedModifiers: z.array(
    z.object({
      modifier: z.string(),
      questionCode: z.string(),
      answerCode: z.string(),
      multiplier: z.number(),
      widen: z.number(),
      unknown: z.boolean(),
    }),
  ),
  lossAnchorSource: z.enum([
    'reported-daily-disruption-cost',
    'derived-from-profile',
    'elicitation-adjusted-reference-severity',
    'reference-class-severity',
  ]),
  statistics: statisticsSchema,
  distribution: distributionSchema,
  confidence: confidenceSchema,
  drivers: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      value: z.number(),
      unit: z.enum(['events/year', 'probability', 'currency']),
      detail: z.string(),
    }),
  ),
  driverIndex: z.object({
    frequency: z.number().int().min(0).max(100),
    magnitude: z.number().int().min(0).max(100),
    secondary: z.number().int().min(0).max(100),
  }),
  interpretation: z.object({
    summary: z.string(),
    rangeStatement: z.string(),
    thresholdStatement: z.string(),
    annualisationStatement: z.string().min(1),
    unknownStatement: z.string(),
    doesNotMean: z.string(),
    investigationPromptNote: z.string(),
  }),
  investigationPrompts: z.array(z.string()),
});

export const calculationResponseSchema = z.object({
  status: z.literal('ok'),
  meta: z.object({
    applicationVersion: z.string(),
    modelId: z.string(),
    modelVersion: z.string(),
    schemaVersion: z.string(),
    calibrationVersion: z.string(),
    methodologyVersion: z.string(),
    disclaimerVersion: z.string(),
    privacyNoticeVersion: z.string(),
    releaseStatus: z.string(),
    retentionMode: z.string(),
    currency: z.string(),
    currencySymbol: z.string(),
    iterations: z.number().int().positive(),
    scenarioCount: z.number().int().positive(),
    calculatedAt: z.string(),
    seedPersisted: z.literal(false),
    seedDisclosed: z.boolean(),
    simulationSeed: z.number().int().positive().optional(),
    jointPercentilesAvailable: z.boolean(),
    annualisationMethod: z.enum([
      'frequency-times-severity-annualised-exposure',
      'posterior-predictive-compound-poisson-annual-total',
    ]),
    realisedAnnualTotalsModelled: z.boolean(),
    annualisationLimitation: z.string().min(1),
    calibrationStatus: z.string(),
    inference: z
      .object({
        mode: z.enum(['posterior-reference-class', 'legacy-heuristic']),
        active: z.boolean(),
        packageVersion: z.string(),
        evidencePackageVersion: z.string(),
        status: z.string(),
        drawCount: z.number().int().nonnegative(),
        referencePackageHash: z.string(),
        validationScope: z.array(z.string()),
        knownValidationGap: z.string(),
        evidenceSources: z.array(
          z.object({
            id: z.string(),
            role: z.string(),
            classification: z.string(),
          }),
        ),
        evidenceUpdate: z
          .object({
            evidenceUsed: z.boolean(),
            materialLossEventCount: z.number().int().nonnegative().nullable(),
            effectiveSampleSize: z.number().nonnegative(),
            lowEffectiveSampleSize: z.boolean().optional(),
          })
          .optional(),
      })
      .optional(),
  }),
  portfolio: z.object({
    label: z.string(),
    expectedAnnualLoss: z.number(),
    annualisationNote: z.string().min(1),
    p10: z.number().optional(),
    p25: z.number().optional(),
    p50: z.number().optional(),
    p75: z.number().optional(),
    p90: z.number().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    standardDeviation: z.number().optional(),
    meanStandardError: z.number().optional(),
    thresholdProbabilities: z.record(z.string(), z.number()).optional(),
    thresholdExceedanceCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
    thresholdIntervals: z.record(z.string(), thresholdIntervalSchema).optional(),
    scenarioContributions: z.array(z.unknown()).optional(),
    topScenarios: z.array(
      z.object({
        rank: z.number().int().positive(),
        code: z.string(),
        name: z.string(),
        shortLabel: z.string(),
        expectedAnnualLoss: z.number(),
        confidence: z.enum(['High', 'Medium', 'Low']),
      }),
    ),
    highestP90: z
      .object({ code: z.string(), name: z.string(), shortLabel: z.string(), p90: z.number() })
      .nullable(),
    highestProbabilityAboveThreshold: z
      .object({
        code: z.string(),
        name: z.string(),
        shortLabel: z.string(),
        threshold: z.number(),
        probability: z.number(),
      })
      .nullable(),
    confidence: confidenceSchema,
    summary: z.string(),
    jointPercentilesNote: z.string(),
    sensitivity: z.object({
      factors: z.array(
        z.object({
          kind: z.enum(['profile', 'scenario']),
          questionCode: codeSchema,
          scenarioCode: codeSchema.nullable(),
          label: z.string().min(1),
          lowOption: codeSchema,
          lowExpectedAnnualLoss: z.number().nonnegative(),
          highOption: codeSchema,
          highExpectedAnnualLoss: z.number().nonnegative(),
          spreadRatio: z.number().min(1),
          baselineExpectedAnnualLoss: z.number().nonnegative(),
        }),
      ),
      factorCount: z.number().int().positive(),
      baselineExpectedAnnualLoss: z.number().nonnegative(),
      baselineMethod: z.enum(['analytic-expected-value', 'posterior-draw-expected-value']),
      method: z.string().min(1),
      note: z.string().min(1),
      truncated: z.boolean(),
    }),
  }),
  scenarios: z.array(scenarioResultSchema).length(5),
});

export const errorResponseSchema = z.object({
  status: z.literal('error'),
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
});
