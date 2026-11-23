import { describe, expect, it } from 'vitest';
import { acronymDefinitions, buildBoardReport, modeledEffect, type BoardModelInput } from '@/decision/board/boardModel';
import {
  ACRONYMS,
  type AppetiteEvaluation,
  type DistributionSummary,
  type TreatmentDefinition,
} from '@/decision/domain/decisionTypes';

const summary = (eal: number, p90: number): DistributionSummary => ({
  expectedAnnualLoss: eal,
  p10: eal * 0.4,
  p25: eal * 0.6,
  p50: eal * 0.9,
  p75: eal * 1.2,
  p90,
  minimum: 0,
  maximum: p90 * 3,
  iterations: 2000,
  thresholdProbabilities: { '100000': 1, '500000': 0.5 },
  thresholdExceedanceCounts: { '100000': 2000, '500000': 1000 },
  scenarioContributions: [
    { code: 'S1', name: 'Ransomware', shortLabel: 'Ransomware', expectedAnnualLoss: eal * 0.6, factor: 1 },
    { code: 'S2', name: 'Identity compromise', shortLabel: 'Identity', expectedAnnualLoss: eal * 0.4, factor: 1 },
  ],
});

const appetite = (status: AppetiteEvaluation['status']): AppetiteEvaluation => ({
  status,
  label: status === 'within' ? 'Within appetite' : 'Above appetite',
  message: '',
  criteria: [
    {
      id: 'annualLoss',
      label: 'Expected annual loss',
      limit: 250000,
      actual: 765000,
      unit: 'currency',
      passes: status === 'within',
      threshold: null,
    },
    {
      id: 'highEndLoss',
      label: 'High-end modeled loss',
      limit: 900000,
      actual: 1060000,
      unit: 'currency',
      passes: status === 'within',
      threshold: null,
    },
  ],
});

const treatment = (overrides: Partial<TreatmentDefinition> = {}): TreatmentDefinition => ({
  id: 'immutable-backup',
  version: '1.0',
  name: 'Immutable Backup Resilience',
  shortDescription: 'Offline copies',
  businessOutcome: 'A destructive event costs less.',
  applicableScenarios: ['S1'],
  causalEffects: { frequency: null, magnitude: { min: 0.25, mostLikely: 0.45, max: 0.65 } },
  implementationDelayDays: 90,
  initialCost: { amount: 90000, currency: 'EUR' },
  annualOperatingCost: { amount: 45000, currency: 'EUR' },
  evidenceQuality: 'industry',
  mechanismGroup: 'data-resilience',
  interactionDefaults: { sameGroupIndependentCoverage: 0.65 },
  assumptions: ['Assumes restoration exercises twice a year.'],
  reviewedAt: '2026-11-07',
  reviewOwner: 'QuickRisk methodology owner',
  evidenceReference: 'Application assumption.',
  origin: 'curated',
  enabled: true,
  ...overrides,
});

const input = (overrides: Partial<BoardModelInput> = {}): BoardModelInput => ({
  title: 'Ransomware treatment',
  currencySymbol: '€',
  generatedAt: '2026-11-07',
  baseline: summary(765000, 1060000),
  treated: summary(500000, 700000),
  appetiteBaseline: appetite('above'),
  appetiteTreated: appetite('within'),
  initialInvestment: 90000,
  annualOperatingCost: 45000,
  treatments: [treatment()],
  recommended: { id: 'p1', treatmentIds: ['immutable-backup'] },
  recommendationState: 'recommended',
  reductionShare: 0.35,
  riskReductionEfficiency: 4.09,
  implementationDelayDays: 90,
  provenance: {
    decisionMethodologyVersion: '1.0',
    boardPackVersion: '1.0',
    quickriskModelVersion: '1.3.0',
    iterations: 2000,
    simulationSeed: 20261107,
    effectModel: 'paired-driver-multiplicative',
  },
  ...overrides,
});

