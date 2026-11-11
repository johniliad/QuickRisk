/**
 * QuickRisk Decision Lab — domain types and business vocabulary.
 *
 * The default interface must never require statistical literacy (requirements 7–10, 48). The
 * labels below are the only ones Business Mode uses; the technical names live next to them in
 * small captions, or in Analyst Mode.
 */

export const DECISION_METHODOLOGY_VERSION = '1.0';
export const BOARD_PACK_VERSION = '1.0';

export type EvidenceQuality =
  | 'measured_internal'
  | 'validated_benchmark'
  | 'industry'
  | 'vendor'
  | 'expert_judgement'
  | 'illustrative';

export type MechanismGroup =
  | 'identity'
  | 'endpoint'
  | 'network'
  | 'email'
  | 'data-resilience'
  | 'response'
  | 'governance';

export type AppetiteStatus = 'within' | 'above' | 'undefined';

export type PortfolioLabel = 'recommended' | 'viable' | 'high_value' | 'dominated' | 'infeasible';

export interface EffectEstimate {
  readonly min: number;
  readonly mostLikely: number;
  readonly max: number;
}

export interface TreatmentDefinition {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly shortDescription: string;
  readonly businessOutcome: string;
  readonly applicableScenarios: readonly string[];
  readonly causalEffects: {
    readonly frequency: EffectEstimate | null;
    readonly magnitude: EffectEstimate | null;
  };
  readonly implementationDelayDays: number;
  readonly initialCost: { readonly amount: number; readonly currency: string };
  readonly annualOperatingCost: { readonly amount: number; readonly currency: string };
  readonly evidenceQuality: EvidenceQuality;
  readonly mechanismGroup: MechanismGroup;
  readonly interactionDefaults: { readonly sameGroupIndependentCoverage: number };
  readonly assumptions: readonly string[];
  readonly reviewedAt: string;
  readonly reviewOwner: string;
  readonly evidenceReference: string;
  readonly origin: 'curated' | 'custom';
  readonly enabled: boolean;
}

export interface CustomTreatmentDefinition {
  name: string;
  businessOutcome: string;
  shortDescription: string;
  applicableScenarios: string[];
  causalEffects: {
    frequency: EffectEstimate | null;
    magnitude: EffectEstimate | null;
  };
  implementationDelayDays: number;
  initialCost: number;
  annualOperatingCost: number;
  evidenceQuality: EvidenceQuality;
  mechanismGroup: MechanismGroup;
  assumptionNotes: string;
}

export interface Appetite {
  annualLossLimit: number | null;
  highEndLimit: number | null;
  maxExceedanceProbability: number | null;
}

export interface AppetiteCriterionResult {
  readonly id: string;
  readonly label: string;
  readonly limit: number;
  readonly actual: number;
  readonly unit: string;
  readonly passes: boolean;
  readonly threshold: number | null;
}

export interface AppetiteEvaluation {
  readonly status: AppetiteStatus;
  readonly label: string;
  readonly message: string;
  readonly criteria: readonly AppetiteCriterionResult[];
}

export interface DistributionSummary {
  readonly expectedAnnualLoss: number;
  readonly p10: number;
  readonly p25: number;
  readonly p50: number;
  readonly p75: number;
  readonly p90: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly iterations: number;
  readonly thresholdProbabilities: Readonly<Record<string, number>>;
  readonly thresholdExceedanceCounts: Readonly<Record<string, number>>;
  readonly scenarioContributions: readonly {
    readonly code: string;
    readonly name: string;
    readonly shortLabel: string;
    readonly expectedAnnualLoss: number;
    readonly factor: number;
  }[];
}

export interface DecisionCost {
  readonly initialInvestment: number;
  readonly annualOperatingCost: number;
  readonly horizonYears: number;
  readonly annualisedTreatmentCost: number;
  readonly implementationDelayDays: number;
}

export interface DelayPhases {
  readonly implementationDelayDays: number;
  readonly currentEal: number;
  readonly transitionYearEal: number;
  readonly steadyStateEal: number;
  readonly effectiveWithinOneYear: boolean;
}

export interface DecisionProvenance {
  readonly quickriskModelId: string;
  readonly quickriskModelVersion: string;
  readonly decisionMethodologyVersion: string;
  readonly boardPackVersion: string;
  readonly effectModel: string;
  readonly simulationSeed: number;
  readonly iterations: number;
  readonly planningHorizonYears: number;
  readonly sameGroupIndependentCoverage: number;
  readonly generatedAt: string;
}

export interface TreatmentComparison {
  readonly baseline: DistributionSummary;
  readonly treated: DistributionSummary;
  readonly delta: {
    readonly expectedAnnualLoss: number;
    readonly p90: number;
    readonly reductionShare: number;
  };
  readonly appetite: {
    readonly baseline: AppetiteEvaluation;
    readonly treated: AppetiteEvaluation;
    readonly improved: boolean;
  };
  readonly cost: DecisionCost;
  readonly delayPhases: DelayPhases;
  readonly riskReductionEfficiency: number | null;
  readonly factors: {
    readonly byScenario: Readonly<
      Record<
        string,
        {
          readonly frequencyFactor: number;
          readonly magnitudeFactor: number;
          readonly kappa: number;
          readonly clampBound: boolean;
        }
      >
    >;
    readonly notes: readonly string[];
    readonly clampWarning: boolean;
  };
  readonly effects: {
    readonly effects: Readonly<
      Record<string, { readonly frequency: number | null; readonly magnitude: number | null }>
    >;
    readonly draws: readonly {
      readonly treatmentId: string;
      readonly seed: number;
      readonly frequency:
        | { readonly min: number; readonly mostLikely: number; readonly max: number; readonly realised: number }
        | null;
      readonly magnitude:
        | { readonly min: number; readonly mostLikely: number; readonly max: number; readonly realised: number }
        | null;
    }[];
  };
  readonly treatments: readonly TreatmentDefinition[];
  readonly provenance: DecisionProvenance;
}

