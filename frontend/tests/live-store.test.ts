import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SOC_STATE, type SOCInputState, type TimelineEntry } from '@/live/domain/socTypes';
import { calculateRealTimeRisk } from '@/live/engine/socRiskEngine';
import { liveApi, type LiveAssessmentDetail, type LiveScenarioPreset } from '@/live/api/liveClient';
import { liveStateFingerprint } from '@/live/domain/liveFingerprint';
import { LIVE_METHODOLOGY_VERSION } from '@/live/domain/socTypes';
import { useLiveStore, type LiveBaseline } from '@/live/state/liveStore';

const state = (scenarioId: string, overrides: Partial<SOCInputState> = {}): SOCInputState => ({
  ...DEFAULT_SOC_STATE,
  scenarioId,
  ...overrides,
});

const baseline = (scenarioCode = 'S2', baselineEal = 500000): LiveBaseline => ({
  scenarioCode,
  scenarioName: `Scenario ${scenarioCode}`,
  baselineEal,
  currencySymbol: '€',
  modelId: 'FAIR-QK-1.3',
  modelVersion: '1.3.0',
});

const preset = (scenarioCode = 'S1'): LiveScenarioPreset => ({
  slug: 'ransomware-preset',
  name: 'Ransomware Outbreak',
  category: 'intrusion',
  shortDescription: 'Preset',
  longDescription: 'Preset',
  scenarioVersion: '1.0',
  defaultState: state(scenarioCode, { incidentStage: 'compromise' }),
  timeline: [
    {
      offsetMs: 0,
      label: 'Detection',
      state: state(scenarioCode, { incidentStage: 'triage', iocCount: 2 }),
    },
  ],
  executiveSummaryTemplate: 'Preset summary',
});

const entry = (scenarioCode = 'S2', baselineEal = 500000): TimelineEntry => {
  const soc = state(scenarioCode, { incidentStage: 'triage' });

  return {
    offsetMs: 0,
    label: 'Saved step',
    state: soc,
    result: calculateRealTimeRisk(soc, baselineEal),
  };
};

