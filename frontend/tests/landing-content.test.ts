import { describe, expect, it } from 'vitest';
import {
  LANDING_BRANCHES,
  LANDING_FORK_NOTE,
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