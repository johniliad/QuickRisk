# Application logic remediation plan

> **Historical implementation plan.** This plan was written against `FAIR-QK-1.3`. Its completed
> application-logic phases are preserved as a delivery record; the active 2.0 model, evidence package
> and activation gates are documented in [`MODEL_DOCUMENTATION_FAIR-QK-2.0.md`](MODEL_DOCUMENTATION_FAIR-QK-2.0.md)
> and [`../calibration/README.md`](../calibration/README.md).

**Companion to:** [`APPLICATION_LOGIC_REVIEW_A.md`](APPLICATION_LOGIC_REVIEW_A.md)
**Findings covered:** ALR-01 … ALR-15
**Audience:** the implementing agent or contributor
**Status:** Phase 1 complete; Phase 2 complete for the approved scope (P2.1, P2.4–P2.6). P2.2 was rejected by the owner on 2026-11-22: no receipt key will be introduced, and P2.1 consistency validation is the accepted control. P2.3 is resolved by Option C (saved/shared Live data labelled user-recorded). Phase 3 complete (P3.1–P3.5). Phase 4 complete (P4.1–P4.5), including the owner-approved Playwright development dependency and the P4.5 Option A rate-limit fix.

## 0. How to use this plan

1. Read the review document first. It explains *why* each change is required.
2. Read `README.md`, `docs/MODEL_DOCUMENTATION_FAIR-QK-1.3.md`, `docs/QUICKRISK_LIVE.md`,
   `docs/QUICKRISK_DECISION_LAB.md`, `docs/SECURITY_AND_PRIVACY.md` and
   `docs/ZERO_RETENTION_PROOF.md`.
3. Inspect every file named in a task before editing it. Symbols are stable; line numbers are not.
4. Implement **one phase at a time** and stop for review at each phase boundary.
5. Do not fix unrelated style, naming or refactoring issues in the same change.
6. After each task, run the verification commands in §9.

## 1. Non-negotiable constraints

| # | Constraint | Reason |
| --- | --- | --- |
| C1 | Do not change the QuickRisk numerical methodology, parameters, distributions or seeds. | The model is audited and regression-pinned. |
| C2 | Do not change the Live or Decision Lab methodology versions unless a task explicitly says so. | They are versioned, documented contracts. |
| C3 | Preserve the base assessment's zero-retention behaviour. | Documented product promise, and tested. |
| C4 | Never weaken server-side validation to accommodate a client bug. | The server is the authority. |
| C5 | Preserve same-origin, JSON-only, CSRF, session-ownership, share-token, expiry and revocation controls. | Security boundary. |
| C6 | Do not add browser storage, cookies, service workers, autosave or shareable result URLs for the base assessment. | Zero-retention proof. |
| C7 | Do not add production dependencies. A new development dependency needs the owner's explicit approval. | Licence and supply-chain policy. |
| C8 | Follow existing conventions: TypeScript strict, functional components, zustand stores, PHP `declare(strict_types=1)`, prepared statements, PHP test files returning `[name => callable]`, Vitest files in `frontend/tests/*.test.ts`. | Consistency. |
| C9 | Treat saved and shared outputs as audit-sensitive. When in doubt, refuse to save or share rather than persist an uncertain analysis. | The product's credibility. |
| C10 | Update the documentation that describes changed behaviour, and keep `docs/README.md` complete. | The index claims every published document is listed. |
| C11 | Leave the working tree free of generated artefacts. If a tool rewrites only the timestamp in `audit/results/reference-audit.json`, restore it. | Clean, reviewable diffs. |

Text under a task is normative. Examples are illustrative.

## 2. Definition of done

A phase is complete only when **all** of the following are true.

1. Every task in the phase is implemented, or explicitly deferred with a written reason.
2. New tests fail against the pre-fix behaviour and pass after it. A test that passes both
   before and after does not prove the fix.
3. `php tests/run-tests.php` passes with the same or a greater number of tests.
4. `npm run lint` passes in `frontend` (type-check, model boundary, browser storage, licences).
5. `npm test -- --run` passes in `frontend`.
6. When the browser suite is present (P4.4), `npm run test:e2e` passes in `frontend`.
7. No numerical output changes for the same inputs and seed. If a golden value must change,
   stop and obtain approval first.
8. No new production dependency; no new browser storage; no new network endpoint unless a task
   requires one.
9. `git status --short` shows only intended files. Generated artefacts are restored.
10. The behaviour changes are reflected in the documents listed in the task.

## 3. Phase overview

| Phase | Theme | Tasks | Findings | Depends on |
| --- | --- | --- | --- | --- |
| 1 | Correctness of the released surfaces | P1.1–P1.9 | ALR-01, ALR-02, ALR-03, ALR-04, ALR-05, ALR-11 (client part), ALR-12, ALR-15 | — |
| 2 | Persistence and share integrity | P2.1–P2.6 | ALR-06, ALR-13 | Phase 1 |
| 3 | Complete the workflows | P3.1–P3.5 | ALR-07, ALR-08, ALR-14 | Phase 1 (P1.1–P1.4) |
| 4 | Reliability and hardening | P4.1–P4.5 | ALR-09, ALR-10, ALR-11 (server part), rate-limit settings shape | Phase 2 |

Phase 2 status: P2.1, P2.4 and P2.6 are complete; P2.5 covers the implemented P2.1/P2.4 scope.
P2.2 was rejected by the owner on 2026-11-22: the application's user is seeking their own
decision-support results, so a new server receipt key was judged unnecessary. P2.1 consistency
validation is the accepted control, and the residual self-consistent-fabrication risk is recorded
in `docs/SECURITY_AND_PRIVACY.md`. P2.3 is resolved by Option C: Live remains client-calculated,
and saved/shared values are explicitly labelled user-recorded and not independently verified by
the server. Live server behaviour is unchanged.

Phase 3 status: P3.1–P3.5 are complete. Custom treatment identity is definition-based, custom
treatments are usable end to end, saved Decision Lab analyses have a read-only owner history, and
Live/Decision Lab saved state is shown honestly. P2.2 is decided (rejected); its accepted residual
risk does not block Phase 3. P2.3 is resolved by Option C.

Phase 4 status: P4.1–P4.5 are complete and verified. P4.4 uses the owner-approved Playwright
development dependency; the browser tests drive the real UI with mocked API responses. P4.5 applies
the configured Live per-action limits through the limiter's `rateLimit` key.

Do not begin a phase before the previous phase's definition of done is met and reviewed.

---

## 4. Phase 1 — correctness of the released surfaces

**Goal:** no screen, saved record or shared report can describe one analysis while showing
another analysis's numbers.

### P1.1 — Add a canonical analysis-input identity (ALR-11, client part)

**Create** `frontend/src/decision/domain/analysisIdentity.ts`.

```ts
import type { Appetite } from '@/decision/domain/decisionTypes';

export type TreatmentIdentity =
  | { readonly source: 'curated'; readonly id: string; readonly version: string }
  | { readonly source: 'custom'; readonly definition: Readonly<Record<string, unknown>> };

export interface AnalysisIdentityInputs {
  readonly answers: Readonly<Record<string, unknown>>;
  readonly treatments: readonly TreatmentIdentity[];
  readonly appetite: Appetite;
  readonly seed: number;
  readonly iterations: number;
  readonly decisionMethodologyVersion: string;
}

/** Returns the canonical identity of an analysis input set. Deterministic; no hashing. */
export function analysisInputKey(inputs: AnalysisIdentityInputs): string;
```

Requirements:

1. Serialise with object keys sorted recursively; do not rely on property insertion order.
2. Sort `organisationAnswers` by `questionCode`; sort `scenarioAnswers` by `scenarioCode` and
   each answer list by `questionCode`. These are sets, not sequences.
3. Sort treatment identities by their canonical serialisation. For curated treatments use
   `source`, `id` and `version`. For custom treatments use the complete definition, because the
   server re-derives the id from the name (see ALR-14) and two different same-named definitions
   must not share an identity.
