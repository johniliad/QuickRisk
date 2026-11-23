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

import { FileText, History, Printer, RefreshCw, Save, Share2, ShieldOff, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataProvenance } from '@/components/layout/DataProvenance';
import { DataStatusNote } from '@/components/layout/DataStatusNote';
import { GuidedOnboarding } from '@/components/layout/GuidedOnboarding';
import { JourneyMap } from '@/components/layout/JourneyMap';
import { formatIterations } from '@/lib/format';
import {
  DECISION_UNSAVED_NOTE,
  SAVED_SESSION_LABEL,
  SESSION_SAVE_NOTE,
  UNSAVED_SESSION_LABEL,
  decisionBaselineEalProvenance,
  decisionTreatedEalProvenance,
} from '@/content/dataLifecycle';
import { Checkbox, Label } from '@/components/ui/field';
import { publicModel } from '@/model';
import { useAssessmentStore } from '@/state/assessmentStore';
import { useLiveStore } from '@/live/state/liveStore';
import { decisionApi, DecisionApiError } from '@/decision/api/decisionClient';
import { CustomTreatmentForm } from '@/decision/components/CustomTreatmentForm';
import {
  BoardRiskPack,
  formatBoardMoney,
} from '@/decision/board/BoardRiskPack';
import { buildBoardReport } from '@/decision/board/boardModel';
import {
  attachPortfolios,
  attachRecommendedComparison,
  attachSensitivity,
  sameProvenance,
  selectReportTarget,
  snapshotAfterComparison,
  type DecisionSnapshot,
} from '@/decision/domain/analysisSnapshot';
import { analysisInputKey } from '@/decision/domain/analysisIdentity';
import {
  probabilityCriterionDisabled,
  withAnnualLossLimit,
} from '@/decision/domain/appetite';
import {
  boardModelInputFromBasis,
  comparisonBasis,
  recommendedBasis,
  type ReportBasis,
} from '@/decision/domain/reportBasis';
import {
  DECISION_METHODOLOGY_VERSION,
  EVIDENCE_LABELS,
  MECHANISM_LABELS,
  type Appetite,
  type CustomTreatmentDefinition,
  type EvidenceQuality,
  type MechanismGroup,
  type TreatmentCatalogue,
  type TreatmentDefinition,
} from '@/decision/domain/decisionTypes';
import {
  catalogueSelections,
  findSelectionByTreatmentId,
  findSelectionForResultTreatment,
  selectionForCompute,
  selectionIdentity,
  type SelectableTreatment,
} from '@/decision/domain/selectableTreatment';

/**
 * The published assessment seed.
 *
 * It mirrors `tools/generate-baseline.php`, `tests/helpers.php` and the audited baseline. Decision
 * Lab sends it, with the iteration count the results response reports, so the server replays the
 * results page configuration instead of choosing another modelling basis. The assessment endpoint
 * seeds each calculation randomly, so the two figures are draws from the same model and agree to
 * within Monte Carlo noise rather than being the same draw.
 */
const RESULTS_SIMULATION_SEED = 20261029;

/** Iteration budget used only if the results response does not report one. */
const RESULTS_ITERATION_FALLBACK = 5_000;

/**
 * Relative gap above which a baseline is treated as describing different answers.
 *
 * The assessment endpoint seeds each calculation randomly, so the Results figure and the
 * Decision Lab replay are two draws from the same model. Measured on the reference profile at
 * 5,000 iterations, the portfolio expected annual loss moves by less than 0.5% between seeds;
 * an edited answer changes a scenario's frequency or magnitude band and moves the portfolio by
 * several percent. 2% therefore separates sampling noise from an answer change with margin.
 */
const BASELINE_NOISE_TOLERANCE = 0.02;

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

