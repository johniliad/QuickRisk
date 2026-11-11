/**
 * QuickRisk Decision Lab — business workflow screen.
 *
 * Steps: current risk and appetite → treatments → expected effect → portfolio comparison →
 * break-even → Board Risk Pack. Business Mode is the default; Analyst Mode exposes the seed,
 * iteration count, driver factors and the realised effect draws.
 *
 * Every number comes from the server, which drives the existing QuickRisk engine. Nothing here
 * calculates risk.
 */

import { ArrowRight, FileText, Printer, RefreshCw, Save, Share2, ShieldOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Label } from '@/components/ui/field';
import { publicModel } from '@/model';
import { useAssessmentStore } from '@/state/assessmentStore';
import { useLiveStore } from '@/live/state/liveStore';
import { decisionApi, DecisionApiError, type ComparisonResponse, type PortfolioResponse } from '@/decision/api/decisionClient';
import {
  BoardRiskPack,
  formatBoardMoney,
} from '@/decision/board/BoardRiskPack';
import { buildBoardReport } from '@/decision/board/boardModel';
import {
  EVIDENCE_LABELS,
  MECHANISM_LABELS,
  type Appetite,
  type EvidenceQuality,
  type MechanismGroup,
  type SensitivityResult,
  type TreatmentCatalogue,
  type TreatmentDefinition,
} from '@/decision/domain/decisionTypes';

const SEED = 20261107;

/** Builds the assessment payload the compute endpoints expect, from the in-memory answers. */
function buildAnswersPayload(
  organisationAnswers: Record<string, string>,
  scenarioAnswers: Record<string, Record<string, string>>,
) {
  return {
    schemaVersion: publicModel.version.schemaVersion,
    modelId: publicModel.version.modelId,
    disclaimer: { acknowledged: true, version: publicModel.version.disclaimerVersion },
    organisationAnswers: Object.entries(organisationAnswers).map(([questionCode, optionCode]) => ({
      questionCode,
      optionCode,
    })),
    scenarioAnswers: publicModel.scenarios.map((scenario) => ({
      scenarioCode: scenario.code,
      answers: [scenario.likelihoodQuestion, scenario.impactQuestion].map((question) => ({
        questionCode: question.code,
        optionCode: scenarioAnswers[scenario.code]?.[question.code] ?? publicModel.unknownCode,
      })),
    })),
  };
}

const emptyAppetite: Appetite = { annualLossLimit: null, highEndLimit: null, maxExceedanceProbability: null };

/**
 * A numeric input that accepts an empty value (an unconfigured appetite criterion).
 *
 * It is used for both money amounts and for a share between 0 and 1 (the exceedance
 * probability). The visible value is a local string draft, so intermediate states such
 * as "0." are preserved while typing: the parent only ever receives a number once it is
 * a valid finite value (or null for empty), and the decimal point is never lost.
 */
function MoneyInput({
  id,
  label,
  help,
  value,
  onChange,
  suffix,
}: {
  id: string;
  label: string;
  help: string;
  value: number | null;
  onChange: (value: number | null) => void;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [focused, setFocused] = useState(false);

  // Re-sync from the parent while the field is not being edited (for example after a reset).
  useEffect(() => {
    if (!focused) {
      setDraft(value === null ? '' : String(value));
    }
  }, [value, focused]);

  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          className="min-h-9 w-full rounded-control border border-border bg-paper px-3 text-small"
          inputMode="decimal"
          value={draft}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            const trimmed = draft.trim();
            if (trimmed === '') {
              setDraft('');
              onChange(null);
              return;
            }
            const parsed = Number(trimmed);
            if (Number.isFinite(parsed)) {
              setDraft(String(parsed));
              onChange(parsed);
            } else {
              // Revert an unparseable value to the last accepted one.
              setDraft(value === null ? '' : String(value));
            }
          }}
          onChange={(event) => {
            const raw = event.target.value;
            setDraft(raw);
            const trimmed = raw.trim();
            if (trimmed === '') {
              onChange(null);
              return;
            }
            const parsed = Number(trimmed);
            if (Number.isFinite(parsed)) {
              onChange(parsed);
            }
            // An intermediate value such as "0." stays in the draft and is not pushed to the
            // parent, so the decimal point survives and the parent is never given a truncated value.
          }}
          placeholder="Not configured"
        />
        {suffix === undefined ? null : <span className="text-small text-muted">{suffix}</span>}
      </div>
      <p className="m-0 text-micro text-muted">{help}</p>
    </div>
  );
}