4. Include the appetite values with `null` preserved; do not treat “not configured” as zero.
5. Return the canonical JSON string itself. Do **not** hash it: a collision would silently
   equate two analyses.
6. Export a helper `analysisInputKeyMatches(left, right): boolean` only if it adds clarity;
   otherwise compare strings.

**Tests:** `frontend/tests/analysis-identity.test.ts`.

- identical inputs produce an identical key across repeated calls;
- reordering answers does not change the key;
- changing any option changes the key;
- changing appetite from `null` to a number changes the key;
- changing the seed, iterations or methodology version changes the key;
- two custom definitions with the same name and different effects produce different keys.

**Do not:** add a dependency, use `JSON.stringify` on unsorted objects, or hash.

### P1.2 — Replace independent result state with one immutable snapshot (ALR-01, ALR-02)

**Create** `frontend/src/decision/domain/analysisSnapshot.ts` (types and pure transitions only;
no React, no network).

```ts
import type { PortfolioSearch, SensitivityResult, TreatmentComparison } from '@/decision/domain/decisionTypes';

export type ReportTarget = 'comparison' | 'recommended-portfolio';

export interface DecisionSnapshot {
  /** Identity of the inputs this snapshot was computed from. */
  readonly inputKey: string;
  /** Comparison for the treatment set the user selected. */
  readonly comparison: TreatmentComparison;
  /** Portfolio search over the same inputs and candidate set, when one has been run. */
  readonly portfolios: PortfolioSearch | null;
  /** Break-even result over the same inputs and treatment set, when one has been run. */
  readonly sensitivity: SensitivityResult | null;
  /** Exact comparison for the recommended subset, when one has been prepared. */
  readonly recommendedComparison: TreatmentComparison | null;
  /** What the next report or save will describe. */
  readonly reportTarget: ReportTarget;
}
```

`decisionClient.ts` currently re-declares `ComparisonResponse` and `PortfolioResponse` with the
same shape as `TreatmentComparison` and `PortfolioSearch`. Collapse them to imports or type
aliases; do not keep two structurally identical response types.

Pure transitions:

```ts
export function snapshotAfterComparison(inputKey: string, comparison: TreatmentComparison): DecisionSnapshot;
export function attachPortfolios(snapshot: DecisionSnapshot, inputKey: string, portfolios: PortfolioSearch): DecisionSnapshot;
export function attachSensitivity(snapshot: DecisionSnapshot, inputKey: string, sensitivity: SensitivityResult): DecisionSnapshot;
export function attachRecommendedComparison(snapshot: DecisionSnapshot, inputKey: string, comparison: TreatmentComparison): DecisionSnapshot;
```

Each `attach*` throws a typed error when `snapshot.inputKey !== inputKey`. The component catches
it and shows: “The inputs changed while the request was running. Recalculate.”

**Component changes** in `DecisionLabView`:

1. Replace `comparison`, `portfolios` and `sensitivity` state with `snapshot: DecisionSnapshot |
   null`.
2. Compute `currentKey = analysisInputKey(...)` with `useMemo` from the answers, the selected
   treatment identities, the appetite, the seed, the iteration count and the methodology
   version returned by the catalogue.
3. Before every request, capture `requestKey = currentKey`; after the response, recompute the
   key and require equality with both `requestKey` and `snapshot.inputKey` where applicable.
4. `runComparison` replaces the whole snapshot. `runPortfolios` and `runSensitivity` require an
   existing snapshot with a matching key; otherwise show “Run the comparison again for the
   current inputs” and do not display the response.
5. Add an effect that clears `snapshot`, `publicId` and `shareUrl` whenever `currentKey`
   changes. Show a single informational message: “Inputs changed. Results cleared. Recalculate.”
   Do not keep old numbers on screen.
6. Disable Compare/Portfolios/Break-even while `busy`; disable Save, Print and Share when
   `snapshot === null` or `snapshot.inputKey !== currentKey`.

**Why the first comparison is the anchor:** the Board Pack needs every combination of baseline,
treated, appetite, cost, delay and efficiency, and only a comparison response contains all of
them. Making the portfolio search attach to a comparison prevents ALR-01 by construction.

**Tests:** `frontend/tests/analysis-snapshot.test.ts` (pure transitions).

- `attachPortfolios` with a different key throws and does not mutate the input;
- `snapshotAfterComparison` starts with no portfolios, sensitivity or recommendation;
- attaching portfolios then sensitivity preserves the comparison and the key;
- a new comparison replaces the previous snapshot entirely;
- `attachRecommendedComparison` records the target but does not change `reportTarget` by itself.

**Do not:** keep a parallel legacy state variable “for display”. One source of truth.

### P1.3 — Resolve an explicit report basis (ALR-01, ALR-15)

**Create** `frontend/src/decision/domain/reportBasis.ts`.

```ts
import type { Portfolio, TreatmentComparison } from '@/decision/domain/decisionTypes';
import type { DecisionSnapshot, ReportTarget } from '@/decision/domain/analysisSnapshot';
import type { BoardModelInput, RecommendationState } from '@/decision/board/boardModel';

export interface ReportBasis {
  readonly kind: ReportTarget;
  readonly inputKey: string;
  readonly comparison: TreatmentComparison;
  /** Present only when the basis describes a recommended portfolio. */
  readonly portfolio: Portfolio | null;
  /** What the report may claim about a portfolio recommendation. */
  readonly recommendationState: RecommendationState;
}

export function comparisonBasis(snapshot: DecisionSnapshot): ReportBasis;
export function recommendedBasis(snapshot: DecisionSnapshot): ReportBasis | null;
export function boardModelInputFromBasis(
  basis: ReportBasis,
  currencySymbol: string,
  generatedAt: string,
): BoardModelInput;
```

#### Rules

1. `recommendedBasis` returns `null` unless all of the following hold:
   - `snapshot.portfolios !== null`;
   - `snapshot.portfolios.recommendedId !== null`;
   - the recommended portfolio row exists;
   - `snapshot.recommendedComparison !== null`;
   - the set of `snapshot.recommendedComparison.treatments.map(t => t.id)` equals the set of
     `portfolio.treatmentIds`;
   - the seed, iteration count, QuickRisk model id/version and Decision Lab methodology version
     in `snapshot.recommendedComparison.provenance` equal the portfolio search provenance.
2. `boardModelInputFromBasis` copies **only** from `basis.comparison`:
   `baseline`, `treated`, `appetite.baseline`, `appetite.treated`, `cost.initialInvestment`,
   `cost.annualOperatingCost`, `cost.implementationDelayDays`, `delta.reductionShare`,
   `riskReductionEfficiency`, and `treatments`.
3. `recommended` in the `BoardModelInput` is `basis.portfolio` when
   `basis.kind === 'recommended-portfolio'`; otherwise `null`. `recommendationState` is copied
   from `basis.recommendationState` (see P1.4). `comparisonBasis` computes it from the snapshot:
   no portfolio search → `not-evaluated`; search with `noneSatisfies` → `none-satisfies`; search
   with a recommendation → `evaluated-other`. `recommendedBasis` always returns `recommended`.
4. `basis.comparison.treatments` is the authoritative treatment list. Never use the live
   `selectedIds` to build report rows.

#### Preparing the recommended report

**Ordering note:** `boardModelInputFromBasis` cannot compile until P1.4 adds the required
`recommendationState` field to `BoardModelInput`. Implement P1.3 and P1.4 together, or land P1.4's
type change immediately before P1.3.

Add a component action `prepareRecommendedReport()`:

1. Require a snapshot with a matching input key and a portfolio search.
2. Read `recommendedId` and the portfolio row.
3. Call `computeComparison` with exactly `portfolio.treatmentIds` as curated selections and the
   same answers, appetite, seed and iteration count as the snapshot.
