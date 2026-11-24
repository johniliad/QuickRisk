# Application logic review — 22 November 2026

> **Historical snapshot.** This review was performed against application `1.3.3` /
> `FAIR-QK-1.3`. It remains a record of that review, not a description of the active 2.0 model.
> See [`MODEL_DOCUMENTATION_FAIR-QK-2.0.md`](MODEL_DOCUMENTATION_FAIR-QK-2.0.md) for current behaviour.


**Review type:** application logic and state-coherence review of the whole product.
**Reviewed release:** application `1.3.3` · model `FAIR-QK-1.3` · model/schema `1.3.0` ·
calibration `CAL-1.3` · methodology `METH-1.3` · disclaimer `DISC-1.2`.
**Product surfaces:** base assessment, QuickRisk Live `1.0`, Decision Lab `1.0`, Board Risk
Pack `1.0`.
**Outcome:** confirmed correctness defects in Decision Lab report composition, input staleness,
Live scenario identity, comparison-only reporting and custom-treatment identity; one saved-result
integrity weakness; and a set of incomplete or fragile workflows.

> This document records findings only. It changes no behaviour. The implementation
> instructions are in [`APPLICATION_LOGIC_REMEDIATION_PLAN.md`](APPLICATION_LOGIC_REMEDIATION_PLAN.md).

---

## 1. Scope and method

### 1.1 Code reviewed

| Area | Paths |
| --- | --- |
| Calculation engine and model | `server/includes/fair_engine.php`, `distributions.php`, `modifiers.php`, `confidence.php`, `percentile.php`, `fairquickmodel/*.json` |
| Assessment API | `server/api/calculate.php`, `server/includes/calculate_handler.php`, `validation.php`, `http.php`, `csrf.php`, `rate_limit.php`, `logging.php`, `security_headers.php` |
| QuickRisk Live | `server/includes/live/*`, `server/live/api/*`, `frontend/src/live/**` |
| Decision Lab | `server/includes/decision/*`, `server/live/api/decision-*.php`, `frontend/src/decision/**` |
| Persistence | `database/001_initial_schema.sql` … `005_decision_lab.sql` |
| Independent audit | `audit/reference-model.mjs`, `audit/run-audit.mjs` |
| Tests | `tests/*.test.php`, `frontend/tests/*.test.ts` |
| Documentation | root `README.md`, `CHANGELOG.md`, `SECURITY.md`, and every file in `docs/` |

### 1.2 Method

Each request path was traced from UI state through the client API, the server handler, the
calculation, persistence and the report projection. The documentation was then compared with
the implementation. The review specifically looked for:

1. state that is displayed, saved or shared but no longer describes the inputs that produced it;
2. invariants that one layer enforces and another layer can violate;
3. values cached in the browser that a server is expected to trust;
4. branches that no test exercises;
5. places where the documentation promises behaviour the code does not deliver.

### 1.3 Verification run

| Command | Result |
| --- | --- |
| `php tests/run-tests.php` | 146 passed, 0 failed |
| `npm run lint` (in `frontend`) | type-check, model-boundary, browser-storage and licence checks passed |
| `npm test -- --run` (in `frontend`) | 70 passed, 0 failed (7 files) |
| `node audit/run-audit.mjs` | completed; refreshes the generated audit artefact |

The suites are green. The findings below are therefore **not** test failures; they are
behaviours the current suites do not assert.

### 1.4 Evidence convention

Findings cite the file and the symbol (function, component, interface or constant). Line numbers
are deliberately avoided: they move with every edit. Locate the symbol and read the surrounding
block.

## 2. Findings at a glance

| ID | Finding | Severity | Classification |
| --- | --- | --- | --- |
| ALR-01 | Decision Lab report and save can combine different analyses | High | Confirmed defect |
| ALR-02 | Decision Lab results survive input changes | High | Confirmed defect |
| ALR-03 | Live baseline and SOC scenario can diverge; valid work cannot be saved | High | Confirmed defect |
| ALR-04 | Live state-replacing actions reintroduce a mismatched scenario id | Medium | Confirmed defect |
| ALR-05 | Live timeline keeps exposures from the previous baseline | Medium | Confirmed defect |
| ALR-06 | Saved and shared results are not bound to a server calculation | High/Medium | Integrity weakness |
| ALR-07 | Custom treatments are implemented in the API but unreachable in the UI | Medium | Incomplete functionality |
| ALR-08 | Saved Decision Lab analyses have no reopen, list or archive workflow | Medium | Incomplete functionality |
| ALR-09 | Anonymous session initialisation can race and rotate the CSRF token | Medium/Low | Reliability risk |
| ALR-10 | A probability appetite criterion can be silently dropped | Low | Validation/UX gap |
| ALR-11 | Compute responses carry no analysis-input identity | Medium | Architectural weakness |
| ALR-12 | Saved and share identifiers are not bound to a revision | Low/Medium | Coherence gap |
| ALR-13 | A share link can be created for an archived decision and then 404 | Low | Logic inconsistency |
| ALR-14 | Custom treatment identity is derived from the name, so same-named definitions collide | Medium | Confirmed defect |
| ALR-15 | A comparison-only report asserts that no portfolio satisfies appetite | Medium/High | Confirmed defect |

