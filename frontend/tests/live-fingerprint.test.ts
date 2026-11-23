import { describe, expect, it } from 'vitest';
import { DEFAULT_SOC_STATE, type SOCInputState, type TimelineEntry } from '@/live/domain/socTypes';
import { calculateRealTimeRisk } from '@/live/engine/socRiskEngine';
import { liveStateFingerprint } from '@/live/domain/liveFingerprint';
import type { LiveBaseline } from '@/live/domain/livePayload';

const baseline: LiveBaseline = {
  scenarioCode: 'S2',
  scenarioName: 'Ransomware',
  baselineEal: 500000,
  currencySymbol: '€',
  modelId: 'FAIR-QK-1.3',
  modelVersion: '1.3.0',
};

const soc = (overrides: Partial<SOCInputState> = {}): SOCInputState => ({
  ...DEFAULT_SOC_STATE,
  scenarioId: 'S2',
  incidentStage: 'triage',
  ...overrides,
});

const entry = (label: string, offsetMs: number, state = soc()): TimelineEntry => ({
  offsetMs,
  label,
  state,
  result: calculateRealTimeRisk(state, baseline.baselineEal),
});

const input = (overrides: Partial<Parameters<typeof liveStateFingerprint>[0]> = {}) => ({
  baseline,
  soc: soc(),
  timeline: [entry('Detection', 0)],
  title: 'Finance rehearsal',
  methodologyVersion: '1.0',
  ...overrides,
});

describe('QuickRisk Live saved-state fingerprint', () => {
  it('is stable for the same saved values', () => {
    expect(liveStateFingerprint(input())).toBe(liveStateFingerprint(input()));
  });

  it('does not depend on object key insertion order', () => {
    const reordered = Object.fromEntries(
      Object.entries(soc()).reverse(),
    ) as unknown as SOCInputState;

    expect(liveStateFingerprint(input({ soc: reordered }))).toBe(liveStateFingerprint(input()));
  });

  it('changes when a persisted value changes', () => {
    const original = liveStateFingerprint(input());

    expect(liveStateFingerprint(input({ title: 'A different title' }))).not.toBe(original);
    expect(liveStateFingerprint(input({ soc: soc({ iocCount: 3 }) }))).not.toBe(original);
    expect(liveStateFingerprint(input({ baseline: { ...baseline, baselineEal: 600000 } }))).not.toBe(
      original,
    );
    expect(liveStateFingerprint(input({ methodologyVersion: '2.0' }))).not.toBe(original);
    expect(liveStateFingerprint(input({ timeline: [entry('Containment', 30000)] }))).not.toBe(original);
  });

  it('keeps timeline order significant', () => {
    const first = entry('Detection', 0);
    const second = entry('Containment', 30000, soc({ incidentStage: 'anomaly' }));

    expect(liveStateFingerprint(input({ timeline: [first, second] }))).not.toBe(
      liveStateFingerprint(input({ timeline: [second, first] })),
    );
  });

  it('ignores derived result values because they cannot be edited independently', () => {
    const saved = entry('Detection', 0);
    const alteredResult = { ...saved.result, realTimeEal: saved.result.realTimeEal + 1 };

    expect(liveStateFingerprint(input({ timeline: [{ ...saved, result: alteredResult }] }))).toBe(
      liveStateFingerprint(input({ timeline: [saved] })),
    );
  });
});