4. Verify the response treatment-id set equals `portfolio.treatmentIds` and the provenance
   matches the snapshot.
5. Store it through `attachRecommendedComparison` and set `reportTarget` to
   `'recommended-portfolio'`.

If the portfolio search recommends the empty portfolio, the report basis is the comparison for
no treatments (baseline equals treated, zero cost). Handle it explicitly; do not fall back to
the selected-set comparison.

#### Tests

`frontend/tests/report-basis.test.ts`:

- candidates A, B, C; recommendation B; the basis uses B's comparison, B's cost and B's
  treatment definitions;
- recommendation B + C uses B + C, not all candidates;
- a recommended comparison whose treatment set differs from `portfolio.treatmentIds` is
  rejected;
- `comparisonBasis` keeps `portfolio: null` and never reports a recommendation;
- the empty recommended portfolio produces zero cost and an unchanged baseline.

`frontend/tests/decision-board.test.ts` additions:

- every page-4 metric equals the basis comparison, not the selected-set comparison;
- page 1 and page 4 cannot disagree.

**Do not:** pass the portfolio row's `treated`/`cost` into the report directly. `Portfolio`
does not carry risk-reduction efficiency or the full treatment definitions; only the exact
comparison does.

### P1.4 — Make the Board Pack state what it actually evaluated (ALR-15)

**Modify** `frontend/src/decision/board/boardModel.ts`.

1. Add to `BoardModelInput`:

```ts
export type RecommendationState =
  | 'recommended'
  | 'none-satisfies'
  | 'evaluated-other'
  | 'not-evaluated';

readonly recommendationState: RecommendationState;
```

2. Keep `recommended` for the portfolio row, but make it authoritative only when
   `recommendationState === 'recommended'`. If a caller passes `recommended !== null` with any
   other state, throw in development or ignore it; do not silently render it.
3. Branch page-4 `narrative`, `decisionRequested` and `recommendation` on the state:

| State | Page-4 narrative | `decisionRequested` | `recommendation` |
| --- | --- | --- | --- |
| `recommended` | existing recommended-portfolio text | existing investment request | populated |
| `none-satisfies` | existing “No evaluated portfolio satisfies…” text | existing “No evaluated portfolio satisfies…” text | `null` |
| `evaluated-other` | “A portfolio search was performed and a different combination was recommended. This report describes the selected treatment set and does not present that recommendation.” | “For consideration: the selected treatment set… No portfolio recommendation is made in this report.” | `null` |
| `not-evaluated` | “No portfolio search has been performed for this analysis. This report describes the selected treatment set only.” | “For consideration: the selected treatment set… Run a portfolio search to evaluate alternatives.” | `null` |

4. Page 4's title stays “Recommended treatment portfolio” because the structure is fixed by the
   Board Risk Pack specification. The narrative carries the distinction.
5. Pass `recommendationState` from `boardModelInputFromBasis`:
   - `basis.kind === 'recommended-portfolio'` → `recommended`;
   - comparison basis and `snapshot.portfolios === null` → `not-evaluated`;
   - comparison basis and `snapshot.portfolios.noneSatisfies === true` → `none-satisfies`;
   - comparison basis and a recommended portfolio exists → `evaluated-other`.
6. Update `SharedBoardPack` to read a persisted state, with a legacy fallback:
   `selection.reportBasis?.recommendationState` when present; otherwise derive from
   `recommendedPortfolio`, `selection.portfolios?.noneSatisfies` and the presence of a portfolio
   search. Legacy records must never be labelled `recommended` unless a recommended portfolio was
   actually stored.

**Tests** in `frontend/tests/decision-board.test.ts`:

- all four states produce the specified narrative and decision request;
- only `recommended` populates `report.recommendation`;
- `not-evaluated` does **not** contain “No evaluated portfolio satisfies”;
- `evaluated-other` names neither a recommendation nor “none satisfies”;
- the existing five-page structure and acronym rules are unchanged;
- a comparison-only report with no search never claims a portfolio was evaluated.

**Documentation:** update `docs/QUICKRISK_DECISION_LAB.md` to describe the four states and when
the report presents a recommendation.

### P1.5 — Make the baseline scenario the single identity in Live (ALR-03, ALR-04)

**Create** `frontend/src/live/domain/scenarioIdentity.ts`:

```ts
import type { SOCInputState } from '@/live/domain/socTypes';

/** Returns the state with the active baseline scenario. Pure; does not mutate. */
export function withScenario(state: SOCInputState, scenarioCode: string): SOCInputState;

/** True when the state belongs to the scenario. */
export function belongsToScenario(state: SOCInputState, scenarioCode: string): boolean;
```

`withScenario` must be the only way a SOC state enters the store from outside the simulator
controls.

**Modify** `frontend/src/live/state/liveStore.ts`:

1. `setBaseline(baseline)`:
   - set `baseline`;
   - when `baseline !== null`, set `soc: withScenario(state.soc, baseline.scenarioCode)`;
   - clear `timeline`, `currentPublicId`, `shareUrl`, and any stale message;
   - apply the auto-title rule from P1.7.
2. `resetSoc`:
   - set `soc: withScenario(DEFAULT_SOC_STATE, activeScenarioCode)` where the active code is
     `baseline?.scenarioCode` when a baseline exists, otherwise `DEFAULT_SOC_STATE.scenarioId`;
   - clear `timeline`.
3. `applyPreset`:
   - resolve `scenarioCode = baseline?.scenarioCode ?? preset.defaultState.scenarioId`;
   - set `soc: withScenario(preset.defaultState, scenarioCode)`;
   - build every timeline entry with `state: withScenario(step.state, scenarioCode)` and
     `result: calculateRealTimeRisk(normalisedState, baseline.baselineEal)`;
   - when `baseline === null`, build an empty timeline as today and keep the “select a baseline”
     behaviour.
4. `ingestDetail`:
   - before setting state, require `detail.inputState.scenarioId === detail.scenarioId`;
   - on mismatch, set an error (“The saved assessment is internally inconsistent and was not
     opened.”) and return without mutating the store;
   - replace the hard-coded currency symbol with a value derived from the saved record or the
     established application currency, not a literal in the ingest function.
5. Extract the payload builder to `frontend/src/live/domain/livePayload.ts` as a pure function:

```ts
export function buildLivePayload(input: {
  readonly baseline: LiveBaseline;
  readonly soc: SOCInputState;
  readonly timeline: readonly TimelineEntry[];
  readonly title: string;
  readonly methodologyVersion: string;
}): Record<string, unknown>;
```

It must throw a typed error when `soc.scenarioId !== baseline.scenarioCode` or when any timeline
entry’s state carries a different scenario. A doomed request must never leave the browser.

**Tests:** `frontend/tests/live-scenario-identity.test.ts` (pure; no network).

- `withScenario` changes only `scenarioId` and returns a new object;
- baseline change from S1 to S2 normalises the current state and every preset timeline state;
- `resetSoc` under an S2 baseline produces an S2 state;
- `ingestDetail`-style input with mismatched ids is rejected (test the extracted validation
  helper, not the component);
- `buildLivePayload` succeeds for a coherent S2 state and throws for S1 under an S2 baseline;
- `buildLivePayload` throws when one timeline entry carries another scenario.

**Do not:** remove the server equality check, and do not make the payload builder “fix up” a
mismatch silently. It must refuse, so a missed normalisation fails a test instead of saving a
different scenario than the user saw.

### P1.6 — Fix the Live timeline policy and prove it (ALR-05)

**Policy:** changing the QuickRisk baseline clears the simulation timeline. Recomputing silently
would rewrite recorded history; clearing is explicit, deterministic and visible. State the
policy in the interface and in `docs/QUICKRISK_LIVE.md`.

**Implement:**

1. `setBaseline` clears `timeline` (already required by P1.5 step 1).
2. `applyPreset` recomputes every timeline result against the active baseline (P1.5 step 3).
3. Add a pure invariant used by the payload builder:

