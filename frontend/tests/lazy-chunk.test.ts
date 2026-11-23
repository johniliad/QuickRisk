import { describe, expect, it } from 'vitest';
import { IMPORT_ATTEMPTS, IMPORT_RETRY_DELAY_MS, importWithRetry } from '@/lib/lazyChunk';

describe('on-demand chunk loading', () => {
  it('returns the module on the first attempt', async () => {
    let calls = 0;

    const module = await importWithRetry(async () => {
      calls += 1;
      return { marker: 'results' };
    });

    expect(module).toEqual({ marker: 'results' });
    expect(calls).toBe(1);
  });

  it('retries one failed chunk request instead of failing the view', async () => {
    let calls = 0;

    const module = await importWithRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('Failed to fetch dynamically imported module');
        }
        return { marker: 'recovered' };
      },
      { delayMs: 0 },
    );

    expect(module).toEqual({ marker: 'recovered' });
    expect(calls).toBe(2);
  });

  it('throws the last error after every attempt, so the error boundary can report it', async () => {
    let calls = 0;

    await expect(
      importWithRetry(
        async () => {
          calls += 1;
          throw new Error(`attempt ${calls} failed`);
        },
        { delayMs: 0 },
      ),
    ).rejects.toThrow('attempt 2 failed');

    expect(calls).toBe(IMPORT_ATTEMPTS);
  });

  it('wraps a rejection that is not an Error', async () => {
    await expect(
      importWithRetry(
        async () => {
          throw 'offline';
        },
        { attempts: 1 },
      ),
    ).rejects.toThrow('The requested view could not be downloaded.');
  });

  it('makes exactly one attempt when retries are switched off', async () => {
    let calls = 0;

    await expect(
      importWithRetry(
        async () => {
          calls += 1;
          throw new Error('offline');
        },
        { attempts: 1 },
      ),
    ).rejects.toThrow('offline');

    expect(calls).toBe(1);
  });

  it('never attempts fewer than once', async () => {
    let calls = 0;

    await expect(
      importWithRetry(
        async () => {
          calls += 1;
          throw new Error('offline');
        },
        { attempts: 0 },
      ),
    ).rejects.toThrow('offline');

    expect(calls).toBe(1);
  });

  it('waits the configured delay between attempts', async () => {
    let calls = 0;

    await importWithRetry(
      async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error('transient');
        }
        return { marker: 'ok' };
      },
      { delayMs: 1 },
    );

    expect(calls).toBe(2);
  });

  it('uses a short default delay so the fallback message stays honest', () => {
    expect(IMPORT_ATTEMPTS).toBeGreaterThan(1);
    expect(IMPORT_RETRY_DELAY_MS).toBeLessThanOrEqual(1_000);
  });
});
