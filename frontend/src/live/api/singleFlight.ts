/**
 * Single-flight helper.
 *
 * The first caller starts the request; concurrent callers receive the same promise. Once the
 * request settles (resolved or rejected), the slot is cleared so a later caller can retry. This is
 * used for the anonymous session because the server rotates the CSRF token on every session read.
 */

export function createSingleFlight<T>(request: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;

  return () => {
    if (inFlight !== null) {
      return inFlight;
    }

    const start = (): Promise<T> => {
      try {
        return Promise.resolve(request());
      } catch (error) {
        return Promise.reject(error);
      }
    };

    const current = start().finally(() => {
      if (inFlight === current) {
        inFlight = null;
      }
    });
    inFlight = current;

    return current;
  };
}