Severity reflects the consequence for a decision-maker acting on saved or shared output, not
the amount of code involved.

---

## 3. Findings in detail

### ALR-01 — Decision Lab can report one portfolio while displaying another's numbers

**Severity:** High · **Surface:** Decision Lab and Board Risk Pack

**Phase 1 status:** addressed by P1.2 and P1.3 (one snapshot, one report basis).

#### Observation

`DecisionLabView` keeps the current treatment selection, the last comparison, the last
portfolio search and the last sensitivity result as independent state. The Board Risk Pack and
the save payload combine them without proving they describe the same analysis.

A comparison is computed for the selected treatments (`runComparison`). A portfolio search is
computed separately (`runPortfolios`). The optimizer may recommend a subset of the candidates.
`buildBoardReport` then receives:

- `baseline`, `treated`, `appetite`, `cost`, `delta`, `riskReductionEfficiency` and
  `implementationDelayDays` from the **comparison**;
- `recommended` from the **portfolio search**;
- `treatments` from the **current UI selection**.

Nothing requires those three sources to agree.

#### Reproduction

1. Select treatments A, B and C.
2. Run **Compare selected treatments**.
3. Run **Evaluate portfolios**.
4. Assume the optimizer recommends B alone, or B + C.
5. Generate, print, save or share the Board Risk Pack.

The narrative states that the recommended portfolio is the lowest-cost combination that
satisfies appetite, while the figures and treatment rows belong to A + B + C.

#### Why it is wrong

The Board Risk Pack is an executive document. Page 4 is explicitly about the recommended
portfolio. Presenting another portfolio's exposure reduction, cost, delay and efficiency under
that heading is a misstatement, even when every individual number is a correct output of some
calculation.

The mismatch is persisted: `qk_decision_save` stores `result` (the comparison) and
`recommended` (the portfolio row) as independent JSON documents. `SharedBoardPack` then
reconstructs the report from both, so the public link reproduces the mismatch faithfully.

#### Evidence

- `frontend/src/decision/DecisionLabView.tsx` — `runComparison`, `runPortfolios`, `saveDecision`,
  `boardReport`.
- `frontend/src/decision/board/boardModel.ts` — `BoardModelInput`, `buildBoardReport`
  (page 4 uses `input.treated` and `input.initialInvestment` beside `input.recommended`).
- `frontend/src/decision/board/SharedBoardPack.tsx` — the report memo reads
  `selection.comparison` for figures and `recommendedPortfolio` for the recommendation.
- `server/includes/decision/handlers.php` — `qk_decision_save`.
- `frontend/tests/decision-board.test.ts` builds a coherent `BoardModelInput` by hand, so it
  cannot detect a caller that supplies a mixed one.

#### What is not wrong

The Decision Lab engine (`qk_decision_compare`, `qk_decision_portfolio_search`) is internally
consistent. The comparison response already contains the authoritative treatment definitions
(`comparison.treatments`) and provenance. The defect is in composing responses, not in
computing them.

### ALR-02 — Decision Lab results survive the inputs that produced them

**Severity:** High · **Surface:** Decision Lab

**Phase 1 status:** addressed by P1.1–P1.3 (input identity, snapshot and invalidation).

#### Observation

The component holds `comparison`, `portfolios`, `sensitivity`, `publicId` and `shareUrl` in
independent state. Nothing clears them when the inputs change:

- `toggleTreatment` only edits `selectedIds`;
- the appetite `onChange` handlers only edit `appetite`;
- changing the assessment answers does not reach this component at all.

The compute body is built at call time from the current answers and appetite (`computeBody`),
but the displayed and saved results are whatever the last successful request returned.

#### Reproduction

1. Configure an annual loss limit of 1,000,000 and run a comparison.
2. Change the limit to 250,000.
3. The comparison panel still shows the 1,000,000 result and its “within appetite” statement.
4. Save the analysis.

The persisted record contains the 250,000 appetite object beside a result evaluated against
1,000,000. The report shows the old appetite verdict.

The same happens after changing treatment selection: the report title and treatment rows come
from `selectedTreatments`, while the figures come from the previous comparison.

#### Why it is wrong

The screen presents the result as current. The saved record is worse: it records two different
analyses in one row, and the shared report replays both.

#### Evidence

- `frontend/src/decision/DecisionLabView.tsx` — state declarations, `toggleTreatment`, appetite
  inputs, `computeBody`, `saveDecision`, `boardReport`.
- `frontend/src/decision/board/SharedBoardPack.tsx` — replays the stored mixture.
- No test exercises “compute, change an input, observe the result”.

#### Relationship to ALR-01

ALR-01 is about combining *different* compute responses. ALR-02 is about keeping *any* response
after its inputs changed. Fixing only ALR-01 would still allow a stale but internally consistent
comparison to be saved beside a newer appetite.

---

### ALR-03 — QuickRisk Live can hold two different scenarios for one simulation

**Severity:** High · **Surface:** QuickRisk Live

**Phase 1 status:** addressed by P1.5 (the baseline owns the SOC scenario identity).

#### Observation