export interface Portfolio {
  readonly id: string;
  readonly treatmentIds: readonly string[];
  readonly cost: DecisionCost;
  readonly treated: DistributionSummary;
  readonly deltaEal: number;
  readonly reductionShare: number;
  readonly appetite: AppetiteEvaluation;
  readonly withinAppetite: boolean;
  readonly constraintViolations: readonly string[];
  readonly clampWarning: boolean;
  readonly label: PortfolioLabel;
  readonly labelText: string;
  readonly labelReason: string;
}

export interface PortfolioSearch {
  readonly baseline: DistributionSummary;
  readonly portfolios: readonly Portfolio[];
  readonly recommendedId: string | null;
  readonly paretoIds: readonly string[];
  readonly noneSatisfies: boolean;
  readonly noneSatisfiesMessage: string;
  readonly evaluated: number;
  readonly truncated: boolean;
  readonly candidatesConsidered: number;
  readonly appetiteDefined: boolean;
  readonly notes: readonly string[];
  readonly provenance: DecisionProvenance;
}

export interface SensitivityResult {
  readonly available: boolean;
  readonly reason?: string;
  readonly alreadyWithinAppetite?: boolean;
  readonly breakEvenEffectiveness: number | null;
  readonly message?: string;
  readonly curve: readonly {
    readonly effectiveness: number;
    readonly expectedAnnualLoss: number;
    readonly p90: number;
    readonly appetite: AppetiteEvaluation;
  }[];
}

export interface TreatmentCatalogue {
  readonly curated: readonly TreatmentDefinition[];
  readonly custom: readonly {
    readonly publicId: string;
    readonly treatmentId: string;
    readonly name: string;
    readonly mechanismGroup: string;
    readonly evidenceQuality: string;
    readonly definition: TreatmentDefinition;
    readonly createdAt: string;
  }[];
  readonly mechanismGroups: Readonly<Record<string, string>>;
  readonly evidenceLevels: Readonly<Record<string, { label: string; confidence: string; definition: string }>>;
  readonly methodologyVersion: string;
}

/** Business labels for the technical distribution statistics. */
export const METRIC_LABELS = {
  expectedAnnualLoss: 'Expected Annual Loss',
  p90: 'High-End Modeled Loss',
  p50: 'Midpoint Modeled Loss',
  p10: 'Lower-End Modeled Loss',
} as const;

/** Acronym definitions, shown once per page at first use (requirements 4, 8 and 42). */
export const ACRONYMS: Readonly<Record<string, { term: string; short: string }>> = {
  EAL: {
    term: 'Expected Annual Loss',
    short: "The model's estimate of the average annual financial loss for the assessed scenarios.",
  },
  P10: { term: '10th percentile', short: 'A lower modeled loss level; about 10% of modeled years fall below it.' },
  P50: { term: '50th percentile', short: 'The midpoint of the modeled loss distribution.' },
  P90: { term: '90th percentile', short: 'A high-end modeled loss level; about 10% of modeled years exceed it.' },
  RRE: {
    term: 'Risk Reduction Efficiency',
    short: 'Modeled annual loss reduction per unit of annualised treatment cost. Not a financial return.',
  },
};

export const EVIDENCE_LABELS: Readonly<Record<EvidenceQuality, { label: string; confidence: string }>> = {
  measured_internal: { label: 'Measured internal evidence', confidence: 'HIGH CONFIDENCE' },
  validated_benchmark: { label: 'Validated benchmark', confidence: 'HIGH CONFIDENCE' },
  industry: { label: 'Industry evidence', confidence: 'MEDIUM CONFIDENCE' },
  vendor: { label: 'Vendor evidence', confidence: 'MEDIUM CONFIDENCE' },
  expert_judgement: { label: 'Expert judgement', confidence: 'LOW CONFIDENCE' },
  illustrative: { label: 'Illustrative assumption', confidence: 'LOW CONFIDENCE' },
};

export const MECHANISM_LABELS: Readonly<Record<MechanismGroup, string>> = {
  identity: 'Identity and access',
  endpoint: 'Endpoint',
  network: 'Network and perimeter',
  email: 'Email and user channel',
  'data-resilience': 'Data resilience and recovery',
  response: 'Detection and response',
  governance: 'Governance and process',
};

export const PORTFOLIO_LABELS: Readonly<Record<PortfolioLabel, string>> = {
  recommended: 'Recommended',
  viable: 'Viable alternative',
  high_value: 'High value / above appetite',
  dominated: 'Dominated',
  infeasible: 'Infeasible',
};