```ts
export function assertTimelineMatchesBaseline(
  timeline: readonly TimelineEntry[],
  scenarioCode: string,
  baselineEal: number,
): void;
```

It throws when any entry’s `state.scenarioId` differs from `scenarioCode`, or when any entry’s
`result.baselineEal` differs from `baselineEal` by more than `0.01`.

4. Show a one-line notice after a baseline change: “Baseline changed. The simulation timeline was
   cleared because every recorded exposure depends on the baseline.”
5. In `LiveSimulatorView`, place that explanation next to the baseline selector, not only in a
   transient toast.

**Tests:**

`frontend/tests/live-store.test.ts` (the zustand store is plain JavaScript and works in the
Vitest node environment; reset it with `useLiveStore.setState(useLiveStore.getInitialState())`
between tests):

- `setBaseline` followed by `resetSoc` leaves `soc.scenarioId` equal to the new baseline;
- `setBaseline` clears the timeline;
- `applyPreset` under an S2 baseline produces S2 states in the current state and timeline;
- recorded events use the active scenario and the active baseline EAL;
- `buildLivePayload` throws if one timeline entry retains the previous baseline EAL.

`frontend/tests/live-scenario-identity.test.ts`:

- `assertTimelineMatchesBaseline` accepts a coherent timeline;
- it rejects a scenario mismatch and a baseline-EAL mismatch.

**Edge cases to decide and test:**

- baseline set to `null`: timeline is cleared, saving is refused with the existing message;
- baseline changed while `busy` is true: disable the selector while saving, or complete the save
  before applying the change;
- opening a saved assessment whose timeline contains a foreign scenario: refuse to open it and
  surface an error, rather than displaying mixed history.

**Do not:** migrate old timeline entries by rewriting their results in place. Historical records
keep their stored values; only the current editing session is cleared.

---

### P1.7 — Do not carry a preset title onto a different baseline

**Problem:** `applyPreset` sets `currentTitle` to the preset name. Changing the baseline leaves
that title in place, so a report can be titled “Ransomware outbreak” while assessing a
third-party scenario.

**Implement:**

1. Add `titleOrigin: 'preset' | 'user'` to the Live store.
2. `applyPreset` sets `titleOrigin: 'preset'`; `setTitle` and `ingestDetail` set `'user'`.
3. `setBaseline` clears `currentTitle` only when `titleOrigin === 'preset'`.
4. Do not clear a title the user typed or one loaded from a saved assessment.

**Tests** in `frontend/tests/live-store.test.ts`:

- applying a preset then changing the baseline clears the preset title;
- typing a title then changing the baseline preserves it;
- opening a saved assessment then changing the baseline preserves the saved title but clears the
  timeline and the saved/share identifiers.

### P1.8 — Test the composition without adding a UI test framework

The repository has no React testing library or DOM environment, and C7 forbids adding a
dependency without approval. Phase 1 tests therefore target extracted pure logic and the zustand
store. State that limitation in the phase report.

**Unit coverage required:**

| File | Proves |
| --- | --- |
| `frontend/tests/analysis-identity.test.ts` | canonical keys are stable and input-sensitive |
| `frontend/tests/analysis-snapshot.test.ts` | snapshots cannot mix keys; attaching preserves the comparison |
| `frontend/tests/report-basis.test.ts` | recommended basis uses the recommended subset only |
| `frontend/tests/decision-board.test.ts` (extend) | four recommendation states; page 4 equals the basis |
| `frontend/tests/live-scenario-identity.test.ts` | normalisation and payload guards |
| `frontend/tests/live-store.test.ts` | baseline change clears timeline, normalises state, keeps user titles |

**Manual acceptance script** (record the result in the phase report):

Decision Lab:

1. Complete an assessment; open Decision Lab; select A, B and C.
2. Compare; evaluate portfolios; note the recommended subset.
3. Prepare the recommended-portfolio report.
4. Confirm: title, treatment rows, investment, residual EAL, P90, delay and RRE all describe the
   recommended subset.
5. Change the annual loss limit. Confirm the report disappears, Save/Share are disabled and a
   “results cleared” message is shown.
6. Recalculate, save and share. Confirm the shared report matches the saved report value for
   value.
7. Compare only (no portfolio search) and print. Confirm the report says no search was performed
   and does **not** say no portfolio satisfies appetite.

QuickRisk Live:

1. Open Live; select a different baseline.
2. Confirm the SOC scenario is normalised.
3. Apply a preset; confirm it runs under the selected baseline.
4. Record two steps; change the baseline; confirm the timeline is cleared with the explanation.
5. Record a step and save; confirm success.
6. Reopen the saved assessment; confirm the scenario, timeline and result are coherent.

**Do not:** add Playwright, jsdom, Testing Library or any other dependency in Phase 1. If UI-level
automation is wanted, raise it under P4.4.

---

### P1.9 — Update the Phase 1 documentation

After the behaviour is implemented and tested:

1. `docs/QUICKRISK_DECISION_LAB.md`
   - changing any input clears the current results;
   - report basis: comparison versus recommended portfolio;
   - the four recommendation states from P1.4 and what each means;
   - the save payload records the basis that produced the report.
2. `docs/QUICKRISK_LIVE.md`
   - the baseline scenario owns the SOC scenario identity;
   - changing the baseline clears the timeline and why;
   - preset timelines are re-based onto the selected scenario;
   - a saved assessment whose identifiers disagree is refused.
3. `docs/APPLICATION_LOGIC_REVIEW_A.md`
   - add a short “Resolved in” note beside each finding as it closes. Do not rewrite the finding
     text; the record must remain a snapshot of the review.
4. `docs/README.md`
   - confirm both application-logic documents are listed.
5. Do not change the methodology version numbers: no numerical behaviour changes in Phase 1.

## 5. Phase 2 — persistence and share integrity

**Goal:** a saved or shared record must be the record the server calculated and validated, not
whatever the client asserted.

### P2.1 — Validate Decision Lab result consistency at save (ALR-06)

**Modify** `server/includes/decision/validation.php` and
`server/includes/decision/handlers.php`.

Add `qk_decision_validate_saved_result(array $payload, array $appConfig): array`. It receives the
decoded save payload and returns the normalised record or throws `QkLiveHttpError(422, ...)`.

Checks, each with a specific error message:

1. **Structure.** `result`, `selection.comparison`, `selection.treatments`,
   `selection.portfolios` (when present) and `recommended` (when present) have the expected shape.
2. **Arithmetic.**
   - `delta.expectedAnnualLoss` equals `baseline.expectedAnnualLoss − treated.expectedAnnualLoss`
     within `1e-6`;
   - `delta.p90` equals the difference of both `p90` values;
   - `delta.reductionShare` equals delta / baseline, or `0` when baseline is `0`;
   - every summary satisfies `minimum ≤ p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90 ≤ maximum`;
   - `expectedAnnualLoss ≥ 0`.
3. **Cost.** Sum `initialCost.amount` and `annualOperatingCost.amount` over the resolved
   treatments; compare with `cost.initialInvestment` and `cost.annualOperatingCost`.
   `implementationDelayDays` equals the maximum treatment delay. `annualisedTreatmentCost`
   equals `annualOperatingCost + initialInvestment / horizonYears`.
4. **Risk reduction efficiency.** `delta.expectedAnnualLoss / annualisedTreatmentCost`, or `null`
   when the annualised cost is zero.
5. **Appetite.** Re-evaluate every criterion from its stored limit, actual and threshold:
   `annualLoss` against EAL, `highEndLoss` against P90, `exceedanceProbability` against
   `treated.thresholdProbabilities[(string)(int) threshold]`. The `passes` flags and the overall
   status must match. Reject a probability criterion without a threshold.
6. **Recommendation membership.** When `recommended` is present:
   - its `id` exists in `selection.portfolios.portfolios`;
   - if `recommendedId` is not `null`, the two are equal;
   - its `treatmentIds` equal the treatment ids in `selection.comparison` and the definitions in
     `selection.treatments`;
   - its `treated` metrics equal `result.treated` for the same treatment set.
