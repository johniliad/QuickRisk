# Changelog

All notable changes to FAIR QuickRisk are recorded here. Versions follow the release
identity in `fairquickmodel/manifest.json`. The model, schema, calibration, methodology and
disclaimer versions move with a model release; the application version is tracked separately.
A published version's meaning is never edited in place.

## [Unreleased] — hardening and documentation alignment

### Changed

- The user-facing label for the model's expected loss is now **"indicative annual exposure"**.
  The JSON field `expectedAnnualLoss` and the technical "posterior-predictive annual total" label
  are unchanged; this is a labelling clarification, not a different quantity.
- Decision Lab appetite copy and server messages use "exposure limit" and "indicative-exposure
  criterion" instead of "annual loss limit" / "expected annual-loss criterion".

### Added

- Legacy fallback samples primary and secondary loss magnitude from moment-matched **lognormal**
  distributions (heavy right tails); distribution helpers and tests added
  (`server/includes/distributions.php`, `tests/distributions.test.php`).
- Organisation-profile modifiers are triangular uncertainty ranges sampled per Monte Carlo
  iteration, so calibration uncertainty propagates into the output
  (`server/includes/modifiers.php`, `server/includes/fair_engine.php`, `fairquickmodel/parameters.json`).
- Legacy frequency bands and scenario susceptibility bases are evidence-anchored to DSIT 2025/2026
  and IBM/Ponemon differentials, reproducible with `tools/calibrate-frequency-bands.php`.
- A deploy-time guard refuses a frontend bundle that does not embed the active model
  (`tools/prepare-upload.php`, `tools/deploy.sh`), preventing a VERSION_MISMATCH after a model bump.
- The Live and Decision Lab chunks are preloaded once a result exists, so entering those views no
  longer stalls behind the slow-chunk notice (`frontend/src/app/App.tsx`).
- `tools/render-apache-policy.php` refuses any `--out` path that git tracks (checked with
  `git ls-files`, fail-closed when git cannot answer), so rendering can never write the
  Cloudflare origin secret into a versioned file; `.gitignore` covers the local upload tree and
  `tests/apache_policy.test.php` pins both the refusal and the untracked trees that still render.

### Fixed

- Rebuilt `frontend/dist` so the served bundle embeds FAIR-QK-2.0; the previous stale bundle caused
  "The request does not match the active model version" at calculation time.
- Social and link previews now use a purpose-built 1200×627 (1.91:1) card,
  `frontend/public/images/quickrisk-social-2026-11.jpg`, generated from the landing hero. The
  1920×1280 hero is 3:2, so LinkedIn cropped it to 1.91:1 and lost the logo lockup and the
  "Built by Dr. John ILIADIS" credit line. `og:image`, `og:image:secure_url`,
  `og:image:width`/`og:image:height` and `twitter:image` now describe the social card, the hero
  itself is unchanged for the landing page, and `frontend/tests/public-docs.test.ts` reads the
  JPEG headers so the declared dimensions cannot drift from the bytes served.
- Bumped the offline calibration dependency `pytest` from 9.0.2 to 9.0.3 (PYSEC-2026-1845 /
  CVE-2025-71176, pytest tmpdir handling).
- Restored the fail-closed deny rule in `server/.htaccess`: a rendered-looking 64-character
  token had replaced `RewriteRule ^ - [F,L]`, so the committed gate denied nothing and the
  "origin gate is fail-closed" tests failed. The inert `/server/.htaccess` ignore rules are
  gone (gitignore never applies to a tracked file), and the renderer guard now makes that
  specific accident impossible.

## [FAIR-QK-2.0 / application 1.3.5] — 2026-11-24

### Added

- **A validated Bayesian reference-class posterior now drives the active assessment.** The
  offline package in `fairquickmodel/inference/` is fitted from versioned public evidence and
  contains joint posterior draws, reference-class metadata, assumption-labelled questionnaire
  multipliers, treatment draws and a validation report. `QkInferenceRepository` verifies model,
  calibration, status and SHA-256 integrity, then `QkRiskEngine` selects `QkPosteriorEngine`;
  an unavailable or invalid package falls back explicitly to the legacy engine.
- **Annual totals are simulated rather than approximated by frequency × one severity.** Each
  simulated year draws Poisson material-loss event counts, samples a positive lognormal severity
  for each event and sums event losses. Zero-event years are zero-loss years. Scenario results
  share a posterior draw per year, producing joint portfolio percentiles.
- **One optional organisation evidence field:** `organisationEvidence.materialLossEventCount`
  for the previous 12 months. It is applied as a Poisson likelihood with likelihood-weighted
  joint resampling; effective sample size is returned, and Unknown retains the reference
  posterior. The field is held in memory only and excluded from saved reports.
- **Treatment uncertainty is integrated across simulation iterations.** Decision Lab now draws a
  treatment-effect series and applies frequency effects through common Poisson uniforms and
  severity effects per event. The response carries a paired loss series internally; no effect
  series is sent to the browser or saved.
- **Diagnostics that state their limits:** actual run seed disclosure for replay (never stored),
  mean standard error, threshold exceedance counts, Wilson score intervals and low-count notes.