/** One treatment card. Curated and user-defined treatments are visibly different. */
function TreatmentCard({
  treatment,
  selected,
  onToggle,
  symbol,
}: {
  treatment: TreatmentDefinition;
  selected: boolean;
  onToggle: () => void;
  symbol: string;
}) {
  const evidence = EVIDENCE_LABELS[treatment.evidenceQuality as EvidenceQuality];
  const effect = [
    treatment.causalEffects.frequency === null
      ? null
      : `event frequency ${Math.round(treatment.causalEffects.frequency.min * 100)}–${Math.round(
          treatment.causalEffects.frequency.max * 100,
        )}%`,
    treatment.causalEffects.magnitude === null
      ? null
      : `loss magnitude ${Math.round(treatment.causalEffects.magnitude.min * 100)}–${Math.round(
          treatment.causalEffects.magnitude.max * 100,
        )}%`,
  ].filter((entry): entry is string => entry !== null);

  return (
    <div
      className={`grid gap-2 rounded-card border p-3 ${
        selected ? 'border-accent-strong bg-accent-soft' : 'border-border'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="m-0 font-semibold text-heading">{treatment.name}</p>
        <span className="text-micro font-bold uppercase tracking-[0.08em] text-muted">
          {treatment.origin === 'custom' ? 'User-defined treatment' : 'Curated treatment'}
        </span>
      </div>
      <p className="m-0 text-small text-muted">{treatment.businessOutcome}</p>
      <p className="m-0 text-small">
        Investment {formatBoardMoney(treatment.initialCost.amount, symbol)} · annual cost{' '}
        {formatBoardMoney(treatment.annualOperatingCost.amount, symbol)} · effective after{' '}
        {treatment.implementationDelayDays} days
      </p>
      <p className="m-0 text-micro text-muted">
        Primary effect: {effect.length === 0 ? 'not stated' : effect.join('; ')} ·{' '}
        {MECHANISM_LABELS[treatment.mechanismGroup as MechanismGroup] ?? treatment.mechanismGroup} ·{' '}
        {evidence.label} ({evidence.confidence})
      </p>
      <div>
        <Checkbox
          id={`treatment-${treatment.id}`}
          checked={selected}
          onCheckedChange={onToggle}
          label={selected ? 'Included in this analysis' : 'Add to the analysis'}
        />
      </div>
    </div>
  );
}


export function DecisionLabView() {
  const organisationAnswers = useAssessmentStore((state) => state.organisationAnswers);
  const scenarioAnswers = useAssessmentStore((state) => state.scenarioAnswers);
  const results = useAssessmentStore((state) => state.results);
  const setView = useAssessmentStore((state) => state.setView);
  const initSession = useLiveStore((state) => state.initSession);

  const [appetite, setAppetite] = useState<Appetite>(emptyAppetite);
  const [catalogue, setCatalogue] = useState<TreatmentCatalogue | null>(null);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [portfolios, setPortfolios] = useState<PortfolioResponse | null>(null);
  const [sensitivity, setSensitivity] = useState<SensitivityResult | null>(null);
  const [analystMode, setAnalystMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [publicId, setPublicId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const symbol = results?.meta.currencySymbol === '' || results?.meta.currencySymbol === undefined
    ? '€'
    : results.meta.currencySymbol;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const csrfToken = await initSession();
      if (csrfToken === null) {
        if (!cancelled) {
          setError('The anonymous session could not be prepared, so the treatment library is unavailable.');
        }

        return;
      }
      try {
        const loaded = await decisionApi.catalogue(csrfToken);
        if (!cancelled) {
          setCatalogue(loaded);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof DecisionApiError ? caught.message : 'The treatment library could not be loaded.');
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [initSession]);

  const answers = useMemo(
    () => buildAnswersPayload(organisationAnswers, scenarioAnswers),
    [organisationAnswers, scenarioAnswers],
  );

  const curated = catalogue?.curated ?? [];
  const selectedTreatments = curated.filter((treatment) => selectedIds.includes(treatment.id));

  const computeBody = useCallback(
    (extra: Record<string, unknown>) => ({ ...answers, seed: SEED, iterations: 2000, appetite, ...extra }),
    [answers, appetite],
  );

  const runComparison = useCallback(async () => {
    if (selectedTreatments.length === 0) {
      setError('Select at least one treatment to compare.');

      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await decisionApi.computeComparison(
        computeBody({ treatments: selectedTreatments.map((treatment) => ({ source: 'curated', id: treatment.id })) }),
      );
      setComparison(result);
      setMessage('Treatment comparison calculated.');
    } catch (caught) {
      setError(caught instanceof DecisionApiError ? caught.message : 'The comparison could not be calculated.');
    } finally {
      setBusy(false);
    }
  }, [computeBody, selectedTreatments]);

  const runPortfolios = useCallback(async () => {
    if (selectedTreatments.length === 0) {
      setError('Select the candidate treatments you want evaluated.');

      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await decisionApi.computePortfolios(
        computeBody({
          treatments: [],
          candidateTreatments: selectedTreatments.map((treatment) => ({ source: 'curated', id: treatment.id })),
        }),
      );
      setPortfolios(result);
      setMessage(`Evaluated ${result.evaluated} portfolios.`);
    } catch (caught) {
      setError(caught instanceof DecisionApiError ? caught.message : 'The portfolios could not be evaluated.');
    } finally {
      setBusy(false);
    }
  }, [computeBody, selectedTreatments]);

  const runSensitivity = useCallback(async () => {
    if (selectedTreatments.length === 0) {
      setError('Select a treatment first.');

      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await decisionApi.computeSensitivity(
        computeBody({ treatments: selectedTreatments.map((treatment) => ({ source: 'curated', id: treatment.id })) }),
      );
      setSensitivity(result.sensitivity);
    } catch (caught) {
      setError(caught instanceof DecisionApiError ? caught.message : 'The break-even analysis could not be calculated.');
    } finally {
      setBusy(false);
    }
  }, [computeBody, selectedTreatments]);


  const saveDecision = useCallback(async () => {
    if (comparison === null) {
      setError('Run a comparison before saving the analysis.');

      return;
    }
    const csrfToken = await initSession();
    if (csrfToken === null) {
      setError('The anonymous session could not be prepared.');

      return;
    }

    setBusy(true);
    setError(null);
    try {
      const saved = await decisionApi.save(
        {
          title: selectedTreatments.map((treatment) => treatment.name).join(' + ').slice(0, 160),
          selection: { treatments: selectedTreatments, comparison, portfolios, sensitivity },
          appetite,
          recommended: portfolios === null ? null : (portfolios.portfolios.find((entry) => entry.id === portfolios.recommendedId) ?? null),
          result: comparison,
          quickriskModelId: comparison.provenance.quickriskModelId,
          quickriskModelVersion: comparison.provenance.quickriskModelVersion,
          decisionMethodologyVersion: comparison.provenance.decisionMethodologyVersion,
          boardPackVersion: comparison.provenance.boardPackVersion,
          simulationSeed: comparison.provenance.simulationSeed,
          iterations: comparison.provenance.iterations,
        },
        csrfToken,
      );
      setPublicId(saved.publicId);
      setMessage('Decision analysis saved to your anonymous session.');
    } catch (caught) {
      setError(caught instanceof DecisionApiError ? caught.message : 'The analysis could not be saved.');
    } finally {
      setBusy(false);
    }
  }, [appetite, comparison, initSession, portfolios, selectedTreatments, sensitivity]);

  const shareBoardPack = useCallback(async () => {
    if (publicId === null) {
      setError('Save the analysis before sharing the Board Risk Pack.');

      return;
    }
    const csrfToken = await initSession();
    if (csrfToken === null) {
      return;
    }
    try {
      const share = await decisionApi.createShare(publicId, csrfToken);
      setShareUrl(share.shareUrl);
      setMessage('Read-only Board Risk Pack link created.');
    } catch (caught) {
      setError(caught instanceof DecisionApiError ? caught.message : 'The link could not be created.');
    }
  }, [initSession, publicId]);

  const revokeShare = useCallback(async () => {
    if (publicId === null) {
      return;
    }
    const csrfToken = await initSession();
    if (csrfToken === null) {
      return;
    }
    try {
      await decisionApi.revokeShare(publicId, csrfToken);
      setShareUrl(null);
      setMessage('Board Risk Pack link revoked.');
    } catch (caught) {
      setError(caught instanceof DecisionApiError ? caught.message : 'The link could not be revoked.');
    }
  }, [initSession, publicId]);

  const boardReport = useMemo(() => {
    if (comparison === null) {
      return null;
    }
    const recommended = portfolios === null
      ? null
      : (portfolios.portfolios.find((entry) => entry.id === portfolios.recommendedId) ?? null);

    return buildBoardReport({
      title: selectedTreatments.map((treatment) => treatment.name).join(' + ') || 'Decision analysis',
      currencySymbol: symbol,
      generatedAt: comparison.provenance.generatedAt.slice(0, 10),
      baseline: comparison.baseline,
      treated: comparison.treated,
      appetiteBaseline: comparison.appetite.baseline,
      appetiteTreated: comparison.appetite.treated,
      initialInvestment: comparison.cost.initialInvestment,
      annualOperatingCost: comparison.cost.annualOperatingCost,
      treatments: selectedTreatments,
      recommended,
      reductionShare: comparison.delta.reductionShare,
      riskReductionEfficiency: comparison.riskReductionEfficiency,
      implementationDelayDays: comparison.cost.implementationDelayDays,
      provenance: {
        decisionMethodologyVersion: comparison.provenance.decisionMethodologyVersion,
        boardPackVersion: comparison.provenance.boardPackVersion,
        quickriskModelVersion: comparison.provenance.quickriskModelVersion,
        iterations: comparison.provenance.iterations,
        simulationSeed: comparison.provenance.simulationSeed,
        effectModel: comparison.provenance.effectModel,
      },
    });
  }, [comparison, portfolios, selectedTreatments, symbol]);

  const toggleTreatment = (id: string) =>
    setSelectedIds((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));


  if (results === null) {
    return (
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Decision Lab needs a QuickRisk assessment first</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="m-0">
              Decision Lab analyses the scenarios and exposure of a completed QuickRisk assessment. It never
              invents a baseline.
            </p>
            <div>
              <Button onClick={() => setView('disclaimer')}>
                Run a QuickRisk assessment
                <ArrowRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">Decision Lab</p>
        <h1 className="m-0 text-[var(--text-title)] font-bold text-heading">
          Explore how different investments and risk treatments could change your cyber-risk exposure
        </h1>
        <p className="m-0 text-small text-muted">
          QuickRisk model {results.meta.modelId} version {results.meta.modelVersion} · Decision Lab methodology{' '}
          {comparison?.provenance.decisionMethodologyVersion ?? '1.0'} · deterministic seed {SEED}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={analystMode ? 'secondary' : 'ghost'}
            onClick={() => setAnalystMode((current) => !current)}
          >
            {analystMode ? 'Business Mode' : 'Analyst Mode'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setView('live')}>
            QuickRisk Live
          </Button>
        </div>
      </header>

      {error === null ? null : <Alert tone="danger" role="alert">{error}</Alert>}
      {message === null ? null : <Alert tone="info" role="status">{message}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>1. How much risk are we prepared to accept?</CardTitle>
          <p className="m-0 text-small text-muted">
            Every criterion is optional. Only the ones you configure are evaluated, and no threshold is ever
            assumed.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <MoneyInput
            id="appetite-eal"
            label="Annual loss limit"
            help="The maximum modeled annual cyber-loss exposure management is prepared to accept."
            value={appetite.annualLossLimit}
            onChange={(value) => setAppetite((current) => ({ ...current, annualLossLimit: value }))}
            suffix="per year"
          />
          <MoneyInput
            id="appetite-p90"
            label="High-end loss limit"
            help="The maximum high-end modeled loss management is prepared to accept."
            value={appetite.highEndLimit}
            onChange={(value) => setAppetite((current) => ({ ...current, highEndLimit: value }))}
          />
          <MoneyInput
            id="appetite-probability"
            label="Maximum acceptable likelihood of exceeding the annual loss limit"
            help="Enter a share between 0 and 1 (for example 0.25 for 25%)."
            value={appetite.maxExceedanceProbability}
            onChange={(value) => setAppetite((current) => ({ ...current, maxExceedanceProbability: value }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. What could we do about it?</CardTitle>
          <p className="m-0 text-small text-muted">
            Select the treatments to evaluate. Curated treatments carry reviewed application assumptions;
            user-defined treatments are labeled as such.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          {catalogue === null ? (
            <p className="m-0 text-small text-muted">
              {error === null ? 'Loading the treatment library…' : 'The treatment library is unavailable.'}
            </p>
          ) : (
            <>
              <p className="m-0 text-small text-muted">
                {selectedIds.length} of {curated.length} selected · {catalogue.custom.length} saved user-defined
                treatment(s)
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                {curated.map((treatment) => (
                  <TreatmentCard
                    key={treatment.id}
                    treatment={treatment}
                    selected={selectedIds.includes(treatment.id)}
                    onToggle={() => toggleTreatment(treatment.id)}
                    symbol={symbol}
                  />
                ))}
              </div>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void runComparison()} disabled={busy}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Compare selected treatments
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void runPortfolios()} disabled={busy}>
              Evaluate portfolios
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void runSensitivity()} disabled={busy}>
              Break-even effectiveness
            </Button>
            {busy ? <span className="self-center text-small text-muted">Calculating…</span> : null}
          </div>
        </CardContent>
      </Card>

      {comparison === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>3. What would change?</CardTitle>
            <p className="m-0 text-small text-muted">
              Expected Annual Loss (EAL) is the average annual modeled loss. High-End Modeled Loss is the P90
              (90th percentile): about 10% of modeled years exceed it.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-control border border-border p-3">
                <p className="m-0 text-micro font-semibold uppercase tracking-[0.08em] text-muted">
                  Expected Annual Loss
                </p>
                <p className="m-0 text-[1.4rem] font-semibold text-heading">
                  {formatBoardMoney(comparison.baseline.expectedAnnualLoss, symbol)} →{' '}
                  {formatBoardMoney(comparison.treated.expectedAnnualLoss, symbol)}
                </p>
                <p className="m-0 text-micro text-muted">
                  Modeled reduction of {formatBoardMoney(comparison.delta.expectedAnnualLoss, symbol)} (
                  {Math.round(comparison.delta.reductionShare * 100)}%)
                </p>
              </div>
              <div className="rounded-control border border-border p-3">
                <p className="m-0 text-micro font-semibold uppercase tracking-[0.08em] text-muted">
                  High-End Modeled Loss
                </p>
                <p className="m-0 text-[1.4rem] font-semibold text-heading">
                  {formatBoardMoney(comparison.baseline.p90, symbol)} →{' '}
                  {formatBoardMoney(comparison.treated.p90, symbol)}
                </p>
                <p className="m-0 text-micro text-muted">
                  Implementation delay {comparison.cost.implementationDelayDays} days · transition-year
                  exposure {formatBoardMoney(comparison.delayPhases.transitionYearEal, symbol)}
                </p>
              </div>
              <div className="rounded-control border border-border p-3">
                <p className="m-0 text-micro font-semibold uppercase tracking-[0.08em] text-muted">Cost</p>
                <p className="m-0 text-small text-heading">
                  Investment {formatBoardMoney(comparison.cost.initialInvestment, symbol)} · annual operating{' '}
                  {formatBoardMoney(comparison.cost.annualOperatingCost, symbol)}
                </p>
                <p className="m-0 text-micro text-muted">
                  Risk Reduction Efficiency — modeled annual-loss reduction per unit of annualised cost:
                  {comparison.riskReductionEfficiency === null
                    ? ' not available'
                    : ` ${comparison.riskReductionEfficiency.toFixed(2)}`}
                </p>
              </div>
              <div className="rounded-control border border-border p-3">
                <p className="m-0 text-micro font-semibold uppercase tracking-[0.08em] text-muted">
                  Risk appetite
                </p>
                <p className="m-0 text-small text-heading">
                  {comparison.appetite.baseline.label} → {comparison.appetite.treated.label}
                </p>
                {comparison.appetite.treated.criteria.length === 0 ? (
                  <p className="m-0 text-micro text-muted">Risk appetite has not been defined.</p>
                ) : (
                  <ul className="m-0 mt-1 grid gap-0.5 pl-4 text-micro text-muted">
                    {comparison.appetite.treated.criteria.map((criterion) => (
                      <li key={criterion.id}>
                        {criterion.label}:{' '}
                        {criterion.unit === 'probability'
                          ? `${Math.round(criterion.actual * 100)}% (limit ${Math.round(criterion.limit * 100)}%)`
                          : `${formatBoardMoney(criterion.actual, symbol)} (limit ${formatBoardMoney(criterion.limit, symbol)})`}{' '}
                        — {criterion.passes ? 'within' : 'above'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {portfolios === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>4. What are the options?</CardTitle>
            <p className="m-0 text-small text-muted">
              {portfolios.evaluated} portfolios evaluated from {portfolios.candidatesConsidered} candidates. The
              recommendation is the lowest-cost option that satisfies the stated appetite and constraints; it is
              not a claim that it is the only correct investment.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {portfolios.noneSatisfies ? (
              <Alert tone="warning" title="No portfolio satisfies the appetite">
                <p className="m-0">{portfolios.noneSatisfiesMessage}</p>
              </Alert>
            ) : null}
            <table className="w-full border-collapse text-small">
              <caption className="sr-only">Evaluated portfolios with cost, residual exposure and label</caption>
              <thead>
                <tr className="text-left">
                  <th scope="col" className="border-b border-border py-2 pr-3">Portfolio</th>
                  <th scope="col" className="border-b border-border py-2 pr-3">Investment</th>
                  <th scope="col" className="border-b border-border py-2 pr-3">Residual EAL</th>
                  <th scope="col" className="border-b border-border py-2 pr-3">Status</th>
                  <th scope="col" className="border-b border-border py-2">Assessment</th>
                </tr>
              </thead>
              <tbody>
                {portfolios.portfolios.slice(0, 12).map((portfolio) => (
                  <tr key={portfolio.id} className="align-top">
                    <td className="border-b border-border py-2 pr-3">
                      {portfolio.treatmentIds.length === 0
                        ? 'No treatment'
                        : portfolio.treatmentIds
                            .map((id) => curated.find((entry) => entry.id === id)?.name ?? id)
                            .join(' + ')}
                    </td>
                    <td className="border-b border-border py-2 pr-3">
                      {formatBoardMoney(portfolio.cost.initialInvestment, symbol)}
                    </td>
                    <td className="border-b border-border py-2 pr-3">
                      {formatBoardMoney(portfolio.treated.expectedAnnualLoss, symbol)}
                    </td>
                    <td className="border-b border-border py-2 pr-3">{portfolio.appetite.label}</td>
                    <td className="border-b border-border py-2">
                      <span className="font-semibold">{portfolio.labelText}</span>
                      <span className="block text-micro text-muted">{portfolio.labelReason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="m-0 text-micro text-muted">
              {portfolios.paretoIds.length} portfolio(s) are on the best-value frontier.
              {portfolios.truncated ? ' The candidate set was truncated to the configured maximum.' : ''}
              {portfolios.notes.length === 0 ? '' : ` ${portfolios.notes.join(' ')}`}
            </p>
          </CardContent>
        </Card>
      )}

      {sensitivity === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>5. How effective would it have to be?</CardTitle>
            <p className="m-0 text-small text-muted">
              Each point below is a full model run on the same simulated years, not an interpolation.
            </p>
          </CardHeader>
          <CardContent className="grid gap-2">
            <p className="m-0 text-small">
              {sensitivity.message ?? 'Break-even effectiveness is not available for this analysis.'}
            </p>
            <ul className="m-0 grid gap-0.5 pl-4 text-micro text-muted">
              {sensitivity.curve.map((point) => (
                <li key={point.effectiveness}>
                  {Math.round(point.effectiveness * 100)}% effectiveness →{' '}
                  {formatBoardMoney(point.expectedAnnualLoss, symbol)} · {point.appetite.label}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {comparison === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>6. Save, share and report</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => void saveDecision()} disabled={busy}>
                <Save aria-hidden="true" className="size-4" />
                Save decision analysis
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void shareBoardPack()}
                disabled={busy || publicId === null}
              >
                <Share2 aria-hidden="true" className="size-4" />
                Share Board Risk Pack
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void revokeShare()} disabled={busy || publicId === null}>
                <ShieldOff aria-hidden="true" className="size-4" />
                Revoke link
              </Button>
              <Button size="sm" variant="ghost" onClick={() => globalThis.print()}>
                <Printer aria-hidden="true" className="size-4" />
                Print / save as PDF
              </Button>
            </div>
            {shareUrl === null ? null : (
              <div className="grid gap-1 rounded-control border border-accent-strong/30 bg-accent-soft p-3">
                <p className="m-0 text-small font-semibold text-heading">Read-only Board Risk Pack link</p>
                <p className="m-0 break-all text-small">{shareUrl}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {boardReport === null ? null : (
        <section aria-label="Board Risk Pack" className="grid gap-3">
          <div className="qk-no-print flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="m-0 text-micro font-bold uppercase tracking-[0.13em] text-accent-strong">
                Board Risk Pack
              </p>
              <h2 className="m-0 text-[1.35rem] font-bold text-heading">Five-page decision document</h2>
            </div>
            <span className="text-micro text-muted">
              <FileText aria-hidden="true" className="mr-1 inline size-3.5" />
              Printing to PDF keeps the five pages.
            </span>
          </div>
          <BoardRiskPack report={boardReport} />
        </section>
      )}


    </div>


  );
}