7. **Provenance.** `simulationSeed` and `iterations` equal `result.provenance.simulationSeed`
   and `result.provenance.iterations`; `iterations` is within the compute budget;
   `decisionMethodologyVersion` is enabled in `decision_methodology_versions`; `boardPackVersion`
   is the supported Board Pack version; `quickriskModelId` and `quickriskModelVersion` equal the
   active model manifest.
8. **Basis.** `selection.reportBasis` is present after Phase 1 and matches the P1.4 state rules.

**Resolve treatments server-side.** Do not trust the definitions in `selection.treatments`. For
every curated id, re-resolve through `qk_decision_curated_treatment`. For a custom definition,
re-validate it through `qk_decision_treatment_selection`. Compare the resulting ids and costs
with the stored ones.

**Tests** in `tests/decision_lab.test.php` or a new `tests/decision_save.test.php`:

- a valid save payload is accepted;
- altered `treated.expectedAnnualLoss`, `delta`, `reductionShare`, `initialInvestment`,
  `annualOperatingCost`, `implementationDelayDays` or `riskReductionEfficiency` is rejected;
- an appetite `passes` flag or status flipped by the client is rejected;
- a recommended portfolio not present in the search is rejected;
- a recommendation whose treatment set differs from the result's treatment set is rejected;
- a seed, iteration count or methodology version that disagrees with the result is rejected;
- an unknown Board Pack version or model version is rejected;
- a probability criterion without a threshold is rejected.

Use the in-memory repository where possible. The handler must remain testable without MySQL.

**Do not:** implement this by trusting `selection.comparison` instead of `result`; both must
agree, and the arithmetic must be checked against the summaries.

### P2.2 — Bind a saved Decision Lab analysis to a server computation (ALR-06)

**Decision:** rejected by the owner on 2026-11-22. The application's user is the person seeking
their own decision-support results; the owner judged that a new receipt secret is unnecessary for
that use. No `decision.receiptKeys` map, receipt code or server-issued receipt will be added. P2.1
consistency validation remains the accepted save-boundary control. The residual risk — a
self-consistent fabricated result can still be saved — is recorded in
`docs/SECURITY_AND_PRIVACY.md` and must not be described as prevented.

The text below records the rejected proposal for future reference.

This was the recommended mechanism before the owner's decision. It needs no result storage and no
second implementation.

**Add a receipt to every compute response.**

1. Add `decision.receiptKeys` to the application configuration, read from the environment as a
   map of key id to a 32-byte secret. Do not commit a key. Do not invent a default.
2. In `qk_decision_compute`, compute:
   - `inputFingerprint`: SHA-256 over a canonical serialisation of the validated answers, the
     resolved treatments (full definitions, ordered by id), the validated appetite, the
     constraints, the seed, the iteration count and the model/decision versions;
   - `resultHash`: SHA-256 over the canonical serialisation of the result that is returned;
   - `receipt` = base64url(HMAC-SHA-256(key, `inputFingerprint | resultHash | keyId`)).
3. Return `receipt`, `keyId` and `provenance.inputFingerprint` alongside the result.
4. Add the same fields to the client response types and keep them in `DecisionSnapshot`. The
   canonical key from P1.1 is a UI identity; the server fingerprint is the integrity identity.
   Keep both, and never treat one as the other.

**Verify at save.**

1. Require `receipt`, `keyId`, `inputFingerprint` and `selection.comparison`.
2. Recompute `resultHash` from the submitted result and the canonical rules. Recompute the HMAC.
   Compare with `hash_equals`.
3. Recompute `inputFingerprint` from the submitted inputs and treatment definitions after
   server-side resolution. It must equal the fingerprint inside the signed payload.
4. Reject with `422 INTEGRITY_MISMATCH` when any check fails; do not fall back to range checks.
5. A receipt may be replayed to save the same analysis more than once. That is acceptable: the
   result is identical. Do not add receipt storage.

**Rollout.** If no key is configured, compute returns `503 INTEGRITY_UNAVAILABLE` with a clear
message, so the operator notices during deployment instead of discovering that save is broken.
Add the key to the deployment runbooks and to the release checklist.

**Tests:**

- a compute response contains a receipt and fingerprint;
- a save carrying the exact result succeeds;
- altering one numeric field invalidates the receipt;
- altering a treatment definition or appetite after compute invalidates the fingerprint;
- a missing, malformed or wrong-key receipt is rejected;
- key rotation verifies the previous key id and rejects an unknown one;
- canonicalisation is stable across object key order.

**If the owner rejects a new secret:** implement P2.1 only, and record the residual risk (a
self-consistent fabrication is still possible) in `docs/SECURITY_AND_PRIVACY.md`. Do not claim
integrity that is not enforced.

---

### P2.3 — Decide the QuickRisk Live integrity mechanism before writing code (ALR-06)

**Decision:** Option C selected by the owner on 2026-11-22 (remediation session): do not claim
server integrity for Live. The client-only engine and all Live server behaviour are unchanged.
Saved and shared values are labelled **user-recorded simulation data**, the shared view states
that the server does not independently verify them, and the documentation no longer implies that
a share link proves a calculation. `tests/live_architecture.test.php` was not weakened.

**Decision gate. Do not implement a Live verifier without reading this section and obtaining the
owner's choice.**

`tests/live_architecture.test.php` contains a permanent test named “live architecture: PHP never
reimplements the risk mathematics”. It asserts that the coefficients and formulas do not appear
in the Live PHP sources, and that the TypeScript engine is the only implementation. A PHP verifier
would violate that test as written.

**Option A — Approved verifier with shared vectors (recommended if integrity is required).**

- Move the methodology constants (stage scores, weights, mitigation effects, clamps, band edges)
  into one shared JSON file consumed by TypeScript and PHP. `resolveJsonModule` is already enabled.
- Add exactly one PHP verifier, `server/includes/live/verification.php`.
- Add shared mandatory vectors to the test fixtures, executed by both the TypeScript engine tests
  and the PHP verifier tests.
- Amend the architecture test to allow the verifier file and to assert that both implementations
  pass the same vectors. Update `docs/QUICKRISK_LIVE.md`, which currently promises PHP never
  reimplements the model.
- Verify the current state and every timeline state/result pair at save.

**Option B — Move Live calculation to the server.**

Rejected for this release: it changes the product from instant local calculation to a network
round trip per change and contradicts the documented architecture.

**Option C — Do not claim integrity for Live.**

Keep the client-only engine, label saved and shared Live results as user-recorded simulation
data, state in `docs/QUICKRISK_LIVE.md` and in the shared view that values are not independently
verified by the server, and remove any implication that a share link proves a calculation. This
is a product and documentation change, not a code fix.

**Required output of the gate:** the chosen option, the owner's approval reference, and the
resulting documentation change. Record it in the phase report. Until a choice is recorded, leave
the server behaviour unchanged and do not weaken `tests/live_architecture.test.php`.

### P2.4 — Refuse to share an archived analysis (ALR-13)

**Modify** `server/includes/decision/handlers.php`:

1. In `qk_decision_share_create`, after `findDecision`, reject when
   `$record['status'] === 'archived'` with `409 CONFLICT` and the message “An archived analysis
   cannot be shared.”
2. Keep the ownership check first; a foreign session must still receive `404`.
3. Add `AND d.status <> 'archived'` to `findActiveShareByHash` in
   `server/includes/decision/repository.php` as defence in depth. The handler already rejects an
   archived record; the query should not return it either.

**Tests** in `tests/decision_lab.test.php` or the new save/share test file:

- create, archive, then create a share: `409`, and no new share row exists;
- an existing share stops resolving after archive (already covered for Live; add the Decision
  Lab equivalent);
- a foreign session archiving or sharing still receives `404`, never `409`.