Live keeps the QuickRisk baseline in `baseline.scenarioCode` and the SOC state’s scenario in
`soc.scenarioId`. The numerical engine does not read `soc.scenarioId`, so a mismatch is
invisible on screen.

`setBaseline` replaces `baseline` and clears the saved id and share URL. It does not update
`soc.scenarioId`. The initial SOC state always uses the first scenario (`DEFAULT_SOC_STATE`).

`buildPayload` uses the baseline code as the top-level `scenarioId` and sends `inputState:
state.soc` unchanged. The server requires equality in
`qk_live_validate_assessment_payload`.

#### Reproduction A — change the baseline

1. Open Live with the default SOC state.
2. Select a different QuickRisk baseline.
3. Record a timeline step and calculate.
4. Save.

The request carries the new scenario at the top level and the original scenario inside the
state. The server returns `422` with “The SOC state scenario does not match the payload
scenario.” The UI has shown a valid-looking result throughout.

#### Reproduction B — apply a preset

1. Select a baseline other than the preset’s own scenario.
2. Apply a seeded demonstration preset.
3. Save.

`applyPreset` replaces the SOC state with `preset.defaultState`, whose embedded scenario id
belongs to the preset. The top-level id remains the baseline. The same `422` results.

#### Why it is wrong

The application permits a state that its own server rejects, with no warning before the user has
done the work. The two identifiers represent one fact and are allowed to disagree.

#### Evidence

- `frontend/src/live/state/liveStore.ts` — `setBaseline`, `applyPreset`, `buildPayload`.
- `frontend/src/live/domain/socTypes.ts` — `DEFAULT_SOC_STATE`, `SOCInputState`.
- `frontend/src/live/LiveSimulatorView.tsx` — the baseline selector.
- `server/includes/live/validation.php` — `qk_live_validate_assessment_payload`.

#### What is not wrong

The server check is correct and must stay. The client must stop producing the mismatch.

### ALR-04 — Live state-replacing actions recreate the scenario mismatch

**Severity:** Medium · **Surface:** QuickRisk Live

**Phase 1 status:** addressed by P1.5 (`resetSoc`, presets, edits and ingest normalise or refuse).

#### Observation

Fixing `setBaseline` alone is insufficient. Three other paths replace the SOC state without
consulting the active baseline:

1. `resetSoc` restores `DEFAULT_SOC_STATE`, whose scenario id is the first scenario;
2. `applyPreset` installs `preset.defaultState` and timeline states with the preset’s ids;
3. `ingestDetail` installs `detail.inputState` beside `detail.scenarioId`. The server guarantees
   they match today, but the client does not fail closed if they do not, and it hard-codes the
   currency symbol instead of carrying the saved baseline’s currency.

#### Reproduction

1. Select a non-default baseline.
2. Press Reset.
3. Record a step and save.

The reset silently reintroduces the original scenario id, so the save is rejected. This is the
same user-visible failure as ALR-03 through a different route.

#### Why it is wrong

Every action that replaces the SOC state is a potential identity change. One normalisation
function must be the only way a SOC state enters the store.

#### Evidence

- `frontend/src/live/state/liveStore.ts` — `resetSoc`, `applyPreset`, `ingestDetail`.
- `frontend/src/live/domain/socTypes.ts` — `DEFAULT_SOC_STATE`.

---

### ALR-05 — The Live timeline keeps exposures calculated from the previous baseline

**Severity:** Medium · **Surface:** QuickRisk Live, saved timeline and shared assessment

**Phase 1 status:** addressed by P1.6 (a baseline change clears the timeline with an explanation).

#### Observation

A timeline entry stores both a state and a full result, including `baselineEal` and
`realTimeEal`. The real-time exposure is `baselineEal × socMultiplier`, so it depends on the
selected baseline.

Changing the baseline leaves existing entries untouched. Their stored exposures continue to
reflect the old baseline while the current panel reflects the new one. Preset timelines are
calculated at apply time against whichever baseline was active then, and are carried unchanged
by later baseline changes.

#### Reproduction

1. Select a baseline of 100,000 and record a step whose multiplier is 2.00. The entry stores a
   real-time EAL of 200,000.
2. Change the baseline to 500,000. The current panel shows the same state at 1,000,000.
3. Save.

The saved timeline contains 200,000 for that state; the saved current result contains 1,000,000
for an equivalent state. The timeline is presented as a record of one simulation.

#### Why it is wrong

The timeline is persisted and included in the read-only share. It records exposures, not just
SOC observations. An exposure computed from a baseline that no longer applies is a stale number
presented as history.

#### Evidence

- `frontend/src/live/domain/socTypes.ts` — `TimelineEntry`, `StoredRiskResult`.
- `frontend/src/live/state/liveStore.ts` — `setBaseline`, `applyPreset`, `recordEvent`,
  `buildPayload`.
- `frontend/src/live/engine/socRiskEngine.ts` — `calculateRealTimeRisk`, `roundMoney`.
- `server/includes/live/validation.php` — `qk_live_validate_timeline`.

---

### ALR-06 — Saved and shared results are not bound to a server calculation

**Severity:** High/Medium · **Surface:** QuickRisk Live and Decision Lab persistence

