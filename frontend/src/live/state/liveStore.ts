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
  APPLICATION_CURRENCY_SYMBOL,
  buildLivePayload,
  type LiveBaseline,
} from '@/live/domain/livePayload';
import { savedAssessmentScenarioError, withScenario } from '@/live/domain/scenarioIdentity';
import { liveStateFingerprint } from '@/live/domain/liveFingerprint';
import { retryCsrfOnce } from '@/live/api/csrfRetry';
import { createSingleFlight } from '@/live/api/singleFlight';
import {
  LiveApiError,
  liveApi,
  type LiveAssessmentDetail,
  type LiveAssessmentSummary,
  type LiveScenarioPreset,
} from '@/live/api/liveClient';

export type { LiveBaseline };

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
  titleOrigin: 'preset' | 'user';
  shareUrl: string | null;
  /** True when the saved assessment has an active read-only link, even if its URL is not known. */
  currentHasActiveShare: boolean;
  /** Fingerprint of the state as last saved; null when no saved state is open. */
  savedFingerprint: string | null;

  busy: boolean;
  message: string | null;
  error: string | null;

  initSession: (forceRefresh?: boolean) => Promise<string | null>;
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
  /** Clears the current simulation while retaining the anonymous session, library and history. */
  resetSimulation: () => void;
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
  titleOrigin: 'user' as const,
  shareUrl: null,
  currentHasActiveShare: false,
  savedFingerprint: null,
  busy: false,
  message: null,
  error: null,
};

const errorMessage = (error: unknown): string =>
  error instanceof LiveApiError || error instanceof Error
    ? error.message
    : 'The request could not be completed.';

/**
 * The server rotates the CSRF token on every session read, so overlapping session requests are
 * never allowed. This single promise is shared by every caller and cleared after settlement.
 */
const sessionFlight = createSingleFlight(() => liveApi.session());

