/**
 * QuickRisk Decision Lab — API client.
 *
 * Same-origin only, same envelope and security conventions as the QuickRisk Live client. The
 * compute endpoints return values the QuickRisk engine produced on the server; the browser never
 * re-derives them, and the server validates every payload before it is used.
 */

import { z } from 'zod';
import type {
  DecisionProvenance,
  Portfolio,
  PortfolioSearch,
  SensitivityResult,
  TreatmentCatalogue,
  TreatmentComparison,
  TreatmentDefinition,
} from '@/decision/domain/decisionTypes';

const API_BASE = `${import.meta.env.BASE_URL}live/api/`;

const ENVELOPE = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

export class DecisionApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'DecisionApiError';
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'DELETE';
  readonly body?: unknown;
  readonly csrfToken?: string;
  readonly signal?: AbortSignal;
}

/**
 * Sends one request and unwraps the envelope.
 *
 * Only the envelope is validated here, so a failed or malformed response can never be mistaken
 * for a result. The payload is typed below and validated again by the server.
 */
async function request<T>(
  path: string,
  schema: z.ZodTypeAny,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', 'X-QuickRisk-Live': '1' };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.csrfToken !== undefined) {
    headers['X-Live-Csrf'] = options.csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      referrerPolicy: 'same-origin',
      signal: options.signal,
    });
  } catch {
    throw new DecisionApiError('NETWORK_ERROR', 'Decision Lab could not reach the server.');
  }

  const payload: unknown = await response.json().catch(() => null);
  const envelope = ENVELOPE.safeParse(payload);

  if (!envelope.success) {
    throw new DecisionApiError('RESPONSE_INVALID', 'The server response could not be read.', response.status);
  }
  if (envelope.data.ok !== true) {
    throw new DecisionApiError(
      envelope.data.error?.code ?? 'REQUEST_FAILED',
      envelope.data.error?.message ?? 'The request could not be completed.',
      response.status,
    );
  }

  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) {
    throw new DecisionApiError(
      'RESPONSE_INVALID',
      'The server response did not match the expected Decision Lab shape.',
      response.status,
    );
  }

  return parsed.data as T;
}

/** The assessment fields the compute endpoints need (already in memory from the questionnaire). */
export interface AssessmentAnswers {
  readonly schemaVersion: string;
  readonly modelId: string;
  readonly disclaimer: { readonly acknowledged: boolean; readonly version: string };
  readonly organisationAnswers: readonly { readonly questionCode: string; readonly optionCode: string }[];
  readonly scenarioAnswers: readonly {
    readonly scenarioCode: string;
    readonly answers: readonly { readonly questionCode: string; readonly optionCode: string }[];
  }[];
}

/** Compatibility aliases; the domain types are the single definition. */
export type ComparisonResponse = TreatmentComparison;
export type PortfolioResponse = PortfolioSearch;

export interface SavedDecisionSummary {
  readonly publicId: string;
  readonly title: string;
  readonly appetiteStatus: string;
  readonly baselineEal: number;
  readonly treatedEal: number;
  readonly initialInvestment: number;
  readonly annualOperatingCost: number;
  readonly decisionMethodologyVersion: string;
  readonly status: string;
  /** True when an active share link exists, even though its raw token cannot be re-displayed. */
  readonly hasActiveShare?: boolean;
  readonly createdAt: string;
}

/** A decision analysis as stored and replayed for the Board Risk Pack. */
export interface StoredDecision {
  readonly publicId: string;
  readonly title: string;
  readonly appetiteStatus: string;
  readonly baselineEal: number;
  readonly treatedEal: number;
  readonly initialInvestment: number;
  readonly annualOperatingCost: number;
  readonly decisionMethodologyVersion: string;
  readonly boardPackVersion: string;
  readonly quickriskModelId: string;
  readonly quickriskModelVersion: string;
  readonly simulationSeed: number;
  readonly iterations: number;
  readonly status: string;
  readonly hasActiveShare?: boolean;
  readonly createdAt: string;
  readonly selection: {
    readonly treatments?: readonly TreatmentDefinition[];
    readonly comparison?: ComparisonResponse;
    readonly portfolios?: PortfolioResponse;
    readonly sensitivity?: SensitivityResult | null;
    readonly appetite?: Readonly<Record<string, number | null>>;
    /** The basis that produced the saved report (Phase 1 records). */
    readonly reportBasis?: {
      readonly kind?: 'comparison' | 'recommended-portfolio';
      readonly inputKey?: string;
      readonly recommendationState?: 'recommended' | 'none-satisfies' | 'evaluated-other' | 'not-evaluated';
      readonly treatmentIds?: readonly string[];
    };
  };
  readonly recommendedPortfolio?: Partial<Portfolio>;
}


