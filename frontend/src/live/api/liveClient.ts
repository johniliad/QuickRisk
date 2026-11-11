/**
 * QuickRisk Live — API client.
 *
 * All calls are same-origin, send an opaque anonymous-session cookie that the browser
 * cannot read (HttpOnly), and carry a per-session CSRF token that the server returns with
 * the session payload. Nothing is cached and nothing is persisted in the browser.
 *
 * The API is for persistence only: the risk mathematics stays in the TypeScript engine.
 */

import { z } from 'zod';
import type { IncidentStage, RiskBand, SOCInputState } from '@/live/domain/socTypes';
import { STAGE_ORDER } from '@/live/domain/socTypes';

/** Base path of the Live API, relative to the deployed application base. */
const API_BASE = `${import.meta.env.BASE_URL}live/api/`;

export const SOC_STATE_SCHEMA = z.object({
  scenarioId: z.string().min(1).max(64),
  incidentStage: z.enum(STAGE_ORDER),
  iocCount: z.number().int().min(0).max(15),
  iocConfidence: z.number().min(0.1).max(1),
  alertVelocity: z.number().min(1).max(5),
  isEdrIsolated: z.boolean(),
  isNetworkBlocked: z.boolean(),
  isIdentityRevoked: z.boolean(),
});

export const RISK_RESULT_SCHEMA = z.object({
  telemetryScore: z.number().min(0).max(100),
  mitigationFactor: z.number().min(0).max(1),
  socMultiplier: z.number().min(0.2).max(4),
  realTimeRisk: z.number().int().min(0).max(100),
  riskBand: z.enum(['Low', 'Medium', 'High', 'Critical']),
  baselineEal: z.number().min(0),
  realTimeEal: z.number().min(0),
  methodologyVersion: z.string().min(1),
  trace: z.record(z.string(), z.unknown()),
});

const SESSION_SCHEMA = z.object({
  csrfToken: z.string().min(16),
  expiresAt: z.string().min(1),
  sessionLabel: z.string().min(1),
});

const ASSESSMENT_SUMMARY_SCHEMA = z.object({
  publicId: z.string().min(16),
  title: z.string(),
  scenarioId: z.string(),
  scenarioName: z.string(),
  baselineEal: z.number(),
  telemetryScore: z.number(),
  mitigationFactor: z.number(),
  socMultiplier: z.number(),
  realTimeRisk: z.number(),
  riskBand: z.enum(['Low', 'Medium', 'High', 'Critical']),
  realTimeEal: z.number(),
  methodologyVersion: z.string(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  hasActiveShare: z.boolean(),
});

const TIMELINE_EVENT_SCHEMA = z.object({
  sequenceNo: z.number().int(),
  offsetMs: z.number().int(),
  eventType: z.string(),
  label: z.string(),
  state: SOC_STATE_SCHEMA,
  result: RISK_RESULT_SCHEMA,
});

const ASSESSMENT_DETAIL_SCHEMA = ASSESSMENT_SUMMARY_SCHEMA.extend({
  inputState: SOC_STATE_SCHEMA,
  result: RISK_RESULT_SCHEMA,
  timeline: z.array(TIMELINE_EVENT_SCHEMA),
  shareUrl: z.string().nullable(),
  baselineModelId: z.string(),
  baselineModelVersion: z.string(),
});

const SCENARIO_SCHEMA = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  shortDescription: z.string(),
  longDescription: z.string(),
  scenarioVersion: z.string(),
  defaultState: SOC_STATE_SCHEMA,
  timeline: z.array(
    z.object({
      offsetMs: z.number().int().min(0),
      label: z.string().min(1),
      state: SOC_STATE_SCHEMA,
    }),
  ),
  executiveSummaryTemplate: z.string(),
});

export type LiveSession = z.infer<typeof SESSION_SCHEMA>;
export type LiveAssessmentSummary = z.infer<typeof ASSESSMENT_SUMMARY_SCHEMA>;
export type LiveAssessmentDetail = z.infer<typeof ASSESSMENT_DETAIL_SCHEMA>;
export type LiveTimelineEvent = z.infer<typeof TIMELINE_EVENT_SCHEMA>;
export type LiveScenarioPreset = z.infer<typeof SCENARIO_SCHEMA>;

