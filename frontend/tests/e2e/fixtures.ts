/**
 * Browser-test fixtures.
 *
 * Plain data modelling the same-origin API responses the real UI consumes. Playwright can then
 * exercise the actual React screens without a database or PHP host. No production code imports it.
 */

export const assessmentResults = {
  status: 'ok',
  meta: {
    applicationVersion: '1.3.3',
    modelId: 'FAIR-QK-1.3',
    modelVersion: '1.3.0',
    schemaVersion: '1.3.0',
    calibrationVersion: 'CAL-1.3',
    methodologyVersion: 'METH-1.3',
    disclaimerVersion: 'DISC-1.2',
    privacyNoticeVersion: 'PRIV-1.0',
    releaseStatus: 'released',
    retentionMode: 'zero-retention',
    currency: 'EUR',
    currencySymbol: '€',
    iterations: 5000,
    scenarioCount: 5,
    calculatedAt: '2026-11-22T10:00:00Z',
    seedPersisted: false,
    seedDisclosed: false,
    jointPercentilesAvailable: false,
    annualisationMethod: 'frequency-times-severity-annualised-exposure',
    realisedAnnualTotalsModelled: false,
    annualisationLimitation: 'Annualised exposure approximation.',
    calibrationStatus: 'calibrated',
  },
  portfolio: {
    label: 'Sum of scenario expected annual loss exposure',
    expectedAnnualLoss: 1365484.7,
    annualisationNote: 'Annualised exposure approximation.',
    topScenarios: [],
    highestP90: null,
    highestProbabilityAboveThreshold: null,
    confidence: {
      score: 75,
      level: 'Medium',
      reasons: [],
      basis: 'heuristic-input-quality',
      isStatisticalConfidence: false,
      displayLabel: 'Medium',
      levelCapApplied: false,
      maximumLevelWhenProvisional: 'High',
    },
    summary: '',
    jointPercentilesNote: '',
    sensitivity: {
      factors: [],
      factorCount: 0,
      baselineExpectedAnnualLoss: 1365484.7,
      baselineMethod: '',
      method: '',
      note: '',
      truncated: false,
    },
  },
  scenarios: [
    { code: 'S1', shortLabel: 'Ransomware', statistics: { expectedAnnualLoss: 765484.7 } },
    { code: 'S2', shortLabel: 'Business email compromise', statistics: { expectedAnnualLoss: 210000 } },
    { code: 'S3', shortLabel: 'Data breach', statistics: { expectedAnnualLoss: 180000 } },
    { code: 'S4', shortLabel: 'DDoS', statistics: { expectedAnnualLoss: 90000 } },
    { code: 'S5', shortLabel: 'Third-party outage', statistics: { expectedAnnualLoss: 120000 } },
  ],
};

export const fingerprint = 'a'.repeat(64);

export const provenance = {
  quickriskModelId: 'FAIR-QK-1.3',
  quickriskModelVersion: '1.3.0',
  decisionMethodologyVersion: '1.0',
  boardPackVersion: '1.0',
  effectModel: 'paired-driver-multiplicative',
  simulationSeed: 20261029,
  inputFingerprint: fingerprint,
  iterations: 5000,
  planningHorizonYears: 3,
  sameGroupIndependentCoverage: 0.65,
  generatedAt: '2026-11-22T10:00:00Z',
  computeBudget: { maxIterations: 10000, maxCandidates: 30, maxPortfolios: 256 },
};

export const treatment = {
  id: 'edr',
  version: '1.0',
  name: 'Endpoint Detection and Response',
  shortDescription: 'Detect and isolate compromised endpoints.',
  businessOutcome: 'Shorten attacker dwell time.',
  applicableScenarios: ['S1', 'S5'],
  causalEffects: {
    frequency: null,
    magnitude: { min: 0.1, mostLikely: 0.2, max: 0.3 },
  },
  implementationDelayDays: 30,
  initialCost: { amount: 10000, currency: 'EUR' },
  annualOperatingCost: { amount: 2000, currency: 'EUR' },
  evidenceQuality: 'industry',
  mechanismGroup: 'endpoint',
  interactionDefaults: { sameGroupIndependentCoverage: 0.65 },
  assumptions: ['Assumes full endpoint coverage within one quarter.'],
  reviewedAt: '2026-01-01',
  reviewOwner: 'Product security',
  evidenceReference: 'Industry evidence: endpoint coverage assumption.',
  origin: 'curated',
  enabled: true,
};

export const treatmentCatalogue = {
  curated: [treatment],
  custom: [],
  mechanismGroups: { endpoint: 'Endpoint' },
  evidenceLevels: {
    industry: {
      label: 'Industry evidence',
      confidence: 'MEDIUM CONFIDENCE',
      definition: 'Published industry data.',
    },
  },
  methodologyVersion: '1.0',
};

const summary = (eal: number, p90: number) => ({
  expectedAnnualLoss: eal,
  p10: eal * 0.4,
  p25: eal * 0.6,
  p50: eal * 0.8,
  p75: eal * 1.2,
  p90,
  minimum: 0,
  maximum: p90 * 2,
  iterations: 5000,
  thresholdProbabilities: {},
  thresholdExceedanceCounts: {},
  scenarioContributions: [],
});

const appetite = {
  status: 'undefined',
  label: 'Risk appetite has not been defined',
  message: 'Risk appetite has not been defined.',
  criteria: [],
};

