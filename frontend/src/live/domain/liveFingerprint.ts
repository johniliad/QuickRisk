/**
 * QuickRisk Live — saved-state fingerprint.
 *
 * A deterministic string over exactly the values that are persisted. It is used only to tell the
 * user whether the current simulation still matches the saved assessment; it is not a security
 * control and it is never sent to the server.
 */

import type { SOCInputState, TimelineEntry } from '@/live/domain/socTypes';
import type { LiveBaseline } from '@/live/domain/livePayload';
import { canonicalJson } from '@/lib/canonicalJson';

export interface LiveStateFingerprintInput {
  readonly baseline: LiveBaseline;
  readonly soc: SOCInputState;
  readonly timeline: readonly TimelineEntry[];
  readonly title: string;
  readonly methodologyVersion: string;
}

/** Stable identity of the saved simulation state. */
export function liveStateFingerprint(input: LiveStateFingerprintInput): string {
  return canonicalJson({
    baseline: {
      scenarioCode: input.baseline.scenarioCode,
      scenarioName: input.baseline.scenarioName,
      baselineEal: input.baseline.baselineEal,
      modelId: input.baseline.modelId,
      modelVersion: input.baseline.modelVersion,
    },
    soc: input.soc,
    timeline: input.timeline.map((entry) => ({
      offsetMs: entry.offsetMs,
      label: entry.label,
      state: entry.state,
    })),
    title: input.title.slice(0, 160),
    methodologyVersion: input.methodologyVersion,
  });
}
