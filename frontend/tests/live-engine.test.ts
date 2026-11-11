import { describe, expect, it } from 'vitest';
import {
  BaselineEalError,
  SocInputError,
  activeControls,
  bandForRisk,
  calculateRealTimeRisk,
  validateSocInput,
} from '@/live/engine/socRiskEngine';
import {
  DEFAULT_SOC_STATE,
  LIVE_METHODOLOGY_VERSION,
  SOC_MULTIPLIER_MAX,
  SOC_MULTIPLIER_MIN,
  type SOCInputState,
} from '@/live/domain/socTypes';

/** Builds a valid state, overriding only the fields a test cares about. */
function state(overrides: Partial<SOCInputState> = {}): SOCInputState {
  return { ...DEFAULT_SOC_STATE, ...overrides };
}

/** Every combination of the three simulated response controls. */
const CONTROL_COMBINATIONS: readonly { edr: boolean; network: boolean; identity: boolean }[] = [
  { edr: false, network: false, identity: false },
  { edr: true, network: false, identity: false },
  { edr: false, network: true, identity: false },
  { edr: false, network: false, identity: true },
  { edr: true, network: true, identity: false },
  { edr: true, network: false, identity: true },
  { edr: false, network: true, identity: true },
  { edr: true, network: true, identity: true },
];

describe('QuickRisk Live methodology v1.0 — mandatory test vectors', () => {
  it('Test A: zero telemetry always yields a 1.00x multiplier, whatever the controls', () => {
    for (const controls of CONTROL_COMBINATIONS) {
      const result = calculateRealTimeRisk(
        state({
          incidentStage: 'none',
          iocCount: 0,
          alertVelocity: 1,
          isEdrIsolated: controls.edr,
          isNetworkBlocked: controls.network,
          isIdentityRevoked: controls.identity,
        }),
        100_000,
      );
      expect(result.telemetryScore).toBe(0);
      expect(result.socMultiplier).toBe(1);
      // Baseline preservation: controls never silently reduce the baseline exposure.
      expect(result.realTimeEal).toBe(100_000);
      expect(result.realTimeRisk).toBe(0);
      expect(result.riskBand).toBe('Low');
    }
  });

  it('Test B: maximum telemetry without mitigation yields 4.00x and a risk index of 100', () => {
    // 15 IOCs at 100% confidence = 180, plus active compromise 75, plus 4x velocity = 30.
    const result = calculateRealTimeRisk(
      state({ incidentStage: 'compromise', iocCount: 15, iocConfidence: 1, alertVelocity: 4 }),
      100_000,
    );
    expect(result.telemetryScore).toBe(100);
    expect(result.mitigationFactor).toBe(1);
    expect(result.socMultiplier).toBe(4);
    expect(result.realTimeRisk).toBe(100);
    expect(result.riskBand).toBe('Critical');
    expect(result.realTimeEal).toBe(400_000);
  });

  it('Test C: maximum telemetry with every control yields a 0.05 mitigation factor, 0.20x and index 5', () => {
    const result = calculateRealTimeRisk(
      state({
        incidentStage: 'compromise',
        iocCount: 15,
        iocConfidence: 1,
        alertVelocity: 4,
        isEdrIsolated: true,
        isNetworkBlocked: true,
        isIdentityRevoked: true,
      }),
      100_000,
    );
    expect(result.telemetryScore).toBe(100);
    expect(result.mitigationFactor).toBeCloseTo(0.05, 10);
    expect(result.socMultiplier).toBe(0.2);
    expect(result.realTimeRisk).toBe(5);
    expect(result.riskBand).toBe('Low');
    expect(result.realTimeEal).toBe(20_000);
  });

  it('Test D: real-time EAL is exactly the baseline multiplied by the SOC multiplier', () => {
    // telemetry 42 => 1 + 0.42 x 3 = 2.26
    const result = calculateRealTimeRisk(
      state({ incidentStage: 'triage', iocCount: 2, iocConfidence: 0.5, alertVelocity: 2 }),
      100_000,
    );
    expect(result.telemetryScore).toBe(42);
    expect(result.socMultiplier).toBe(2.26);
    expect(result.realTimeEal).toBe(226_000);
  });

  it('reports the methodology version with every result', () => {
    expect(calculateRealTimeRisk(state(), 1).methodologyVersion).toBe(LIVE_METHODOLOGY_VERSION);
  });
});