export const useLiveStore = create<LiveState>((set, get) => ({
  ...initialState,

  initSession: async (forceRefresh = false) => {
    const current = get();
    if (!forceRefresh && current.sessionStatus === 'ready' && current.csrfToken !== null) {
      return current.csrfToken;
    }
    set({ sessionStatus: 'loading', error: null });
    try {
      const session = await sessionFlight();
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

  setBaseline: (baseline) =>
    set((state) => {
      const hadTimeline = state.timeline.length > 0;
      const clearPresetTitle = state.titleOrigin === 'preset';

      return {
        baseline,
        soc: baseline === null ? state.soc : withScenario(state.soc, baseline.scenarioCode),
        timeline: EMPTY_TIMELINE,
        currentPublicId: null,
        currentTitle: clearPresetTitle ? '' : state.currentTitle,
        shareUrl: null,
        currentHasActiveShare: false,
        savedFingerprint: null,
        message:
          baseline !== null && hadTimeline
            ? 'Baseline changed. The simulation timeline was cleared because every recorded exposure depends on the baseline.'
            : null,
        error: null,
      };
    }),

  setTitle: (title) => set({ currentTitle: title.slice(0, 160), titleOrigin: 'user' }),

  updateSoc: (patch) =>
    set((state) => {
      const merged = { ...state.soc, ...patch };
      const scenarioCode = state.baseline?.scenarioCode ?? merged.scenarioId;

      return { soc: withScenario(merged, scenarioCode), error: null };
    }),

  resetSoc: () =>
    set((state) => ({
      soc: withScenario(DEFAULT_SOC_STATE, state.baseline?.scenarioCode ?? DEFAULT_SOC_STATE.scenarioId),
      timeline: EMPTY_TIMELINE,
      error: null,
    })),

  applyPreset: (preset) => {
    const state = get();
    const scenarioCode = state.baseline?.scenarioCode ?? preset.defaultState.scenarioId;
    const soc = withScenario(preset.defaultState, scenarioCode);
    const timeline: TimelineEntry[] = [];
    if (state.baseline !== null) {
      for (const step of preset.timeline) {
        const stepState = withScenario(step.state, scenarioCode);
        timeline.push({
          offsetMs: step.offsetMs,
          label: step.label,
          state: stepState,
          result: calculateRealTimeRisk(stepState, state.baseline.baselineEal),
        });
      }
    }
    set({
      soc,
      timeline,
      currentTitle: preset.name,
      titleOrigin: 'preset',
      currentPublicId: null,
      shareUrl: null,
      currentHasActiveShare: false,
      savedFingerprint: null,
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
    const normalized = withScenario(soc, baseline.scenarioCode);
    const previousOffset = timeline.length === 0 ? 0 : timeline[timeline.length - 1].offsetMs;
    const offsetMs = timeline.length === 0 ? 0 : previousOffset + TIMELINE_STEP_MS;
    const entry: TimelineEntry = {
      offsetMs,
      label: label.trim() === '' ? `Step ${timeline.length + 1}` : label.trim().slice(0, 160),
      state: normalized,
      result: calculateRealTimeRisk(normalized, baseline.baselineEal),
    };
    set({
      soc: normalized,
      timeline: [...timeline, entry],
      message: `Recorded timeline step ${timeline.length + 1}.`,
      error: null,
    });
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

    set({ busy: true, error: null, message: null });
    try {
      const detail = await retryCsrfOnce(get().initSession, (csrfToken) =>
        liveApi.createAssessment(buildPayload(state, title ?? state.currentTitle), csrfToken),
      );
      // Ingest the persisted response rather than retaining the pre-save values. MySQL stores
      // the baseline at DECIMAL(18,2); using the unrounded in-memory baseline made a fresh
      // save look dirty immediately and disabled Share.
      const ingested = ingestDetail(set, detail);
      set({
        busy: false,
        message: ingested
          ? 'Assessment saved to your anonymous session.'
          : 'The saved assessment is internally inconsistent and was not applied.',
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

    set({ busy: true, error: null, message: null });
    try {
      const detail = await retryCsrfOnce(get().initSession, (csrfToken) =>
        liveApi.updateAssessment(
          state.currentPublicId as string,
          buildPayload(state, state.currentTitle),
          csrfToken,
        ),
      );
      const ingested = ingestDetail(set, detail);
      set({ busy: false, message: ingested ? 'Assessment updated in your anonymous session.' : null });
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
      const ingested = ingestDetail(set, detail);
      set({ busy: false, message: ingested ? 'Assessment opened.' : null });
    } catch (error) {
      set({ busy: false, error: errorMessage(error) });
    }
  },

  archiveAssessment: async (publicId) => {
    set({ busy: true, error: null, message: null });
    try {
      await retryCsrfOnce(get().initSession, (csrfToken) =>
        liveApi.archiveAssessment(publicId, csrfToken),
      );
      set((state) => {
        const archivedCurrent = state.currentPublicId === publicId;

        return {
          busy: false,
          history: state.history.filter((entry) => entry.publicId !== publicId),
          currentPublicId: archivedCurrent ? null : state.currentPublicId,
          savedFingerprint: archivedCurrent ? null : state.savedFingerprint,
          shareUrl: archivedCurrent ? null : state.shareUrl,
          currentHasActiveShare: archivedCurrent ? false : state.currentHasActiveShare,
          message: 'Assessment archived.',
        };
      });
    } catch (error) {
      set({ busy: false, error: errorMessage(error) });
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
      const problem = savedAssessmentScenarioError(source);
      if (problem !== null) {
        set({ busy: false, error: problem });

        return;
      }
      const duplicated = await retryCsrfOnce(get().initSession, (writeToken) =>
        liveApi.createAssessment(
          {
            title: `${source.title === '' ? source.scenarioName : source.title} (copy)`.slice(0, 160),
            scenarioId: source.scenarioId,
            scenarioName: source.scenarioName,
            baselineEal: source.baselineEal,
            baselineSource: {
              modelId: source.baselineModelId,
              modelVersion: source.baselineModelVersion,
            },
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
          writeToken,
        ),
      );
      const ingested = ingestDetail(set, duplicated);
      set({ busy: false, message: ingested ? 'Assessment duplicated as a new assessment.' : null });
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
    const fingerprint = currentFingerprint(state);
    if (fingerprint === null || state.savedFingerprint === null || fingerprint !== state.savedFingerprint) {
      set({
        error: 'Save or update the assessment before sharing it. The simulation has changed since the last save.',
      });

      return;
    }
    try {
      const share = await retryCsrfOnce(get().initSession, (writeToken) =>
        liveApi.createShare(state.currentPublicId as string, writeToken),
      );
      set({
        shareUrl: share.shareUrl,
        currentHasActiveShare: true,
        message: 'Read-only share link created.',
      });
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
    try {
      await retryCsrfOnce(get().initSession, (writeToken) =>
        liveApi.revokeShare(state.currentPublicId as string, writeToken),
      );
      set({ shareUrl: null, currentHasActiveShare: false, message: 'Share link revoked.' });
      await get().loadHistory();
    } catch (error) {
      set({ error: errorMessage(error) });
    }
  },

  clearMessages: () => set({ message: null, error: null }),

  resetSimulation: () =>
    set({
      baseline: null,
      soc: DEFAULT_SOC_STATE,
      timeline: EMPTY_TIMELINE,
      currentPublicId: null,
      currentTitle: '',
      titleOrigin: 'user',
      shareUrl: null,
      currentHasActiveShare: false,
      savedFingerprint: null,
      busy: false,
      message: null,
      error: null,
    }),

  reset: () => set({ ...initialState }),
}));


/** Builds the persistence payload through the pure coherence guard. */
function buildPayload(state: LiveState, title: string): Record<string, unknown> {
  const baseline = state.baseline;
  if (baseline === null) {
    throw new Error('A QuickRisk baseline is required before saving.');
  }

  return buildLivePayload({
    baseline,
    soc: state.soc,
    timeline: state.timeline,
    title,
    methodologyVersion: LIVE_METHODOLOGY_VERSION,
  });
}

/**
 * Applies a server assessment to the in-memory store.
 *
 * Fails closed when the saved record is internally inconsistent, rather than displaying a
 * scenario, timeline and result that do not belong together.
 */
function ingestDetail(
  set: (partial: Partial<LiveState>) => void,
  detail: LiveAssessmentDetail,
): boolean {
  const problem = savedAssessmentScenarioError(detail);
  if (problem !== null) {
    set({ error: problem });

    return false;
  }

  const baseline: LiveBaseline = {
    scenarioCode: detail.scenarioId,
    scenarioName: detail.scenarioName,
    baselineEal: detail.baselineEal,
    currencySymbol: APPLICATION_CURRENCY_SYMBOL,
    modelId: detail.baselineModelId,
    modelVersion: detail.baselineModelVersion,
  };
  const soc = withScenario(detail.inputState, detail.scenarioId);
  const timeline = detail.timeline.map((event) => ({
    offsetMs: event.offsetMs,
    label: event.label,
    state: withScenario(event.state, detail.scenarioId),
    result: event.result,
  }));

  set({
    baseline,
    soc,
    timeline,
    currentPublicId: detail.publicId,
    currentTitle: detail.title,
    titleOrigin: 'user',
    shareUrl: detail.shareUrl,
    currentHasActiveShare: detail.hasActiveShare,
    savedFingerprint: detailFingerprint(detail),
    error: null,
  });

  return true;
}

/** Fingerprint of the state returned by the server after a save or an open. */
function detailFingerprint(detail: LiveAssessmentDetail): string {
  return liveStateFingerprint({
    baseline: {
      scenarioCode: detail.scenarioId,
      scenarioName: detail.scenarioName,
      baselineEal: detail.baselineEal,
      currencySymbol: APPLICATION_CURRENCY_SYMBOL,
      modelId: detail.baselineModelId,
      modelVersion: detail.baselineModelVersion,
    },
    soc: withScenario(detail.inputState, detail.scenarioId),
    timeline: detail.timeline.map((event) => ({
      offsetMs: event.offsetMs,
      label: event.label,
      state: withScenario(event.state, detail.scenarioId),
      result: event.result,
    })),
    title: detail.title,
    methodologyVersion: LIVE_METHODOLOGY_VERSION,
  });
}

/** Fingerprint of the current in-memory state, or null before a baseline exists. */
function currentFingerprint(state: LiveState): string | null {
  if (state.baseline === null) {
    return null;
  }

  return liveStateFingerprint({
    baseline: state.baseline,
    soc: state.soc,
    timeline: state.timeline,
    title: state.currentTitle,
    methodologyVersion: LIVE_METHODOLOGY_VERSION,
  });
}