---

### P2.5 — Add tampering tests that fail closed (ALR-06)

Tests must prove rejection, not only acceptance. For every rejected case, also assert that the
record count did not increase.

**Decision Lab** (`tests/decision_save.test.php`):

1. Build a valid payload with a helper. Confirm it saves and round-trips unchanged.
2. Mutate, one at a time: baseline EAL, treated EAL, P90, delta, reduction share, initial
   investment, annual cost, delay, efficiency, an appetite `actual`, an appetite `passes` flag,
   the overall status, the recommended id, the recommended treatment list, the seed, the
   iteration count, the methodology version, the Board Pack version, the model version.
3. Each mutation must return `422` (or `409` where applicable) and leave the history empty.
4. Add a “mixed basis” case: `result` from treatment set A, `selection.comparison` from set B,
   `recommended` from set C. It must be rejected even when each part is individually valid.

**QuickRisk Live** (`tests/live_api.test.php`):

1. Keep the existing acceptance tests.
2. Add a forged-result case whose values are all in range but mutually impossible; it must be
   rejected once P2.3 Option A is implemented.
3. Add a timeline case where an event result belongs to another state or another baseline.
4. Under Option C, do not add rejection tests; instead assert the “user-recorded” labelling in
   the shared payload and document the limitation.

**Test data:** never weaken the fixtures to make a rejection test pass. The fixtures are the
published examples.

---

### P2.6 — Document the integrity boundary

Update:

1. `docs/SECURITY_AND_PRIVACY.md`
   - a subsection on saved-result integrity: what the server verifies, what it does not, and the
     residual risk;
   - the trust boundary between the session owner and the public share reader.
2. `docs/QUICKRISK_DECISION_LAB.md`
   - the save validation rules;
   - the P2.2 decision (rejected; no receipt key);
   - what a shared link proves and does not prove.
3. `docs/QUICKRISK_LIVE.md`
   - the chosen Option A/B/C outcome;
   - if A: the shared constants file, the verifier and the parity vectors;
   - if C: an explicit statement that stored values are user-recorded and not independently
     reproduced by the server.
4. `docs/DEPLOYMENT_FIRST_TIME.md` and `docs/DEPLOYMENT_QUICKRISK_LIVE.md`
   - no receipt key is required because P2.2 was rejected;
   - the accepted P2.1-only save boundary.
5. `docs/RELEASE_CHECKLIST.md`
   - “a mutated save payload is rejected”;
   - “the integrity mechanism chosen for Live is recorded and tested”.
6. `CHANGELOG.md`
   - follow the existing format; describe the user-visible changes, not the internal file list.

## 6. Phase 3 — complete the workflows

**Status:** complete. P3.1 landed before P3.2. The server still owns custom-treatment identity and
all computation; the UI only converts a stored definition back to the validated request shape.

### P3.1 — Make custom treatment identity definition-based (ALR-14)

**Modify** `server/includes/decision/validation.php`.

1. Add a canonical serialiser `qk_decision_canonical_json($value): string`. It sorts object keys
   recursively and encodes with `JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE`. Lists keep
   their order; callers sort semantic sets first.
2. Build the identity from the validated definition, excluding any client-supplied id:
   name, business outcome, short description, applicable scenarios (sorted, unique), both causal
   effects, delay, initial cost, annual operating cost, evidence quality, mechanism group and
   assumptions.
3. Derive the id from the SHA-256 of that canonical form, using a 16-hex-character suffix and the
   `custom-` prefix. Keep `version` at `'1.0'` and include it in the realised-effect seed.
4. In `qk_decision_resolved_treatments`, replace the silent `continue` on a duplicate id with a
   `422`: “Two selected treatments resolve to the same identity. Remove or edit one.”
5. In `qk_decision_realise_effects`, assert unique ids and throw if a duplicate reaches it.

**Back-compatibility:** saved analyses store their definitions and results and are replayed, not
recomputed. Old ids remain display data. Do not migrate stored JSON.

**Tests:**

- same name with different effects → different ids;
- the same definition submitted twice → `422`, not silent de-duplication;
- names differing only by case with different definitions → different ids;
- a curated id can never collide with a custom id;
- changing any field changes the id.

---

### P3.2 — Expose custom treatments in Decision Lab (ALR-07)

**Add** to `frontend/src/decision/domain/` a selectable-treatment model:

```ts
export type SelectableTreatment =
  | { readonly source: 'curated'; readonly definition: TreatmentDefinition }
  | { readonly source: 'custom'; readonly publicId: string; readonly definition: TreatmentDefinition };

export function selectionForCompute(treatment: SelectableTreatment): Record<string, unknown>;
export function selectionKey(treatment: SelectableTreatment): string;
```

`selectionForCompute` returns `{ source: 'curated', id }` or `{ source: 'custom', definition }`.
The custom definition must include every field `qk_decision_treatment_selection` requires;
omitting one must fail before the request.

**Screen changes** in `DecisionLabView`:

1. Merge `catalogue.curated` and `catalogue.custom[].definition` into one list, tagging the
   source.
2. Render “Curated treatments” and “Your treatments”. Custom rows are labelled
   “User-defined treatment” and show their evidence class and assumption.
3. Keep selection as `readonly string[]` of `selectionKey` values; resolve to
   `SelectableTreatment` objects when computing.
4. Add a create form with every required field: name, business outcome, short description,
   assumption note, mechanism group, evidence quality, applicable scenarios, at least one causal
   lever with min/most-likely/max, delay, initial cost and annual operating cost.
5. On create: `POST`, reload the catalogue, select the new treatment.
6. On delete: confirm, `DELETE`, remove it from the selection, reload the catalogue.
7. Show server validation messages verbatim; do not attempt to repair a rejected definition.

**Report and save:** the comparison response already carries the resolved definitions and their
`origin`. Use `basis.comparison.treatments`; do not rebuild rows from form state.

**Update `prepareRecommendedReport`:** resolve each `portfolio.treatmentIds` entry through the
merged catalogue and send the matching `selectionForCompute` object, so a recommended portfolio
that contains a custom treatment can be compared. If an id cannot be resolved, refuse to prepare
the report instead of silently omitting the treatment.

**Tests:**

- pure tests for `selectionForCompute`, `selectionKey` and the catalogue merge;
- server tests: create, list, use in a comparison, delete, and reject an incomplete definition;
- manual: create a custom treatment, compare it, prepare a recommended report, save, share, and
  confirm the shared report labels it user-defined and shows its assumption.

### P3.3 — Add a saved Decision Lab history (ALR-08)

**Constraint:** a saved Decision Lab record does not store the QuickRisk assessment answers, so
it cannot be recomputed. History is a read-only replay of the saved snapshot, not a return to an
editable analysis. The interface must say so.

**Add** a `DecisionHistoryView`:

1. List `decisionApi.list()` summaries: title, created date, appetite status, baseline and
   residual EAL, investment, methodology version.
2. Open a record with `decisionApi.get(publicId)` and render the Board Risk Pack read-only, with a
   “Saved snapshot” banner and the stored provenance.
3. Archive with `decisionApi.archive(publicId)` and refresh the list.
4. Create or revoke a share link for the selected record (after P2.4).
5. Provide “Start a new analysis” that returns to the lab without merging the saved record into
   the current inputs.

**Tests:** the handlers already cover ownership and archival; add a list-scoping test if one is
missing, plus a manual acceptance script. Do not add a UI test dependency.

**Documentation:** state that a saved record is a snapshot and that recomputation requires a new
assessment.

---

### P3.4 — Show saved, edited and shared state honestly (ALR-12)

**QuickRisk Live:**

1. Add a pure `liveStateFingerprint` over the baseline scenario and EAL, the SOC state, the
   timeline, the title and the methodology version.
2. Store `savedFingerprint` after save, update, duplicate and open.
3. Show exactly one of: “Not saved”, “Saved”, “Unsaved changes since the last save”.
4. Disable Share while the current fingerprint differs from `savedFingerprint`, with the message
   “Save or update the assessment before sharing it.”