describe('QuickRisk Live engine — stage, IOC and velocity contributions', () => {
  it('scores each incident stage as documented', () => {
    const stages = [
      ['none', 0],
      ['triage', 20],
      ['anomaly', 45],
      ['compromise', 75],
    ] as const;

    for (const [stage, expected] of stages) {
      const result = calculateRealTimeRisk(state({ incidentStage: stage }), 1);
      expect(result.telemetryScore).toBe(expected);
      expect(result.trace.stageContribution).toBe(expected);
    }
  });

  it('weights each IOC by 12 and by the confidence ratio', () => {
    const low = calculateRealTimeRisk(state({ iocCount: 3, iocConfidence: 0.1 }), 1);
    const high = calculateRealTimeRisk(state({ iocCount: 3, iocConfidence: 1 }), 1);
    expect(low.trace.iocContribution).toBeCloseTo(3.6, 10);
    expect(high.trace.iocContribution).toBe(36);
    expect(high.trace.cappedTelemetry - low.trace.cappedTelemetry).toBeCloseTo(32.4, 10);
  });

  it('adds 10 points per unit of velocity above 1.0 and nothing at 1.0', () => {
    expect(calculateRealTimeRisk(state({ alertVelocity: 1 }), 1).trace.velocityContribution).toBe(0);
    expect(calculateRealTimeRisk(state({ alertVelocity: 5 }), 1).trace.velocityContribution).toBe(40);
  });

  it('caps the telemetry score at 100 and records the raw value in the trace', () => {
    const result = calculateRealTimeRisk(
      state({ incidentStage: 'compromise', iocCount: 15, iocConfidence: 1, alertVelocity: 5 }),
      1,
    );
    expect(result.trace.rawTelemetry).toBeGreaterThan(100);
    expect(result.trace.cappedTelemetry).toBe(100);
    expect(result.telemetryScore).toBe(100);
  });
});

