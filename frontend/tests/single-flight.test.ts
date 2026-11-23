import { describe, expect, it } from 'vitest';
import { createSingleFlight } from '@/live/api/singleFlight';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
};

describe('single-flight helper', () => {
  it('starts one request for concurrent callers and gives both the same result', async () => {
    const gate = deferred<string>();
    let calls = 0;
    const run = createSingleFlight(() => {
      calls++;
      return gate.promise;
    });

    const first = run();
    const second = run();

    expect(calls).toBe(1);
    expect(second).toBe(first);

    gate.resolve('token');
    await expect(first).resolves.toBe('token');
    await expect(second).resolves.toBe('token');
  });

  it('starts a new request after the previous one has settled', async () => {
    let calls = 0;
    const run = createSingleFlight(async () => {
      calls++;
      return `token-${calls}`;
    });

    await expect(run()).resolves.toBe('token-1');
    await expect(run()).resolves.toBe('token-2');
    expect(calls).toBe(2);
  });

  it('clears a rejected request so a later caller can retry', async () => {
    let calls = 0;
    const run = createSingleFlight(async () => {
      calls++;
      if (calls === 1) {
        throw new Error('first request failed');
      }

      return 'recovered';
    });

    await expect(run()).rejects.toThrow('first request failed');
    await expect(run()).resolves.toBe('recovered');
    expect(calls).toBe(2);
  });
});
