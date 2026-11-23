import { describe, expect, it } from 'vitest';
import { questionnaireMilestone } from '@/domain/assessment';
import { resolveJourneySteps, type JourneyInput } from '@/lib/journey';

/**
 * The journey stepper is the only affordance that tells a visitor that Live and
 * Decision Lab need a completed assessment. Its rules are derived by a pure function so
 * they can be pinned here instead of being implied by component markup.
 */
const statuses = (input: JourneyInput) =>
  Object.fromEntries(resolveJourneySteps(input).map((step) => [step.key, step.status]));

describe('assessment journey', () => {
  it('locks every dependent step before anything has been answered', () => {
    expect(statuses({ view: 'landing', hasAnswers: false, hasResults: false })).toEqual({
      assess: 'todo',
      results: 'locked',
      explore: 'locked',
    });
  });

  it('marks the assessment as current while the questionnaire is open', () => {
    expect(statuses({ view: 'questionnaire', hasAnswers: true, hasResults: false })).toEqual({
      assess: 'active',
      results: 'todo',
      explore: 'locked',
    });
  });

  it('opens the results step as soon as answers exist', () => {
    expect(statuses({ view: 'questionnaire', hasAnswers: true, hasResults: false }).results).toBe('todo');
  });

  it('marks the assessment done and the results current on the dashboard', () => {
    expect(statuses({ view: 'results', hasAnswers: true, hasResults: true })).toEqual({
      assess: 'done',
      results: 'active',
      explore: 'todo',
    });
  });

  it('keeps results current on the scenario detail and printable report', () => {
    expect(statuses({ view: 'scenario-detail', hasAnswers: true, hasResults: true }).results).toBe('active');
    expect(statuses({ view: 'report', hasAnswers: true, hasResults: true }).results).toBe('active');
  });

  it('unlocks and marks the explore step inside Live and Decision Lab', () => {
    expect(statuses({ view: 'live', hasAnswers: true, hasResults: true })).toEqual({
      assess: 'done',
      results: 'done',
      explore: 'active',
    });
    expect(statuses({ view: 'decision-lab', hasAnswers: true, hasResults: true }).explore).toBe('active');
  });

  it('never locks history, which is readable without a baseline', () => {
    expect(statuses({ view: 'history', hasAnswers: false, hasResults: false }).explore).toBe('active');
  });

  it('numbers the steps in order', () => {
    const steps = resolveJourneySteps({ view: 'landing', hasAnswers: false, hasResults: false });
    expect(steps.map((step) => step.position)).toEqual([1, 2, 3]);
    expect(steps.map((step) => step.label)).toEqual(['Assess', 'Results', 'Explore']);
  });
});

/**
 * The two workspace tabs added in Phase 1 are views in the same journey, not new
 * destinations: the Board Brief prints the current result, and Saved Packs is readable
 * without a baseline for the same reason History is.
 */
describe('workspace tabs inside the journey', () => {
  it('marks the results step done on the Board Brief, which prints that result', () => {
    expect(statuses({ view: 'board-brief', hasAnswers: true, hasResults: true }).results).toBe('done');
  });

  it('does not claim a result the Board Brief cannot print', () => {
    expect(statuses({ view: 'board-brief', hasAnswers: false, hasResults: false }).results).toBe('locked');
  });

  it('never locks Saved Packs', () => {
    expect(statuses({ view: 'saved-packs', hasAnswers: false, hasResults: false }).explore).toBe('active');
  });
});

/**
 * The milestone is the only forward-looking sentence in the questionnaire. It has to fire
 * at the real section boundaries and nowhere else, or it becomes noise.
 */
describe('questionnaire milestones', () => {
  it('says nothing in the middle of a section', () => {
    expect(questionnaireMilestone(0, 8, 18)).toBeNull();
    expect(questionnaireMilestone(10, 8, 18)).toBeNull();
  });

  it('marks the end of the organisation profile', () => {
    expect(questionnaireMilestone(7, 8, 18)).toContain('Organisation profile complete');
  });

  it('marks the last scenario question', () => {
    expect(questionnaireMilestone(17, 8, 18)).toContain('All scenarios answered');
  });

  it('returns nothing for an empty or out-of-range step list', () => {
    expect(questionnaireMilestone(0, 8, 0)).toBeNull();
    expect(questionnaireMilestone(-1, 8, 18)).toBeNull();
    expect(questionnaireMilestone(18, 8, 18)).toBeNull();
  });
});