/** The one basis the next report or save will describe. */
const resolveReportBasis = (snapshot: DecisionSnapshot | null): ReportBasis | null => {
  if (snapshot === null) {
    return null;
  }

  return snapshot.reportTarget === 'recommended-portfolio'
    ? recommendedBasis(snapshot)
    : comparisonBasis(snapshot);
};

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
  disabled = false,
}: {
  id: string;
  label: string;
  help: string;
  value: number | null;
  onChange: (value: number | null) => void;
  suffix?: string;
  disabled?: boolean;
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
          disabled={disabled}
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
  onDelete,
  symbol,
}: {
  treatment: TreatmentDefinition;
  selected: boolean;
  onToggle: () => void;
  onDelete?: () => void;
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-micro font-bold uppercase tracking-[0.08em] text-muted">
            {treatment.origin === 'custom' ? 'User-defined treatment' : 'Curated treatment'}
          </span>
          {onDelete === undefined ? null : (
            <Button
              size="sm"
              variant="ghost"
              onClick={onDelete}
              aria-label={`Delete the user-defined treatment ${treatment.name}`}
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
              Delete
            </Button>
          )}
        </div>
      </div>
      <p className="m-0 text-small text-muted">{treatment.businessOutcome}</p>
      {treatment.assumptions.length === 0 ? null : (
        <p className="m-0 text-micro text-muted">
          Assumption: {treatment.assumptions.join(' ')}
        </p>
      )}
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
  const [selectedKeys, setSelectedKeys] = useState<readonly string[]>([]);
  const [snapshot, setSnapshot] = useState<DecisionSnapshot | null>(null);
  const [analystMode, setAnalystMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [publicId, setPublicId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const symbol = results?.meta.currencySymbol === '' || results?.meta.currencySymbol === undefined
    ? '€'
    : results.meta.currencySymbol;
  // Derived from the active model, never hard-coded: the questionnaire already exposes the
  // profile question count and two questions per scenario.
  const questionCount = publicModel.profileQuestions.length + publicModel.scenarios.length * 2;

  // The assessment's own run: the same published seed and iteration budget are re-sent below, so
  // the server replays the results page configuration instead of choosing another basis.
  const resultsIterations = results?.meta.iterations ?? RESULTS_ITERATION_FALLBACK;
  const resultsPortfolioEal =
    typeof results?.portfolio?.expectedAnnualLoss === 'number'
    && Number.isFinite(results.portfolio.expectedAnnualLoss)
      ? results.portfolio.expectedAnnualLoss
      : null;

  const reloadCatalogue = useCallback(async (): Promise<TreatmentCatalogue> => {
    const csrfToken = await initSession();
    if (csrfToken === null) {
      throw new Error(
        'The anonymous session could not be prepared, so the treatment library is unavailable.',
      );
    }

    return decisionApi.catalogue(csrfToken);
  }, [initSession]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const loaded = await reloadCatalogue();
        if (!cancelled) {
          setCatalogue(loaded);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof DecisionApiError || caught instanceof Error
              ? caught.message
              : 'The treatment library could not be loaded.',
          );
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [reloadCatalogue]);

  const answers = useMemo(
    () => buildAnswersPayload(organisationAnswers, scenarioAnswers),
    [organisationAnswers, scenarioAnswers],
  );

  const selections = useMemo(
    () => (catalogue === null ? [] : catalogueSelections(catalogue)),
    [catalogue],
  );
  const curatedSelections = useMemo(
    () => selections.filter((treatment) => treatment.source === 'curated'),
    [selections],
  );
  const customSelections = useMemo(
    () =>
      selections.filter(
        (treatment): treatment is Extract<SelectableTreatment, { source: 'custom' }> =>
          treatment.source === 'custom',
      ),
    [selections],
  );
  const selectedTreatments = useMemo(
    () => selections.filter((treatment) => selectedKeys.includes(treatment.key)),
    [selections, selectedKeys],
  );

  const methodologyVersion = catalogue?.methodologyVersion ?? DECISION_METHODOLOGY_VERSION;

  const currentKey = useMemo(
    () =>
      analysisInputKey({
        answers,
        treatments: selectedTreatments.map(selectionIdentity),
        appetite,
        seed: RESULTS_SIMULATION_SEED,
        iterations: resultsIterations,
        decisionMethodologyVersion: methodologyVersion,
      }),
    [answers, appetite, methodologyVersion, resultsIterations, selectedTreatments],
  );

  const currentKeyRef = useRef(currentKey);
  currentKeyRef.current = currentKey;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const previousKeyRef = useRef(currentKey);

  // Any input change invalidates the analysis, the saved identifier and the share link.
  useEffect(() => {
    if (previousKeyRef.current === currentKey) {
      return;
    }
    previousKeyRef.current = currentKey;
    const hadResults = snapshotRef.current !== null;
    setSnapshot(null);
    setPublicId(null);
    setShareUrl(null);
    setError(null);
    setMessage(hadResults ? 'Inputs changed. Results cleared. Recalculate.' : null);
  }, [currentKey]);

  const activeSnapshot = snapshot !== null && snapshot.inputKey === currentKey ? snapshot : null;
  const reportBasis = useMemo(() => resolveReportBasis(activeSnapshot), [activeSnapshot]);
  const comparison = reportBasis?.comparison ?? null;
  const portfolios = activeSnapshot?.portfolios ?? null;
  const sensitivity = activeSnapshot?.sensitivity ?? null;
  /**
   * Whether the calculated baseline still describes the answers the results page used.
   *
   * `true` means the replay lands within Monte Carlo noise of the portfolio figure on the results
   * page, so nothing material moved since it was calculated. `false` means the gap is larger than
   * sampling noise can explain, which is what an edited answer looks like (the in-memory Results
   * response is then stale for the current answers), so the screen must say the two surfaces no
   * longer describe the same answers. `null` means there is nothing to compare yet.
   */
  const baselineCarriedFromResults =
    comparison === null || resultsPortfolioEal === null
      ? null
      : Math.abs(comparison.baseline.expectedAnnualLoss - resultsPortfolioEal)
        <= BASELINE_NOISE_TOLERANCE * resultsPortfolioEal;
  const portfolioDecisionAvailable =
    appetite.annualLossLimit !== null && Number.isFinite(appetite.annualLossLimit) && appetite.annualLossLimit > 0;

  const computeBody = useCallback(
    (extra: Record<string, unknown>) => ({
      ...answers,
      seed: RESULTS_SIMULATION_SEED,
      iterations: resultsIterations,
      appetite,
      ...extra,
    }),
    [answers, appetite, resultsIterations],
  );

  const runComparison = useCallback(async () => {
    if (selectedTreatments.length === 0) {
      setError('Select at least one treatment to compare.');

      return;
    }
    const requestKey = currentKey;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await decisionApi.computeComparison(
        computeBody({ treatments: selectedTreatments.map(selectionForCompute) }),
      );
      if (currentKeyRef.current !== requestKey) {
        setError('The inputs changed while the request was running. Recalculate.');

        return;
      }
      setSnapshot(snapshotAfterComparison(requestKey, result));
      setPublicId(null);
      setShareUrl(null);
      setMessage('Treatment comparison calculated.');
    } catch (caught) {
      setError(
        caught instanceof DecisionApiError || caught instanceof Error
          ? caught.message
          : 'The comparison could not be calculated.',
      );
    } finally {
      setBusy(false);
    }
  }, [computeBody, currentKey, selectedTreatments]);

  const runPortfolios = useCallback(async () => {
    const request = snapshotRef.current;
    if (selectedTreatments.length === 0) {
      setError('Select the candidate treatments you want evaluated.');

      return;
    }
    if (
      appetite.annualLossLimit === null
      || !Number.isFinite(appetite.annualLossLimit)
      || appetite.annualLossLimit <= 0
    ) {
      setError('Enter an annual loss limit before evaluating portfolios.');

      return;
    }
    if (request === null || request.inputKey !== currentKeyRef.current) {
      setError('Run the comparison again for the current inputs before evaluating portfolios.');

      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await decisionApi.computePortfolios(
        computeBody({
          treatments: [],
          candidateTreatments: selectedTreatments.map(selectionForCompute),
        }),
      );
      if (currentKeyRef.current !== request.inputKey || snapshotRef.current !== request) {
        setError('The inputs changed while the request was running. Recalculate.');

        return;
      }
      setSnapshot(attachPortfolios(request, request.inputKey, result));
      setPublicId(null);
      setShareUrl(null);
      setMessage(
        result.truncated && result.notes.length > 0
          ? `Evaluated ${result.evaluated} portfolios. ${result.notes.join(' ')}`
          : `Evaluated ${result.evaluated} portfolios.`,
      );
    } catch (caught) {
      setError(
        caught instanceof DecisionApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : 'The portfolios could not be evaluated.',
      );
    } finally {
      setBusy(false);
    }
  }, [appetite.annualLossLimit, computeBody, selectedTreatments]);

  const runSensitivity = useCallback(async () => {
    const request = snapshotRef.current;
    if (selectedTreatments.length === 0) {
      setError('Select a treatment first.');

      return;
    }
    if (request === null || request.inputKey !== currentKeyRef.current) {
      setError('Run the comparison again for the current inputs before calculating break-even effectiveness.');

      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await decisionApi.computeSensitivity(
        computeBody({ treatments: selectedTreatments.map(selectionForCompute) }),
      );
      if (currentKeyRef.current !== request.inputKey || snapshotRef.current !== request) {
        setError('The inputs changed while the request was running. Recalculate.');

        return;
      }
      if (!sameProvenance(result.provenance, request.comparison.provenance)) {
        setError('The break-even result does not belong to this analysis. Recalculate.');

        return;
      }
      setSnapshot(attachSensitivity(request, request.inputKey, result.sensitivity, result.provenance));
    } catch (caught) {
      setError(
        caught instanceof DecisionApiError || caught instanceof Error
          ? caught.message
          : 'The break-even analysis could not be calculated.',
      );
    } finally {
      setBusy(false);
    }
  }, [computeBody, selectedTreatments]);

  const prepareRecommendedReport = useCallback(async () => {
    const request = snapshotRef.current;
    if (request === null || request.inputKey !== currentKeyRef.current) {
      setError('Recalculate the analysis before preparing a recommended report.');

      return;
    }
    const search = request.portfolios;
    if (search === null) {
      setError('Run a portfolio search before preparing a recommended report.');

      return;
    }
    const recommendedId = search.recommendedId;
    if (recommendedId === null) {
      setError('No portfolio was recommended for this analysis.');

      return;
    }
    const portfolio = search.portfolios.find((entry) => entry.id === recommendedId);
    if (portfolio === undefined) {
      setError('The recommended portfolio could not be found. Recalculate.');

      return;
    }
    const resolved = portfolio.treatmentIds.map((id) => {
      const direct = findSelectionByTreatmentId(selections, id);
      if (direct !== undefined) {
        return direct;
      }
      const resultTreatment = request.comparison.treatments.find((treatment) => treatment.id === id);

      return resultTreatment === undefined
        ? undefined
        : findSelectionForResultTreatment(selections, resultTreatment);
    });
    if (resolved.some((treatment) => treatment === undefined)) {
      setError('The recommended portfolio names a treatment that is not in the library.');

      return;
    }
    const treatments = resolved as SelectableTreatment[];

    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await decisionApi.computeComparison(
        computeBody({ treatments: treatments.map(selectionForCompute) }),
      );
      if (currentKeyRef.current !== request.inputKey || snapshotRef.current !== request) {
        setError('The inputs changed while the request was running. Recalculate.');

        return;
      }
      const expected = [...portfolio.treatmentIds].sort();
      const actual = result.treatments.map((treatment) => treatment.id).sort();
      if (expected.length !== actual.length || expected.some((id, index) => id !== actual[index])) {
        setError('The recommended comparison returned a different treatment set. Recalculate.');

        return;
      }
      if (!sameProvenance(result.provenance, search.provenance)) {
        setError('The recommended comparison does not belong to this portfolio search. Recalculate.');

        return;
      }
      const attached = attachRecommendedComparison(request, request.inputKey, result);
      setSnapshot(selectReportTarget(attached, request.inputKey, 'recommended-portfolio'));
      setPublicId(null);
      setShareUrl(null);
      setMessage('Recommended portfolio report prepared.');
    } catch (caught) {
      setError(
        caught instanceof DecisionApiError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : 'The recommended portfolio report could not be prepared.',
      );
    } finally {
      setBusy(false);
    }
  }, [computeBody, selections]);


  const saveDecision = useCallback(async () => {
    const current = snapshotRef.current;
    if (current === null || current.inputKey !== currentKeyRef.current) {
      setError('Recalculate the analysis before saving it.');

      return;
    }
    const basis = resolveReportBasis(current);
    if (basis === null) {
      setError('Prepare the recommended portfolio report before saving.');

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
          title:
            (basis.comparison.treatments.length === 0
              ? 'No treatment (baseline)'
              : basis.comparison.treatments.map((treatment) => treatment.name).join(' + ')
            ).slice(0, 160),
          selection: {
            treatments: basis.comparison.treatments,
            comparison: basis.comparison,
            portfolios: current.portfolios,
            sensitivity: basis.kind === 'comparison' ? current.sensitivity : null,
            reportBasis: {
              kind: basis.kind,
              inputKey: basis.inputKey,
              recommendationState: basis.recommendationState,
              treatmentIds: basis.comparison.treatments.map((treatment) => treatment.id),
            },
          },
          appetite,
          recommended: basis.portfolio,
          result: basis.comparison,
          quickriskModelId: basis.comparison.provenance.quickriskModelId,
          quickriskModelVersion: basis.comparison.provenance.quickriskModelVersion,
          decisionMethodologyVersion: basis.comparison.provenance.decisionMethodologyVersion,
          boardPackVersion: basis.comparison.provenance.boardPackVersion,
          simulationSeed: basis.comparison.provenance.simulationSeed,
          iterations: basis.comparison.provenance.iterations,
        },
        csrfToken,
      );
      setPublicId(saved.publicId);
      setShareUrl(null);
      setMessage('Decision analysis saved to your anonymous session.');
    } catch (caught) {
      setError(caught instanceof DecisionApiError ? caught.message : 'The analysis could not be saved.');
    } finally {
      setBusy(false);
    }
  }, [appetite, initSession]);

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
    if (reportBasis === null) {
      return null;
    }

    return buildBoardReport(
      boardModelInputFromBasis(
        reportBasis,
        symbol,
        reportBasis.comparison.provenance.generatedAt.slice(0, 10),
      ),
    );
  }, [reportBasis, symbol]);

  const createCustomTreatment = useCallback(
    async (definition: CustomTreatmentDefinition) => {
      const csrfToken = await initSession();
      if (csrfToken === null) {
        throw new Error('The anonymous session could not be prepared.');
      }
      const created = await decisionApi.createCustomTreatment(
        definition as unknown as Record<string, unknown>,
        csrfToken,
      );
      const loaded = await reloadCatalogue().catch(() => null);
      if (loaded === null) {
        setError(
          'The treatment was saved, but the treatment library could not be refreshed. Reopen Decision Lab to reload it.',
        );

        return;
      }
      setCatalogue(loaded);
      const added = catalogueSelections(loaded).find(
        (entry) => entry.source === 'custom' && entry.publicId === created.publicId,
      );
      if (added !== undefined) {
        setSelectedKeys((current) => (current.includes(added.key) ? current : [...current, added.key]));
      }
      setMessage('User-defined treatment created and selected for the analysis.');
    },
    [initSession, reloadCatalogue],
  );

  const deleteCustomTreatment = useCallback(
    async (treatment: Extract<SelectableTreatment, { source: 'custom' }>) => {
      if (
        !globalThis.confirm(
          `Delete the user-defined treatment “${treatment.definition.name}”? Saved analyses that used it are not changed.`,
        )
      ) {
        return;
      }
      const csrfToken = await initSession();
      if (csrfToken === null) {
        setError('The anonymous session could not be prepared.');

        return;
      }
      try {
        await decisionApi.deleteCustomTreatment(treatment.publicId, csrfToken);
        setSelectedKeys((current) => current.filter((key) => key !== treatment.key));
        const loaded = await reloadCatalogue().catch(() => null);
        if (loaded === null) {
          setError(
            'The treatment was deleted, but the treatment library could not be refreshed. Reopen Decision Lab to reload it.',
          );

          return;
        }
        setCatalogue(loaded);
        setMessage('User-defined treatment deleted.');
      } catch (caught) {
        setError(caught instanceof DecisionApiError ? caught.message : 'The treatment could not be deleted.');
      }
    },
    [initSession, reloadCatalogue],
  );

  const toggleTreatment = (key: string) =>
    setSelectedKeys((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));


  if (results === null) {
    return (
      <div className="grid gap-6">
        <GuidedOnboarding
          eyebrow="Decision Lab"
          title="Decision Lab compares treatments against a QuickRisk assessment"
          description="It never invents a baseline. The comparison replays the same simulated years the Results page showed, then applies the treatments you select to the drivers those treatments actually change."
          steps={[
            'Complete the QuickRisk assessment in this tab.',
            'Return here — the portfolio baseline from Results is carried across with the same seed and iteration count, and your answers are re-sent for the treated calculation.',
            'Set a risk appetite, select treatments and build the Board Risk Pack.',
          ]}
          primaryLabel="Start a new assessment"
          onPrimary={() => setView('disclaimer')}
          secondaryLabel="Open saved analyses"
          onSecondary={() => setView('decision-history')}
          footnote="A saved analysis keeps the result, the treatment set and the appetite status — not your questionnaire answers."
        />
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
          {baselineCarriedFromResults === false ? (
            <>
              Decision Lab replays the results page run with the published assessment seed{' '}
              {RESULTS_SIMULATION_SEED} and {formatIterations(resultsIterations)} simulated years. This
              baseline is further from the results page than sampling noise explains, so your answers
              changed after that calculation.
            </>
          ) : (
            <>
              Baseline carried from the results page: the same QuickRisk model, the published assessment
              seed {RESULTS_SIMULATION_SEED} and the same {formatIterations(resultsIterations)} simulated
              years, so the two figures agree to within Monte Carlo noise instead of describing separate
              runs.
            </>
          )}{' '}
          Treated figures are recalculated on the server from your {questionCount} answers with QuickRisk
          model {results.meta.modelId} version {results.meta.modelVersion} · Decision Lab methodology{' '}
          {comparison?.provenance.decisionMethodologyVersion ?? '1.0'}.
        </p>
        {comparison !== null && baselineCarriedFromResults === false && resultsPortfolioEal !== null ? (
          <Alert tone="warning" title="The baseline no longer matches the results page">
            <p className="m-0">
              Your answers changed after the results were calculated. This baseline is{' '}
              {formatBoardMoney(comparison.baseline.expectedAnnualLoss, symbol)}, while the results page
              shows {formatBoardMoney(resultsPortfolioEal, symbol)} — a gap larger than Monte Carlo noise at{' '}
              {formatIterations(resultsIterations)} iterations. Recalculate the assessment so both screens
              describe the same answers.
            </p>
          </Alert>
        ) : null}
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
          <Button size="sm" variant="ghost" onClick={() => setView('decision-history')}>
            <History aria-hidden="true" className="size-4" />
            Saved analyses
          </Button>
        </div>
        <DataStatusNote
          label={publicId === null ? UNSAVED_SESSION_LABEL : SAVED_SESSION_LABEL}
          tone={publicId === null ? 'warning' : 'neutral'}
          detail={publicId === null ? DECISION_UNSAVED_NOTE : SESSION_SAVE_NOTE}
        />

        {analystMode ? (
          <div className="rounded-control border border-border bg-canvas p-3">
            <p className="m-0 text-micro font-semibold uppercase tracking-[0.08em] text-muted">
              Server input fingerprint
            </p>
            <code className="block break-all text-micro text-ink">
              {reportBasis?.comparison.provenance.inputFingerprint ??
                activeSnapshot?.comparison.provenance.inputFingerprint ??
                'Not calculated'}
            </code>
            <p className="m-0 mt-1 text-micro text-muted">
              Seed {RESULTS_SIMULATION_SEED} · {formatIterations(resultsIterations)} iterations · Analyst Mode
              only. The fingerprint identifies the validated compute input; it is not a security token.
            </p>
          </div>
        ) : null}
      </header>

      {error === null ? null : <Alert tone="danger" role="alert">{error}</Alert>}
      {message === null ? null : <Alert tone="info" role="status">{message}</Alert>}

      <JourneyMap currentSurface="decision-lab" />

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
            onChange={(value) => setAppetite((current) => withAnnualLossLimit(current, value))}
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
            help={
              probabilityCriterionDisabled(appetite)
                ? 'This criterion needs a loss threshold. Enter an annual loss limit first.'
                : 'Enter a share between 0 and 1 (for example 0.25 for 25%).'
            }
            value={appetite.maxExceedanceProbability}
            onChange={(value) => setAppetite((current) => ({ ...current, maxExceedanceProbability: value }))}
            disabled={probabilityCriterionDisabled(appetite)}
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
                {selectedTreatments.length} of {selections.length} selected · {customSelections.length} saved
                user-defined treatment(s)
              </p>
              <p className="m-0 text-small font-semibold text-heading">Curated treatments</p>
              <div className="grid gap-3 lg:grid-cols-2">
                {curatedSelections.map((treatment) => (
                  <TreatmentCard
                    key={treatment.key}
                    treatment={treatment.definition}
                    selected={selectedKeys.includes(treatment.key)}
                    onToggle={() => toggleTreatment(treatment.key)}
                    symbol={symbol}
                  />
                ))}
              </div>
              {customSelections.length === 0 ? null : (
                <div className="grid gap-2">
                  <p className="m-0 text-small font-semibold text-heading">Your user-defined treatments</p>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {customSelections.map((treatment) => (
                      <TreatmentCard
                        key={treatment.key}
                        treatment={treatment.definition}
                        selected={selectedKeys.includes(treatment.key)}
                        onToggle={() => toggleTreatment(treatment.key)}
                        onDelete={() => void deleteCustomTreatment(treatment)}
                        symbol={symbol}
                      />
                    ))}
                  </div>
                </div>
              )}
              <CustomTreatmentForm
                scenarios={publicModel.scenarios.map((scenario) => ({
                  code: scenario.code,
                  shortLabel: scenario.shortLabel,
                }))}
                mechanismGroups={catalogue.mechanismGroups}
                evidenceLevels={catalogue.evidenceLevels}
                busy={busy}
                onCreate={createCustomTreatment}
              />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void runComparison()} disabled={busy}>
              <RefreshCw aria-hidden="true" className="size-4" />
              Compare selected treatments
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void runPortfolios()}
              disabled={busy || !portfolioDecisionAvailable}
              title={
                portfolioDecisionAvailable
                  ? 'Evaluate portfolios against the expected annual-loss criterion'
                  : 'Enter an annual loss limit to enable portfolio evaluation'
              }
            >
              Evaluate portfolios
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void runSensitivity()} disabled={busy}>
              Break-even effectiveness
            </Button>
            {busy ? <span className="self-center text-small text-muted">Calculating…</span> : null}
          </div>
          <p className="m-0 text-micro text-muted">
            Portfolio selection uses the expected annual-loss limit only. High-end modeled loss and
            exceedance probability remain part of the exact treatment comparison but are not used
            to rank portfolios, because they require a joint scenario-dependence model.
            {portfolioDecisionAvailable
              ? ''
              : ' Enter an annual loss limit to enable portfolio evaluation.'}
          </p>
        </CardContent>
      </Card>

      {comparison === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>3. What would change?</CardTitle>
            <p className="m-0 text-small text-muted">
              {reportBasis?.kind === 'recommended-portfolio'
                ? 'These figures describe the recommended portfolio.'
                : 'These figures describe the selected treatment set.'}
            </p>
            <p className="m-0 text-small text-muted">
              Expected Annual Loss (EAL) is the average annual modeled loss. High-End Modeled Loss is the P90
              (90th percentile): about 10% of modeled years exceed it.{' '}
              {baselineCarriedFromResults === false
                ? 'The baseline is further from the results page than sampling noise explains, so it describes changed answers.'
                : 'The baseline replays the results page run with the same seed and iteration count, so it agrees with that figure to within Monte Carlo noise.'}{' '}
              The treated figures apply your selected treatments to those same simulated years. Neither figure
              comes from QuickRisk Live, and neither one changes the results page or your saved Live
              snapshots.
            </p>
          </CardHeader>
          <CardContent className="grid gap-4">
            {comparison.factors.clampWarning ? (
              <Alert tone="warning" title="A documented loss cap limits the modeled effect">
                <p className="m-0">
                  {comparison.factors.notes.join(' ') ||
                    'A sampled loss component can reach the documented cap, so the paired-year treatment scaling is an approximation.'}
                </p>
              </Alert>
            ) : null}
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
            <div className="grid gap-2">
              <DataProvenance
                provenance={decisionBaselineEalProvenance({
                  ...comparison.provenance,
                  questionCount,
                  baselineCarriedFromResults,
                  resultsPortfolioEal,
                })}
              />
              <DataProvenance provenance={decisionTreatedEalProvenance(comparison.provenance)} />
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
              recommendation is the lowest-cost option that meets the expected annual-loss criterion and
              constraints; it is not a claim that it is the only correct investment. High-end and exceedance
              criteria are not used for portfolio selection.
            </p>
          </CardHeader>
          <CardContent className="grid gap-3">
            {portfolios.noneSatisfies ? (
              <Alert tone="warning" title="No portfolio meets the annual-loss criterion">
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
                            .map(
                              (id) =>
                                findSelectionByTreatmentId(selections, id)?.definition.name ??
                                comparison?.treatments.find((treatment) => treatment.id === id)?.name ??
                                id,
                            )
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
            <p className="m-0 text-micro text-muted">
              {portfolios.portfolios.length <= 12
                ? `Showing all ${portfolios.portfolios.length} evaluated portfolios.`
                : `Showing the first 12 of ${portfolios.portfolios.length} evaluated portfolios. All evaluated portfolios remain in the saved analysis.`}
            </p>
          </CardContent>
        </Card>
      )}

      {sensitivity === null || reportBasis?.kind !== 'comparison' ? null : (
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

      {activeSnapshot === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>6. Save, share and report</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="m-0 text-micro text-muted">
              {publicId === null
                ? `${UNSAVED_SESSION_LABEL}. Saving stores this analysis in your anonymous session; it does not publish it.`
                : `${SESSION_SAVE_NOTE} Any input change clears the result and the saved identifier.`}
            </p>
            <p className="m-0 text-micro text-muted">
              {reportBasis === null
                ? 'No report basis is available. Recalculate the analysis.'
                : reportBasis.kind === 'recommended-portfolio'
                  ? 'The report describes the recommended portfolio.'
                  : 'The report describes the selected treatment set.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {activeSnapshot !== null &&
              activeSnapshot.portfolios !== null &&
              activeSnapshot.portfolios.recommendedId !== null ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void prepareRecommendedReport()}
                  disabled={busy}
                >
                  Prepare recommended portfolio report
                </Button>
              ) : null}
              {reportBasis?.kind === 'recommended-portfolio' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const current = snapshotRef.current;
                    if (current === null || current.inputKey !== currentKeyRef.current) {
                      return;
                    }
                    setSnapshot(selectReportTarget(current, current.inputKey, 'comparison'));
                    setPublicId(null);
                    setShareUrl(null);
                    setMessage('The report now describes the selected treatment set.');
                  }}
                  disabled={busy}
                >
                  Describe selected treatment set
                </Button>
              ) : null}
              <Button
                size="sm"
                onClick={() => void saveDecision()}
                disabled={busy || reportBasis === null || publicId !== null}
              >
                <Save aria-hidden="true" className="size-4" />
                {publicId === null ? 'Save decision analysis' : 'Decision analysis saved'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void shareBoardPack()}
                disabled={busy || publicId === null || reportBasis === null}
              >
                <Share2 aria-hidden="true" className="size-4" />
                Share Board Risk Pack
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void revokeShare()} disabled={busy || publicId === null}>
                <ShieldOff aria-hidden="true" className="size-4" />
                Revoke link
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => globalThis.print()}
                disabled={reportBasis === null}
              >
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