**Phase 2 status:** save-boundary consistency validation added by P2.1. **P2.2 was rejected by the
owner on 2026-11-22**: no compute receipt or receipt key was added, and the self-consistent
fabrication risk is accepted and documented. P2.3 was resolved by the owner on 2026-11-22 with
**Option C**: live saved/shared values are explicitly labelled user-recorded and not independently
verified; no verifier was added.

#### Observation

Both products accept a result object from the browser at save time and store it after range
checks. Neither proves that the stored numbers follow from the stated inputs.

**QuickRisk Live.** The deterministic engine exists only in TypeScript. The PHP handler
validates types, ranges, band membership, baseline equality, scenario equality and methodology
equality. It does not verify the formula, nor each timeline state/result pair.

**Decision Lab.** The compute endpoint calculates on the server, but the save request sends the
result back. `qk_decision_save` extracts a handful of bounded fields and stores the supplied
JSON. It does not verify any of the following:

- `delta.expectedAnnualLoss = baseline − treated`;
- `delta.reductionShare` against baseline and treated;
- `delta.p90` against both summaries;
- `cost.initialInvestment` and `annualOperatingCost` against the stored treatments;
- `cost.implementationDelayDays` against the maximum treatment delay;
- the appetite verdict against the appetite criteria and the summaries;
- the recommended portfolio belongs to the stored portfolio search;
- the recommended treatment ids match the stored treatment definitions;
- the recommended portfolio's metrics match the report metrics;
- the seed and iteration count agree with the result provenance;
- the board pack version and QuickRisk model identifiers are known versions;
- the appetite object is structurally valid.

`boardPackVersion` is accepted as free text up to 32 characters, and the save iteration ceiling
(50,000) is higher than the compute ceiling (10,000), so a record can claim a run the compute
endpoint would refuse.

#### Reproduction

1. Open browser developer tools on the Live simulator.
2. Save once and capture the request body.
3. Change `socMultiplier` to its minimum and `realTimeEal` accordingly, keeping every value
   inside the allowed ranges.
4. Replay the request.
5. The assessment is stored and can be shared.

Every individual value passes validation; the combination is impossible. The same technique
applies to a Decision Lab save, including a mixed comparison/portfolio pair.

#### Why it is wrong

The shared views are read-only and authenticated only by an opaque link. A reader has no way to
distinguish a result produced by the methodology from a value asserted by the session owner.
Public reports currently carry unverified provenance.

#### What this is not

It is not a cross-user access-control failure. Session ownership, CSRF, same-origin checks and
token hashing work. The owner is attacking their own record; the damage is to the credibility of
what the application later presents as a calculated result.

#### Evidence

- `server/includes/live/validation.php` — `qk_live_validate_risk_result`,
  `qk_live_validate_assessment_payload`.
- `server/includes/decision/handlers.php` — `qk_decision_save`.
- `frontend/src/live/state/liveStore.ts` — `buildPayload`.
- `frontend/src/decision/DecisionLabView.tsx` — `saveDecision`.
- `tests/live_api.test.php` asserts that supplied values are stored unchanged.
- `tests/decision_lab.test.php` tests the engine, not the save boundary.

#### Options (in preference order)

1. **Server-issued compute receipt.** Compute returns a signed or opaque receipt binding the
   canonical inputs, the result hash and the methodology version. Save requires the receipt.
2. **Recompute at save.** Re-run the deterministic calculation from inputs and compare. Correct,
   but adds compute cost and a second implementation surface for Live.
3. **Structured verification.** For Live, implement the formula in a PHP verifier with shared
   mandatory vectors. For Decision Lab, verify every cross-field relationship and the
   recommendation membership.

Option 1 protects both products with one mechanism without duplicating methodology code.

**Decision (2026-11-22):** Option 1 was rejected for Decision Lab (P2.2) because the application's
user is seeking their own decision-support results; P2.1 consistency validation is the accepted
control and the residual risk is documented. For QuickRisk Live, P2.3 selected Option C:
saved/shared values are explicitly labelled user-recorded and not independently verified.

### ALR-07 — Custom treatments are implemented in the API but unreachable in the UI

**Severity:** Medium · **Surface:** Decision Lab

#### Observation

The server supports listing, creating and deleting session-owned custom treatments, and the
compute endpoint accepts a complete custom definition. The client exposes
`createCustomTreatment` and `deleteCustomTreatment`.

`DecisionLabView` renders only `catalogue.curated`. It never lists, selects, creates or deletes a
custom treatment. The only use of the custom collection is a count in a sentence:

> “{n} saved user-defined treatment(s)”

The screen also states that “user-defined treatments are labeled as such”, but no user-defined
treatment can appear.

#### Reproduction

1. Create a custom treatment through `POST /live/api/decision-treatments.php`.
2. Reload Decision Lab.
3. The count increases; the treatment cannot be selected or used.

#### Why it is wrong

The product promises a capability in the interface text and in the methodology documentation
that the interface does not provide. The unused client methods suggest the gap is accidental.

#### Evidence

- `frontend/src/decision/DecisionLabView.tsx` — `curated`, `selectedTreatments`, the catalogue
  block.
- `frontend/src/decision/api/decisionClient.ts` — `createCustomTreatment`,
  `deleteCustomTreatment`.
