/**
 * Public model types.
 *
 * These types describe only the parts of the authoritative model that the browser
 * is allowed to see: scenario presentation, questions, answer options, version
 * metadata and user-facing content. Calibration parameters are server-only and are
 * never imported here.
 */

export type OptionCode = string;

export interface AnswerOption {
  readonly code: OptionCode;
  readonly label: string;
  readonly order: number;
  readonly unknown?: boolean;
}

export interface OptionSet {
  readonly label: string;
  readonly options: readonly AnswerOption[];
}

export interface ProfileQuestion {
  readonly code: string;
  readonly order: number;
  readonly text: string;
  readonly help: string;
  readonly optionSet: string;
  readonly required: boolean;
  readonly unknownAllowed: boolean;
  readonly profileFactor: string;
  readonly purpose: string;
  /** Short factor name used by the sensitivity analysis. */
  readonly shortLabel: string;
}

export interface ScenarioQuestion {
  readonly code: string;
  readonly template: string;
  readonly optionSet: string;
  readonly text: string;
  readonly help: string;
}

export interface ScenarioDriver {
  readonly code: string;
  readonly label: string;
  readonly detail: string;
}

export interface Scenario {
  readonly code: string;
  readonly order: number;
  readonly name: string;
  readonly shortLabel: string;
  readonly shortDescription: string;
  readonly statement: string;
  readonly likelihoodQuestion: ScenarioQuestion;
  readonly impactQuestion: ScenarioQuestion;
  readonly drivers: readonly ScenarioDriver[];
  readonly investigationPrompts: readonly string[];
  readonly interpretationNote: string;
  readonly doesNotMean: string;
}

export interface ModelVersionMeta {
  readonly modelId: string;
  readonly modelVersion: string;
  readonly schemaVersion: string;
  readonly calibrationVersion: string;
  readonly applicationVersion: string;
  readonly methodologyVersion: string;
  readonly disclaimerVersion: string;
  readonly privacyNoticeVersion: string;
  readonly releaseStatus: string;
  readonly retentionMode: string;
  readonly currency: string;
  readonly currencySymbol: string;
  readonly defaultIterations: number;
  readonly maximumIterations: number;
  readonly allowedIterations: readonly number[];
  readonly lossThresholds: readonly number[];
  readonly requiredProfileQuestions: readonly string[];
  readonly optionalProfileQuestions: readonly string[];
}

export interface DisclaimerContent {
  readonly title: string;
  readonly acknowledgementLabel: string;
  readonly shortForm: string;
  readonly paragraphs: readonly string[];
  readonly legalReviewNote: string;
}

export interface PrivacyNoticeContent {
  readonly title: string;
  readonly statement: string;
  readonly detail: readonly string[];
}

export interface AttributionContent {
  readonly before: string;
  readonly name: string;
  readonly url: string;
  readonly after: string;
}

export interface PositioningContent {
  readonly productName: string;
  readonly tagline: string;
  readonly headline: string;
  readonly subheadline: string;
  readonly attribution: AttributionContent;
  readonly timeEstimate: string;
}

export interface MethodologySection {
  readonly id: string;
  readonly heading: string;
  readonly paragraphs?: readonly string[];
  readonly bullets?: readonly string[];
}

export interface MethodologyContent {
  readonly title: string;
  readonly summary: string;
  readonly sections: readonly MethodologySection[];
}

export interface TerminologyTerm {
  readonly term: string;
  readonly plain: string;
}

export interface TerminologyContent {
  readonly intro: string;
  readonly terms: readonly TerminologyTerm[];
}

export interface LimitationsContent {
  readonly title: string;
  readonly items: readonly string[];
  readonly investigationPromptNote: string;
}

/**
 * Published statement that input confidence is a heuristic indicator and not statistical
 * confidence.
 */
export interface ConfidenceNoticeContent {
  readonly title: string;
  readonly statement: string;
  readonly bullets: readonly string[];
}

/**
 * Published statement that the reported percentiles describe an annualised exposure
 * approximation rather than realised annual loss totals.
 */
export interface AnnualisationNoticeContent {
  readonly title: string;
  readonly statement: string;
}

export interface EvidenceSource {
  readonly name: string;
  readonly publisher: string;
  readonly url: string;
  readonly note: string;
}

export interface ReportLabels {
  readonly title: string;
  readonly subtitle: string;
  readonly generatedNote: string;
  readonly prohibitedTitleNote: string;
  readonly annualisationNote: string;
  readonly confidenceNote: string;
  readonly sections: Readonly<Record<string, string>>;
}

export interface ContentBundle {
  readonly disclaimerVersion: string;
  readonly disclaimer: DisclaimerContent;
  readonly privacyNotice: PrivacyNoticeContent;
  readonly positioning: PositioningContent;
  readonly methodology: MethodologyContent;
  readonly terminology: TerminologyContent;
  readonly limitations: LimitationsContent;
  readonly confidenceNotice: ConfidenceNoticeContent;
  readonly annualisationNotice: AnnualisationNoticeContent;
  readonly outOfScope: readonly string[];
  readonly evidenceSources: readonly EvidenceSource[];
  readonly reportLabels: ReportLabels;
}

export interface PublicModel {
  readonly version: ModelVersionMeta;
  readonly content: ContentBundle;
  readonly profileQuestions: readonly ProfileQuestion[];
  readonly optionSets: Readonly<Record<string, OptionSet>>;
  readonly scenarios: readonly Scenario[];
  readonly unknownCode: OptionCode;
}

export function optionSetFor(model: PublicModel, name: string): OptionSet {
  const optionSet = model.optionSets[name];
  if (optionSet === undefined) {
    throw new Error(`Unknown option set referenced by the model: ${name}`);
  }
  return optionSet;
}

export function findScenario(model: PublicModel, code: string): Scenario {
  const scenario = model.scenarios.find((entry) => entry.code === code);
  if (scenario === undefined) {
    throw new Error(`Unknown scenario code: ${code}`);
  }
  return scenario;
}
