/**
 * QuickRisk Decision Lab — immutable analysis snapshot.
 *
 * One snapshot owns the comparison, the portfolio search, the break-even result and the
 * recommended-subset comparison. Transitions reject a mismatched input key or provenance, so
 * responses from different analyses can never be combined.
 *
 * Pure: no React, no network, no clock.
 */

import type {
  DecisionProvenance,
  PortfolioSearch,
  SensitivityResult,
  TreatmentComparison,
} from '@/decision/domain/decisionTypes';

export type ReportTarget = 'comparison' | 'recommended-portfolio';

export interface DecisionSnapshot {
  /** Identity of the inputs this snapshot was computed from. */
  readonly inputKey: string;
  /** Comparison for the treatment set the user selected. */
  readonly comparison: TreatmentComparison;
  /** Portfolio search over the same inputs and candidate set, when one has been run. */
  readonly portfolios: PortfolioSearch | null;
  /** Break-even result over the same inputs and treatment set, when one has been run. */
  readonly sensitivity: SensitivityResult | null;
  /** Exact comparison for the recommended subset, when one has been prepared. */
  readonly recommendedComparison: TreatmentComparison | null;
  /** What the next report or save will describe. */
  readonly reportTarget: ReportTarget;
}

export class SnapshotKeyMismatchError extends Error {
  constructor() {
    super('The inputs changed while the request was running. Recalculate.');
    this.name = 'SnapshotKeyMismatchError';
  }
}

export class SnapshotProvenanceMismatchError extends Error {
  constructor() {
    super('The server response does not belong to this analysis. Recalculate.');
    this.name = 'SnapshotProvenanceMismatchError';
  }
}

export class SnapshotStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotStateError';
  }
}

export class SnapshotFingerprintError extends Error {
  constructor() {
    super('The server response did not include a valid analysis input fingerprint. Recalculate.');
    this.name = 'SnapshotFingerprintError';
  }
}

const SERVER_FINGERPRINT = /^[a-f0-9]{64}$/;

/** Every server response attached to a snapshot must carry its input fingerprint. */
export function assertServerFingerprint(provenance: DecisionProvenance): void {
  if (!SERVER_FINGERPRINT.test(provenance.inputFingerprint ?? '')) {
    throw new SnapshotFingerprintError();
  }
}

const PROVENANCE_FIELDS = [
  'quickriskModelId',
  'quickriskModelVersion',
  'decisionMethodologyVersion',
  'boardPackVersion',
  'simulationSeed',
  'iterations',
  'planningHorizonYears',
  'sameGroupIndependentCoverage',
] as const;

/** True when two responses were produced by the same model, versions, seed and iteration count. */
export function sameProvenance(left: DecisionProvenance, right: DecisionProvenance): boolean {
  return PROVENANCE_FIELDS.every((field) => left[field] === right[field]);
}

function assertKey(snapshot: DecisionSnapshot, inputKey: string): void {
  if (snapshot.inputKey !== inputKey) {
    throw new SnapshotKeyMismatchError();
  }
}

export function snapshotAfterComparison(
  inputKey: string,
  comparison: TreatmentComparison,
): DecisionSnapshot {
  assertServerFingerprint(comparison.provenance);

  return {
    inputKey,
    comparison,
    portfolios: null,
    sensitivity: null,
    recommendedComparison: null,
    reportTarget: 'comparison',
  };
}

export function attachPortfolios(
  snapshot: DecisionSnapshot,
  inputKey: string,
  portfolios: PortfolioSearch,
): DecisionSnapshot {
  assertKey(snapshot, inputKey);
  assertServerFingerprint(portfolios.provenance);
  if (
    snapshot.comparison.provenance.inputFingerprint !== portfolios.provenance.inputFingerprint ||
    !sameProvenance(snapshot.comparison.provenance, portfolios.provenance)
  ) {
    throw new SnapshotProvenanceMismatchError();
  }

  return {
    ...snapshot,
    portfolios,
    recommendedComparison: null,
    reportTarget: 'comparison',
  };
}

export function attachSensitivity(
  snapshot: DecisionSnapshot,
  inputKey: string,
  sensitivity: SensitivityResult,
  provenance: DecisionProvenance,
): DecisionSnapshot {
  assertKey(snapshot, inputKey);
  assertServerFingerprint(provenance);
  if (
    snapshot.comparison.provenance.inputFingerprint !== provenance.inputFingerprint ||
    !sameProvenance(snapshot.comparison.provenance, provenance)
  ) {
    throw new SnapshotProvenanceMismatchError();
  }

  return { ...snapshot, sensitivity };
}

export function attachRecommendedComparison(
  snapshot: DecisionSnapshot,
  inputKey: string,
  comparison: TreatmentComparison,
): DecisionSnapshot {
  assertKey(snapshot, inputKey);
  assertServerFingerprint(comparison.provenance);
  if (snapshot.portfolios === null) {
    throw new SnapshotStateError('A portfolio search is required before preparing a recommended report.');
  }
  if (!sameProvenance(snapshot.portfolios.provenance, comparison.provenance)) {
    throw new SnapshotProvenanceMismatchError();
  }

  return { ...snapshot, recommendedComparison: comparison };
}

export function selectReportTarget(
  snapshot: DecisionSnapshot,
  inputKey: string,
  target: ReportTarget,
): DecisionSnapshot {
  assertKey(snapshot, inputKey);

  return { ...snapshot, reportTarget: target };
}