- `server/includes/decision/handlers.php` — `qk_decision_treatment_catalogue`,
  `qk_decision_custom_create`.
- `docs/QUICKRISK_DECISION_LAB.md` — custom treatment rules.

---

### ALR-08 — Saved Decision Lab analyses have no reopen, list or archive workflow

**Severity:** Medium · **Surface:** Decision Lab

#### Observation

The server and client support listing, reading, archiving, sharing and revoking a saved
analysis. The main screen supports only save, share the just-saved analysis, and revoke it.

There is no list of previous analyses, no open action, no archive action and no way to share an
older record. `decisionApi.list`, `decisionApi.get`, `decisionApi.archive` and
`SavedDecisionSummary` exist without a screen that uses them.

#### Reproduction

1. Save two analyses.
2. Navigate away.
3. Return to Decision Lab.

The previous analyses are not reachable. The only share control refers to `publicId` held in
component memory.

#### Why it is wrong

Persistence exists but delivers little user value, and reopening is where the ALR-01/ALR-02
defects would otherwise resurface silently. A history view is also the natural place to show
which snapshot produced a report.

#### Evidence

- `frontend/src/decision/api/decisionClient.ts` — `list`, `get`, `archive`,
  `SavedDecisionSummary`.
- `server/includes/decision/handlers.php` — `qk_decision_list`, `qk_decision_get`,
  `qk_decision_archive`.
- `frontend/src/live/LiveHistoryView.tsx` — the equivalent Live workflow that Decision Lab
  lacks.

---

### ALR-09 — Anonymous session initialisation can race and rotate the CSRF token

**Severity:** Medium/Low · **Surface:** QuickRisk Live and Decision Lab session handling

**Phase 4 status:** addressed by P4.1 (single-flight session and one CSRF retry).

#### Observation

`initSession` returns early only when the session is already `ready` with a token. If two callers
arrive while the status is `loading`, both start a session request.

The server rotates the CSRF token whenever an existing session is reused. Two overlapping
requests can therefore receive different tokens, and the token that ends up in the store depends
on completion order.

#### Reproduction

1. Open Decision Lab with a slow network profile.
2. Trigger two actions that both call `initSession` (for example, the catalogue load and a
   save).
3. Observe that one request can fail with a CSRF error even though a valid session exists.

The exact timing is environment-dependent, but the duplicate-request path is unconditional.

#### Why it is wrong

The token is a shared mutable credential with no single-flight guarantee. This is a reliability
defect that appears as an intermittent security error.

#### Evidence

- `frontend/src/live/state/liveStore.ts` — `initSession`.
- `server/includes/live/handlers.php` — `qk_live_handle_session` (token rotation).
- `frontend/src/decision/DecisionLabView.tsx` — session use during catalogue load and save.

#### Recommended direction

Single-flight the request with a module-level promise, and retry once on an explicit invalid-CSRF
response by refreshing the session. Detail is in P4.1.

---

### ALR-10 — A probability appetite criterion can be silently dropped

**Severity:** Low · **Surface:** Decision Lab appetite and portfolio search

**Phase 4 status:** addressed by P4.2 (server rejects an unthresholded probability; UI disables and clears it).

#### Observation

The interface asks for a “maximum acceptable likelihood of exceeding the annual loss limit”.
The server's `qk_decision_appetite_criteria` only evaluates that criterion when it can resolve a
threshold: the annual loss limit, or an explicit `exceedanceThreshold`.

The UI does not expose `exceedanceThreshold`. If a user enters a probability but leaves the
annual loss limit blank, the server accepts the probability value and then omits the criterion.
The analysis proceeds as if it had never been configured.

#### Reproduction

1. Leave the annual loss limit blank.
2. Enter 0.25 as the maximum acceptable probability.
3. Run a comparison.

No exceedance criterion is evaluated. The interface does not warn.

#### Why it is wrong

A configured-looking control has no effect. The user cannot tell whether the portfolio satisfied
the probability limit because the limit was never tested.

#### Evidence

- `frontend/src/decision/DecisionLabView.tsx` — appetite inputs (`MoneyInput` for the probability).
- `server/includes/decision/decision_engine.php` — `qk_decision_appetite_criteria`.
- `server/includes/decision/validation.php` — `qk_decision_appetite`.

#### Recommended direction

Disable the probability field until an annual loss limit exists, explain why, and add a server
error when a probability is supplied without any resolvable threshold. Prefer disabling over
inventing a default threshold.

---

### ALR-11 — Compute responses carry no analysis-input identity

**Severity:** Medium · **Surface:** Decision Lab API and client

**Phase 1 status:** client-side identity added by P1.1.
**Phase 4 status:** server input fingerprint added by P4.3; responses without it are refused by the snapshot layer.

#### Observation

`provenance` carries the model versions, the seed, the iteration count and a timestamp. It does
not carry an identity of the complete input set: answers, treatment definitions and versions,
appetite, constraints and iteration count combined.

The client therefore has no way to prove that two responses belong to the same analysis. ALR-01
and ALR-02 are symptoms of that missing identity.

#### Reproduction

1. Run a comparison.
2. Run a portfolio search.
3. Change the assessment answers in another tab or by returning to the questionnaire.
4. Both responses remain structurally combinable; nothing in either payload reveals that the
   inputs differ.