- **Offline calibration pipeline** in `calibration/` with versioned evidence files, standard
  library fitting, validation reports and deterministic export. DSIT 2025/2026 informs frequency,
  materiality and ordinary severity; IBM 2025 is a large-enterprise severity sensitivity; DBIR
  2026 is composition context only; ECB 2025 rates provide conversion provenance.

### Changed

- Model identity moved to `FAIR-QK-2.0` / `2.0.0`, calibration `CAL-2.0`, methodology `METH-2.0`
  and disclaimer `DISC-2.0`. Historical 1.x records keep their original identifiers.
- Scenario-level simulation uses independent random streams, while parameter draws remain shared;
  changing one scenario's answers no longer changes another scenario's simulation noise.
- Sensitivity is recomputed across posterior draws instead of an analytic legacy-band helper.
- The public model, request schema and result schema accept posterior inputs and explicit
  inference provenance.
- Model documentation and the known-answer baseline are named by model `2.0.0`; the frontend
  package metadata and published error-page footers use application version `1.3.5`.

### Security and privacy

- The browser receives the actual in-memory seed so a run can be replayed; it receives no
  persisted seed and no assessment identifier. Zero-retention remains unchanged.

### Known limitations

- No independent organisation-level prospective loss dataset exists; national evidence is not
  organisation-specific validation.
- Scenario weights and questionnaire multipliers remain elicitation assumptions.
- Shared posterior draws are a structural dependence model, not an estimated correlation matrix.

## [Unreleased]

### Added

- **The eight top-level navigation links are now three workspace tabs, and the landing page opens
  with three ways in.** `Risk Calculator`, `Board Brief` and `Saved Packs` replace `Overview`,
  `Live`, `Decision Lab`, `History`, `Methodology`, `Live methodology`, `Analyst view` and the
  disclaimer link (`WORKSPACE_TABS`, `workspaceTabForView` in
  `frontend/src/content/workspaceNav.ts`). Reference material moved into modals that reuse the
  published business-to-model mapping instead of restating it: `MethodologyModal` is tabbed across
  Baseline FAIR-QK, Live SOC and Decision Lab/FAIR-CAM (`frontend/src/components/layout/ReferenceModals.tsx`),
  data handling reuses the existing lifecycle dialog, and the disclaimer opens in a modal. The
  landing hero now states the value proposition and a one-line trust strip whose three claims open
  their own explanation (`TRUST_STRIP_ITEMS` in `frontend/src/content/dataLifecycle.ts`), followed by
  three entry actions — `Load 60-Second Sample`, `Quick 1-Scenario Check`, `Full 5-Scenario
  Assessment` (`LANDING_ENTRY_ACTIONS` in `frontend/src/content/landingJourney.ts`,
  `frontend/src/components/landing/EntryActions.tsx`). The sample is a complete answer set built
  from the middle option of every question (`frontend/src/content/sampleAssessment.ts`), so it is
  calculated by the same server run as a real assessment; the quick check asks the organisation
  profile and one scenario and submits the rest as `Unknown` (`activeStepsFor`,
  `stepsForScope`). No path acknowledges the disclaimer or calculates on the visitor's behalf: the
  sample lands on the gate, which then offers `Calculate these answers`. Board Brief prints the
  result already in the tab (empty state otherwise) and Saved Packs reuses the unified history.
  The footer gains an understated suite strip placing QuickRisk as stage 3 of the six-stage
  ILIADIS Cyber Intelligence Suite (`frontend/src/content/iliadisSuite.ts`,
  `frontend/src/components/layout/IliadisSuiteFooter.tsx`). Pinned by
  `frontend/tests/workspace-nav.test.ts`, `frontend/tests/sample-assessment.test.ts`, the extended
  landing/journey/data-lifecycle suites and `frontend/tests/e2e/workspace-tabs.spec.ts`.

- **The Results → Live / Results → Decision Lab fork is now drawn, not just described, and it reads
  the same from the landing page to the printed report.** `ForkArms` in
  `frontend/src/components/layout/BranchDivider.tsx` draws a stem, a split bar and two drops that
  land on the exact centre of each lane, sharing one grid template (`FORK_GRID`) with the lane
  cards; the divider between the lanes is a "Not connected" pill with no vertical rule on wide
  screens, because a spine there would imply a join. The landing page's third step is now a fork
  (`LANDING_BRANCHES`, `LANDING_FORK_NOTE` in `frontend/src/content/landingJourney.ts`) rather than
  two bullets, and the actionable Results cards are labelled Branch A / Branch B. Artefacts that
  travel without the diagram — the saved-work list, the Live executive report and the Board Risk
  Pack — carry a one-line `BranchNote` naming their branch (`LIVE_BRANCH_NOTE`,
  `DECISION_BRANCH_NOTE`, `HISTORY_BRANCH_NOTE` in `frontend/src/content/dataLifecycle.ts`). Pinned
  by `frontend/tests/landing-content.test.ts`, `frontend/tests/data-lifecycle.test.ts` and the
  landing case in `frontend/tests/e2e/journey.spec.ts`, and verified visually at 390, 768 and
  1440 px.