export class LiveApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'LiveApiError';
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly body?: unknown;
  readonly csrfToken?: string;
  readonly signal?: AbortSignal;
}

const ENVELOPE = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

async function request<T>(path: string, schema: z.ZodType<T>, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-QuickRisk-Live': '1',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.csrfToken !== undefined) {
    headers['X-Live-Csrf'] = options.csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
      credentials: 'same-origin',
      redirect: 'error',
      referrerPolicy: 'same-origin',
      signal: options.signal,
    });
  } catch {
    throw new LiveApiError(
      'NETWORK_ERROR',
      'QuickRisk Live could not reach the server. Your current simulation is still in this page.',
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  const envelope = ENVELOPE.safeParse(payload);

  if (!envelope.success) {
    throw new LiveApiError('RESPONSE_INVALID', 'The server response could not be read.', response.status);
  }
  if (envelope.data.ok !== true) {
    const error = envelope.data.error;
    throw new LiveApiError(
      error?.code ?? 'REQUEST_FAILED',
      error?.message ?? 'The request could not be completed.',
      response.status,
    );
  }

  const parsed = schema.safeParse(envelope.data.data);
  if (!parsed.success) {
    throw new LiveApiError('RESPONSE_INVALID', 'The server response did not match the expected shape.', response.status);
  }

  return parsed.data;
}

export const liveApi = {
  /** Creates or renews the anonymous session and returns the CSRF token. */
  session: (signal?: AbortSignal) => request('session.php', SESSION_SCHEMA, { signal }),

  listAssessments: (csrfToken: string, signal?: AbortSignal) =>
    request('assessments.php', z.array(ASSESSMENT_SUMMARY_SCHEMA), { csrfToken, signal }),

  createAssessment: (body: unknown, csrfToken: string) =>
    request('assessments.php', ASSESSMENT_DETAIL_SCHEMA, { method: 'POST', body, csrfToken }),

  getAssessment: (publicId: string, csrfToken: string, signal?: AbortSignal) =>
    request(`assessment.php?id=${encodeURIComponent(publicId)}`, ASSESSMENT_DETAIL_SCHEMA, {
      csrfToken,
      signal,
    }),

  updateAssessment: (publicId: string, body: unknown, csrfToken: string) =>
    request(`assessment.php?id=${encodeURIComponent(publicId)}`, ASSESSMENT_DETAIL_SCHEMA, {
      method: 'PUT',
      body,
      csrfToken,
    }),

  archiveAssessment: (publicId: string, csrfToken: string) =>
    request(`archive.php?id=${encodeURIComponent(publicId)}`, ASSESSMENT_SUMMARY_SCHEMA, {
      method: 'POST',
      body: {},
      csrfToken,
    }),

  saveTimeline: (publicId: string, body: unknown, csrfToken: string) =>
    request(`timeline.php?id=${encodeURIComponent(publicId)}`, z.array(TIMELINE_EVENT_SCHEMA), {
      method: 'POST',
      body,
      csrfToken,
    }),

  createShare: (publicId: string, csrfToken: string) =>
    request(`share.php?id=${encodeURIComponent(publicId)}`, z.object({ shareUrl: z.string().min(1) }), {
      method: 'POST',
      body: {},
      csrfToken,
    }),

  revokeShare: (publicId: string, csrfToken: string) =>
    request(`share.php?id=${encodeURIComponent(publicId)}`, z.object({ revoked: z.literal(true) }), {
      method: 'DELETE',
      csrfToken,
    }),

  shared: (token: string, signal?: AbortSignal) =>
    request(`shared.php?token=${encodeURIComponent(token)}`, ASSESSMENT_DETAIL_SCHEMA, { signal }),

  scenarios: (signal?: AbortSignal) => request('scenarios.php', z.array(SCENARIO_SCHEMA), { signal }),
};

/** Convenience aliases for callers that only need the input types. */
export type LiveSocState = SOCInputState;
export type LiveRiskBand = RiskBand;
export type LiveIncidentStage = IncidentStage;