#### Why it is wrong

The system relies on component discipline rather than data. Any future screen that combines two
responses inherits the defect.

#### Evidence

- `frontend/src/decision/domain/decisionTypes.ts` — `DecisionProvenance`.
- `frontend/src/decision/api/decisionClient.ts` — `ComparisonResponse`, `PortfolioResponse`.
- `server/includes/decision/handlers.php` — the `provenance` block in `qk_decision_compute`.

#### Recommended direction

Phase 1 adds a client-side canonical key, which is sufficient to prevent combining mismatched
responses in this release. Phase 2 adds a server-computed input fingerprint to `provenance` and
requires save to verify it. Detail is in P1.1, P1.3 and P2.1.

---

### ALR-12 — Saved and share identifiers are not bound to a revision

**Severity:** Low/Medium · **Surface:** QuickRisk Live and Decision Lab

**Phase 1 status:** Decision Lab clears saved/share identifiers on any input change (P1.2); the Live dirty-state indicator remains P3.4.

#### Observation

**Decision Lab.** After a successful save, `publicId` and `shareUrl` stay in state while the user
continues to edit treatments or appetite. The Share control still refers to the older record,
while the screen shows the newer inputs.

**QuickRisk Live.** `setBaseline` clears `currentPublicId` and `shareUrl`, but editing SOC values
does not. The Update workflow is intentional, yet nothing on screen distinguishes “saved
snapshot”, “current edits” and “shared snapshot”.

#### Reproduction

Decision Lab: save, change the appetite, then create a share link. The link describes the old
analysis while the screen describes the new one.

Live: save, change the IOC count, then open the existing share link. The shared page shows the
saved values, not the values on screen; the interface does not say so.

#### Why it is wrong

Two different analyses are presented under one identity. This is the same class of defect as
ALR-02, at the persistence boundary.

#### Evidence

- `frontend/src/decision/DecisionLabView.tsx` — `publicId`, `shareUrl`, `saveDecision`,
  `shareBoardPack`.
- `frontend/src/live/state/liveStore.ts` — `currentPublicId`, `shareUrl`, `updateAssessment`,
  `createShare`.
- `frontend/src/live/components/AssessmentActions.tsx` — save/update/share controls.

#### Recommended direction

For Decision Lab, clear `publicId` and `shareUrl` whenever the analysis key changes; sharing
always follows a save of the current basis. For Live, add an explicit saved/edited indicator and
disable Share until the current edits have been saved. Detail is in P3.4.

---

### ALR-13 — A share link can be created for an archived decision and then 404

**Severity:** Low · **Surface:** Decision Lab sharing

**Phase 2 status:** addressed by P2.4 (archived analyses return 409; old links return 404).

#### Observation

`qk_decision_share_create` verifies ownership with `findDecision`. The repository query does not
filter `status`, so an archived analysis is found. The handler revokes existing links, creates a
new one and returns `201`.

The public read then rejects any record whose status is `archived`, so the freshly issued link
returns `404`.

#### Reproduction

1. Save an analysis and note its `publicId`.
2. Archive it with `DELETE /live/api/decision-assessment.php?id=…`.
3. Call the share endpoint for the same id.

Step 3 returns success; the returned URL never works.

#### Why it is wrong

The application issues a credential for an object that its own read path refuses. This is
confusing and could be used to make a support conversation believe a link exists.

#### Evidence

- `server/includes/decision/handlers.php` — `qk_decision_archive`, `qk_decision_share_create`,
  `qk_decision_shared`.
- `server/includes/decision/repository.php` — `findDecision`, `findActiveShareByHash`.

#### Recommended direction

Reject share creation for an archived record with a clear error (409 or 404), and filter
`status <> 'archived'` in the share lookup as defence in depth. Detail is in P2.4.

---

### ALR-14 — Custom treatment identity is derived from the name, so same-named definitions collide

**Severity:** Medium · **Surface:** Decision Lab treatments and effects

#### Observation

`qk_decision_treatment_selection` builds the identity of a custom treatment from its lower-cased
name:

```php
$id = 'custom-' . substr(hash('sha256', strtolower($name)), 0, 12);
```

`qk_decision_resolved_treatments` de-duplicates selections by `id`, silently skipping a repeated
id. `qk_decision_realise_effects` keys the realised effects by `id`.

Two custom definitions with the same name but different effects, costs or applicability
therefore share an identity. Depending on order, one definition is dropped, or its effect is
overwritten by the other.

#### Reproduction

1. Submit a comparison with two custom treatments, both named “MFA” but with different magnitude
   effects.
2. Both are structurally valid.
3. Only one appears in `treatments`; the realised effect reported for that id belongs to one
   definition, and the other definition's effect is absent.

Names differing only by case (“MFA” and “mfa”) collide by construction.

#### Why it is wrong

The identity of a treatment must describe its definition, not its label. Silent substitution is
especially dangerous in an audit document: the report can state a treatment whose numbers were
produced by a different assumption.

#### Evidence

- `server/includes/decision/validation.php` — `qk_decision_treatment_selection` (id derivation).
- `server/includes/decision/handlers.php` — `qk_decision_resolved_treatments` (`$seen`).
- `server/includes/decision/treatment_adapter.php` — `qk_decision_realise_effects`
  (`$effects[$id]`).

