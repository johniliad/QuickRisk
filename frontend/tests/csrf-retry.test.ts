import { describe, expect, it } from 'vitest';
import { LiveApiError } from '@/live/api/liveClient';
import { retryCsrfOnce } from '@/live/api/csrfRetry';

describe('CSRF retry policy', () => {
  it('refreshes once and retries once after an explicit CSRF failure', async () => {
    const requested: boolean[] = [];
    const usedTokens: string[] = [];
    let attempts = 0;

    const result = await retryCsrfOnce(
      async (forceRefresh = false) => {
        requested.push(forceRefresh);
        return forceRefresh ? 'fresh-token' : 'stale-token';
      },
      async (token) => {
        usedTokens.push(token);
        attempts++;
        if (attempts === 1) {
          throw new LiveApiError('CSRF_INVALID', 'The request security token is not valid.', 403);
        }

        return 'written';
      },
    );

    expect(result).toBe('written');
    expect(requested).toEqual([false, true]);
    expect(usedTokens).toEqual(['stale-token', 'fresh-token']);
    expect(attempts).toBe(2);
  });

  it('does not retry a non-CSRF failure', async () => {
    let attempts = 0;
    let refreshes = 0;

    await expect(
      retryCsrfOnce(
        async () => {
          refreshes++;
          return 'token';
        },
        async () => {
          attempts++;
          throw new LiveApiError('NOT_FOUND', 'Assessment not found.', 404);
        },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(attempts).toBe(1);
    expect(refreshes).toBe(1);
  });

  it('fails closed when no session token can be obtained', async () => {
    await expect(
      retryCsrfOnce(
        async () => null,
        async () => 'never-written',
      ),
    ).rejects.toThrow('anonymous session');
  });
});
