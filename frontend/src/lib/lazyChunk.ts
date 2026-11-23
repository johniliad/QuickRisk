/**
 * Resilient loading of the on-demand views.
 *
 * The result, Live, Decision Lab and history screens are separate chunks. A chunk
 * request can fail for reasons that have nothing to do with the application: a
 * deployment that replaced the content-hashed file names while a page was open, a
 * corporate proxy that blocks or stalls a large script, a transient edge error. A
 * failed `import()` rejects the promise behind `React.lazy`, and without an error
 * boundary that leaves the visitor on the Suspense fallback ("Loading the results
 * view…") with no way forward.
 *
 * One retry covers a transient failure. A permanent one still rejects, so the error
 * boundary in `App` can replace the loading message with an explanation and a reload
 * control instead of an indefinite spinner. Nothing is persisted: the retry counter
 * lives in memory for the lifetime of the page.
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/** Attempts per chunk, including the first. */
export const IMPORT_ATTEMPTS = 2;

/** Pause between attempts. Short: the visitor is already waiting. */
export const IMPORT_RETRY_DELAY_MS = 400;

export interface ImportRetryOptions {
  /** Attempts including the first. Values below 1 are treated as 1. */
  attempts?: number;
  /** Delay between attempts in milliseconds. Zero retries immediately. */
  delayMs?: number;
}

function pause(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, delayMs);
  });
}

/**
 * Runs an importer, retrying a rejection a fixed number of times.
 *
 * The last error is rethrown unchanged when every attempt fails, so the caller keeps
 * the original message for the error boundary.
 */
export async function importWithRetry<T>(
  importer: () => Promise<T>,
  options: ImportRetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? IMPORT_ATTEMPTS);
  const delayMs = Math.max(0, options.delayMs ?? IMPORT_RETRY_DELAY_MS);

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await importer();
    } catch (error) {
      lastError = error;
      if (attempt < attempts && delayMs > 0) {
        await pause(delayMs);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('The requested view could not be downloaded.');
}

/**
 * `React.lazy` with the retry above.
 *
 * The generic mirrors React's own `lazy` signature (`T extends ComponentType<any>`):
 * a narrower constraint such as `ComponentType<never>` makes TypeScript infer the
 * props from the context instead of from the imported component, which then rejects
 * every real view. The importer must resolve to a module with a `default` export,
 * exactly as `lazy` requires; map a named export in the caller.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  options: ImportRetryOptions = {},
): LazyExoticComponent<T> {
  return lazy(() => importWithRetry(importer, options));
}
