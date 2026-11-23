/**
 * Deterministic JSON serialisation.
 *
 * Object keys are sorted at every depth. Arrays keep their order by default; callers can pass a
 * normaliser to sort semantic sets before serialisation. The function is pure and never hashes:
 * callers that need an identity compare the returned string directly.
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type CanonicalNormaliser = (value: unknown, key?: string) => unknown;

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

function canonicalise(value: unknown, key: string | undefined, normalise: CanonicalNormaliser | undefined): JsonValue {
  const normalised = normalise === undefined ? value : normalise(value, key);

  if (Array.isArray(normalised)) {
    return normalised.map((entry) => canonicalise(entry, undefined, normalise));
  }

  if (isPlainObject(normalised)) {
    const sorted: Record<string, JsonValue> = {};
    for (const property of Object.keys(normalised).sort(compareText)) {
      sorted[property] = canonicalise(normalised[property], property, normalise);
    }

    return sorted;
  }

  if (
    normalised === null ||
    typeof normalised === 'boolean' ||
    typeof normalised === 'number' ||
    typeof normalised === 'string'
  ) {
    return normalised;
  }

  return String(normalised);
}

/** Serialises a value with sorted object keys. */
export function canonicalJson(value: unknown, normalise?: CanonicalNormaliser): string {
  return JSON.stringify(canonicalise(value, undefined, normalise));
}
