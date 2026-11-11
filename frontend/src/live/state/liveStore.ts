/**
 * QuickRisk Live state.
 *
 * Held in JavaScript memory only, exactly like the QuickRisk assessment: there is no
 * browser storage, no URL state and no autosave. Persistence happens only when the user
 * explicitly saves, and it is owned by the anonymous server session.
 *
 * The risk result is never stored in this store: it is derived from `soc` and `baseline`
 * with the pure engine, so the UI can never display a stale score.
 */

import { create } from 'zustand';
import {
  DEFAULT_SOC_STATE,
  LIVE_METHODOLOGY_VERSION,
  type SOCInputState,
  type TimelineEntry,
} from '@/live/domain/socTypes';
import { calculateRealTimeRisk } from '@/live/engine/socRiskEngine';
import {
  LiveApiError,
  liveApi,
  type LiveAssessmentDetail,
  type LiveAssessmentSummary,
  type LiveScenarioPreset,
} from '@/live/api/liveClient';

export interface LiveBaseline {
  readonly scenarioCode: string;
  readonly scenarioName: string;
  readonly baselineEal: number;
  readonly currencySymbol: string;
  readonly modelId: string;
  readonly modelVersion: string;
}

type SessionStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Synthetic timeline clock: each recorded step advances 30 simulated seconds. */
const TIMELINE_STEP_MS = 30_000;

interface LiveState {
  sessionStatus: SessionStatus;
  csrfToken: string | null;
  sessionLabel: string | null;
  sessionExpiresAt: string | null;

  baseline: LiveBaseline | null;
  soc: SOCInputState;
  timeline: TimelineEntry[];
  library: LiveScenarioPreset[];
  history: LiveAssessmentSummary[];

  currentPublicId: string | null;
  currentTitle: string;
  shareUrl: string | null;

  busy: boolean;
  message: string | null;
  error: string | null;

  initSession: () => Promise<string | null>;
  setBaseline: (baseline: LiveBaseline | null) => void;
  setTitle: (title: string) => void;
  updateSoc: (patch: Partial<SOCInputState>) => void;
  resetSoc: () => void;
  applyPreset: (preset: LiveScenarioPreset) => void;
  recordEvent: (label: string) => void;
  removeTimelineEntry: (index: number) => void;
  clearTimeline: () => void;
  loadLibrary: () => Promise<void>;
  loadHistory: () => Promise<void>;
  saveAssessment: (title?: string) => Promise<void>;
  updateAssessment: () => Promise<void>;
  openAssessment: (publicId: string) => Promise<void>;
  archiveAssessment: (publicId: string) => Promise<void>;
  duplicateAssessment: (publicId: string) => Promise<void>;
  createShare: () => Promise<void>;
  revokeShare: () => Promise<void>;
  clearMessages: () => void;
  reset: () => void;
}

const EMPTY_TIMELINE: TimelineEntry[] = [];

const initialState = {
  sessionStatus: 'idle' as SessionStatus,
  csrfToken: null,
  sessionLabel: null,
  sessionExpiresAt: null,
  baseline: null,
  soc: DEFAULT_SOC_STATE,
  timeline: EMPTY_TIMELINE,
  library: [] as LiveScenarioPreset[],
  history: [] as LiveAssessmentSummary[],
  currentPublicId: null,
  currentTitle: '',
  shareUrl: null,
  busy: false,
  message: null,
  error: null,
};

const errorMessage = (error: unknown): string =>
  error instanceof LiveApiError || error instanceof Error
    ? error.message
    : 'The request could not be completed.';

