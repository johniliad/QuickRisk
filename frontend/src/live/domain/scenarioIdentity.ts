/**
 * QuickRisk Live — scenario identity.
 *
 * The QuickRisk baseline scenario owns the SOC state's scenario identifier. Every action that
 * replaces or edits a SOC state must pass through `withScenario`, and the saved payload refuses
 * an incoherent state instead of silently saving a different scenario than the user saw.
 */

import type { SOCInputState, TimelineEntry } from '@/live/domain/socTypes';

export class LiveScenarioMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LiveScenarioMismatchError';
  }
}

/** Returns the state with the active baseline scenario. Pure; always returns a new object. */
export function withScenario(state: SOCInputState, scenarioCode: string): SOCInputState {
  return { ...state, scenarioId: scenarioCode };
}

/** True when the state belongs to the scenario. */
export function belongsToScenario(state: SOCInputState, scenarioCode: string): boolean {
  return state.scenarioId === scenarioCode;
}

/**
 * Refuses a timeline that mixes scenarios or baselines. A recorded exposure depends on both.
 */
export function assertTimelineMatchesBaseline(
  timeline: readonly TimelineEntry[],
  scenarioCode: string,
  baselineEal: number,
): void {
  for (const entry of timeline) {
    if (!belongsToScenario(entry.state, scenarioCode)) {
      throw new LiveScenarioMismatchError(
        `Timeline event "${entry.label}" belongs to scenario ${entry.state.scenarioId}, not ${scenarioCode}.`,
      );
    }
    if (Math.abs(entry.result.baselineEal - baselineEal) > 0.01) {
      throw new LiveScenarioMismatchError(
        `Timeline event "${entry.label}" was calculated against a different baseline exposure.`,
      );
    }
  }
}

interface SavedScenarioShape {
  readonly scenarioId: string;
  readonly baselineEal: number;
  readonly inputState: SOCInputState;
  readonly timeline: readonly {
    readonly label: string;
    readonly state: SOCInputState;
    readonly result: { readonly baselineEal: number };
  }[];
}

/** Returns an error message when a saved assessment is internally inconsistent, or null. */
export function savedAssessmentScenarioError(detail: SavedScenarioShape): string | null {
  if (!belongsToScenario(detail.inputState, detail.scenarioId)) {
    return 'The saved assessment is internally inconsistent and was not opened.';
  }

  for (const event of detail.timeline) {
    if (!belongsToScenario(event.state, detail.scenarioId)) {
      return `The saved timeline event "${event.label}" belongs to another scenario and was not opened.`;
    }
    if (Math.abs(event.result.baselineEal - detail.baselineEal) > 0.01) {
      return `The saved timeline event "${event.label}" was calculated against another baseline and was not opened.`;
    }
  }

  return null;
}