- **Each surface now states where its expected annual loss comes from, and the journey is drawn
  as a fork.** Results, QuickRisk Live and Decision Lab all show an expected annual loss, and they
  are three different figures: the portfolio sum of five server-calculated scenarios, one scenario
  copied verbatim into Live and multiplied in the browser, and the same portfolio sum replayed in
  Decision Lab with treatments applied on identical simulated years. A `JourneyMap` on all three
  screens draws Assessment → Results → two independent branches, marks the current surface and
  states that Live never feeds Decision Lab and Decision Lab never reads Live. Every figure carries
  a collapsed `DataProvenance` disclosure
  naming its source, its method (iterations, seed or multiplier) and what it is explicitly *not*
  connected to. The Live screen's two "scenario" concepts are renamed: the dropdown is now
  "Quantitative baseline — which scenario's EAL to use", and the preset panel is the "Synthetic SOC
  timeline library". Copy lives in `frontend/src/content/dataLifecycle.ts`
  (`resultsPortfolioEalProvenance`, `resultsScenarioEalProvenance`, `liveBaselineEalProvenance`,
  `liveOverlayEalProvenance`, `decisionBaselineEalProvenance`, `decisionTreatedEalProvenance`,
  `JOURNEY_NODES`, `JOURNEY_FORK_NOTE`), rendered by
  `frontend/src/components/layout/JourneyMap.tsx` and
  `frontend/src/components/layout/DataProvenance.tsx`, and pinned by
  `frontend/tests/data-lifecycle.test.ts` and three new cases in
  `frontend/tests/e2e/journey.spec.ts`.
- **The landing page states the whole product before the first click.** A three-step map sits
  directly under the hero (Assess, Results, Explore) with each step output and its dependency, and
  three role cards name the artefact the board, the CISO and the risk manager each receive. An
  expandable sample of the dashboard shows scenario exposure and threshold probabilities while
  stating three times that it is illustrative. The copy lives in
  `frontend/src/content/landingJourney.ts` and is pinned by `frontend/tests/landing-content.test.ts`;
  the question count is derived from the model (`frontend/src/components/landing/`,
  `frontend/src/app/LandingView.tsx`).
- **The journey is explained inside the flow, not only in the header.** The questionnaire progress
  indicator marks the end of the organisation profile and the last scenario question
  (`questionnaireMilestone` in `frontend/src/domain/assessment.ts`), the results page states that
  both exploration tools are now unlocked and badges each card, and the stepper locked-state
  tooltips name what completing the assessment unlocks
  (`frontend/src/components/layout/JourneyStepper.tsx`).
- **The three surfaces are one stated journey.** The header shows Assess → Results → Explore, marks
  the current step and keeps QuickRisk Live and Decision Lab unavailable until a baseline exists; a
  persistent status line states what the tab is holding. Live and Decision Lab now explain their
  prerequisite with a guided panel instead of a two-sentence dead end, and the results page presents
  both tools as explicit next steps with a note on what each one carries across
  (`frontend/src/lib/journey.ts`, `frontend/src/components/layout/JourneyStepper.tsx`,
  `frontend/src/components/layout/SessionStatusBar.tsx`,
  `frontend/src/components/layout/GuidedOnboarding.tsx`).
- **Data handling is stated where the decision is made.** A "Where your data goes" dialog lists, per
  surface, what is stored, what deletes it and what can be exported. The questionnaire carries a
  banner, the results page a note, and "Start over" now confirms exactly what will be discarded
  (answers, results, the unsaved Live and Decision Lab state) and what survives in the anonymous
  session. The copy lives in `frontend/src/content/dataLifecycle.ts` and is pinned by
  `frontend/tests/data-lifecycle.test.ts`, so the 30-day session retention and the zero-retention
  questionnaire cannot drift from the implementation.
- **One history destination.** Header "History" now lists both saved surfaces in tabs — Live
  assessments and Decision Lab analyses — instead of Live only
  (`frontend/src/history/UnifiedHistoryView.tsx`).
- **Guided-journey browser coverage.** `frontend/tests/e2e/journey.spec.ts` pins the locked stepper,
  the data dialog, the guided onboarding, the results next-step panel and the start-over
  confirmation against the real application.
- **A view that cannot load now says so.** The results, scenario detail, report, Live,
  Decision Lab and history screens are downloaded on demand. A chunk that failed or
  stalled used to leave the Suspense fallback ("Loading the results view…") on screen with
  no way out, because nothing in the application could report the failure. An error
  boundary now replaces that message with a branded explanation and a Reload control, the
  import is retried once before it gives up, and after eight seconds the fallback itself
  states that the download is taking too long and offers a reload
  (`frontend/src/lib/lazyChunk.ts`, `frontend/src/components/ui/error-boundary.tsx`,
  `frontend/src/components/ui/view-loading-fallback.tsx`).
- **The result chunks are fetched while the calculation runs.** Submitting an assessment
  starts the results download immediately, so the visitor waits once for the simulation
  instead of twice, and a slow download no longer strands the results view after the
  response has already arrived. Browser-level regression coverage drives the real
  questionnaire to the dashboard and blocks the chunk to prove the failure is reported
  (`frontend/tests/e2e/results.spec.ts`).