5. Never auto-save before sharing.

**Decision Lab:** Phase 1 already clears `publicId` and `shareUrl` when inputs change. Add a
status line: “Saved”, “Not saved” or “Results cleared — recalculate”. Share stays disabled until
the current basis is saved.

**Tests:** pure fingerprint tests (same inputs → same fingerprint; every meaningful change → a
different one) and store tests for the saved/dirty transitions.

---

### P3.5 — Document Phase 3

Update `docs/QUICKRISK_DECISION_LAB.md` for:

- creating, selecting and deleting custom treatments;
- the definition-based identity rule;
- the history view and its read-only nature;
- saved/edited/shared status.

Update `CHANGELOG.md` and `docs/RELEASE_CHECKLIST.md` with the new acceptance checks.

---

## 7. Phase 4 — reliability and hardening

**Status:** approved scope complete. P4.1–P4.5 are implemented and tested.

### P4.1 — Single-flight the anonymous session (ALR-09)

**Status:** complete. `createSingleFlight` is used for the session request, and Live writes retry once after an explicit CSRF failure.

**Modify** `frontend/src/live/state/liveStore.ts`.

1. Keep a module-level `let sessionPromise: Promise<string | null> | null`.
2. If `sessionStatus === 'ready'` and a token exists, return it.
3. If `sessionPromise !== null`, return it.
4. Otherwise create the request and clear the promise in `finally`.
5. On an explicit CSRF failure from a write, refresh the session once and retry the write once.
   Do not retry other errors.

**Tests:** extract the single-flight helper into a pure module and test:

- two concurrent calls invoke the underlying request once;
- both receive the same token;
- after settlement, a later call starts a new request;
- a rejected request clears the promise so a retry is possible.

Also add a handler-level note: the server rotates the token on reuse, so the client must not
issue overlapping session calls. Do not change the server rotation without a separate decision.

---

### P4.2 — Require a threshold for a probability appetite (ALR-10)

**Status:** complete in the server and the Decision Lab screen.

**Server:**

1. In `qk_decision_appetite`, reject `maxExceedanceProbability` when neither `annualLossLimit` nor
   `exceedanceThreshold` is present, with `422` and a clear message.
2. Keep the existing per-field ranges.

**UI:**

1. Disable the probability input until an annual loss limit is entered, or expose an explicit
   exceedance threshold field.
2. Add help text: “This criterion needs a loss threshold. Enter an annual loss limit first.”
3. Clear the probability value when the annual limit is cleared, so a hidden stale value cannot
   be submitted.

**Tests:** server rejects the incomplete object and accepts both complete forms; a pure client
test proves the input is disabled and the value is cleared.

---

### P4.3 — Put the server input fingerprint in every compute response (ALR-11, server part)

**Status:** complete. The fingerprint is in every action's provenance; the snapshot layer requires it and Analyst Mode displays it.

P2.2 was rejected by the owner, so this fingerprint exists independently as a staleness and
input-identity control, not as a receipt. Finish it:

1. Compute the fingerprint once in `qk_decision_compute` and include it in the provenance of all
   four actions: `baseline`, `compare`, `portfolios`, `sensitivity`.
2. Make every client action require the fingerprint before attaching a response to a snapshot.
3. Display the fingerprint in Analyst Mode only, so a user can compare two reports without
   exposing internal meaning in Business Mode.

**Tests:** identical inputs and seed produce the same fingerprint; changing any answer, treatment,
appetite or constraint changes it; every action carries it.

---

### P4.4 — Browser-level automation (approved 2026-11-22)

**Status:** complete — owner-approved on 2026-11-22. `@playwright/test` is a development
dependency. The browser suite lives in `frontend/tests/e2e`, runs with `npm run test:e2e`, and uses
the real React UI under Vite with the same-origin `/live/api/**` responses mocked at the network
boundary. It needs no MySQL server and no deployed host. The config uses a locally installed
Chrome/Edge (or a `PLAYWRIGHT_EXECUTABLE_PATH`) when present; otherwise install Playwright's
managed Chromium with `npx playwright install chromium`.

Coverage:

| Spec | Workflow |
| --- | --- |
| `smoke.spec.ts` | the real application boots and the assessment store is reachable |
| `decision-lab.spec.ts` | compare → evaluate portfolios → prepare the recommended report → save → share → changing appetite clears the result; probability appetite stays disabled without a loss threshold; compare-only report states that no portfolio search was performed |
| `live.spec.ts` | save → dirty state disables Share → update → share with the user-recorded notice; baseline change normalises the SOC state and clears a recorded timeline; history shows the disclosure and reopens a saved assessment |
| `share.spec.ts` | the public Live share page replays a saved assessment with the user-recorded notice |

These are browser-level UI tests, not full end-to-end tests against PHP and MySQL. The tests inject a
completed assessment into the in-memory store rather than driving every questionnaire step, and the
API responses are fixtures. Real-server persistence, session ownership, the demonstration preset
library and print/PDF remain covered by the manual deployment acceptance in
`docs/DEPLOYMENT_QUICKRISK_LIVE.md` and `docs/RELEASE_CHECKLIST.md`.

### P4.5 — Correct the Live per-action rate-limit settings shape (discovered in Phase 2)

**Status:** complete (Option A, minimal wrapper). The configured per-action limits now reach
`QkRateLimiter` through its `rateLimit` key. A regression test with a limit of 1 rejects the second
request. The limiter still uses the `auto` backend; when APCu is unavailable and no Live store path
is configured it falls back to process-local memory, which is documented rather than claimed as a
shared persistent limiter.

`qk_live_rate_limit` previously built a flat settings array and passed it to
`QkRateLimiter::assertWithinLimit`, which reads `$config['rateLimit']`. The configured per-action
limits were ignored and the limiter's 30-request default applied to every Live action. Option A wraps
the settings as `['rateLimit' => $settings]`; `tests/live_rate_limit.test.php` uses a limit of 1 on a
unique client and asserts that the second request returns 429. The deployment documentation and the
release checklist are reconciled with the effective limits.

---

## 8. Phase report template

Every phase hand-back should use this structure. It makes review possible without re-reading the
whole diff.

```text
Phase: <1-4>
Scope implemented: <task ids>
Scope deferred: <task ids and why>

Behaviour before -> after:
- <finding id>: <one sentence>

Files changed:
- <path>: <what changed>

Design decisions:
- <decision>: <reason>
- <alternative rejected>: <reason>

Tests added:
- <file>: <what it proves>

Verification:
- php tests/run-tests.php: <passed/failed>
- npm run lint: <passed/failed>
- npm test -- --run: <passed/failed>
- npm run build: <passed/failed, if run>

Manual acceptance:
- <script>: <result>

Residual risk / open gates:
- <item>

git status:
<output>
```

Do not report a phase as complete if any verification command failed. Do not summarise a failure
as a “known limitation” without recording it under residual risk.

## 9. Test map

| Layer | Location | Runs with | Must not need |
| --- | --- | --- | --- |
| Pure TypeScript | `frontend/tests/*.test.ts` | `npm test -- --run` | DOM, network, clock |
| Live store | `frontend/tests/live-store.test.ts` | `npm test -- --run` | network, DOM |
| Browser UI | `frontend/tests/e2e/*.spec.ts` | `npm run test:e2e` | MySQL, a deployed host |
| PHP engine and handlers | `tests/*.test.php` | `php tests/run-tests.php` | MySQL |
| Static policy | `tests/apache_policy.test.php`, `tests/security_headers.test.php`, `tests/zero_retention.test.php` | full PHP suite | network |
| Manual acceptance | the scripts in P1.8 and P3, plus the deployment checklist | human | extra dependencies |

Rules:

- PHP test files return `['name' => callable]`; the runner discovers `tests/*.test.php`.
- Vitest includes `frontend/tests/**/*.test.ts`; the environment is node.
- Never make a test depend on wall-clock time or random ordering.
- Reset zustand state between store tests.
- A test for a rejection must also assert that nothing was stored.

## 10. Verification commands

Run from the repository root unless stated.

```powershell
# 1. PHP suite
php tests/run-tests.php

# 2. Frontend type-check, boundary, storage and licence guards
Set-Location frontend
npm run lint

# 3. Frontend unit tests
npm test -- --run

# 4. Browser-level UI tests (Playwright; install Chromium if no local browser)
npm run test:e2e

# 5. Production build, before handing back a phase
npm run build

# 6. Diff hygiene
Set-Location ..
git --no-pager diff --check
git status --short
```

Optional, only when the model or the independent audit changed:

```powershell
node audit/run-audit.mjs
git restore -- audit/results/reference-audit.json
```

Do **not** run the audit for a logic-only change; it rewrites a generated timestamp.

## 11. Handoff prompts

### Phase 1 prompt

```text
You are implementing Phase 1 of the FairQuickRisk application-logic remediation.

Read completely before editing:
- docs/APPLICATION_LOGIC_REVIEW_A.md
- docs/APPLICATION_LOGIC_REMEDIATION_PLAN.md
- docs/QUICKRISK_DECISION_LAB.md
- docs/QUICKRISK_LIVE.md
- docs/SECURITY_AND_PRIVACY.md
- docs/ZERO_RETENTION_PROOF.md

Implement only P1.1 through P1.9.

Non-negotiable:
- no numerical methodology change;
- no new dependency;
- no browser storage;
- do not weaken server validation;
- keep the PHP architecture test passing;
- follow the existing TypeScript, React, PHP and test conventions.

Start by:
1. running git status;
2. inspecting every file named in the tasks;
3. writing down the current behaviour for each Phase 1 finding;
4. presenting the files you will change and the snapshot/report-basis design.

Then implement, add the tests listed in P1.8, and run:
- php tests/run-tests.php
- cd frontend; npm run lint
- cd frontend; npm test -- --run

Finish with:
- files changed;
- design decisions;
- tests added and their results;
- manual acceptance results;
- anything deferred;
- git status.

Do not start Phase 2.
```

### Phase 2 prompt

```text
Implement Phase 2 of docs/APPLICATION_LOGIC_REMEDIATION_PLAN.md.

Read P2.1 through P2.6 and the ALR-06 and ALR-13 findings first.

P2.1 (Decision Lab save consistency) and P2.4 (archived shares) are mandatory and
self-contained.

P2.2 (compute receipt) was rejected by the owner on 2026-11-22. Do not add a
receipt key, receipt endpoint field or receipt code; implement P2.1 and record the
accepted residual risk in the security documentation.

P2.3 is resolved by **Option C**. Do not add a PHP Live verifier or modify
`tests/live_architecture.test.php`; the saved/shared user-recorded labels and the documentation
are the chosen treatment. If no later decision changes this, leave Live calculation behaviour
unchanged.

Add the tampering tests in P2.5 for everything actually implemented.

Run the verification commands in section 10 and report results.
```

### Phase 3 prompt

```text
Implement Phase 3 of docs/APPLICATION_LOGIC_REMEDIATION_PLAN.md.

P3.1 must land before P3.2. Do not expose custom treatments in the UI while their
identity is still derived from the name.

P3.3 is a read-only history: saved Decision Lab records do not contain the QuickRisk
answers and cannot be recomputed. Do not imply otherwise.

Follow the existing Live history screen as the interaction model, and do not add a UI
test dependency.

Run the verification commands and report the manual acceptance results.
```

### Phase 4 prompt

```text
Implement Phase 4 of docs/APPLICATION_LOGIC_REMEDIATION_PLAN.md.

P4.1 and P4.2 are code and tests. P4.3 finishes the server fingerprint if Phase 2 did
not already deliver it. P4.4 was approved on 2026-11-22: `@playwright/test` is a development
dependency and the browser suite runs with `npm run test:e2e`. P4.5 applies the approved Option A
rate-limit wrapper fix. P2.3 is resolved by Option C.

Run the verification commands and report results.
```

## 12. Completion checklist

Phase 1:

- [x] P1.1 canonical analysis identity with tests
- [x] P1.2 immutable snapshot replaces independent result state
- [x] P1.3 report basis uses the exact recommended comparison
- [x] P1.4 four recommendation states; no false “none satisfies”
- [x] P1.5 Live scenario identity normalised in every replacement path
- [x] P1.6 timeline cleared on baseline change with an explanation
- [x] P1.7 preset titles do not survive a baseline change
- [x] P1.8 unit tests and manual acceptance recorded
- [x] P1.9 documentation updated
- [x] PHP suite, frontend lint, frontend tests and build pass
- [x] No numerical output change; no new dependency; git diff reviewed

Phase 1 verification (22 November 2026): 117 frontend tests in 12 files pass; 146 PHP tests pass;
`npm run lint` and `npm run build` pass. Browser-level manual acceptance could not be executed in
this non-browser environment; the equivalent domain and store acceptance is covered by the new
tests, and the P1.8 manual script remains the reviewer's check.

Phase 2:

- [x] P2.1 Decision Lab save consistency validation with rejection tests
- [x] P2.2 compute receipt — **rejected by the owner on 2026-11-22**: no `decision.receiptKeys` map or receipt code; P2.1 consistency validation is the accepted control and the residual self-consistent-fabrication risk is documented
- [x] P2.3 Live integrity decision — **Option C** selected by the owner on 2026-11-22: saved/shared Live values are explicitly labelled user-recorded and not independently verified; Live server behaviour unchanged
- [x] P2.4 archived analyses cannot be shared
- [x] P2.5 tampering tests fail closed and assert nothing was stored (P2.1 and P2.4 scope)
- [x] P2.6 integrity boundary documented, including residual risk and the open gates
- [x] Full verification passes

Phase 2 verification: 156 PHP tests pass, including 10 new save/share tests. P2.1 remains the
accepted Decision Lab save control. P2.2 was rejected by the owner, with the residual risk
documented; P2.3 is resolved by Option C, with no receipt key or Live verifier introduced.

P2.3 verification (2026-11-22): saved/shared Live values are labelled user-recorded in the history,
executive report and shared view; the shared view states that the server does not independently
verify them and that a link is not proof of calculation. No Live server calculation behaviour was
changed.

Phase 3:

- [x] P3.1 definition-based custom treatment identity
- [x] P3.2 custom treatments usable end to end
- [x] P3.3 saved Decision Lab history, read-only and clearly labelled
- [x] P3.4 saved/edited/shared status is honest and Share is gated
- [x] P3.5 documentation and changelog updated
- [x] Full verification passes

Phase 3 verification: 167 PHP tests pass, including 11 custom-identity, lifecycle and list-scoping
tests, and 137 frontend tests pass, including selection-adapter, stored-report, Live-fingerprint and
store-transition tests. P2.2 is decided (rejected); P2.3 is resolved by Option C.

Phase 4:

- [x] P4.1 single-flight session with one retry
- [x] P4.2 probability appetite requires a threshold, in server and UI
- [x] P4.3 server fingerprint on every compute action
- [x] P4.4 browser automation — Playwright development dependency approved; 8 browser-level UI tests added under `frontend/tests/e2e` (`npm run test:e2e`)
- [x] P4.5 Live per-action rate-limit settings shape — Option A wrapper fix, regression test, and documentation updated
- [x] Full verification passes

Phase 4 verification: 174 PHP tests pass, including the probability-threshold, four-action
fingerprint and rate-limit settings-shape tests; 152 frontend unit tests pass, including
single-flight, CSRF retry, appetite, snapshot-fingerprint and user-recorded-disclosure tests; and 8
Playwright browser tests pass with `npm run test:e2e`. P4.4/P4.5 are complete.














