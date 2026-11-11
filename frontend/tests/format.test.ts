import { describe, expect, it } from 'vitest';
import { formatDriverValue, formatMoney, formatMoneyExact, formatPercent, formatRate, formatTimestamp } from '@/lib/format';

describe('formatMoney', () => {
  it('rounds to executive-readable units', () => {
    expect(formatMoney(0)).toBe('€0');
    expect(formatMoney(480)).toBe('€480');
    expect(formatMoney(480_000)).toBe('€480k');
    expect(formatMoney(1_800_000)).toBe('€1.8M');
    expect(formatMoney(5_700_000)).toBe('€5.7M');
    expect(formatMoney(1_200_000_000)).toBe('€1.2bn');
  });

  it('never returns a value with trailing zeros or a dangling separator', () => {
    expect(formatMoney(2_000_000)).toBe('€2M');
    expect(formatMoney(250_000)).toBe('€250k');
    expect(formatMoney(0.4)).toBe('€0');
  });

  it('handles non-finite input without throwing', () => {
    expect(formatMoney(Number.NaN)).toBe('€0');
    expect(formatMoney(Number.POSITIVE_INFINITY)).toBe('€0');
  });
});

describe('formatMoneyExact', () => {
  it('formats a full currency value', () => {
    expect(formatMoneyExact(1_234_567)).toMatch(/1,234,567/);
    expect(formatMoneyExact(Number.NaN)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('formats probabilities and avoids false precision at the low end', () => {
    expect(formatPercent(0)).toBe('0%');
    expect(formatPercent(0.123)).toBe('12.3%');
    expect(formatPercent(0.0005)).toBe('<0.1%');
    expect(formatPercent(1)).toBe('100%');
  });
});

describe('formatRate', () => {
  it('formats event rates', () => {
    expect(formatRate(0.5)).toBe('0.5');
    expect(formatRate(2.25)).toBe('2.25');
    expect(formatRate(0)).toBe('0');
  });
});

describe('formatTimestamp', () => {
  it('formats an ISO timestamp and passes through unparseable input', () => {
    expect(formatTimestamp('2026-10-29T12:34:56Z')).toContain('2026');
    expect(formatTimestamp('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDriverValue', () => {
  it('formats by unit', () => {
    expect(formatDriverValue(1_500_000, 'currency')).toBe('€1.5M');
    expect(formatDriverValue(0.42, 'probability')).toBe('42%');
    expect(formatDriverValue(0.42, 'events/year')).toBe('0.42');
  });
});