const effectEstimateSchema = z.object({
  min: z.number(),
  mostLikely: z.number(),
  max: z.number(),
});

const costSchema = z.object({
  initialInvestment: z.number(),
  annualOperatingCost: z.number(),
  horizonYears: z.number().int().positive(),
  annualisedTreatmentCost: z.number(),
  implementationDelayDays: z.number().int().nonnegative(),
});

const treatmentSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string(),
  shortDescription: z.string(),
  businessOutcome: z.string(),
  applicableScenarios: z.array(z.string()).min(1),
  causalEffects: z.object({
    frequency: effectEstimateSchema.nullable(),
    magnitude: effectEstimateSchema.nullable(),
  }),
  implementationDelayDays: z.number().int().nonnegative(),
  initialCost: z.object({ amount: z.number(), currency: z.string() }),
  annualOperatingCost: z.object({ amount: z.number(), currency: z.string() }),
  evidenceQuality: z.enum([
    'measured_internal',
    'validated_benchmark',
    'industry',
    'vendor',
    'expert_judgement',
    'illustrative',
  ]),
  mechanismGroup: z.enum([
    'identity',
    'endpoint',
    'network',
    'email',
    'data-resilience',
    'response',
    'governance',
  ]),
  interactionDefaults: z.object({ sameGroupIndependentCoverage: z.number() }),
  assumptions: z.array(z.string()),
  reviewedAt: z.string(),
  reviewOwner: z.string(),
  evidenceReference: z.string(),
  origin: z.enum(['curated', 'custom']),
  enabled: z.boolean(),
});

const appetiteCriterionSchema = z.object({
  id: z.string(),
  label: z.string(),
  limit: z.number(),
  actual: z.number(),
  unit: z.string(),
  passes: z.boolean(),
  threshold: z.number().nullable(),
});

const appetiteEvaluationSchema = z.object({
  status: z.enum(['within', 'above', 'undefined']),
  label: z.string(),
  message: z.string(),
  criteria: z.array(appetiteCriterionSchema),
});

const summarySchema = z.object({
  expectedAnnualLoss: z.number(),
  p10: z.number(),
  p25: z.number(),
  p50: z.number(),
  p75: z.number(),
  p90: z.number(),
  minimum: z.number(),
  maximum: z.number(),
  iterations: z.number().int().positive(),
  thresholdProbabilities: z.record(z.string(), z.number()),
  thresholdExceedanceCounts: z.record(z.string(), z.number().int().nonnegative()),
  scenarioContributions: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      shortLabel: z.string(),
      expectedAnnualLoss: z.number(),
      factor: z.number(),
    }),
  ),
});

const provenanceSchema = z.object({
  quickriskModelId: z.string(),
  quickriskModelVersion: z.string(),
  decisionMethodologyVersion: z.string(),
  boardPackVersion: z.string(),
  effectModel: z.string(),
  simulationSeed: z.number().int(),
  inputFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  iterations: z.number().int().positive(),
  planningHorizonYears: z.number().int().positive(),
  sameGroupIndependentCoverage: z.number(),
  generatedAt: z.string(),
});

const comparisonSchema = z.object({
  baseline: summarySchema,
  treated: summarySchema,
  delta: z.object({
    expectedAnnualLoss: z.number(),
    p90: z.number(),
    reductionShare: z.number(),
  }),
  appetite: z.object({
    baseline: appetiteEvaluationSchema,
    treated: appetiteEvaluationSchema,
    improved: z.boolean(),
  }),
  cost: costSchema,
  delayPhases: z.object({
    implementationDelayDays: z.number().int(),
    currentEal: z.number(),
    transitionYearEal: z.number(),
    steadyStateEal: z.number(),
    effectiveWithinOneYear: z.boolean(),
  }),
  riskReductionEfficiency: z.number().nullable(),
  factors: z.object({
    byScenario: z.record(
      z.string(),
      z.object({
        frequencyFactor: z.number(),
        magnitudeFactor: z.number(),
        kappa: z.number(),
        clampBound: z.boolean(),
      }),
    ),
    notes: z.array(z.string()),
    clampWarning: z.boolean(),
  }),
  effects: z.object({
    effects: z.record(
      z.string(),
      z.object({ frequency: z.number().nullable(), magnitude: z.number().nullable() }),
    ),
    draws: z.array(
      z.object({
        treatmentId: z.string(),
        seed: z.number().int(),
        frequency: z
          .object({ min: z.number(), mostLikely: z.number(), max: z.number(), realised: z.number() })
          .nullable(),
        magnitude: z
          .object({ min: z.number(), mostLikely: z.number(), max: z.number(), realised: z.number() })
          .nullable(),
      }),
    ),
  }),
  treatments: z.array(treatmentSchema),
  provenance: provenanceSchema,
});

