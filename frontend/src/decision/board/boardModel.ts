/**
 * QuickRisk Decision Lab — Board Risk Pack model.
 *
 * A pure projection of one stored decision result into the five-page report structure
 * (requirements 35–43). It performs no calculation: every number is copied from the stored
 * result, so the report and the Decision Lab screen can never disagree.
 *
 * Page-level acronym rule (requirement 42): each page declares the acronyms it uses, and the
 * renderer shows the definition at the first occurrence on that page.
 */

import type { AppetiteEvaluation, DistributionSummary, Portfolio, TreatmentDefinition } from '@/decision/domain/decisionTypes';
import { ACRONYMS, EVIDENCE_LABELS, METRIC_LABELS, type EvidenceQuality } from '@/decision/domain/decisionTypes';

export interface BoardMetric {
  readonly label: string;
  readonly technicalLabel: string;
  readonly value: number;
  readonly previousValue?: number;
  readonly appetite?: number | null;
  readonly status?: AppetiteEvaluation['status'];
}

export interface BoardTreatmentRow {
  readonly name: string;
  readonly investment: number;
  readonly annualCost: number;
  readonly modeledEffect: string;
  readonly timeToEffect: string;
  readonly evidence: string;
  readonly origin: 'curated' | 'custom';
}

export interface BoardPage {
  readonly number: number;
  readonly title: string;
  readonly question: string;
  readonly narrative: string;
  readonly acronyms: readonly string[];
  readonly metrics: readonly BoardMetric[];
  readonly treatments: readonly BoardTreatmentRow[];
  readonly notes: readonly string[];
}

