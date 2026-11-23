/**
 * CSRF retry policy for Live writes.
 *
 * A write is attempted once. If (and only if) the server reports an explicit CSRF failure, the
 * caller refreshes the anonymous session once and retries the write once. Other errors are never
 * retried, and the second failure is returned unchanged.
 */

import { LiveApiError } from '@/live/api/liveClient';

export type SessionTokenProvider = (forceRefresh?: boolean) => Promise<string | null>;

const isCsrfFailure = (error: unknown): boolean =>
  error instanceof LiveApiError && (error.code === 'CSRF_REQUIRED' || error.code === 'CSRF_INVALID');

export async function retryCsrfOnce<T>(
  getToken: SessionTokenProvider,
  write: (csrfToken: string) => Promise<T>,
): Promise<T> {
  const token = await getToken();
  if (token === null) {
    throw new Error('The anonymous session could not be prepared.');
  }

  try {
    return await write(token);
  } catch (error) {
    if (!isCsrfFailure(error)) {
      throw error;
    }

    const refreshed = await getToken(true);
    if (refreshed === null) {
      throw error;
    }

    return write(refreshed);
  }
}