- **Decision Lab custom treatments are usable end to end.** The treatment step now merges curated
  and session-owned treatments, provides a create form for every validated field, supports deletion
  after confirmation, and lets a recommended-portfolio report include custom treatments. Server
  validation messages are shown verbatim and every custom row stays labelled “User-defined
  treatment”.
- **Saved Decision Lab history.** Owners can list, open, share, revoke and archive their saved
  analyses. The history is a read-only replay of the stored comparison and Board Risk Pack; it does
  not store assessment answers and cannot recompute them.
- **Honest saved state in QuickRisk Live.** A canonical fingerprint over the persisted baseline,
  SOC state, timeline, title and methodology now distinguishes “Not saved”, “Saved” and “Unsaved
  changes”. Share is disabled until the current state has been saved or updated; the app never
  auto-saves before sharing.
- **Reliable anonymous-session initialisation.** Live session reads are single-flight, so two
  concurrent callers share one request instead of rotating the CSRF token against each other. A
  Live write retries once after an explicit CSRF failure and never retries other errors.
- **A probability appetite now requires a loss threshold.** PHP rejects a probability criterion
  without an annual loss limit or explicit `exceedanceThreshold`; the Decision Lab disables the
  probability input until a positive annual limit exists and clears it when that limit is removed.
- **Every Decision Lab compute response carries a server input fingerprint.** A SHA-256 over the
  validated answers, treatments and candidates, appetite, constraints, seed, iterations and
  versions is returned in `provenance.inputFingerprint` for baseline, comparison, portfolio and
  sensitivity actions. The client refuses to attach a snapshot without it, and Analyst Mode shows
  it.
- **Browser-level regression coverage (P4.4).** The owner approved Playwright as a development
  dependency. `npm run test:e2e` runs eight browser-level UI tests against the real React app with
  mocked API responses: Decision Lab compare → portfolio → recommended report → save/share →
  invalidation, compare-only reporting, probability-appetite gating, Live save/edit/update/share,
  baseline/timeline clearing, history disclosure, and the public Live share page. This is not a
  full end-to-end deployment test; real-server persistence, presets and print/PDF remain manual.
- **QuickRisk Live per-action rate limits are applied (P4.5).** The settings array is now wrapped
  under the limiter's `rateLimit` key. A configured limit of 1 rejects the second request in the
  new regression test. The limiter's `auto` backend still falls back to process-local memory when
  APCu is unavailable and no Live store path is configured.

### Fixed

- **The header brand now returns to the application, and a view change starts at the top of the new
  screen.** The logo and wordmark open `https://quickrisk.iliadis.net/` instead of the main site;
  the separate `iliadis.net` link in the utility row is unchanged. Every view change scrolls the
  window to the top, so choosing the sample, the quick check or the full assessment no longer leaves
  the disclaimer gate at the landing page's previous scroll offset (`frontend/src/app/App.tsx`,
  `frontend/src/components/layout/Header.tsx`, pinned by `frontend/tests/e2e/workspace-tabs.spec.ts`).
- **The design-system heading sizes now apply, and the landing hero keeps its whole poster.**
  Tailwind v4 interpreted `text-[var(--text-…)]` as a colour utility, leaving the homepage `<h1>`
  and section headings at the 16px preflight default. Headings now use the theme-derived
  `text-display`, `text-title` and `text-section` utilities, restoring the 48/32px responsive hero
  headline and the intended title hierarchy throughout the application. The concise hero headline is
  "Quantify annual cyber-loss exposure". The "What you will receive" summary spans both columns
  below the copy and poster, keeping the shorter hero balanced; the image retains its natural 3:2
  ratio without `object-cover` cropping (`frontend/src/app/LandingView.tsx`, pinned by
  `frontend/tests/e2e/typography.spec.ts`).
- **Saved state reads the same in QuickRisk Live and Decision Lab.** Switching from Live, where a
  snapshot is stored in the anonymous session, to Decision Lab used to replace “Saved to your
  session” with an absolute “Not saved”, which reads as data loss. Both surfaces now use the same
  labels — “Not saved yet”, “Saved to your session” and “Unsaved changes” — defined once in
  `frontend/src/content/dataLifecycle.ts`. Decision Lab's note states that a snapshot saved in Live
  is separate and unaffected, and Live's status strip now reports unsaved changes since the last
  save instead of claiming that nothing is stored
  (`frontend/tests/data-lifecycle.test.ts`, `frontend/tests/e2e/{live,decision-lab}.spec.ts`).
- **A refused request lands on the branded error page again.** The Cloudflare origin gate
  also applied to Apache's internal `ErrorDocument` subrequest, so a mistyped URL or any
  request refused by the gate was answered with Apache's bare "Additionally, a 403 Forbidden
  error was encountered while trying to use an ErrorDocument to handle the request" page.
  The gate now exempts internal error-document subrequests
  (`RewriteCond %{ENV:REDIRECT_STATUS} ^$`, a value Apache sets itself during the internal
  redirect) while every top-level request without `X-Origin-Secret` is still refused. The
  renderer refuses a policy without the exemption, `tools/preflight.php` reports it on the
  host, and the live header verifier now fails when a missing page does not return a
  branded document (`tests/apache_policy.test.php`, `tools/verify-live-headers.mjs`).
