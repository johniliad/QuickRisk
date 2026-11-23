import { afterEach, describe, expect, it, vi } from 'vitest';
import { comparison, portfolioSearch } from './e2e/fixtures';
import { decisionApi, DecisionApiError } from '@/decision/api/decisionClient';

const response = (data: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data }),
  }) as Response;

describe('Decision Lab response validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts a structurally valid comparison', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(comparison));

    const result = await decisionApi.computeComparison({});

    expect(result.baseline.expectedAnnualLoss).toBe(comparison.baseline.expectedAnnualLoss);
  });

  it('rejects a portfolio response with an unrecognised decision basis', async () => {
    const invalid = { ...portfolioSearch, appetiteBasis: 'joint-p90' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(invalid));

    await expect(decisionApi.computePortfolios({})).rejects.toMatchObject<Partial<DecisionApiError>>({
      code: 'RESPONSE_INVALID',
    });
  });
});