#### Recommended direction

Derive the id from a canonical hash of the complete validated definition (including effects,
costs, delay, applicability, mechanism, evidence and assumptions), and give it a version. When a
user selects a saved custom treatment, submit its stored definition so the id is reproducible; do
not accept a client-supplied id that is not derived from the definition. Reject two selections
with the same resolved id rather than silently dropping one. Detail is in P3.1.

---

### ALR-15 — A comparison-only report asserts that no portfolio satisfies appetite

**Severity:** Medium/High · **Surface:** Board Risk Pack

**Phase 1 status:** addressed by P1.4 (four explicit recommendation states).

#### Observation

`buildBoardReport` treats `recommended === null` as “a portfolio search ran and found nothing”.
It uses that branch for the page-4 narrative, for `decisionRequested`, and for the
recommendation block.

`DecisionLabView` builds the report whenever a comparison exists, even when the portfolio search
has never been run. In that state `recommended` is `null`, so the printed report states:

> “No evaluated portfolio satisfies the selected risk appetite within the stated constraints.”

No portfolio was evaluated. The statement is false.

#### Reproduction

1. Select one or more treatments.
2. Run **Compare selected treatments** only.
3. Print the Board Risk Pack.

Page 4 and the final decision request claim that no evaluated portfolio satisfies appetite.

#### Why it is wrong

This is an unsupported negative conclusion in an executive document. It can steer a reader away
from an option that was never tested.

#### Evidence

- `frontend/src/decision/board/boardModel.ts` — `buildBoardReport`, `pageFour`,
  `decisionRequested`, `recommendation`.
- `frontend/src/decision/DecisionLabView.tsx` — `boardReport` builds a report from
  `comparison` with `recommended` possibly `null`.
- `frontend/tests/decision-board.test.ts` covers `recommended: null` only as “no portfolio
  satisfies”, which entrenches the conflation.

#### Required distinction

The report must distinguish four states:

| State | Meaning | Page 4 and decision request must say |
| --- | --- | --- |
| `recommended` | This report describes the optimizer's recommended portfolio | It is the lowest-cost evaluated combination that satisfies appetite and constraints |
| `none-satisfies` | A search ran and no feasible portfolio met appetite | No evaluated portfolio satisfies appetite |
| `evaluated-other` | A search ran and recommended a portfolio, but this report describes the selected set | The optimizer recommended a different combination; this report does not present it |
| `not-evaluated` | No search ran | No portfolio search has been performed for this analysis |

Only `recommended` may populate the `recommendation` block.

---

## 4. What the review did not find

A findings document is only useful if it is equally clear about what held up.

### 4.1 The core assessment engine

I did not find a confirmed arithmetic or distributional error in the main calculation path.
Specifically, the following behaved consistently with the documentation:

- strict model, schema, disclaimer and answer validation;
- Unknown answers represented as mixtures rather than favourable defaults;
- Unknown answers widening ranges and lowering confidence;
- the widening mean-shift cap that prevents an Unknown answer from inflating the central
  estimate without bound;
- loss-magnitude construction, including primary and secondary components;
- threshold probabilities and exceedance counts derived from the same sample;
- deterministic behaviour for a fixed seed;
- the regression envelope and the independent reference audit.

### 4.2 Documented model limitations that are not code defects

The base assessment reports an annualised exposure approximation, not a fully aggregated
realised annual-loss distribution. The code and the documentation disclose this. The independent
audit shows that event-aggregated percentiles can differ materially, especially for low-frequency
scenarios. That remains a model-design limitation that must stay visible; it is not an
implementation defect.

The release documentation also records that extreme compound results await expert review. That
is a model-validation gap, not a coding error.

### 4.3 Security and privacy controls

The following held up:

- the base assessment's zero-retention behaviour, with no session, cookie, database connection or
  file write on that path;
- no browser storage or persistent results URL for the base assessment;
- CSRF, same-origin, JSON-only and client-header checks on persistent workflows;
- anonymous-session ownership on every read and write;
- prepared statements and scoped queries;
- opaque random tokens, hashed at rest, with expiry, revocation and archival;
- security headers and the single-policy rule;
- server-only model parameters and the frontend boundary check.

ALR-06 is a trust-boundary weakness, not a breakdown of these controls.

### 4.4 Documentation quality

The methodology, Live, Decision Lab, zero-retention and security documents are unusually
specific and, with the exceptions noted against ALR-07 and ALR-15, match the implementation.

---

## 5. Test-coverage gaps exposed by the review

The suites are strong on pure functions, individual handlers and static policies. They do not
exercise multi-step state transitions.

| Gap | Why the current tests miss it |
| --- | --- |
| Decision Lab result composition | `decision-board.test.ts` builds a coherent `BoardModelInput` by hand |
| Input invalidation | No test computes, changes an input, then observes the result |
| Recommended-portfolio reporting | The engine test checks the optimizer, not the report built from it |
| Comparison-only reporting | `recommended: null` is tested only as “none satisfies” |
| Live scenario identity | `live-engine.test.ts` tests numbers; no test drives the store’s scenario transitions |
| Live timeline rebasing | No test changes the baseline after recording an event |
| Save-boundary tampering | `live_api.test.php` asserts supplied values are stored unchanged |
| Decision save consistency | `decision_lab.test.php` tests the engine, not `qk_decision_save` |
| Archived sharing | No Decision Lab equivalent of the Live archive/share test |
| Custom identity collisions | No test submits two same-named custom definitions |