const portfolioSchema = z.object({
  id: z.string(),
  treatmentIds: z.array(z.string()),
  cost: costSchema,
  treated: summarySchema,
  deltaEal: z.number(),
  reductionShare: z.number(),
  appetite: appetiteEvaluationSchema,
  withinAppetite: z.boolean(),
  constraintViolations: z.array(z.string()),
  clampWarning: z.boolean(),
  label: z.enum(['recommended', 'viable', 'high_value', 'dominated', 'infeasible']),
  labelText: z.string(),
  labelReason: z.string(),
});

const portfolioSearchSchema = z.object({
  baseline: summarySchema,
  portfolios: z.array(portfolioSchema),
  recommendedId: z.string().nullable(),
  paretoIds: z.array(z.string()),
  noneSatisfies: z.boolean(),
  noneSatisfiesMessage: z.string(),
  evaluated: z.number().int().nonnegative(),
  truncated: z.boolean(),
  candidatesConsidered: z.number().int().nonnegative(),
  appetiteDefined: z.boolean(),
  // Optional only so records saved before the EAL-only rule remain replayable in history.
  portfolioAppetiteDefined: z.boolean().optional(),
  appetiteBasis: z.literal('expected-annual-loss-only').optional(),
  portfolioCriteria: z.array(z.string()).optional(),
  excludedCriteria: z.array(z.string()).optional(),
  notes: z.array(z.string()),
  provenance: provenanceSchema,
});

const sensitivitySchema: z.ZodType<SensitivityResult> = z.object({
  available: z.boolean(),
  reason: z.string().optional(),
  alreadyWithinAppetite: z.boolean().optional(),
  breakEvenEffectiveness: z.number().nullable(),
  message: z.string().optional(),
  curve: z.array(
    z.object({
      effectiveness: z.number(),
      expectedAnnualLoss: z.number(),
      p90: z.number(),
      appetite: appetiteEvaluationSchema,
    }),
  ),
});

const savedDecisionSummarySchema: z.ZodType<SavedDecisionSummary> = z.object({
  publicId: z.string().min(16),
  title: z.string(),
  appetiteStatus: z.string(),
  baselineEal: z.number(),
  treatedEal: z.number(),
  initialInvestment: z.number(),
  annualOperatingCost: z.number(),
  decisionMethodologyVersion: z.string(),
  status: z.string(),
  hasActiveShare: z.boolean().optional(),
  createdAt: z.string(),
});

const storedDecisionSchema = z.object({
  publicId: z.string().min(16),
  title: z.string(),
  appetiteStatus: z.string(),
  baselineEal: z.number(),
  treatedEal: z.number(),
  initialInvestment: z.number(),
  annualOperatingCost: z.number(),
  decisionMethodologyVersion: z.string(),
  boardPackVersion: z.string(),
  quickriskModelId: z.string(),
  quickriskModelVersion: z.string(),
  simulationSeed: z.number().int(),
  iterations: z.number().int().positive(),
  status: z.string(),
  hasActiveShare: z.boolean().optional(),
  createdAt: z.string(),
  selection: z.object({
    treatments: z.array(treatmentSchema).optional(),
    comparison: comparisonSchema.optional(),
    portfolios: portfolioSearchSchema.optional(),
    sensitivity: sensitivitySchema.nullable().optional(),
    appetite: z.record(z.string(), z.number().nullable()).optional(),
    reportBasis: z
      .object({
        kind: z.enum(['comparison', 'recommended-portfolio']).optional(),
        inputKey: z.string().optional(),
        recommendationState: z
          .enum(['recommended', 'none-satisfies', 'evaluated-other', 'not-evaluated'])
          .optional(),
        treatmentIds: z.array(z.string()).optional(),
      })
      .optional(),
  }),
  recommendedPortfolio: portfolioSchema.partial().optional(),
}) as unknown as z.ZodType<StoredDecision>;

