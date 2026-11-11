/**
 * Presentation formatting helpers.
 *
 * Currency values are rounded to executive-readable units. The rounding logic
 * mirrors the server-side formatter so that generated narrative text and on-screen
 * values agree.
 */

export function trimNumber(value: string): string {
  if (!value.includes('.')) {
    return value === '' || value === '-' ? '0' : value;
  }
  const trimmed = value.replace(/0+$/, '').replace(/\.$/, '');
  return trimmed === '' || trimmed === '-' ? '0' : trimmed;
}

/** Executive-readable money: €0.4M, €1.8M, €5.7M, €480k, €1.2bn. */
export function formatMoney(value: number, symbol = '€'): string {
  if (!Number.isFinite(value)) {
    return `${symbol}0`;
  }
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000_000) {
    return `${symbol}${trimNumber((value / 1_000_000_000).toFixed(1))}bn`;
  }
  if (absolute >= 1_000_000) {
    return `${symbol}${trimNumber((value / 1_000_000).toFixed(1))}M`;
  }
  if (absolute >= 1_000) {
    return `${symbol}${trimNumber((value / 1_000).toFixed(0))}k`;
  }
  return `${symbol}${trimNumber(value.toFixed(0))}`;
}

/** Full-precision money for tables and the printable report. */
export function formatMoneyExact(value: number, currency = 'EUR', locale = 'en-GB'): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPercent(probability: number, decimals = 1): string {
  if (!Number.isFinite(probability)) {
    return '—';
  }
  const value = probability * 100;
  if (value > 0 && value < 0.1) {
    return '<0.1%';
  }
  return `${trimNumber(value.toFixed(decimals))}%`;
}

export function formatRate(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  return trimNumber(value.toFixed(decimals));
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en-GB').format(value);
}

export function formatTimestamp(isoTimestamp: string, locale = 'en-GB'): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return isoTimestamp;
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(parsed);
}

export function formatIterations(iterations: number): string {
  return new Intl.NumberFormat('en-GB').format(iterations);
}

export function formatDriverValue(value: number, unit: string, symbol = '€'): string {
  switch (unit) {
    case 'currency':
      return formatMoney(value, symbol);
    case 'probability':
      return formatPercent(value);
    default:
      return formatRate(value);
  }
}