### Recommended test layers

1. **Pure domain tests** — identity, snapshot transitions, basis resolution, Board Pack states,
   scenario normalisation, fingerprints. No dependencies required.
2. **Store tests** — the zustand Live store works in the existing node test environment.
3. **Handler tests** — the in-memory repository already supports sessions, saves and shares.
4. **Browser tests** — implemented under P4.4 with the owner-approved Playwright development
   dependency. The suite runs the real UI under Vite with mocked API responses; real-server
   persistence and deployment behaviour remain manual acceptance checks.

---

## 6. Severity, confidence and residual risk

### 6.1 Why ALR-01 and ALR-03 are High

Both produce a user-visible failure in normal use, without developer tools or unusual timing:

- ALR-01 requires only the documented workflow “compare, then evaluate portfolios”.
- ALR-03 requires only selecting a baseline other than the default, or applying a preset.

Both also reach persisted or shared output. A defect that only affected an on-screen readout
would be Medium; these do not stop at the screen.

### 6.2 Why ALR-06 is High/Medium rather than High

Exploiting it requires the session owner to modify their own request. It does not grant access to
another session and does not bypass CSRF or ownership. The consequence is integrity, not
confidentiality: a shared report can carry numbers the methodology did not produce. For an
executive-facing product that is serious, but it is a different threat class from ALR-01/ALR-03.

### 6.3 Confidence

| Finding | Confidence | Basis |
| --- | --- | --- |
| ALR-01, ALR-02, ALR-15 | High | Direct reading of the state flow and report inputs |
| ALR-03, ALR-04, ALR-05 | High | Direct reading of the store and the server equality check |
| ALR-06 | High that verification is absent; Medium on exploitation impact | Handler and validator inspection |
| ALR-07, ALR-08 | High | The client methods exist; no screen uses them |
| ALR-09 | Medium | The duplicate-request path is unconditional; the failure depends on timing |
| ALR-10 | High | The criteria builder omits the criterion without a threshold |
| ALR-11, ALR-12 | High | Structural; no identity or revision is recorded |
| ALR-13 | High | `findDecision` does not filter status; the read path rejects archived |
| ALR-14 | High | The id is a function of the name; de-duplication is by id |

### 6.4 Residual risks not addressed by this plan

- Model-form and calibration uncertainty, and the annualisation limitation. These are documented
  model properties, not defects to fix here.
- Browser-extension or compromised-endpoint tampering. No web application can prevent a user from
  asserting data from their own browser; integrity controls only bind the server's acceptance.
- Anonymous sessions can be lost when cookies are cleared. That is a product property, not a bug.
- Cross-scenario correlation is not modelled. Documented.

---

## 7. Reproduction index

Use this table to confirm each finding before fixing it. The scripts are deliberately short.

| Finding | Minimum reproduction |
| --- | --- |
| ALR-01 | Compare A+B+C; evaluate portfolios so B is recommended; prepare a report; compare page-4 figures with B's portfolio row |
| ALR-02 | Compare with limit X; change the limit to Y; save; inspect the stored appetite beside the result |
| ALR-03 | Select a non-default baseline; save; observe `422` |
| ALR-04 | Select a non-default baseline; press Reset; save; observe `422` |
| ALR-05 | Record a step at baseline X; change to baseline Y; inspect the timeline entry's `realTimeEal` |
| ALR-06 | Replay a saved Live request with a range-valid but impossible multiplier; then share it |
| ALR-07 | Create a custom treatment via the API; reload the screen; try to select it |
| ALR-08 | Save two analyses; navigate away and back; try to reopen them |
| ALR-09 | Slow the network; trigger catalogue load and save together; observe the CSRF error |
| ALR-10 | Enter a probability with no annual limit; run a comparison; inspect the criteria list |
| ALR-11 | Compare; change answers; run portfolios; observe that the responses expose no common input identity |
| ALR-12 | Save; change appetite; create a share; open it and compare with the screen |
| ALR-13 | Save; archive; create a share; open the returned URL |
| ALR-14 | Submit two same-named custom treatments with different effects; observe one effect |
| ALR-15 | Compare only, then print; confirm the false “no evaluated portfolio satisfies” text |

---

## 8. Review record

**Commands executed for this review**

```text
php tests/run-tests.php
cd frontend; npm run lint
cd frontend; npm test -- --run
node audit/run-audit.mjs
```

**Results:** 146 PHP tests passed, 70 frontend tests passed, lint and guards passed, the audit
completed.

**Repository state:** no application source was modified by the review. The audit command
rewrites only the `generatedAt` field of `audit/results/reference-audit.json`; that generated
change was restored. This document and its remediation plan are the only additions.

**Maintenance:** this file is a dated snapshot. Do not rewrite findings after fixes. Add a
“Resolved in” note with the change reference, and record any new finding as a new dated review.