- **The committed gate stub is fail-closed again.** The stub in `server/.htaccess` had been
  weakened to a rule that matched one fixed path, which would have left the origin open if
  the renderer ever failed to run, and it committed a 64-character hex token. It is an
  unconditional deny for top-level requests again, and carries no long token
  (`tests/apache_policy.test.php`).
- **Sensitivity analysis now uses the submitted assessment answers.** The analytic path previously
  looked only for semantic `likelihood`/`impact` keys, while the validated payload uses the model's
  question codes (`S1A`, `S1B`, …). The baseline and every one-at-a-time factor had therefore been
  calculated against Unknown scenario answers. A public-path regression test now maps the model
  codes independently.
- **The documented loss-magnitude clamp is applied to sampled losses.** Primary and secondary
  magnitudes are each clamped to the configured €1,000–€500,000,000 component range in simulation,
  analytic sensitivity and the independent reference model. Previously only the displayed input
  ranges were clamped.
- **A first Live save adopts the persisted decimal precision.** The store ingests the saved
  representation before computing its saved fingerprint, so MySQL's two-decimal baseline can no
  longer make a new save immediately appear dirty and disable Share.
- **Live duplication preserves baseline provenance.** A duplicated assessment retains the source
  model identifier and version.
- **Archived Live records are immutable.** Update, timeline and new-share operations return `409`;
  the public share lookup also excludes archived records.
- **Saved Live timelines are checked for structural identity.** Timeline states must use the
  assessment scenario, and every stored result must use its baseline EAL and methodology version.
- **Fractional Decision Lab thresholds remain distinct.** Threshold keys no longer truncate to an
  integer, which previously let a later fractional appetite threshold overwrite an earlier one.
- **Decision Lab validation errors return the correct API envelope.** Base assessment validation
  now maps to `422` and model failures to `503` instead of a generic `500`.
- **Decision Lab timestamps are normalized to UTC ISO form** when hydrating PDO records.
- **Stale assessment responses are ignored.** Starting a new assessment or discarding one
  invalidates an earlier in-flight calculation, and dependent Live simulation state is cleared
  without losing the anonymous session or history.

### Changed

- **Decision Lab carries the baseline from Results instead of choosing its own modelling basis.**
  The screen now sends the published assessment seed (`20261029`) and the iteration count the results
  response reports (5,000), so the server replays the results page configuration rather than a
  second, differently seeded modelling choice. Because the assessment endpoint seeds each
  calculation randomly, the results figure and the replay are two draws from the same model: they
  agree to within Monte Carlo noise (measured under 0.5% at 5,000 iterations on the reference
  profile). The interface no longer describes the baseline as an independent recalculation. The
  answers are still re-sent, so editing an answer after the results were calculated leaves the
  in-memory Results response stale: the screen compares the returned baseline with that portfolio
  figure, and when the gap exceeds 2% — larger than sampling noise explains — it states that the
  answers changed and asks for the assessment to be recalculated.
  `decisionBaselineEalProvenance` states which of those happened; the Results page Decision Lab
  card, `JOURNEY_NODES` and `JOURNEY_FORK_NOTE` are updated to match
  (`frontend/src/decision/DecisionLabView.tsx`, `frontend/src/content/dataLifecycle.ts`,
  `frontend/src/components/results/ResultsDashboard.tsx`). Pinned by
  `frontend/tests/data-lifecycle.test.ts`, `frontend/tests/e2e/journey.spec.ts` and a new
  invalidation case in `frontend/tests/e2e/decision-lab.spec.ts`.
- **Decision Lab portfolio selection uses expected annual loss only.** The exact treatment
  comparison still evaluates every configured appetite criterion, but portfolio search, labels and
  recommendation use only the annual-loss limit. Joint P90 and exceedance criteria are returned as
  explicitly excluded from portfolio decisions. A portfolio request requires an annual-loss limit.
- **Decision Lab portfolio ranking no longer uses joint P90**: cost, EAL, implementation delay and
  a deterministic portfolio id are the tie-breakers.
- **Decision Lab treatment magnitude factors use the capped expected loss magnitude.** When a
  sampled primary or secondary component can reach the documented cap, `clampWarning` now says that
  applying the treatment as a factor to paired simulated years is an approximation, and the UI and
  Board Pack disclose it.
- **Board Risk Packs include every treatment and every stated assumption.** The portfolio table
  identifies when only the first 12 of a larger evaluated set are shown on screen.
- **Decision Lab responses are runtime-validated**, including the report-basis and
  EAL-only portfolio metadata, rather than only cast to TypeScript types.
- **The Decision Lab input fingerprint includes result-affecting configuration** such as planning
  horizon and same-group overlap coverage.
- **Saved and shared Live/Decision records expose active-share status**, so an existing link can be
  revoked after reopening history even when its raw token cannot be displayed again.
- **Unused Decision Lab configuration was removed** (`portfolioIterations`,
  `highValueReductionShare`). The base assessment now warns before page unload while calculating.

### Security

