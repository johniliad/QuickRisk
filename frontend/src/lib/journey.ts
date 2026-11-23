/**
 * Assessment journey model.
 *
 * QuickRisk is three surfaces with one entry point: the questionnaire produces the
 * baseline, and QuickRisk Live and Decision Lab only work from that baseline. The
 * header used to present every screen as an equal destination, so a visitor could not
 * tell which screens were available or why the others were empty.
 *
 * This module derives the state of the three journey steps from the view and the
 * in-memory assessment. It is pure, so the rule is pinned by a unit test instead of
 * being implied by component markup.
 */

import type { View } from '@/domain/assessment';

/** `locked` means the step needs an earlier step; `todo` means it is available now. */
export type JourneyStepStatus = 'done' | 'active' | 'todo' | 'locked';

export interface JourneyStep {
  readonly key: 'assess' | 'results' | 'explore';
  readonly position: number;
  readonly label: string;
  readonly status: JourneyStepStatus;
}

export interface JourneyInput {
  readonly view: View;
  readonly hasAnswers: boolean;
  readonly hasResults: boolean;
}

const ASSESS_VIEWS: ReadonlySet<View> = new Set<View>(['disclaimer', 'questionnaire', 'calculating']);

/**
 * The printable report is part of the results step. The Board Brief is not: it prints the
 * result that already exists, and opening it without one shows an empty state rather than a
 * step of its own.
 */
const RESULT_VIEWS: ReadonlySet<View> = new Set<View>(['results', 'scenario-detail', 'report']);

/**
 * Screens that operate on a completed assessment. History is included because saved
 * Live assessments and Decision Lab analyses are readable without a live baseline.
 */
const EXPLORE_VIEWS: ReadonlySet<View> = new Set<View>([
  'live',
  'live-history',
  'live-executive',
  'live-methodology',
  'decision-lab',
  'decision-history',
  'history',
  'saved-packs',
]);

export function resolveJourneySteps({ view, hasAnswers, hasResults }: JourneyInput): readonly JourneyStep[] {
  const assess: JourneyStepStatus = hasResults ? 'done' : ASSESS_VIEWS.has(view) ? 'active' : 'todo';

  // The results step becomes available as soon as answers exist, because submitting the
  // questionnaire is the only thing between the two.
  const results: JourneyStepStatus = RESULT_VIEWS.has(view)
    ? 'active'
    : hasResults
      ? 'done'
      : hasAnswers
        ? 'todo'
        : 'locked';

  // Live, Decision Lab and history need a baseline. History is the one exception: it is a
  // destination in its own right, so it is never locked.
  const explore: JourneyStepStatus = EXPLORE_VIEWS.has(view)
    ? 'active'
    : hasResults
      ? 'todo'
      : 'locked';

  return [
    { key: 'assess', position: 1, label: 'Assess', status: assess },
    { key: 'results', position: 2, label: 'Results', status: results },
    { key: 'explore', position: 3, label: 'Explore', status: explore },
  ];
}

/** True when Live and Decision Lab can be opened from the current assessment. */
export function explorationAvailable(hasResults: boolean): boolean {
  return hasResults;
}
