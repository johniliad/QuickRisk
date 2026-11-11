import { ArrowRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney, formatPercent } from '@/lib/format';
import { AssessmentActions } from '@/live/components/AssessmentActions';
import { CalculationTrace } from '@/live/components/CalculationTrace';
import { PresetLibrary } from '@/live/components/PresetLibrary';
import { RiskDisplay } from '@/live/components/RiskDisplay';
import { LiveDisclaimer, SimulationBadge } from '@/live/components/SimulationBadge';
import { SocInputs } from '@/live/components/SocInputs';
import { TimelinePanel } from '@/live/components/TimelinePanel';
import { calculateRealTimeRisk } from '@/live/engine/socRiskEngine';
import { useLiveStore } from '@/live/state/liveStore';
import { useAssessmentStore } from '@/state/assessmentStore';

/**
 * QuickRisk Live simulator.
 *
 * Three columns on desktop (SOC inputs · current risk · why), stacked on mobile in the order
 * risk → inputs → trace. The baseline comes from the QuickRisk quantitative model that is
 * already in memory, or from the saved assessment opened from history.
 */
export function LiveSimulatorView() {
  const results = useAssessmentStore((state) => state.results);
  const setView = useAssessmentStore((state) => state.setView);
  const selectedScenarioCode = useAssessmentStore((state) => state.selectedScenarioCode);

  const baseline = useLiveStore((state) => state.baseline);
  const soc = useLiveStore((state) => state.soc);
  const timeline = useLiveStore((state) => state.timeline);
  const library = useLiveStore((state) => state.library);
  const currentPublicId = useLiveStore((state) => state.currentPublicId);
  const currentTitle = useLiveStore((state) => state.currentTitle);
  const shareUrl = useLiveStore((state) => state.shareUrl);
  const message = useLiveStore((state) => state.message);
  const error = useLiveStore((state) => state.error);
  const busy = useLiveStore((state) => state.busy);
  const sessionLabel = useLiveStore((state) => state.sessionLabel);

  const setBaseline = useLiveStore((state) => state.setBaseline);
  const updateSoc = useLiveStore((state) => state.updateSoc);
  const applyPreset = useLiveStore((state) => state.applyPreset);
  const recordEvent = useLiveStore((state) => state.recordEvent);
  const removeTimelineEntry = useLiveStore((state) => state.removeTimelineEntry);
  const clearTimeline = useLiveStore((state) => state.clearTimeline);
  const loadLibrary = useLiveStore((state) => state.loadLibrary);
  const initSession = useLiveStore((state) => state.initSession);
  const saveAssessment = useLiveStore((state) => state.saveAssessment);
  const updateAssessment = useLiveStore((state) => state.updateAssessment);
  const createShare = useLiveStore((state) => state.createShare);
  const revokeShare = useLiveStore((state) => state.revokeShare);
  const setTitle = useLiveStore((state) => state.setTitle);

  const [recordLabel, setRecordLabel] = useState('');

  useEffect(() => {
    void initSession();
    void loadLibrary();
  }, [initSession, loadLibrary]);

  // Adopt the QuickRisk result that is already in memory, unless a saved assessment is open.
  useEffect(() => {
    if (baseline !== null || results === null) {
      return;
    }
    const scenario =
      results.scenarios.find((entry) => entry.code === selectedScenarioCode) ?? results.scenarios[0];
    if (scenario === undefined) {
      return;
    }
    setBaseline({
      scenarioCode: scenario.code,
      scenarioName: scenario.shortLabel,
      baselineEal: scenario.statistics.expectedAnnualLoss,
      currencySymbol: results.meta.currencySymbol === '' ? '€' : results.meta.currencySymbol,
      modelId: results.meta.modelId,
      modelVersion: results.meta.modelVersion,
    });
  }, [baseline, results, selectedScenarioCode, setBaseline]);

  const result = useMemo(() => {
    if (baseline === null) {
      return null;
    }
    try {
      return calculateRealTimeRisk(soc, baseline.baselineEal);
    } catch {
      return null;
    }
  }, [soc, baseline]);
  if (baseline === null || result === null) {
    return (
      <div className="grid gap-6">
        <SimulationBadge />
        <Card>
          <CardHeader>
            <CardTitle>QuickRisk Live needs a QuickRisk baseline first</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="m-0">
              Select a valid QuickRisk scenario before using QuickRisk Live. The baseline exposure comes
              from the QuickRisk quantitative model and is never invented here.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setView('disclaimer')}>
                Run a QuickRisk assessment
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
              <Button variant="secondary" onClick={() => setView('live-history')}>
                Open a saved assessment
              </Button>
            </div>
          </CardContent>
        </Card>
        <LiveDisclaimer />
      </div>
    );
  }
  const symbol = baseline.currencySymbol;
  const scenarioChoices = results?.scenarios ?? [];

  return (
    <div className="grid gap-6">
      <SimulationBadge />

      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">
            QuickRisk Live — real-time overlay
          </p>
          <h1 className="m-0 text-[var(--text-title)] font-bold text-heading">Simulated SOC risk state</h1>
        </div>
        {scenarioChoices.length === 0 ? (
          <p className="m-0 text-small text-muted">
            Baseline scenario: <strong className="text-ink">{baseline.scenarioName}</strong> ·{" "}
            {formatMoney(baseline.baselineEal, symbol)} per year
          </p>
        ) : (
          <div className="grid gap-1">
            <label
              className="text-micro font-semibold uppercase tracking-[0.08em] text-muted"
              htmlFor="live-scenario"
            >
              QuickRisk baseline scenario
            </label>
            <select
              id="live-scenario"
              className="min-h-9 rounded-control border border-border bg-paper px-3 text-small"
              value={baseline.scenarioCode}
              onChange={(event) => {
                const scenario = scenarioChoices.find((entry) => entry.code === event.target.value);
                if (scenario === undefined) {
                  return;
                }
                setBaseline({
                  scenarioCode: scenario.code,
                  scenarioName: scenario.shortLabel,
                  baselineEal: scenario.statistics.expectedAnnualLoss,
                  currencySymbol: symbol,
                  modelId: results?.meta.modelId ?? baseline.modelId,
                  modelVersion: results?.meta.modelVersion ?? baseline.modelVersion,
                });
              }}
            >
              {scenarioChoices.map((scenario) => (
                <option key={scenario.code} value={scenario.code}>
                  {scenario.shortLabel} — {formatMoney(scenario.statistics.expectedAnnualLoss, symbol)}/year
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)_minmax(0,1.15fr)]">
        <div className="order-2 grid gap-6 xl:order-1">
          <SocInputs soc={soc} onChange={updateSoc} disabled={busy} />
        </div>
        <div className="order-1 grid gap-6 xl:order-2">
          <RiskDisplay result={result} symbol={symbol} scenarioName={baseline.scenarioName} />
          <Card>
            <CardHeader>
              <CardTitle>Mitigation state</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-small">
              <p className="m-0">
                EDR isolation: <strong>{soc.isEdrIsolated ? 'active' : 'not active'}</strong>
              </p>
              <p className="m-0">
                Network blocking: <strong>{soc.isNetworkBlocked ? 'active' : 'not active'}</strong>
              </p>
              <p className="m-0">
                Identity response: <strong>{soc.isIdentityRevoked ? 'active' : 'not active'}</strong>
              </p>
              <p className="m-0 text-micro text-muted">
                Modelled exposure reduction: {formatPercent(1 - result.mitigationFactor)} of the simulated
                telemetry weight. With no active telemetry the multiplier stays at 1.00x.
              </p>
            </CardContent>
          </Card>
        </div>
        <div className="order-3 grid gap-6">
          <CalculationTrace result={result} symbol={symbol} />
        </div>
      </div>

      <TimelinePanel
        entries={timeline}
        symbol={symbol}
        onRecord={() => {
          recordEvent(recordLabel);
          setRecordLabel('');
        }}
        onClear={clearTimeline}
        onRemove={removeTimelineEntry}
        onLoadState={(state) => updateSoc(state)}
        onSave={() => {
          if (currentPublicId === null) {
            void saveAssessment(currentTitle);
          } else {
            void updateAssessment();
          }
        }}
        busy={busy}
        canSave
        recordLabel={recordLabel}
        onRecordLabelChange={setRecordLabel}
      />

      <PresetLibrary presets={library} onApply={applyPreset} disabled={busy} />

      <AssessmentActions
        title={currentTitle}
        onTitleChange={setTitle}
        onSave={() => void saveAssessment(currentTitle)}
        onUpdate={() => void updateAssessment()}
        onShare={() => void createShare()}
        onRevokeShare={() => void revokeShare()}
        onExecutive={() => setView('live-executive')}
        onHistory={() => setView('live-history')}
        shareUrl={shareUrl}
        publicId={currentPublicId}
        busy={busy}
        message={message}
        error={error}
        sessionLabel={sessionLabel}
      />

      <Alert tone="info" title="How to read this page">
        <p className="m-0">
          The risk index and multiplier describe the synthetic SOC state, not a probability that a real
          compromise is happening. Saving and sharing are explicit actions; the simulator itself keeps
          everything in this page.
        </p>
      </Alert>

      <LiveDisclaimer />
    </div>
  );
}