beforeEach(() => {
  useLiveStore.setState(useLiveStore.getInitialState(), true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('QuickRisk Live session initialisation', () => {
  it('single-flights concurrent session calls and returns the same token', async () => {
    const session = {
      csrfToken: 'a'.repeat(64),
      expiresAt: '2026-11-22T12:00:00Z',
      sessionLabel: 'TESTSESSION',
    };
    const request = vi.spyOn(liveApi, 'session').mockResolvedValue(session);

    const [first, second] = await Promise.all([
      useLiveStore.getState().initSession(),
      useLiveStore.getState().initSession(),
    ]);

    expect(request).toHaveBeenCalledTimes(1);
    expect(first).toBe(session.csrfToken);
    expect(second).toBe(session.csrfToken);
  });

  it('reuses the cached token and starts a new request only when forced', async () => {
    const request = vi.spyOn(liveApi, 'session').mockResolvedValue({
      csrfToken: 'b'.repeat(64),
      expiresAt: '2026-11-22T12:00:00Z',
      sessionLabel: 'TESTSESSION',
    });

    await useLiveStore.getState().initSession();
    await useLiveStore.getState().initSession();
    expect(request).toHaveBeenCalledTimes(1);

    await useLiveStore.getState().initSession(true);
    expect(request).toHaveBeenCalledTimes(2);
  });
});

describe('QuickRisk Live store scenario transitions', () => {
  it('normalises the SOC scenario when the baseline changes', () => {
    useLiveStore.getState().setBaseline(baseline('S2'));

    expect(useLiveStore.getState().baseline?.scenarioCode).toBe('S2');
    expect(useLiveStore.getState().soc.scenarioId).toBe('S2');
  });

  it('keeps the active scenario when the SOC inputs are reset', () => {
    useLiveStore.getState().setBaseline(baseline('S2'));
    useLiveStore.getState().resetSoc();

    expect(useLiveStore.getState().soc.scenarioId).toBe('S2');
  });

  it('keeps the active scenario when a SOC patch tries to change it', () => {
    useLiveStore.getState().setBaseline(baseline('S2'));
    useLiveStore.getState().updateSoc({ scenarioId: 'S9' });

    expect(useLiveStore.getState().soc.scenarioId).toBe('S2');
  });

  it('re-bases a preset onto the selected baseline and recalculates its timeline', () => {
    useLiveStore.getState().setBaseline(baseline('S2', 500000));
    useLiveStore.getState().applyPreset(preset('S1'));

    const current = useLiveStore.getState();
    expect(current.soc.scenarioId).toBe('S2');
    expect(current.timeline).toHaveLength(1);
    expect(current.timeline[0].state.scenarioId).toBe('S2');
    expect(current.timeline[0].result.baselineEal).toBe(500000);
  });

  it('records an event against the active scenario and baseline', () => {
    useLiveStore.getState().setBaseline(baseline('S2', 500000));
    useLiveStore.getState().recordEvent('Containment');

    const current = useLiveStore.getState();
    expect(current.timeline).toHaveLength(1);
    expect(current.timeline[0].state.scenarioId).toBe('S2');
    expect(current.timeline[0].result.baselineEal).toBe(500000);
  });

  it('clears the timeline and explains why when the baseline changes', () => {
    useLiveStore.getState().setBaseline(baseline('S2', 500000));
    useLiveStore.getState().recordEvent('Containment');
    useLiveStore.getState().setBaseline(baseline('S3', 900000));

    const current = useLiveStore.getState();
    expect(current.timeline).toHaveLength(0);
    expect(current.message).toContain('timeline was cleared');
  });

  it('clears a preset title when the baseline changes', () => {
    useLiveStore.getState().setBaseline(baseline('S2'));
    useLiveStore.getState().applyPreset(preset('S1'));
    expect(useLiveStore.getState().currentTitle).toBe('Ransomware Outbreak');

    useLiveStore.getState().setBaseline(baseline('S3'));
    expect(useLiveStore.getState().currentTitle).toBe('');
  });

  it('preserves a title the user typed when the baseline changes', () => {
    useLiveStore.getState().setBaseline(baseline('S2'));
    useLiveStore.getState().setTitle('Finance rehearsal');
    useLiveStore.getState().setBaseline(baseline('S3'));

    expect(useLiveStore.getState().currentTitle).toBe('Finance rehearsal');
  });

  it('preserves a saved title but clears the timeline and identifiers on a baseline change', () => {
    const savedState = state('S2', { incidentStage: 'compromise' });
    useLiveStore.setState({
      baseline: baseline('S2'),
      soc: savedState,
      timeline: [entry('S2')],
      currentTitle: 'Saved assessment',
      titleOrigin: 'user',
      currentPublicId: 'public-id',
      shareUrl: 'https://example.test/share',
    });

    useLiveStore.getState().setBaseline(baseline('S3'));

    const current = useLiveStore.getState();
    expect(current.currentTitle).toBe('Saved assessment');
    expect(current.timeline).toHaveLength(0);
    expect(current.currentPublicId).toBeNull();
    expect(current.shareUrl).toBeNull();
  });

  it('clears the saved fingerprint when the baseline changes', () => {
    useLiveStore.setState({
      baseline: baseline('S2'),
      soc: state('S2'),
      currentPublicId: 'public-id',
      savedFingerprint: 'saved-fingerprint',
    });

    useLiveStore.getState().setBaseline(baseline('S3'));

    expect(useLiveStore.getState().savedFingerprint).toBeNull();
  });

  it('clears the saved fingerprint when a demonstration preset is applied', () => {
    useLiveStore.getState().setBaseline(baseline('S2'));
    useLiveStore.setState({ currentPublicId: 'public-id', savedFingerprint: 'saved-fingerprint' });

    useLiveStore.getState().applyPreset(preset('S1'));

    expect(useLiveStore.getState().savedFingerprint).toBeNull();
  });

  it('refuses to share when the current state no longer matches the saved fingerprint', async () => {
    useLiveStore.setState({
      baseline: baseline('S2'),
      soc: state('S2', { incidentStage: 'compromise' }),
      currentPublicId: 'public-id',
      savedFingerprint: 'fingerprint-of-the-last-save',
    });

    await useLiveStore.getState().createShare();

    expect(useLiveStore.getState().error).toContain('Save or update the assessment before sharing it');
    expect(useLiveStore.getState().shareUrl).toBeNull();
  });

  it('resets only the simulation and retains the anonymous session and history', () => {
    useLiveStore.setState({
      sessionStatus: 'ready',
      csrfToken: 'c'.repeat(64),
      sessionLabel: 'SESSION',
      baseline: baseline('S2'),
      currentPublicId: 'public-id',
      currentHasActiveShare: true,
      history: [
        {
          publicId: 'SAVEDASSESSMENT00000000001',
          title: 'Saved',
          scenarioId: 'S2',
          scenarioName: 'Scenario S2',
          baselineEal: 500000,
          telemetryScore: 0,
          mitigationFactor: 1,
          socMultiplier: 1,
          realTimeRisk: 0,
          riskBand: 'Low',
          realTimeEal: 500000,
          methodologyVersion: '1.0',
          status: 'saved',
          createdAt: '2026-11-22T10:00:00Z',
          updatedAt: '2026-11-22T10:00:00Z',
          hasActiveShare: true,
        },
      ],
    });

    useLiveStore.getState().resetSimulation();

    const current = useLiveStore.getState();
    expect(current.sessionStatus).toBe('ready');
    expect(current.csrfToken).toBe('c'.repeat(64));
    expect(current.history).toHaveLength(1);
    expect(current.baseline).toBeNull();
    expect(current.currentHasActiveShare).toBe(false);
    expect(current.currentPublicId).toBeNull();
  });
});

describe('QuickRisk Live persistence normalization', () => {
  const detail = (baselineEal: number, title = 'Ransomware rehearsal'): LiveAssessmentDetail =>
    ({
      publicId: 'SAVEDASSESSMENT00000000001',
      title,
      scenarioId: 'S2',
      scenarioName: 'Scenario S2',
      baselineEal,
      baselineModelId: 'FAIR-QK-1.3',
      baselineModelVersion: '1.3.0',
      telemetryScore: 0,
      mitigationFactor: 1,
      socMultiplier: 1,
      realTimeRisk: 0,
      riskBand: 'Low',
      realTimeEal: baselineEal,
      methodologyVersion: '1.0',
      status: 'saved',
      createdAt: '2026-11-22T10:00:00Z',
      updatedAt: '2026-11-22T10:00:00Z',
      hasActiveShare: false,
      inputState: state('S2'),
      result: calculateRealTimeRisk(state('S2'), baselineEal),
      timeline: [],
      shareUrl: null,
    }) as unknown as LiveAssessmentDetail;

  const mockSession = () =>
    vi.spyOn(liveApi, 'session').mockResolvedValue({
      csrfToken: 'd'.repeat(64),
      expiresAt: '2026-11-22T12:00:00Z',
      sessionLabel: 'SESSION',
    });

  it('normalises the first save to the persisted decimal precision', async () => {
    mockSession();
    vi.spyOn(liveApi, 'listAssessments').mockResolvedValue([]);
    const persisted = detail(500000.79);
    vi.spyOn(liveApi, 'createAssessment').mockResolvedValue(persisted);

    useLiveStore.setState({
      baseline: baseline('S2', 500000.789),
      soc: state('S2'),
      currentTitle: 'Ransomware rehearsal',
    });

    await useLiveStore.getState().saveAssessment();

    const current = useLiveStore.getState();
    expect(current.baseline?.baselineEal).toBe(500000.79);
    expect(current.savedFingerprint).not.toBeNull();
    const currentFingerprint = liveStateFingerprint({
      baseline: current.baseline as LiveBaseline,
      soc: current.soc,
      timeline: current.timeline,
      title: current.currentTitle,
      methodologyVersion: LIVE_METHODOLOGY_VERSION,
    });
    expect(currentFingerprint).toBe(current.savedFingerprint);
  });

  it('preserves baseline model provenance when duplicating an assessment', async () => {
    mockSession();
    const source = detail(125000);
    vi.spyOn(liveApi, 'getAssessment').mockResolvedValue(source);
    const create = vi.spyOn(liveApi, 'createAssessment').mockResolvedValue(detail(125000, 'Copy'));
    vi.spyOn(liveApi, 'listAssessments').mockResolvedValue([]);

    await useLiveStore.getState().duplicateAssessment(source.publicId);

    const payload = create.mock.calls[0]?.[0] as {
      baselineSource?: { modelId?: string; modelVersion?: string };
    };
    expect(payload.baselineSource).toEqual({
      modelId: 'FAIR-QK-1.3',
      modelVersion: '1.3.0',
    });
  });
});