const catalogueSchema: z.ZodType<TreatmentCatalogue> = z.object({
  curated: z.array(treatmentSchema),
  custom: z.array(
    z.object({
      publicId: z.string(),
      treatmentId: z.string(),
      name: z.string(),
      mechanismGroup: z.string(),
      evidenceQuality: z.string(),
      definition: treatmentSchema,
      createdAt: z.string(),
    }),
  ),
  mechanismGroups: z.record(z.string(), z.string()),
  evidenceLevels: z.record(
    z.string(),
    z.object({ label: z.string(), confidence: z.string(), definition: z.string() }),
  ),
  methodologyVersion: z.string(),
});

export const decisionApi = {
  computeComparison: (body: Record<string, unknown>) =>
    request<ComparisonResponse>('decision-compute.php', comparisonSchema, {
      method: 'POST',
      body: { ...body, action: 'compare' },
    }),

  computePortfolios: (body: Record<string, unknown>) =>
    request<PortfolioResponse>('decision-compute.php', portfolioSearchSchema, {
      method: 'POST',
      body: { ...body, action: 'portfolios' },
    }),

  computeSensitivity: (body: Record<string, unknown>) =>
    request<{ sensitivity: SensitivityResult; provenance: DecisionProvenance }>(
      'decision-compute.php',
      z.object({ sensitivity: sensitivitySchema, provenance: provenanceSchema }),
      {
        method: 'POST',
        body: { ...body, action: 'sensitivity' },
      },
    ),

  catalogue: (csrfToken: string, signal?: AbortSignal) =>
    request<TreatmentCatalogue>('decision-treatments.php', catalogueSchema, { csrfToken, signal }),

  createCustomTreatment: (definition: Record<string, unknown>, csrfToken: string) =>
    request<{ publicId: string }>(
      'decision-treatments.php',
      z.object({ publicId: z.string().min(16) }).passthrough(),
      { method: 'POST', body: { definition }, csrfToken },
    ),

  deleteCustomTreatment: (publicId: string, csrfToken: string) =>
    request<{ deleted: true }>(
      `decision-treatments.php?id=${encodeURIComponent(publicId)}`,
      z.object({ deleted: z.literal(true) }),
      { method: 'DELETE', csrfToken },
    ),

  save: (body: Record<string, unknown>, csrfToken: string) =>
    request<SavedDecisionSummary>('decision-assessments.php', savedDecisionSummarySchema, {
      method: 'POST',
      body,
      csrfToken,
    }),

  list: (csrfToken: string, signal?: AbortSignal) =>
    request<readonly SavedDecisionSummary[]>('decision-assessments.php', z.array(savedDecisionSummarySchema), {
      csrfToken,
      signal,
    }),

  get: (publicId: string, csrfToken: string, signal?: AbortSignal) =>
    request<StoredDecision>(`decision-assessment.php?id=${encodeURIComponent(publicId)}`, storedDecisionSchema, {
      csrfToken,
      signal,
    }),

  archive: (publicId: string, csrfToken: string) =>
    request<{ archived: true }>(
      `decision-assessment.php?id=${encodeURIComponent(publicId)}`,
      z.object({ archived: z.literal(true) }),
      { method: 'DELETE', csrfToken },
    ),

  createShare: (publicId: string, csrfToken: string) =>
    request<{ shareUrl: string }>(
      `decision-share.php?id=${encodeURIComponent(publicId)}`,
      z.object({ shareUrl: z.string().min(1) }),
      {
        method: 'POST',
        body: {},
        csrfToken,
      },
    ),

  revokeShare: (publicId: string, csrfToken: string) =>
    request<{ revoked: true }>(
      `decision-share.php?id=${encodeURIComponent(publicId)}`,
      z.object({ revoked: z.literal(true) }),
      {
        method: 'DELETE',
        csrfToken,
      },
    ),

  shared: (token: string, signal?: AbortSignal) =>
    request<StoredDecision>(
      `decision-shared.php?token=${encodeURIComponent(token)}`,
      storedDecisionSchema,
      { signal },
    ),
};