- **Decision Lab save integrity.** The server now revalidates a saved result before storing it:
  the baseline/residual/delta arithmetic, costs against the server-resolved treatments, appetite
  criteria and pass flags, treatment identities and definitions, portfolio and recommendation
  membership, provenance and versions, and the report basis. A mismatch returns `422` and nothing
  is stored. Archived analyses can no longer be shared, and an old share link stops resolving.
- **Definition-based custom treatment identity.** A custom treatment id is now the SHA-256 of its
  canonical validated definition, with a 16-hex-character `custom-` suffix. Names no longer define
  identity, and two selected treatments that resolve to the same identity return `422` instead of
  being silently merged. Saved analyses keep their stored ids and are replayed, not migrated.
- **QuickRisk Live integrity claim removed.** P2.3 was resolved by the owner with **Option C**:
  saved and shared Live values are explicitly labelled **user-recorded simulation data**, not
  independently verified by the server. The simulator, history, executive report and shared view
  state that a share link is a read-only record, not proof of a server calculation. The client-only
  engine and all Live server calculation behaviour are unchanged; no PHP verifier was added.
- **Decision Lab receipt rejected as unnecessary for the product use.** The owner rejected P2.2 on
  2026-11-22: the application's user is seeking their own decision-support results, so a new
  server-issued receipt secret was judged unnecessary. P2.1 consistency validation remains the
  accepted save control. The residual risk — a self-consistent fabricated result can still be
  saved — is recorded in `docs/SECURITY_AND_PRIVACY.md`; no receipt or integrity claim is active.
- **Live per-action rate limits corrected.** P4.5 passes the configured settings to
  `QkRateLimiter` in the shape it reads. The regression test proves that a limit of 1 rejects the
  second request on the same client and action. The `auto` backend remains process-local when APCu
  is unavailable and no store path is configured; see `requirements/QUICKRISK_LIVE.md` §6.

### Documentation

- **The documentation was audited against the implementation and corrected where it had drifted.**
  `README.md` no longer implies a single entry button or a "History" destination: it names the three
  workspace tabs (Risk Calculator, Board Brief, Saved Packs), the dialog-based reference material and
  the three entry paths (server-calculated sample, one-scenario quick check, full assessment), and its
  repository layout no longer claims that `docs/` holds the proofs and the release checklist. The test
  counts quoted by `docs/DEPLOYMENT_QUICKRISK_LIVE.md` and
  `docs/MODEL_DOCUMENTATION_FAIR-QK-1.3.md` now match the suites (188 PHP tests, 244 frontend unit
  tests), the deployment acceptance step opens Saved Packs rather than "the history view", and
  `SECURITY.md` no longer claims that the on-screen result shows the methodology version (only the
  printable report does). `requirements/DISCLAIMER_INVENTORY.md` records the trust strip, the
  reference dialogs and the fact that the landing headline now comes from
  `frontend/src/content/landingJourney.ts`; `requirements/ILIADIS_INTEGRATION.md` quotes the current
  headline, the real page metadata and the six-stage suite statement the footer renders;
  `requirements/ZERO_RETENTION_PROOF.md` states that the sample and the quick check use the same
  single POST; and `requirements/RELEASE_CHECKLIST.md` records the `WebApplication` JSON-LD that
  exists rather than a `SoftwareApplication` block with a disclaimer property.
- **The operator documents moved from `docs/` to `requirements/`.** The first-time deployment plan,
  the QuickRisk Live and Decision Lab references, the release checklist, the zero-retention proof,
  the 1.1 audit response and the two application-logic review records now live in `requirements/`.
  `docs/` keeps the model documentation, the Live deployment runbook, the security and privacy
  record and its own index. `requirements/` is deliberately outside version control, so those
  documents are held locally and are not part of the published repository; the identity tests read
  them only when the directory is present. Cross-references in `README.md`, this changelog,
  `fairquickmodel/manifest.json`, `tools/deploy.sh`, the documentation index and the PHP tests use
  the new paths.
- `docs/SECURITY_AND_PRIVACY.md`, `requirements/QUICKRISK_DECISION_LAB.md` and `requirements/QUICKRISK_LIVE.md`
  record the save-boundary validation, definition-based custom identity, the read-only history,
  the saved/edited state rules, the Phase 4 session/fingerprint behaviour, the user-recorded Live
  label, the accepted P2.2 receipt risk and the effective per-action rate limits.
- P4.4 browser automation is documented in `requirements/APPLICATION_LOGIC_REMEDIATION_PLAN.md` and
  `requirements/RELEASE_CHECKLIST.md`: it is a UI-level suite with mocked API responses, not a substitute
  for the manual real-server acceptance checks.
- Decision Lab frontend and backend must be deployed together: the save contract requires
  `selection.reportBasis` and `selection.comparison`, so an older client receives `422`.

## [1.3.3] — 2026-11-19

Documentation and Decision Lab hardening release. The application version moves to 1.3.3; the
model, schema, calibration, methodology and disclaimer are unchanged (`FAIR-QK-1.3` / `1.3.0` /
`CAL-1.3` / `METH-1.3` / `DISC-1.2`), and the 1.3.0 version record is left exactly as published.

### Security