export interface BoardReportModel {
  readonly title: string;
  readonly subtitle: string;
  readonly generatedAt: string;
  readonly currencySymbol: string;
  readonly provenance: {
    readonly decisionMethodologyVersion: string;
    readonly boardPackVersion: string;
    readonly quickriskModelVersion: string;
    readonly iterations: number;
    readonly simulationSeed: number;
    readonly effectModel: string;
  };
  readonly pages: readonly BoardPage[];
  readonly decisionRequested: string;
  readonly recommendation: {
    readonly names: readonly string[];
    readonly initialInvestment: number;
    readonly annualOperatingCost: number;
    readonly baselineEal: number;
    readonly treatedEal: number;
    readonly baselineStatus: AppetiteEvaluation['status'];
    readonly treatedStatus: AppetiteEvaluation['status'];
  } | null;
  readonly limitations: readonly string[];
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;
const days = (value: number): string => (value === 0 ? 'Immediate' : `${value} days`);

/** Describes a treatment's modelled effect in business language (never a fixed percentage). */
export function modeledEffect(treatment: TreatmentDefinition): string {
  const parts: string[] = [];
  if (treatment.causalEffects.frequency !== null) {
    const effect = treatment.causalEffects.frequency;
    parts.push(`event frequency ${percent(effect.min)}–${percent(effect.max)}`);
  }
  if (treatment.causalEffects.magnitude !== null) {
    const effect = treatment.causalEffects.magnitude;
    parts.push(`loss magnitude ${percent(effect.min)}–${percent(effect.max)}`);
  }

  return parts.length === 0 ? 'No modelled effect stated' : parts.join('; ');
}

export interface BoardModelInput {
  readonly title: string;
  readonly currencySymbol: string;
  readonly generatedAt: string;
  readonly baseline: DistributionSummary;
  readonly treated: DistributionSummary;
  readonly appetiteBaseline: AppetiteEvaluation;
  readonly appetiteTreated: AppetiteEvaluation;
  readonly initialInvestment: number;
  readonly annualOperatingCost: number;
  readonly treatments: readonly TreatmentDefinition[];
  readonly recommended: Partial<Portfolio> | null;
  readonly reductionShare: number;
  readonly riskReductionEfficiency: number | null;
  readonly implementationDelayDays: number;
  readonly provenance: {
    readonly decisionMethodologyVersion: string;
    readonly boardPackVersion: string;
    readonly quickriskModelVersion: string;
    readonly iterations: number;
    readonly simulationSeed: number;
    readonly effectModel: string;
  };
}

/** The acronym definitions required by one page, for its footnote area. */
export function acronymDefinitions(keys: readonly string[]): readonly { term: string; definition: string }[] {
  const seen = new Set<string>();
  const definitions: { term: string; definition: string }[] = [];

  for (const key of keys) {
    if (seen.has(key) || ACRONYMS[key] === undefined) {
      continue;
    }
    seen.add(key);
    definitions.push({ term: `${key} — ${ACRONYMS[key].term}`, definition: ACRONYMS[key].short });
  }

  return definitions;
}

const statusText = (status: AppetiteEvaluation['status']): string =>
  status === 'within' ? 'WITHIN APPETITE' : status === 'above' ? 'ABOVE APPETITE' : 'APPETITE NOT DEFINED';

const statusSentence = (status: AppetiteEvaluation['status']): string =>
  status === 'within'
    ? 'within the stated appetite'
    : status === 'above'
      ? 'above the stated appetite'
      : 'of undefined appetite';

/** Builds the five-page Board Risk Pack from an already-calculated decision result. */
export function buildBoardReport(input: BoardModelInput): BoardReportModel {
  const annualLimit = input.appetiteBaseline.criteria.find((entry) => entry.id === 'annualLoss')?.limit ?? null;
  const highEndLimit = input.appetiteBaseline.criteria.find((entry) => entry.id === 'highEndLoss')?.limit ?? null;
  const exceedance = input.appetiteBaseline.criteria.find((entry) => entry.id === 'exceedanceProbability') ?? null;

  const topContributors = [...input.baseline.scenarioContributions]
    .sort((left, right) => right.expectedAnnualLoss - left.expectedAnnualLoss)
    .slice(0, 5);

  const treatmentRows: BoardTreatmentRow[] = input.treatments.slice(0, 6).map((treatment) => ({
    name: treatment.name,
    investment: treatment.initialCost.amount,
    annualCost: treatment.annualOperatingCost.amount,
    modeledEffect: modeledEffect(treatment),
    timeToEffect: days(treatment.implementationDelayDays),
    evidence: EVIDENCE_LABELS[treatment.evidenceQuality as EvidenceQuality].label,
    origin: treatment.origin,
  }));

  const ealMetric = (
    value: number,
    previous: number | undefined,
    status: AppetiteEvaluation['status'],
  ): BoardMetric => ({
    label: METRIC_LABELS.expectedAnnualLoss,
    technicalLabel: 'Expected Annual Loss (EAL)',
    value,
    previousValue: previous,
    appetite: annualLimit,
    status,
  });

  const p90Metric = (
    value: number,
    previous: number | undefined,
    status: AppetiteEvaluation['status'],
  ): BoardMetric => ({
    label: METRIC_LABELS.p90,
    technicalLabel: 'P90 (90th percentile)',
    value,
    previousValue: previous,
    appetite: highEndLimit,
    status,
  });

  const pageOne: BoardPage = {
    number: 1,
    title: 'Cyber Risk Decision',
    question: 'What decision is requested?',
    narrative:
      `Current modeled exposure is ${statusSentence(input.appetiteBaseline.status)}. Under the selected ` +
      `treatment assumptions the modeled annual loss exposure falls by ${percent(input.reductionShare)}, and ` +
      `the residual position is ${statusSentence(input.appetiteTreated.status)}.`,
    acronyms: ['EAL', 'P90'],
    metrics: [
      ealMetric(input.treated.expectedAnnualLoss, input.baseline.expectedAnnualLoss, input.appetiteTreated.status),
      p90Metric(input.treated.p90, input.baseline.p90, input.appetiteTreated.status),
    ],
    treatments: [],
    notes: [
      `Investment required: ${input.initialInvestment.toFixed(0)} ${input.currencySymbol} initial and ` +
        `${input.annualOperatingCost.toFixed(0)} ${input.currencySymbol} per year.`,
      `Time to effect: ${days(input.implementationDelayDays)}.`,
      `Residual position: ${statusText(input.appetiteTreated.status)}.`,
    ],
  };

  const pageTwo: BoardPage = {
    number: 2,
    title: 'Where are we today?',
    question: 'Why does it matter?',
    narrative:
      'The five assessed scenarios contribute the exposure below. The appetite limit is the level ' +
      'management has stated it is prepared to accept.',
    acronyms: ['EAL', 'P90'],
    metrics: [
      ealMetric(input.baseline.expectedAnnualLoss, undefined, input.appetiteBaseline.status),
      p90Metric(input.baseline.p90, undefined, input.appetiteBaseline.status),
    ],
    treatments: [],
    notes: [
      ...topContributors.map(
        (scenario) =>
          `${scenario.shortLabel}: ${scenario.expectedAnnualLoss.toFixed(0)} ${input.currencySymbol} ` +
          'modeled annual exposure.',
      ),
      exceedance === null
        ? 'No probability limit was configured for this analysis.'
        : `Modeled likelihood of exceeding the annual loss limit: ${percent(exceedance.actual)} ` +
          `(limit ${percent(exceedance.limit)}).`,
    ],
  };


  const pageThree: BoardPage = {
    number: 3,
    title: 'How can we reduce the risk?',
    question: 'What can we do, and what would it cost?',
    narrative:
      'Each candidate is modeled through the mechanism it affects — how often an event succeeds, how much ' +
      'it costs, or both — with a stated range and an evidence classification.',
    acronyms: [],
    metrics: [],
    treatments: treatmentRows,
    notes: [
      'Curated treatments carry reviewed application assumptions. User-defined treatments are labeled as ' +
        'such and are never presented as equally authoritative.',
      'Modeled effect is an assumption, not a measured outcome; the evidence column states its provenance.',
    ],
  };

  const pageFour: BoardPage = {
    number: 4,
    title: 'Recommended treatment portfolio',
    question: 'What would it change?',
    narrative:
      input.recommended === null
        ? 'No evaluated portfolio satisfies the selected risk appetite within the stated constraints.'
        : `The recommended portfolio brings modeled exposure ${statusSentence(input.appetiteTreated.status)}. ` +
          'It is the lowest-cost evaluated combination that satisfies the stated appetite and constraints.',
    acronyms: ['EAL', 'P90', 'RRE'],
    metrics: [
      ealMetric(input.treated.expectedAnnualLoss, input.baseline.expectedAnnualLoss, input.appetiteTreated.status),
      p90Metric(input.treated.p90, input.baseline.p90, input.appetiteTreated.status),
    ],
    treatments: [],
    notes: [
      `Initial investment ${input.initialInvestment.toFixed(0)} ${input.currencySymbol}; annual operating ` +
        `cost ${input.annualOperatingCost.toFixed(0)} ${input.currencySymbol}.`,
      input.riskReductionEfficiency === null
        ? 'Risk Reduction Efficiency (RRE) is not available because no annualised cost was configured.'
        : `Risk Reduction Efficiency (RRE): ${input.riskReductionEfficiency.toFixed(2)} of modeled annual ` +
          'loss reduction per unit of annualised cost. This is not a financial return.',
    ],
  };

  const pageFive: BoardPage = {
    number: 5,
    title: 'Assumptions, evidence and limitations',
    question: 'What should the Board know about this analysis?',
    narrative:
      'This page protects the report from appearing more certain than the underlying evidence. Every ' +
      'figure above is a modeled result under the assumptions stated here.',
    acronyms: ['EAL', 'P90', 'RRE'],
    metrics: [],
    treatments: [],
    notes: [
      `Decision Lab methodology ${input.provenance.decisionMethodologyVersion}; Board Risk Pack ` +
        `${input.provenance.boardPackVersion}; QuickRisk model ${input.provenance.quickriskModelVersion}.`,
      `Monte Carlo iterations ${input.provenance.iterations}; simulation seed ${input.provenance.simulationSeed}.`,
      `Treatment effect model: ${input.provenance.effectModel}.`,
      ...input.treatments.slice(0, 6).map(
        (treatment) =>
          `${treatment.name}: ${EVIDENCE_LABELS[treatment.evidenceQuality as EvidenceQuality].confidence} — ` +
          `${treatment.assumptions[0] ?? treatment.evidenceReference}`,
      ),
      `Implementation timing: ${days(input.implementationDelayDays)} before the modeled effect applies.`,
    ],
  };

  return {
    title: 'Board Risk Pack',
    subtitle: input.title,
    generatedAt: input.generatedAt,
    currencySymbol: input.currencySymbol,
    provenance: input.provenance,
    pages: [pageOne, pageTwo, pageThree, pageFour, pageFive],
    decisionRequested:
      input.recommended === null
        ? 'No evaluated portfolio satisfies the stated appetite and budget. Consider a different appetite, budget ' +
          'or candidate set before deciding.'
        : `For consideration: an initial investment of ${input.initialInvestment.toFixed(0)} ${input.currencySymbol} ` +
          `and ${input.annualOperatingCost.toFixed(0)} ${input.currencySymbol} of annual operating cost, which the ` +
          'model projects will bring expected annual loss and high-end modeled loss within the stated risk appetite. ' +
          'Validate the implementation and treatment-effect assumptions before committing.',
    recommendation:
      input.recommended === null
        ? null
        : {
            names: input.treatments.map((treatment) => treatment.name),
            initialInvestment: input.initialInvestment,
            annualOperatingCost: input.annualOperatingCost,
            baselineEal: input.baseline.expectedAnnualLoss,
            treatedEal: input.treated.expectedAnnualLoss,
            baselineStatus: input.appetiteBaseline.status,
            treatedStatus: input.appetiteTreated.status,
          },
    limitations: [
      'The modeled result depends on the QuickRisk assessment answers, the treatment assumptions and the ' +
        'simulation seed recorded on page 5.',
      'Treatment effectiveness is an assumption, not a measured outcome. Evidence quality is stated for ' +
        'every candidate and does not change the numbers.',
      'The modeled reduction is not a guaranteed saving: QuickRisk quantifies risk exposure, not cash flow.',
      'Correlation between scenarios, model-form uncertainty and calibration uncertainty are not represented.',
      'Synthetic or user-defined assumptions are labeled as such wherever they are used.',
    ],
  };
}

