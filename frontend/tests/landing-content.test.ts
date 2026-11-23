import { describe, expect, it } from 'vitest';
import {
  LANDING_BRANCHES,
  LANDING_ENTRY_ACTIONS,
  LANDING_ENTRY_NOTE,
  LANDING_FORK_NOTE,
  LANDING_HERO_HEADLINE,
  LANDING_QUICK_PICKER_LABEL,
  LANDING_ROLES,
  LANDING_STEPS,
  SAMPLE_PREVIEW_DISCLOSURE,
  SAMPLE_SCENARIO_RESULTS,
  SAMPLE_THRESHOLDS,
  SAMPLE_THRESHOLD_ROWS,
} from '@/content/landingJourney';
import { publicModel } from '@/model';

/**
 * The landing page makes three promises before a visitor commits: the shape of the
 * journey, which audience each artefact serves, and what the output looks like. The copy
 * is data so those promises can be pinned here; otherwise a drifting question count or a
 * self-contradictory sample would only be noticed by a reader.
 */
describe('landing journey content', () => {
  it('states the three journey steps in order', () => {
    expect(LANDING_STEPS).toHaveLength(3);
    expect(LANDING_STEPS.map((step) => step.position)).toEqual([1, 2, 3]);
    expect(LANDING_STEPS.map((step) => step.key)).toEqual(['assess', 'results', 'explore']);
  });

  it('gives every step a summary, at least two points and an availability statement', () => {
    for (const step of LANDING_STEPS) {
      expect(step.summary.length).toBeGreaterThan(30);
      expect(step.points.length).toBeGreaterThanOrEqual(2);
      expect(step.availability.length).toBeGreaterThan(10);
    }
  });

  /**
   * Explore is a fork, not a third screen. If the landing page ever lists Live and Decision
   * Lab as sequential points again, the first thing a visitor reads contradicts the diagram
   * every later page draws.
   */
  it('states Explore as two independent branches from Results', () => {
    expect(LANDING_BRANCHES.map((branch) => branch.key)).toEqual(['live', 'decision-lab']);
    expect(LANDING_BRANCHES.map((branch) => branch.label)).toEqual(['Branch A', 'Branch B']);

    for (const branch of LANDING_BRANCHES) {
      expect(branch.title.length).toBeGreaterThan(5);
      expect(branch.summary.length).toBeGreaterThan(30);
      expect(branch.receives.length).toBeGreaterThan(10);
      expect(branch.produces.length).toBeGreaterThan(10);
    }

    expect(LANDING_FORK_NOTE).toContain('Both branches start from Results');
    expect(LANDING_FORK_NOTE).toContain('neither one feeds the other');
    expect(LANDING_FORK_NOTE).not.toContain('then');
  });

  it('matches the question count the journey map derives from the model', () => {
    const totalQuestions = publicModel.profileQuestions.length + publicModel.scenarios.length * 2;
    expect(publicModel.scenarios).toHaveLength(5);
    expect(totalQuestions).toBe(18);
  });

  it('names the three audiences and the artefact each one receives', () => {
    expect(LANDING_ROLES.map((role) => role.key)).toEqual(['board', 'ciso', 'risk-manager']);
    for (const role of LANDING_ROLES) {
      expect(role.summary.length).toBeGreaterThan(40);
      expect(role.outputs.length).toBeGreaterThanOrEqual(2);
      expect(role.producedBy.length).toBeGreaterThan(10);
    }
  });

  it('labels the sample as illustrative rather than a result', () => {
    const disclosure = SAMPLE_PREVIEW_DISCLOSURE.toLowerCase();
    expect(disclosure).toContain('illustrative');
    expect(disclosure).toContain('will differ');
  });

  it('keeps every sample exposure ordered P10, expected, P90', () => {
    for (const scenario of SAMPLE_SCENARIO_RESULTS) {
      expect(scenario.p10).toBeLessThanOrEqual(scenario.expectedAnnualLoss);
      expect(scenario.expectedAnnualLoss).toBeLessThanOrEqual(scenario.p90);
    }
  });

  it('keeps sample exceedance probabilities bounded and falling as the threshold rises', () => {
    expect(SAMPLE_THRESHOLDS).toEqual([100_000, 500_000, 1_000_000]);
    for (const row of SAMPLE_THRESHOLD_ROWS) {
      expect(row.probabilities).toHaveLength(SAMPLE_THRESHOLDS.length);
      for (const probability of row.probabilities) {
        expect(probability).toBeGreaterThanOrEqual(0);
        expect(probability).toBeLessThanOrEqual(1);
      }
      for (let index = 1; index < row.probabilities.length; index += 1) {
        expect(row.probabilities[index]).toBeLessThanOrEqual(row.probabilities[index - 1]);
      }
    }
  });

  it('covers every sample scenario in the threshold table', () => {
    expect(SAMPLE_THRESHOLD_ROWS.map((row) => row.scenario)).toEqual(
      SAMPLE_SCENARIO_RESULTS.map((scenario) => scenario.name),
    );
  });
});

/**
 * The entry page used to offer one button, so the cheapest way to see a dashboard — a
 * sample — did not exist. These assertions pin the three paths, their order by cost and
 * the promise that each of them is the same model.
 */
describe('landing entry actions', () => {
  it('opens with a value proposition rather than the disclaimer', () => {
    expect(LANDING_HERO_HEADLINE).toBe('Quantify annual cyber-loss exposure');
    expect(LANDING_HERO_HEADLINE.toLowerCase()).not.toContain('disclaimer');
  });

  it('offers exactly three ways in, cheapest first', () => {
    expect(LANDING_ENTRY_ACTIONS.map((action) => action.key)).toEqual(['sample', 'quick', 'full']);
    expect(LANDING_ENTRY_ACTIONS.map((action) => action.title)).toEqual([
      'Load 60-Second Sample',
      'Quick 1-Scenario Check',
      'Full 5-Scenario Assessment',
    ]);
  });

  it('gives every path a time estimate and a control', () => {
    for (const action of LANDING_ENTRY_ACTIONS) {
      expect(action.timeEstimate.length).toBeGreaterThan(5);
      expect(action.ctaLabel.length).toBeGreaterThan(5);
      expect(action.description.length).toBeGreaterThan(60);
      expect(action.eyebrow.length).toBeGreaterThan(3);
    }
  });

  it('marks only the sample path as the primary demo', () => {
    expect(LANDING_ENTRY_ACTIONS.filter((action) => action.primary).map((action) => action.key)).toEqual([
      'sample',
    ]);
  });

  it('says the quick check leaves the other scenarios Unknown rather than guessing', () => {
    const quick = LANDING_ENTRY_ACTIONS.find((action) => action.key === 'quick');
    expect(quick?.description).toContain('Unknown');
    expect(LANDING_QUICK_PICKER_LABEL).toContain('Scenario');
  });

  it('states that all three paths share one model and store nothing', () => {
    expect(LANDING_ENTRY_NOTE).toContain('same server-side model');
    expect(LANDING_ENTRY_NOTE).toContain('Nothing is stored');
  });
});