/**
 * QuickRisk Live — persistence payload builder.
 *
 * Pure: it derives the result with the deterministic engine and refuses any state that is not
 * coherent with the selected baseline. A doomed request never leaves the browser.
 */

import {
  LIVE_METHODOLOGY_VERSION,
  type SOCInputState,
  type TimelineEntry,
} from '@/live/domain/socTypes';
import { calculateRealTimeRisk } from '@/live/engine/socRiskEngine';
import { assertTimelineMatchesBaseline, LiveScenarioMismatchError } from '@/live/domain/scenarioIdentity';

/** The application is single-currency; the symbol is defined once, not in each ingest function. */
export const APPLICATION_CURRENCY_SYMBOL = '€';

export interface LiveBaseline {
  readonly scenarioCode: string;
  readonly scenarioName: string;
  readonly baselineEal: number;
  readonly currencySymbol: string;
  readonly modelId: string;
  readonly modelVersion: string;
}

export interface LivePayloadInput {
  readonly baseline: LiveBaseline;
  readonly soc: SOCInputState;
  readonly timeline: readonly TimelineEntry[];
  readonly title: string;
  readonly methodologyVersion: string;
}

/** Builds the persistence payload. The risk result is the answer of the pure engine. */
export function buildLivePayload(input: LivePayloadInput): Record<string, unknown> {
  const { baseline, soc, timeline, title } = input;

  if (soc.scenarioId !== baseline.scenarioCode) {
    throw new LiveScenarioMismatchError(
      `The SOC state belongs to scenario ${soc.scenarioId}, but the baseline is ${baseline.scenarioCode}.`,
    );
  }
  assertTimelineMatchesBaseline(timeline, baseline.scenarioCode, baseline.baselineEal);

  return {
    title: title.slice(0, 160),
    scenarioId: baseline.scenarioCode,
    scenarioName: baseline.scenarioName,
    baselineEal: baseline.baselineEal,
    baselineSource: { modelId: baseline.modelId, modelVersion: baseline.modelVersion },
    inputState: soc,
    riskResult: calculateRealTimeRisk(soc, baseline.baselineEal),
    timeline: timeline.map((entry) => ({
      offsetMs: entry.offsetMs,
      eventType: 'STATE_RECORDED',
      label: entry.label,
      state: entry.state,
      result: entry.result,
    })),
    methodologyVersion: input.methodologyVersion || LIVE_METHODOLOGY_VERSION,
  };
}