describe('QuickRisk Live engine — controls, bounds and invariants', () => {
  it('applies the documented residual effect for every control combination', () => {
    const expected: Record<string, number> = {
      'false-false-false': 1,
      'true-false-false': 0.25,
      'false-true-false': 0.5,
      'false-false-true': 0.4,
      'true-true-false': 0.125,
      'true-false-true': 0.1,
      'false-true-true': 0.2,
      'true-true-true': 0.05,
    };

    for (const controls of CONTROL_COMBINATIONS) {
      const result = calculateRealTimeRisk(
        state({
          incidentStage: 'anomaly',
          iocCount: 4,
          iocConfidence: 0.6,
          alertVelocity: 2,
          isEdrIsolated: controls.edr,
          isNetworkBlocked: controls.network,
          isIdentityRevoked: controls.identity,
        }),
        50_000,
      );
      const key = `${controls.edr}-${controls.network}-${controls.identity}`;
      expect(result.mitigationFactor).toBeCloseTo(expected[key] ?? -1, 10);
    }
  });

  it('never leaves the documented multiplier, index or band range', () => {
    for (const stage of ['none', 'triage', 'anomaly', 'compromise'] as const) {
      for (let iocCount = 0; iocCount <= 15; iocCount += 1) {
        for (const iocConfidence of [0.1, 0.55, 1]) {
          for (const alertVelocity of [1, 3, 5]) {
            for (const controls of CONTROL_COMBINATIONS) {
              const result = calculateRealTimeRisk(
                state({
                  incidentStage: stage,
                  iocCount,
                  iocConfidence,
                  alertVelocity,
                  isEdrIsolated: controls.edr,
                  isNetworkBlocked: controls.network,
                  isIdentityRevoked: controls.identity,
                }),
                10_000,
              );
              expect(Number.isFinite(result.socMultiplier)).toBe(true);
              expect(result.socMultiplier).toBeGreaterThanOrEqual(SOC_MULTIPLIER_MIN);
              expect(result.socMultiplier).toBeLessThanOrEqual(SOC_MULTIPLIER_MAX);
              expect(result.realTimeRisk).toBeGreaterThanOrEqual(0);
              expect(result.realTimeRisk).toBeLessThanOrEqual(100);
              expect(Number.isInteger(result.realTimeRisk)).toBe(true);
              expect(Number.isFinite(result.realTimeEal)).toBe(true);
              expect(result.realTimeEal).toBeGreaterThanOrEqual(0);
              expect(['Low', 'Medium', 'High', 'Critical']).toContain(result.riskBand);
              expect(result.realTimeEal).toBeCloseTo(result.baselineEal * result.socMultiplier, 2);
            }
          }
        }
      }
    }
  });

  it('is deterministic: identical input yields identical output', () => {
    const input = state({ incidentStage: 'compromise', iocCount: 6, iocConfidence: 0.8, alertVelocity: 3 });
    const first = calculateRealTimeRisk(input, 125_000);
    const second = calculateRealTimeRisk(input, 125_000);
    expect(second).toEqual(first);
    // The pure engine must not read the clock.
    const engineSource = calculateRealTimeRisk.toString();
    expect(engineSource).not.toContain('Date.now');
    expect(engineSource).not.toContain('Math.random');
  });

  it('maps the risk index onto the documented bands', () => {
    expect(bandForRisk(0)).toBe('Low');
    expect(bandForRisk(19)).toBe('Low');
    expect(bandForRisk(20)).toBe('Medium');
    expect(bandForRisk(44)).toBe('Medium');
    expect(bandForRisk(45)).toBe('High');
    expect(bandForRisk(74)).toBe('High');
    expect(bandForRisk(75)).toBe('Critical');
    expect(bandForRisk(100)).toBe('Critical');
  });

  it('lists only the active controls', () => {
    expect(activeControls(state())).toHaveLength(0);
    expect(activeControls(state({ isNetworkBlocked: true }))).toEqual([
      { key: 'network', label: 'Network / perimeter blocking', reduction: 0.5 },
    ]);
  });
});

describe('QuickRisk Live engine — validation', () => {
  it('accepts the boundary values', () => {
    expect(validateSocInput(state({ iocCount: 0, iocConfidence: 0.1, alertVelocity: 1 }))).toEqual([]);
    expect(validateSocInput(state({ iocCount: 15, iocConfidence: 1, alertVelocity: 5 }))).toEqual([]);
  });

  it('rejects out-of-range values with a clear message', () => {
    expect(() => calculateRealTimeRisk(state({ iocCount: 16 }), 1)).toThrow(SocInputError);
    expect(() => calculateRealTimeRisk(state({ iocCount: -1 }), 1)).toThrow(SocInputError);
    expect(() => calculateRealTimeRisk(state({ iocCount: 1.5 }), 1)).toThrow(SocInputError);
    expect(() => calculateRealTimeRisk(state({ iocConfidence: 0.05 }), 1)).toThrow(SocInputError);
    expect(() => calculateRealTimeRisk(state({ iocConfidence: 1.01 }), 1)).toThrow(SocInputError);
    expect(() => calculateRealTimeRisk(state({ alertVelocity: 0.9 }), 1)).toThrow(SocInputError);
    expect(() => calculateRealTimeRisk(state({ alertVelocity: 5.1 }), 1)).toThrow(SocInputError);
    expect(() => calculateRealTimeRisk(state({ incidentStage: 'unknown' as never }), 1)).toThrow(SocInputError);
    expect(() => calculateRealTimeRisk(state({ iocConfidence: Number.NaN }), 1)).toThrow(SocInputError);
  });

  it('refuses to fabricate a baseline', () => {
    expect(() => calculateRealTimeRisk(state(), Number.NaN)).toThrow(BaselineEalError);
    expect(() => calculateRealTimeRisk(state(), -1)).toThrow(BaselineEalError);
    expect(() => calculateRealTimeRisk(state(), Number.POSITIVE_INFINITY)).toThrow(BaselineEalError);
    expect(calculateRealTimeRisk(state(), 0).realTimeEal).toBe(0);
  });
});