describe('Board Risk Pack model', () => {
  it('builds the five required pages in order', () => {
    const report = buildBoardReport(input());

    expect(report.pages).toHaveLength(5);
    expect(report.pages.map((page) => page.title)).toEqual([
      'Cyber Risk Decision',
      'Where are we today?',
      'How can we reduce the risk?',
      'Recommended treatment portfolio',
      'Assumptions, evidence and limitations',
    ]);
    expect(report.title).toBe('Board Risk Pack');
  });

  it('copies stored values and never recalculates them', () => {
    const model = input();
    const report = buildBoardReport(model);
    const pageOne = report.pages[0];

    expect(pageOne.metrics[0].value).toBe(model.treated.expectedAnnualLoss);
    expect(pageOne.metrics[0].previousValue).toBe(model.baseline.expectedAnnualLoss);
    expect(pageOne.metrics[1].value).toBe(model.treated.p90);
    expect(report.recommendation?.baselineEal).toBe(model.baseline.expectedAnnualLoss);
    expect(report.recommendation?.treatedEal).toBe(model.treated.expectedAnnualLoss);
    expect(report.recommendation?.initialInvestment).toBe(model.initialInvestment);
  });

  it('states the modelled reduction and never promises a saving', () => {
    const report = buildBoardReport(input());
    const narrative = report.pages[0].narrative.toLowerCase();

    expect(narrative).toContain('falls by 35%');
    expect(narrative).not.toContain('will save');
    expect(report.decisionRequested).toContain('For consideration:');
    expect(report.limitations.join(' ').toLowerCase()).toContain('not a guaranteed saving');
  });

  it('declares acronyms once per page and defines them', () => {
    const report = buildBoardReport(input());
    const pageOne = report.pages[0];
    const definitions = acronymDefinitions(pageOne.acronyms);

    expect(definitions).toHaveLength(pageOne.acronyms.length);
    for (const definition of definitions) {
      const key = definition.term.split(' — ')[0];
      expect(ACRONYMS[key]).toBeDefined();
      expect(definition.definition).toBe(ACRONYMS[key].short);
    }

    // Page 3 shows treatment options in business language, so it needs no acronym definition.
    expect(report.pages[2].acronyms).toHaveLength(0);
    // Page 5 restates the assumptions, so it redefines the acronyms it uses.
    expect(report.pages[4].acronyms).toContain('RRE');
    // No acronym is defined twice on the same page.
    expect(new Set(pageOne.acronyms).size).toBe(pageOne.acronyms.length);
  });

  it('describes a treatment effect as a range on the driver it changes', () => {
    expect(modeledEffect(treatment())).toBe('loss magnitude 25%–65%');
    expect(
      modeledEffect(
        treatment({
          causalEffects: {
            frequency: { min: 0.1, mostLikely: 0.2, max: 0.35 },
            magnitude: { min: 0.0, mostLikely: 0.1, max: 0.2 },
          },
        }),
      ),
    ).toBe('event frequency 10%–35%; loss magnitude 0%–20%');
  });

  it('labels user-defined treatments and states the evidence quality', () => {
    const report = buildBoardReport(input({ treatments: [treatment({ origin: 'custom' })] }));
    const rows = report.pages[2].treatments;

    expect(rows[0].origin).toBe('custom');
    expect(rows[0].evidence).toBe('Industry evidence');
    expect(rows[0].timeToEffect).toBe('90 days');
  });

  it('makes no recommendation when no portfolio satisfies the appetite', () => {
    const report = buildBoardReport(input({ recommended: null, recommendationState: 'none-satisfies' }));

    expect(report.recommendation).toBeNull();
    expect(report.pages[3].narrative).toContain('No evaluated portfolio meets the expected annual-loss criterion');
    expect(report.decisionRequested).toContain('No evaluated portfolio meets the expected annual-loss criterion');
  });

  it('does not claim a portfolio search happened when none was run', () => {
    const report = buildBoardReport(input({ recommended: null, recommendationState: 'not-evaluated' }));

    expect(report.recommendation).toBeNull();
    expect(report.pages[3].narrative).toContain('No portfolio search has been performed');
    expect(report.pages[3].narrative).not.toContain('No evaluated portfolio meets the expected annual-loss criterion');
    expect(report.decisionRequested).toContain('Run a portfolio search');
    expect(report.decisionRequested).not.toContain('No evaluated portfolio meets the expected annual-loss criterion');
  });

  it('says a different combination was recommended when the report describes the selected set', () => {
    const report = buildBoardReport(input({ recommendationState: 'evaluated-other' }));

    expect(report.recommendation).toBeNull();
    expect(report.pages[3].narrative).toContain('different combination was recommended');
    expect(report.pages[3].narrative).not.toContain('No evaluated portfolio meets the expected annual-loss criterion');
    expect(report.decisionRequested).toContain('no portfolio recommendation is made');
  });

  it('ignores a recommended row unless the state says the report describes it', () => {
    const report = buildBoardReport(input({ recommendationState: 'not-evaluated' }));

    expect(report.recommendation).toBeNull();
    expect(report.pages[3].narrative).toContain('selected treatment set only');
  });

  it('keeps page 1 and page 4 on the same treated figures', () => {
    const model = input();
    const report = buildBoardReport(model);

    expect(report.pages[0].metrics.map((metric) => metric.value)).toEqual(
      report.pages[3].metrics.map((metric) => metric.value),
    );
    expect(report.pages[3].metrics[0].value).toBe(model.treated.expectedAnnualLoss);
    expect(report.pages[3].metrics[1].value).toBe(model.treated.p90);
  });

  it('includes every treatment and every assumption without silent truncation', () => {
    const treatments = Array.from({ length: 8 }, (_, index) =>
      treatment({
        id: `treatment-${index}`,
        name: `Treatment ${index}`,
        assumptions: [`Assumption ${index}.A`, `Assumption ${index}.B`],
      }),
    );
    const report = buildBoardReport(input({ treatments }));

    expect(report.pages[2].treatments).toHaveLength(8);
    const pageFive = report.pages[4].notes.join(' ');
    for (const entry of treatments) {
      expect(pageFive).toContain(entry.name);
      for (const assumption of entry.assumptions) {
        expect(pageFive).toContain(assumption);
      }
    }
  });

  it('states that portfolio selection uses expected annual loss only', () => {
    const report = buildBoardReport(input());
    expect(report.pages[3].notes.join(' ')).toContain('Portfolio selection uses expected annual loss only');
  });

  it('discloses when a sampled loss cap makes treatment scaling approximate', () => {
    const report = buildBoardReport(
      input({ clampWarning: true, clampNotes: ['In S1, the cap is reachable.'] }),
    );
    const limitations = report.limitations.join(' ');

    expect(limitations).toContain('component can reach the documented cap');
    expect(limitations).toContain('In S1, the cap is reachable.');
  });

  it('states that an empty recommended portfolio means no additional treatment', () => {
    const report = buildBoardReport(
      input({
        treatments: [],
        recommended: { id: 'p-empty', treatmentIds: [] },
        recommendationState: 'recommended',
        reductionShare: 0,
        initialInvestment: 0,
        annualOperatingCost: 0,
      }),
    );

    expect(report.pages[3].narrative).toContain('no additional treatment');
    expect(report.recommendation?.names).toEqual(['No additional treatment']);
    expect(report.decisionRequested).toContain('no additional treatment');
  });
});

