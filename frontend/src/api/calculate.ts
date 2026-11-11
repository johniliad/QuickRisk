/**
 * Calculation API client.
 *
 * A single HTTPS POST sends the complete assessment once. The request carries no
 * identifier, no cookie and no assessment token; the response is validated with Zod
 * before anything is rendered. No result is written to any storage medium.
 */

import type { CalculationRequest } from '@/domain/answers';
import type { CalculationResponse } from '@/domain/results';
import { calculationRequestSchema, calculationResponseSchema, errorResponseSchema } from '@/validation/schemas';

const DEFAULT_ENDPOINT = '/api/calculate.php';
const REQUEST_TIMEOUT_MS = 60_000;

/** Endpoint location. Override with VITE_API_BASE for a different deployment path. */
export const calculationEndpoint: string = import.meta.env.VITE_API_BASE ?? DEFAULT_ENDPOINT;

export class CalculationError extends Error {
  readonly code: string;

  readonly status: number;

  constructor(code: string, message: string, status = 0) {
    super(message);
    this.name = 'CalculationError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Validates, sends and validates the response of one calculation request.
 */
export async function requestCalculation(request: CalculationRequest): Promise<CalculationResponse> {
  // Defence in depth: the same shape is validated again in PHP.
  const payload = calculationRequestSchema.parse(request);

  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(calculationEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-QuickRisk-Request': '1',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new CalculationError(
        'REQUEST_TIMEOUT',
        'The calculation took too long to complete. Please try again.',
        408,
      );
    }
    throw new CalculationError(
      'NETWORK_ERROR',
      'The calculation could not be sent. Please check your connection and try again.',
      0,
    );
  } finally {
    globalThis.clearTimeout(timeout);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = errorResponseSchema.safeParse(body);
    if (parsedError.success) {
      throw new CalculationError(
        parsedError.data.error.code,
        parsedError.data.error.message,
        response.status,
      );
    }
    throw new CalculationError(
      'CALCULATION_FAILED',
      'The calculation could not be completed. Please try again.',
      response.status,
    );
  }

  const parsed = calculationResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new CalculationError(
      'RESPONSE_INVALID',
      'The calculation response could not be validated and has not been displayed.',
      response.status,
    );
  }

  return parsed.data;
}

/**
 * Plain-language guidance for a failed calculation, without exposing internals.
 */
export function describeCalculationError(error: unknown): string {
  if (error instanceof CalculationError) {
    switch (error.code) {
      case 'MODEL_UNAVAILABLE':
        return 'The risk model is temporarily unavailable. Please try again shortly.';
      case 'RATE_LIMITED':
        return 'Too many calculations were requested from this browser. Please wait a few minutes and try again.';
      case 'REQUEST_TIMEOUT':
        return 'The calculation did not complete in time. Your answers are still in this page, so you can try again.';
      case 'DISCLAIMER_NOT_ACKNOWLEDGED':
      case 'DISCLAIMER_VERSION_MISMATCH':
        return 'The disclaimer must be acknowledged at its current version. Please review and accept it again.';
      default:
        return error.message;
    }
  }

  return 'The calculation could not be completed. Please try again.';
}