export const comparison = {
  // The baseline mirrors the portfolio figure in `assessmentResults` (the same model, seed and
  // iteration budget), so the screen exercises its "within Monte Carlo noise" path.
  baseline: summary(1365484.7, 2730969.4),
  treated: summary(535839.3, 1071678.6),
  delta: {
    expectedAnnualLoss: 829645.4,
    p90: 1659290.8,
    reductionShare: 0.61,
  },
  appetite: { baseline: appetite, treated: appetite, improved: false },
  cost: {
    initialInvestment: 10000,
    annualOperatingCost: 2000,
    horizonYears: 3,
    annualisedTreatmentCost: 5333.33,
    implementationDelayDays: 30,
  },
  delayPhases: {
    implementationDelayDays: 30,
    currentEal: 1365484.7,
    transitionYearEal: 650662.0,
    steadyStateEal: 535839.3,
    effectiveWithinOneYear: true,
  },
  riskReductionEfficiency: 43.06,
  factors: { byScenario: {}, notes: [], clampWarning: false },
  effects: { effects: { edr: { frequency: null, magnitude: 0.2 } }, draws: [] },
  treatments: [treatment],
  provenance,
};

export const portfolioSearch = {
  baseline: comparison.baseline,
  portfolios: [
    {
      id: 'portfolio-edr',
      treatmentIds: ['edr'],
      cost: comparison.cost,
      treated: comparison.treated,
      deltaEal: comparison.delta.expectedAnnualLoss,
      reductionShare: comparison.delta.reductionShare,
      appetite: comparison.appetite.treated,
      withinAppetite: true,
      constraintViolations: [],
      clampWarning: false,
      label: 'recommended',
      labelText: 'Recommended',
      labelReason: 'Lowest-cost evaluated portfolio that meets the expected annual-loss criterion and constraints.',
    },
  ],
  recommendedId: 'portfolio-edr',
  paretoIds: ['portfolio-edr'],
  noneSatisfies: false,
  noneSatisfiesMessage: '',
  evaluated: 1,
  truncated: false,
  candidatesConsidered: 1,
  appetiteDefined: true,
  portfolioAppetiteDefined: true,
  appetiteBasis: 'expected-annual-loss-only',
  portfolioCriteria: ['annualLoss'],
  excludedCriteria: [],
  notes: [],
  provenance,
};

export const savedDecisionSummary = {
  publicId: 'SAVEDDECISION00000000001',
  title: 'Endpoint Detection and Response',
  appetiteStatus: 'undefined',
  baselineEal: comparison.baseline.expectedAnnualLoss,
  treatedEal: comparison.treated.expectedAnnualLoss,
  initialInvestment: comparison.cost.initialInvestment,
  annualOperatingCost: comparison.cost.annualOperatingCost,
  decisionMethodologyVersion: '1.0',
  status: 'saved',
  createdAt: '2026-11-22T10:00:00Z',
};

export const shareUrl = 'https://example.test/live/share/board/abcdefghijklmnopqrstuvwxyz012345';


export const liveState = {
  scenarioId: 'S1',
  incidentStage: 'none',
  iocCount: 0,
  iocConfidence: 0.5,
  alertVelocity: 1.0,
  isEdrIsolated: false,
  isNetworkBlocked: false,
  isIdentityRevoked: false,
};

export const liveResult = {
  telemetryScore: 40,
  mitigationFactor: 0.65,
  socMultiplier: 1.2,
  realTimeRisk: 50,
  riskBand: 'High',
  baselineEal: 765484.7,
  realTimeEal: 918581.64,
  methodologyVersion: '1.0',
  trace: {},
};

export const liveDetail = {
  publicId: 'LIVEASSESSMENT00000001',
  title: 'Finance rehearsal',
  scenarioId: 'S1',
  scenarioName: 'Ransomware',
  baselineEal: 765484.7,
  telemetryScore: liveResult.telemetryScore,
  mitigationFactor: liveResult.mitigationFactor,
  socMultiplier: liveResult.socMultiplier,
  realTimeRisk: liveResult.realTimeRisk,
  riskBand: liveResult.riskBand,
  realTimeEal: liveResult.realTimeEal,
  methodologyVersion: '1.0',
  status: 'saved',
  createdAt: '2026-11-22T10:00:00Z',
  updatedAt: '2026-11-22T10:00:00Z',
  hasActiveShare: false,
  inputState: liveState,
  result: liveResult,
  timeline: [],
  shareUrl: null,
  baselineModelId: 'FAIR-QK-1.3',
  baselineModelVersion: '1.3.0',
};

export const liveSummary = {
  publicId: liveDetail.publicId,
  title: liveDetail.title,
  scenarioId: liveDetail.scenarioId,
  scenarioName: liveDetail.scenarioName,
  baselineEal: liveDetail.baselineEal,
  telemetryScore: liveDetail.telemetryScore,
  mitigationFactor: liveDetail.mitigationFactor,
  socMultiplier: liveDetail.socMultiplier,
  realTimeRisk: liveDetail.realTimeRisk,
  riskBand: liveDetail.riskBand,
  realTimeEal: liveDetail.realTimeEal,
  methodologyVersion: liveDetail.methodologyVersion,
  status: liveDetail.status,
  createdAt: liveDetail.createdAt,
  updatedAt: liveDetail.updatedAt,
  hasActiveShare: false,
};