export const useLiveStore = create<LiveState>((set, get) => ({
  ...initialState,

  initSession: async () => {
    if (get().sessionStatus === 'ready' && get().csrfToken !== null) {
      return get().csrfToken;
    }
    set({ sessionStatus: 'loading', error: null });
    try {
      const session = await liveApi.session();
      set({
        sessionStatus: 'ready',
        csrfToken: session.csrfToken,
        sessionLabel: session.sessionLabel,
        sessionExpiresAt: session.expiresAt,
      });

      return session.csrfToken;
    } catch (error) {
      set({ sessionStatus: 'error', error: errorMessage(error) });

      return null;
    }
  },

  setBaseline: (baseline) => set({ baseline, currentPublicId: null, shareUrl: null }),

  setTitle: (title) => set({ currentTitle: title.slice(0, 160) }),

  updateSoc: (patch) => set({ soc: { ...get().soc, ...patch }, error: null }),

  resetSoc: () => set({ soc: DEFAULT_SOC_STATE, timeline: EMPTY_TIMELINE, error: null }),

  applyPreset: (preset) => {
    const baseline = get().baseline;
    const timeline: TimelineEntry[] = [];
    if (baseline !== null) {
      for (const step of preset.timeline) {
        timeline.push({
          offsetMs: step.offsetMs,
          label: step.label,
          state: step.state,
          result: calculateRealTimeRisk(step.state, baseline.baselineEal),
        });
      }
    }
    set({
      soc: preset.defaultState,
      timeline,
      currentTitle: preset.name,
      message: `Applied the demonstration scenario: ${preset.name}.`,
      error: null,
    });
  },

  recordEvent: (label) => {
    const { soc, baseline, timeline } = get();
    if (baseline === null) {
      set({ error: 'Select a valid QuickRisk scenario before using QuickRisk Live.' });

      return;
    }
    const previousOffset = timeline.length === 0 ? 0 : timeline[timeline.length - 1].offsetMs;
    const offsetMs = timeline.length === 0 ? 0 : previousOffset + TIMELINE_STEP_MS;
    const entry: TimelineEntry = {
      offsetMs,
      label: label.trim() === '' ? `Step ${timeline.length + 1}` : label.trim().slice(0, 160),
      state: soc,
      result: calculateRealTimeRisk(soc, baseline.baselineEal),
    };
    set({ timeline: [...timeline, entry], message: `Recorded timeline step ${timeline.length + 1}.`, error: null });
  },

  removeTimelineEntry: (index) =>
    set({ timeline: get().timeline.filter((_, position) => position !== index) }),

  clearTimeline: () => set({ timeline: EMPTY_TIMELINE, message: 'Timeline cleared.', error: null }),

  loadLibrary: async () => {
    try {
      const library = await liveApi.scenarios();
      set({ library });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  loadHistory: async () => {
    const csrfToken = await get().initSession();
    if (csrfToken === null) {
      return;
    }
    try {
      const history = await liveApi.listAssessments(csrfToken);
      set({ history });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  saveAssessment: async (title) => {
    const state = get();
    if (state.baseline === null) {
      set({ error: 'Select a valid QuickRisk scenario before using QuickRisk Live.' });

      return;
    }
    const csrfToken = await get().initSession();
    if (csrfToken === null) {
      return;
    }

    set({ busy: true, error: null, message: null });
    try {
      const detail = await liveApi.createAssessment(buildPayload(state, title ?? state.currentTitle), csrfToken);
      set({
        busy: false,
        currentPublicId: detail.publicId,
        currentTitle: detail.title,
        message: 'Assessment saved to your anonymous session.',
      });
      await get().loadHistory();
    } catch (error) {
      set({ busy: false, error: errorMessage(error) });
    }
  },

  updateAssessment: async () => {
    const state = get();
    if (state.currentPublicId === null || state.baseline === null) {
      set({ error: 'Save the assessment first, then update it.' });

      return;
    }
    const csrfToken = await get().initSession();
    if (csrfToken === null) {
      return;
    }

    set({ busy: true, error: null, message: null });
    try {
      const detail = await liveApi.updateAssessment(
        state.currentPublicId,
        buildPayload(state, state.currentTitle),
        csrfToken,
      );
      set({ busy: false, message: 'Assessment updated in your anonymous session.' });
      ingestDetail(set, detail);
      await get().loadHistory();
    } catch (error) {
      set({ busy: false, error: errorMessage(error) });
    }
  },

  openAssessment: async (publicId) => {
    const csrfToken = await get().initSession();
    if (csrfToken === null) {
      return;
    }
    set({ busy: true, error: null, message: null });
    try {
      const detail = await liveApi.getAssessment(publicId, csrfToken);
      ingestDetail(set, detail);
      set({ busy: false, message: 'Assessment opened.' });
    } catch (error) {
      set({ busy: false, error: errorMessage(error) });
    }
  },

  archiveAssessment: async (publicId) => {
    const csrfToken = await get().initSession();
    if (csrfToken === null) {
      return;
    }
    try {
      await liveApi.archiveAssessment(publicId, csrfToken);
      set({
        history: get().history.filter((entry) => entry.publicId !== publicId),
        message: 'Assessment archived.',
      });
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  duplicateAssessment: async (publicId) => {
    const csrfToken = await get().initSession();
    if (csrfToken === null) {
      return;
    }
    set({ busy: true, error: null, message: null });
    try {
      const source = await liveApi.getAssessment(publicId, csrfToken);
      const duplicated = await liveApi.createAssessment(
        {
          title: `${source.title === '' ? source.scenarioName : source.title} (copy)`.slice(0, 160),
          scenarioId: source.scenarioId,
          scenarioName: source.scenarioName,
          baselineEal: source.baselineEal,
          inputState: source.inputState,
          riskResult: source.result,
          timeline: source.timeline.map((event) => ({
            offsetMs: event.offsetMs,
            eventType: event.eventType,
            label: event.label,
            state: event.state,
            result: event.result,
          })),
          methodologyVersion: source.methodologyVersion,
        },
        csrfToken,
      );
      ingestDetail(set, duplicated);
      set({ busy: false, message: 'Assessment duplicated as a new assessment.' });
      await get().loadHistory();
    } catch (error) {
      set({ busy: false, error: errorMessage(error) });
    }
  },

  createShare: async () => {
    const state = get();
    if (state.currentPublicId === null) {
      set({ error: 'Save the assessment before sharing it.' });

      return;
    }
    const csrfToken = await get().initSession();
    if (csrfToken === null) {
      return;
    }
    try {
      const share = await liveApi.createShare(state.currentPublicId, csrfToken);
      set({ shareUrl: share.shareUrl, message: 'Read-only share link created.' });
      await get().loadHistory();
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  revokeShare: async () => {
    const state = get();
    if (state.currentPublicId === null) {
      return;
    }
    const csrfToken = await get().initSession();
    if (csrfToken === null) {
      return;
    }
    try {
      await liveApi.revokeShare(state.currentPublicId, csrfToken);
      set({ shareUrl: null, message: 'Share link revoked.' });
      await get().loadHistory();
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  clearMessages: () => set({ message: null, error: null }),

  reset: () => set({ ...initialState }),
}));


/** Builds the persistence payload. The risk result is the answer of the pure engine. */
function buildPayload(state: LiveState, title: string): Record<string, unknown> {
  const baseline = state.baseline;
  if (baseline === null) {
    throw new Error('A QuickRisk baseline is required before saving.');
  }

  return {
    title: title.slice(0, 160),
    scenarioId: baseline.scenarioCode,
    scenarioName: baseline.scenarioName,
    baselineEal: baseline.baselineEal,
    baselineSource: { modelId: baseline.modelId, modelVersion: baseline.modelVersion },
    inputState: state.soc,
    riskResult: calculateRealTimeRisk(state.soc, baseline.baselineEal),
    timeline: state.timeline.map((entry) => ({
      offsetMs: entry.offsetMs,
      eventType: 'STATE_RECORDED',
      label: entry.label,
      state: entry.state,
      result: entry.result,
    })),
    methodologyVersion: LIVE_METHODOLOGY_VERSION,
  };
}

/** Applies a server assessment to the in-memory store. */
function ingestDetail(
  set: (partial: Partial<LiveState>) => void,
  detail: LiveAssessmentDetail,
): void {
  const baseline: LiveBaseline = {
    scenarioCode: detail.scenarioId,
    scenarioName: detail.scenarioName,
    baselineEal: detail.baselineEal,
    currencySymbol: '€',
    modelId: detail.baselineModelId,
    modelVersion: detail.baselineModelVersion,
  };

  set({
    baseline,
    soc: detail.inputState,
    timeline: detail.timeline.map((event) => ({
      offsetMs: event.offsetMs,
      label: event.label,
      state: event.state,
      result: event.result,
    })),
    currentPublicId: detail.publicId,
    currentTitle: detail.title,
    shareUrl: detail.shareUrl,
    error: null,
  });
}