Remediation of the passive-scan findings reported against the published site. Each control
lives in the layer that owns it, and each is pinned by a test or by the deployment gate.

- **Cookies**: the only cookie the application sets (the QuickRisk Live/Decision Lab anonymous
  session) is `HttpOnly`, `Secure` and `SameSite=Lax`; `session.cookie_httponly`,
  `session.cookie_secure` and `session.cookie_samesite` are also set in the bootstrap, so a
  session that a future change or the host starts is hardened before its cookie is created.
- **HSTS**: one year with `includeSubDomains` on every response, rendered into the deploy
  policy. `tools/render-apache-policy.php` refuses a beta-gate fragment that restates a
  security header — an appended `Strict-Transport-Security: max-age=0` or
  `X-Frame-Options: SAMEORIGIN` wins over the policy and silently downgrades the site.
- **Content-Security-Policy**: one policy for Apache, for the JSON endpoints
  (`includes/security_headers.php`) and for the development server. `'unsafe-inline'` is
  gone: the inline `<style>` blocks of `methodology.html`, the four branded error pages and
  the holding notice are allowed by their sha256, computed by the renderer from the bytes
  that are being published. `object-src`, `frame-src`, `child-src` and `worker-src` are
  `'none'`; `frame-ancestors`, `form-action` and `base-uri` are stated explicitly.
- **Cross-origin**: every `Access-Control-Allow-*` header is unset in the web-server policy
  and removed by `QkHttp`, so an inherited `Access-Control-Allow-Origin: *` cannot reach a
  response.
- **X-Content-Type-Options**, **X-Frame-Options**, **Referrer-Policy**,
  **Cross-Origin-Opener-Policy**, **Cross-Origin-Resource-Policy**,
  **X-Permitted-Cross-Domain-Policies** and **Permissions-Policy** are set on every
  response, including error documents and JSON replies, and are checked by the renderer.
- **Subresource Integrity**: the build now adds `integrity="sha384-…"` to every emitted
  `<script src>` and `<link rel="stylesheet">`, hashing the files on disk in `writeBundle`.
  The HTML is not minified by any proxy, so the digests stay valid.
- **Redirects**: the application issues none — no `Location` header and no `meta refresh`
  anywhere — so the only 3xx a scanner sees is the host's or the CDN's HTTP-to-HTTPS
  redirect.

### Added

- `tools/verify-live-headers.mjs` checks the headers a browser actually receives (HSTS,
  CSP, framing, CORS, cookie flags, Subresource Integrity, the redirect body size) and
  exits non-zero on a failure, so an edge setting such as HSTS `max-age=0` cannot pass a
  release unnoticed.
- `tests/security_headers.test.php` keeps the policy, the renderer, the build and the
  application honest.
- `SECURITY.md` states how to report a vulnerability privately (GitHub private advisories,
  with the `iliadis.net` contact route as the secondary channel), what is in and out of
  scope, the best-effort response targets, coordinated disclosure, safe harbour, and the
  behaviour that is deliberate rather than defective (zero retention, synthetic SOC data,
  same-origin only, strict policy, server-only calibration).
- The README now opens with **About**, **So what?** (the problem in one sentence, a short
  video demonstration, and what it solves for whom) and **Methodology** (the complete,
  test-pinned description of the questionnaire model, its distributions, modifiers,
  percentiles, confidence scoring, the QuickRisk Live overlay and the Decision Lab rules).
- **Decision Lab compute budget**: because Decision Lab has no accounts, one server-side budget
  now applies to every compute request — 10,000 iterations, 30 candidate treatments and 256
  enumerated portfolios. A request above the iteration or candidate limit is rejected with `422`
  and a message naming the budget; a candidate set that implies more portfolios than the budget
  allows is enumerated deterministically (empty portfolio, then every single treatment, then the
  smallest combinations) so no candidate is silently skipped, and the response sets `truncated`
  with an explanation in `notes`. The effective limits are echoed as
  `provenance.computeBudget`. The persistence endpoints are unaffected.

### Documentation

- `docs/README.md` lists only documentation published in the repository. The superseded 1.0 model
  documentation and the internal site-integration note are no longer linked, and the index states
  that historical model documentation is not included in the public repository.
- `docs/SECURITY_AND_PRIVACY.md` names `docs/DEPLOYMENT_QUICKRISK_LIVE.md` as its deployment
  companion and records the Cloudflare HSTS setting actually served
  (`max-age=31536000; includeSubDomains`, verified 2026-11-19).
- The manifest names the audit response that exists
  (`requirements/AUDIT_RESPONSE_FAIR-QK-1.1.md`) and its change summary states the disclaimer version
  `DISC-1.2`.
- `requirements/RELEASE_CHECKLIST.md` records the Cloudflare HSTS verification and the scheduled
  anonymous-session retention cleanup.

### Fixed

- The committed origin-gate stub in `server/.htaccess` had been replaced by a literal token. It is
  restored to the unconditional deny (`RewriteRule ^ - [F,L]`), so a policy that escapes the render
  pipeline locks the origin instead of leaving it open; `tests/apache_policy.test.php` pins it.
- `tools/render-apache-policy.php --secret-file` read the path as if it were the secret and
  therefore always failed; it now reads the file.
