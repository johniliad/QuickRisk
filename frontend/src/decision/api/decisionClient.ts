/**
 * QuickRisk Decision Lab — API client.
 *
 * Same-origin only, same envelope and security conventions as the QuickRisk Live client. The
 * compute endpoints return values the QuickRisk engine produced on the server; the browser never
 * re-derives them, and the server validates every payload before it is used.
 */

import { z } from 'zod';

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
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
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

  return envelope.data.data as T;
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

import type {
  AppetiteEvaluation,
  DecisionCost,
  DecisionProvenance,
  DistributionSummary,
  Portfolio,
  SensitivityResult,
  TreatmentCatalogue,
  TreatmentDefinition,
} from '@/decision/domain/decisionTypes';

export interface ComparisonResponse {
  readonly baseline: DistributionSummary;
  readonly treated: DistributionSummary;
  readonly delta: { readonly expectedAnnualLoss: number; readonly p90: number; readonly reductionShare: number };
  readonly appetite: {
    readonly baseline: AppetiteEvaluation;
    readonly treated: AppetiteEvaluation;
    readonly improved: boolean;
  };
  readonly cost: DecisionCost;
  readonly delayPhases: {
    readonly implementationDelayDays: number;
    readonly currentEal: number;
    readonly transitionYearEal: number;
    readonly steadyStateEal: number;
    readonly effectiveWithinOneYear: boolean;
  };
  readonly riskReductionEfficiency: number | null;
  readonly factors: {
    readonly byScenario: Readonly<
      Record<
        string,
        {
          readonly frequencyFactor: number;
          readonly magnitudeFactor: number;
          readonly kappa: number;
          readonly clampBound: boolean;
        }
      >
    >;
    readonly notes: readonly string[];
    readonly clampWarning: boolean;
  };
  readonly effects: {
    readonly effects: Readonly<
      Record<string, { readonly frequency: number | null; readonly magnitude: number | null }>
    >;
    readonly draws: readonly {
      readonly treatmentId: string;
      readonly seed: number;
      readonly frequency:
        | { readonly min: number; readonly mostLikely: number; readonly max: number; readonly realised: number }
        | null;
      readonly magnitude:
        | { readonly min: number; readonly mostLikely: number; readonly max: number; readonly realised: number }
        | null;
    }[];
  };
  readonly treatments: readonly TreatmentDefinition[];
  readonly provenance: DecisionProvenance;
}

export interface PortfolioResponse {
  readonly baseline: DistributionSummary;
  readonly portfolios: readonly Portfolio[];
  readonly recommendedId: string | null;
  readonly paretoIds: readonly string[];
  readonly noneSatisfies: boolean;
  readonly noneSatisfiesMessage: string;
  readonly evaluated: number;
  readonly truncated: boolean;
  readonly candidatesConsidered: number;
  readonly appetiteDefined: boolean;
  readonly notes: readonly string[];
  readonly provenance: DecisionProvenance;
}

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
  readonly createdAt: string;
  readonly selection: {
    readonly treatments?: readonly TreatmentDefinition[];
    readonly comparison?: ComparisonResponse;
    readonly portfolios?: PortfolioResponse;
    readonly sensitivity?: SensitivityResult | null;
    readonly appetite?: Readonly<Record<string, number | null>>;
  };
  readonly recommendedPortfolio?: Partial<Portfolio>;
}


export const decisionApi = {
  computeComparison: (body: Record<string, unknown>) =>
    request<ComparisonResponse>('decision-compute.php', { method: 'POST', body: { ...body, action: 'compare' } }),

  computePortfolios: (body: Record<string, unknown>) =>
    request<PortfolioResponse>('decision-compute.php', { method: 'POST', body: { ...body, action: 'portfolios' } }),

  computeSensitivity: (body: Record<string, unknown>) =>
    request<{ sensitivity: SensitivityResult; provenance: DecisionProvenance }>('decision-compute.php', {
      method: 'POST',
      body: { ...body, action: 'sensitivity' },
    }),

  catalogue: (csrfToken: string, signal?: AbortSignal) =>
    request<TreatmentCatalogue>('decision-treatments.php', { csrfToken, signal }),

  createCustomTreatment: (definition: Record<string, unknown>, csrfToken: string) =>
    request<{ publicId: string }>('decision-treatments.php', { method: 'POST', body: { definition }, csrfToken }),

  deleteCustomTreatment: (publicId: string, csrfToken: string) =>
    request<unknown>(`decision-treatments.php?id=${encodeURIComponent(publicId)}`, { method: 'DELETE', csrfToken }),

  save: (body: Record<string, unknown>, csrfToken: string) =>
    request<SavedDecisionSummary>('decision-assessments.php', { method: 'POST', body, csrfToken }),

  list: (csrfToken: string, signal?: AbortSignal) =>
    request<readonly SavedDecisionSummary[]>('decision-assessments.php', { csrfToken, signal }),

  get: (publicId: string, csrfToken: string, signal?: AbortSignal) =>
    request<StoredDecision>(`decision-assessment.php?id=${encodeURIComponent(publicId)}`, { csrfToken, signal }),

  archive: (publicId: string, csrfToken: string) =>
    request<unknown>(`decision-assessment.php?id=${encodeURIComponent(publicId)}`, { method: 'DELETE', csrfToken }),

  createShare: (publicId: string, csrfToken: string) =>
    request<{ shareUrl: string }>(`decision-share.php?id=${encodeURIComponent(publicId)}`, {
      method: 'POST',
      body: {},
      csrfToken,
    }),

  revokeShare: (publicId: string, csrfToken: string) =>
    request<{ revoked: true }>(`decision-share.php?id=${encodeURIComponent(publicId)}`, {
      method: 'DELETE',
      csrfToken,
    }),

  shared: (token: string, signal?: AbortSignal) =>
    request<StoredDecision>(`decision-shared.php?token=${encodeURIComponent(token)}`, { signal }),
};