- The beta gate is merged by that renderer instead of `cat`, so a gate carrying its own
  header lines stops the deploy rather than weakening the published policy.

## [1.3.1] — 2026-11-14

Compliance release. The application version moves to 1.3.1; the model, schema, calibration,
methodology and disclaimer are unchanged (`FAIR-QK-1.3` / `1.3.0` / `CAL-1.3` / `METH-1.3` /
`DISC-1.2`), and the 1.3.0 version record is left exactly as published.

### Added

- `NOTICE` is now served with the application at `/NOTICE.txt`, and its text is reproduced at
  the head of `/THIRD-PARTY-NOTICES.txt`, so Apache-2.0 section 4(d) is satisfied for the
  compiled bundle as well as for the source form.
- The application footer and the static fallback link to the Notice.

### Changed

- `tools/prepare-upload.php` and `tools/deploy.sh` verify that `LICENSE.txt`, `NOTICE.txt`,
  `THIRD-PARTY-NOTICES.txt` and the branded error pages are published.
- A test keeps the error-page version line in step with the manifest, so a release cannot
  leave four stale pages behind.

## [1.3.0] — 2026-11-14

**Provisional release.** Model `FAIR-QK-1.3` · schema `1.3.0` · calibration `CAL-1.3` ·
methodology `METH-1.3` · disclaimer `DISC-1.2` · application `1.3.0`.

### Added

- **Questionnaire**: eight organisation-profile questions and two questions for each of five
  scenarios, with a server-side Monte Carlo simulation (5,000 iterations per scenario by
  default) reporting expected annualised exposure, P10/P50/P90, threshold-exceedance
  probabilities, a one-at-a-time sensitivity analysis and an input-confidence indicator.
- **QuickRisk Live**: a deterministic SOC overlay driven by synthetic telemetry, with
  anonymous sessions, assessment history, simulation timelines, revocable read-only share
  links, a six-scenario demonstration library and an executive report.
- **Decision Lab and Board Risk Pack**: paired treatment analysis over the same engine,
  deterministic decision rules, budget and deadline constraints, a Pareto frontier and a
  printable, shareable board pack.
- **Cloudflare origin gate**: the deployed web-root policy refuses every request that does
  not carry the Cloudflare `X-Origin-Secret` header. The secret is never versioned; it is
  injected at publish time by `tools/render-apache-policy.php`, which both
  `tools/deploy.sh` and `tools/prepare-upload.php` use. The committed policy is
  fail-closed, so a policy that escapes the pipeline locks the site instead of opening it.
- **Branded error pages**: `403`, `404`, `500` and `503` documents in the site's own design
  system, served through `ErrorDocument`, self-contained and free of diagnostics.
- **`/.well-known/` exemption**: a narrow, read-only rule before the gate keeps ACME
  HTTP-01 validation reachable, so Let's Encrypt and cPanel AutoSSL can renew certificates.
- **Licensing**: `NOTICE`, a generated `THIRD-PARTY-NOTICES.txt` covering all 76 production
  packages (MIT, ISC, BSD-3-Clause, 0BSD, Apache-2.0), a served copy of the Apache licence,
  footer links, and `npm run verify:licenses` in the build.
- **Tooling**: `tools/prepare-upload.php` assembles a cPanel/FTP upload tree with the
  rendered policy; `tools/preflight.php` now checks the gate, the exemption and the error
  pages; `.gitattributes` pins LF for shell scripts and Apache policy files.

### Changed

- `tools/deploy.sh` renders the web-root `.htaccess` instead of copying it, excludes
  `.well-known/` from its `--delete` sweep, and refuses to finish unless the gate, the
  exemption, the error documents and a single Content-Security-Policy are present.
- The web-root policy now declares `ErrorDocument` for 403/404/500/503; the beta gate's own
  403 notice overrides it while the holding page is in use.
- The README documents the rendered policy, the manual upload path and the licence.

### Fixed

- Audit corrections QK-01 to QK-09 from the independent quantitative review: control
  effectiveness counted once, Unknown answers modelled as an equal-weight mixture,
  annualisation declared, input confidence relabelled and capped, sensitivity analysis
  added, compound extremes documented and flagged, zero exceedances reported as trial
  counts, and uncertainty sources stated.
- The README's database commands now use the deployed `iliadis_quickrisk` schema and
  `iliadis_quickrisk_user` account.

### Security

- Content-Security-Policy and HSTS are served from the web-root policy; assessment data
  remains zero-retention for the questionnaire; the calculation endpoint stays same-origin,
  POST-only, size-limited and rate-limited; QuickRisk Live and the Decision Lab store only
  anonymous state the user explicitly saves.
- The origin is reachable only through Cloudflare (see the Cloudflare origin gate above),
  and certificate renewal is verified separately from the application.

### Known limitations

- Calibration values remain documented application assumptions, not externally evidenced
  FAIR constants; the model reports an annualised exposure approximation, not realised
  annual loss totals.
- The compound-extreme plausibility review, the host-side verification items and the legal
  and trademark reviews recorded in the release checklist remain open, which is why this
  release is published as a pre-release.
