# FAIR QuickRisk

## About

<img width="880" height="587" alt="QuickRisk — Quantify Cyber Risk: identify key risk scenarios, quantify likelihood and financial impact, prioritise what matters most. A fast, FAIR-inspired risk assessment built by Dr. John ILIADIS." src="images/quantify-cyber-risk-dashboard.png" />

QuickRisk is a quantitative cyber-risk assessment tool designed to express cyber exposure in
financial terms. Rather than reducing risk to a single qualitative rating, it uses probabilistic
modelling to estimate potential loss ranges and illustrate how different assumptions affect the
result. The objective is to provide a more useful basis for discussing cyber risk, investment
priorities and risk appetite with business and executive stakeholders.

Rapid, probabilistic, FAIR-informed estimation of financial cyber-risk exposure across five
common scenarios, with an optional deterministic real-time SOC overlay.

**Published at:** https://quickrisk.iliadis.net/ · **Designed and built by**
Dr. John ILIADIS ([iliadis.net](https://www.iliadis.net/))

## So what?

**The problem, in one sentence:** security is still argued to the board in colour-coded
ratings that cannot be set against the money being requested, so "how exposed are we?" and
"is this spend worth it?" end up answered with opinion instead of with a number.

[![Watch the QuickRisk demo](https://img.youtube.com/vi/4uHBT-c80IM/0.jpg)](https://www.youtube.com/watch?v=4uHBT-c80IM)

▶ **[Watch the few-seconds demo](https://www.youtube.com/watch?v=4uHBT-c80IM)** —
<https://www.youtube.com/watch?v=4uHBT-c80IM>

**What this solves, and for whom**

| Role | What QuickRisk gives them |
|---|---|
| Executive, board, CFO | An expected annual loss and a "bad year (1 in 10)" figure per scenario, in euros, that can be set against budget, insurance cover and a stated risk appetite — not an ordinal rating |
| CISO / risk manager | A transparent, reproducible chain from two answers per scenario to a distribution, so the number can be defended, challenged and re-run rather than asserted |
| Security team | A sensitivity analysis per result, so the conversation moves to the assumption that actually moves the number |
| Risk committee / audit | Versioned model and calibration identifiers on every result, zero retention of assessment content, and deterministic test vectors in the test suite |

QuickRisk is a rapid **screening and discussion** instrument. It is not an audit, a
certification, an assurance opinion, or a substitute for a full FAIR analysis.

## Methodology

Everything described here is implemented in this repository and pinned by tests. The
authoritative technical record is `docs/MODEL_DOCUMENTATION_FAIR-QK-2.0.md`; runtime calibration
metadata lives in `fairquickmodel/parameters.json` (server-only), and the fitted posterior package
lives in `fairquickmodel/inference/` with source, assumption, validation and integrity records.

### 1. What is asked

| Input | Question | Role in the model |
|---|---|---|
| QP1 | Organisation size | Economic scale, and the fallback prior for the loss anchor |
| QP2 | Critical-service dependency | Primary-loss modifier |
| QP3 | Internet-facing exposure | Frequency modifier for S1, S2, S3 and S5 |
| QP4 | Sensitive-information exposure | Secondary-loss frequency modifier, all scenarios |
| QP5 | Third-party dependency | Frequency and secondary-loss modifier, S4 only |
| QP6 | Recovery capability | Primary-loss modifier |
| QP7 | Control maturity | Susceptibility — applied once |
| QP8 | Daily disruption cost | Loss-magnitude anchor (optional, and the most influential input) |
| SQA — per scenario | How often the scenario is **attempted or contacted** in a typical 12 months, *before* considering controls | Threat event frequency (TEF) |
| SQB — per scenario | Impact if it succeeds | Loss-magnitude multiplier |

The five scenarios are fixed: **S1** ransomware / destructive extortion, **S2** identity,
phishing or social-engineering compromise, **S3** exploitation of a public-facing
vulnerability, **S4** third-party / supplier compromise, **S5** DDoS or externally driven
service disruption. They are a practical rapid-assessment set chosen from current public
threat evidence, not a mathematical ranking of the five most frequent cyber risks.

Any answer may be **Unknown**. In the active posterior engine an Unknown scenario answer leaves the
relevant reference posterior unchanged: it does not insert a synthetic mixture, a favourable shift or
an adverse extreme, and it lowers the input-confidence score. The legacy fallback also caps added width so it cannot
inflate the mean (mean-shift cap 1.5×).


### 2. The model chain

For each scenario, per simulated year:

```text
Joint posterior draw  ->  scenario material-event rates
Poisson event count   ->  per-event lognormal severity  ->  annual scenario total
Joint portfolio total =  year-by-year sum of scenario totals
```

The active 2.0 engine samples a count of material-loss events for each simulated year, samples a
positive severity for every event, and sums them. Scenario totals use the same posterior draw in a
year, so portfolio percentiles are computed from joint annual totals rather than by adding
independent scenario percentiles. Every response declares
`meta.annualisationMethod = posterior-predictive-compound-poisson-annual-total` and
`meta.realisedAnnualTotalsModelled = true`. If no validated posterior package is available, the
legacy engine falls back explicitly to `frequency-times-severity-annualised-exposure` and declares
that it does not model realised annual totals.

FAIR's core separation is borrowed deliberately: *how often* is kept apart from *how costly*,
ranges replace single numbers, and primary loss is kept apart from secondary (knock-on) loss.
What is simplified is stated in §13.

### 3. Distributions and bounds

| Setting | Active posterior engine | Why |
|---|---|---|
| Attack probability | Beta reference-class posterior | Survey prevalence with capped effective sample size for transportability |
| Material-loss probability | Beta posterior | Published non-zero-cost bases |
| Scenario weights | Weak Dirichlet prior | No public source supplies all five annual rates |
| Annual event count | Poisson | Gives zero-loss years and count uncertainty |
| Positive severity | Lognormal fitted to published quantiles | Heavy-tailed positive losses; IBM sensitivity for `GT1B` |
| Primary/secondary split | Beta allocation | Avoids double-counting separate severity models |
| Dependence | Shared posterior draw | Joint annual totals without claiming an estimated correlation matrix |
| Randomness | Seeded object-local MT19937, one stream per scenario | Reproducible, no global RNG state, no persisted seed |
| Confidence | Heuristic input-quality indicator | Explicitly not statistical confidence |

The active engine does not impose the legacy €500m component cap on per-event severity; the
posterior distribution and its fitted tails determine the range, and the response reports the
simulated maximum. The 1.3 fallback retains the following bounds.

#### Legacy fallback only

| Setting | Value | Why |
|---|---|---|
| Sampling distribution | Triangular | The questionnaire supports min / most-likely / max reasoning |
| Widening mean-shift cap | 1.5× | Stops an Unknown answer from inflating only the central estimate |
| TEF | 0.001 – 100 events/year | Prevents degenerate extremes |
| Susceptibility | 0.005 – 0.99 | It is a probability |
| Impact multiplier | 0.05 – 60 | Bounds the interval arithmetic |
| Loss magnitude | €1,000 – €500,000,000 per component | Legacy component clamp |
| Secondary-loss probability | 0.01 – 0.99 | Keeps the Bernoulli draw meaningful |

### 4. Frequency — legacy fallback calibration

> The active 2.0 engine does not sample these bands. It derives scenario material-event rates
> from the reference posterior and applies the elicitation multipliers in
> `fairquickmodel/inference/reference-classes.json`. The tables in §§4–7 document the retained
> 1.3 fallback, which is used only when no validated posterior package is active.

Base bands (`internally-derived`, from the requirements' illustrative mapping), events per year:

| Answer | Min | Most likely | Max |
|---|---:|---:|---:|
| Very unlikely | 0.01 | 0.03 | 0.10 |
| Unlikely | 0.05 | 0.15 | 0.30 |
| Possible | 0.20 | 0.50 | 1.00 |
| Likely | 0.50 | 1.50 | 3.00 |
| Very likely | 1.50 | 4.00 | 10.00 |

Each band is multiplied by a scenario scale (`heuristic`): S1 ×1.00 (reference), S2 ×1.15,
S3 ×1.15, S4 ×0.85, S5 ×1.50. Incident *volume* is therefore not treated as business risk: a
frequent scenario is not automatically ranked highly, because magnitude is modelled too.

The likelihood question asks for **attempts or contact**, before controls. Controls are applied
once, as susceptibility — they are never counted twice. This was corrected after an
independent audit found that the earlier wording double-counted control effectiveness.

### 5. Susceptibility and controls (legacy fallback)

Probability that a threat event becomes a loss event (`heuristic`), per scenario. In the active
engine, QP7 changes the material-loss odds and the scenario posterior supplies the base rate:

| Scenario | Min | Most likely | Max | Rationale |
|---|---:|---:|---:|---|
| S1 Ransomware | 0.10 | 0.30 | 0.60 | Success needs access, privilege, opportunity and a failure of detection or recovery |
| S2 Identity compromise | 0.15 | 0.35 | 0.65 | Phishing succeeds often enough even with MFA, and account takeover is common |
| S3 Vulnerability exploitation | 0.08 | 0.25 | 0.55 | Requires a reachable, unpatched or misconfigured component |
| S4 Third-party compromise | 0.05 | 0.20 | 0.50 | Propagation into our environment is the exception |
| S5 DDoS / disruption | 0.15 | 0.30 | 0.60 | Mitigation is common, but material disruption still occurs |

Control maturity (QP7) is the one organisation-level modifier: Very limited ×1.80, Limited
×1.40, Moderate ×1.00, Strong ×0.70, Very strong ×0.50, Unknown ×1.00 with ×1.50 widening,
clamped to 0.005 – 0.99.


### 6. Loss magnitude (legacy fallback)

**Anchor — daily disruption cost (QP8, `heuristic`).** The active engine uses QP8 as a weak
severity elasticity against reference-class severity, not as a direct daily-cost anchor. The
legacy fallback uses the following range of euros per day of disruption:

| Answer | Min (€/day) | Most likely | Max |
|---|---:|---:|---:|
| Less than €25k | 5,000 | 12,000 | 25,000 |
| €25–100k | 25,000 | 45,000 | 100,000 |
| €100–500k | 100,000 | 200,000 | 500,000 |
| €500k–€2m | 500,000 | 900,000 | 2,000,000 |
| €2–10m | 2,000,000 | 3,500,000 | 10,000,000 |
| More than €10m | 10,000,000 | 14,000,000 | 40,000,000 |
| Unknown / skipped | 8,000 | 60,000 | 1,500,000 |

When QP8 is Unknown the fallback band is scaled by organisation size (QP1): <€10m ×0.25,
€10–50m ×0.60, €50–250m ×1.20, €250m–€1bn ×3.00, >€1bn ×8.00.

**Impact multiplier (SQB, `internally-derived`).** Applied to the *daily* anchor, so
"Significant" means roughly one to five days of disruption cost, not one day:

| Answer | Min | Most likely | Max |
|---|---:|---:|---:|
| Minor | 0.25 | 0.50 | 1.00 |
| Moderate | 0.50 | 1.00 | 2.00 |
| Significant | 1.00 | 2.20 | 5.00 |
| Severe | 3.00 | 6.00 | 15.00 |
| Critical | 8.00 | 16.00 | 40.00 |

That product is then multiplied by a scenario scale (`heuristic`): S1 ×1.20, S2 ×0.90, S3
×1.00, S4 ×0.85, S5 ×0.60. Two profile answers modify primary loss (`heuristic`):
critical-service dependency (QP2) ×0.60 – ×1.60, and recovery capability (QP6) ×1.50 – ×0.65.
Both act on the shared anchor, so their effect propagates into secondary loss as well.

### 7. Secondary loss

Knock-on loss is drawn as `Secondary loss = Bernoulli(SLEF) × SLM`, **once per simulated
trial** (not once per loss event, because event counts are not drawn):

| Scenario | SLEF min | mode | max | SLM min | mode | max |
|---|---:|---:|---:|---:|---:|---:|
| S1 Ransomware | 0.25 | 0.45 | 0.70 | 0.50 | 1.20 | 2.50 |
| S2 Identity compromise | 0.20 | 0.38 | 0.60 | 0.40 | 0.90 | 2.00 |
| S3 Vulnerability exploitation | 0.15 | 0.32 | 0.55 | 0.40 | 1.00 | 2.50 |
| S4 Third-party compromise | 0.15 | 0.35 | 0.60 | 0.40 | 0.90 | 2.00 |
| S5 DDoS / disruption | 0.10 | 0.22 | 0.45 | 0.30 | 0.60 | 1.50 |

SLM is a multiple of the same daily disruption-cost anchor. Sensitive-information exposure
(QP4) scales SLEF in every scenario (×0.50 – ×1.70), and third-party dependency (QP5) scales it
again for S4 (×0.60 – ×1.60). SLEF is widened ×1.30 when the impact answer is Unknown and ×1.20
when control maturity is Unknown. **Statutory fines, regulatory penalties and specific legal
liabilities are not calculated or predicted.**

### 8. Simulation, percentiles and thresholds

| Setting | Value |
|---|---|
| Iterations per scenario | 5,000 by default (allowed: 1,000 / 5,000 / 10,000 / 25,000 / 50,000; hard maximum 50,000) |
| Reported percentiles | P10, P25, P50, P75, P90 of simulated annual total losses |
| Expected annual loss | Arithmetic mean of simulated annual totals, including zero-loss years |
| Portfolio total | Year-by-year sum of scenario totals under shared posterior draws; joint percentiles are reported |
| Loss thresholds | €100k, €500k, €1m, €5m, €10m |
| Threshold probability | Share of simulated years above the threshold, with integer counts and Wilson intervals |
| Histogram | 40 bins, the last one an overflow bin above the 99th percentile |
| Sensitivity | Expected loss re-computed across the same posterior draws for each answer option |

The reported words matter: **expected annual loss** is the posterior-predictive mean under the
model assumptions (not a forecast); **typical year** is P50; **bad year (1 in 10)** is P90;
**best case (1 in 10)** is P10. Percentiles are predictive intervals, not confidence intervals.
The mean standard error and low-exceedance warnings are returned with the statistics.


### 9. Input confidence

A heuristic measure of answer completeness and distribution width — **not** statistical
confidence, not a confidence interval, and not a probability that the result is correct. Start
at 100 and subtract:

| Condition | Penalty |
|---|---:|
| Scenario likelihood answer Unknown | −18 |
| Scenario impact answer Unknown | −20 |
| Daily disruption cost (QP8) Unknown, so derived from organisation size | −15 |
| Each Unknown organisation-profile answer | −5 |
| Distribution wide (coefficient of variation ≥ 1.20) | −8 |
| Distribution very wide (coefficient of variation ≥ 2.00) | −15 |
| Calibration still provisional | −15 |

Levels: **High** ≥ 85, **Medium** ≥ 62, **Low** below 62 — **capped at Medium while the
calibration is provisional**, because the calibration values are heuristics that have not been
externally validated. A complete set of answers therefore shows "Medium", never "High".

### 10. Determinism, versioning and retention

- The same payload and seed reproduce the same distribution exactly; the test suite asserts this
  against the recorded baseline in `tests/expected/`.
- The response carries the model identifier, model version, schema version, calibration version,
  methodology version, iteration count, annualisation method and the retention mode.
- Calibration changes create a new version; the meaning of a published version is never edited
  in place.
- The questionnaire and its results are **zero-retention**: processed in memory for one request
  and discarded. No database row, file, PHP session, cookie, browser storage, cache entry or log
  line is written, and no result URL exists. See `requirements/ZERO_RETENTION_PROOF.md`.

### 11. QuickRisk Live overlay

QuickRisk Live is a separate, deterministic layer that shows how current SOC observations and
response actions could change the *operational* risk state. It never re-does the risk
mathematics: the baseline expected annual loss comes from the model above (or from a saved
assessment that recorded it).

```text
telemetry  = min(100, IOCs × 12 × confidence + stageScore + (velocity − 1) × 10)
mitigation = (1 − EDR) × (1 − network) × (1 − identity)      0.75, 0.50, 0.60
multiplier = clamp(1 + telemetry/100 × (4 × mitigation − 1), 0.20, 4.00)
riskIndex  = min(100, round(telemetry × mitigation))
realTimeEAL = baselineEAL × multiplier
```

Invariants: telemetry 0 with any controls gives ×1.00 (the baseline is preserved); telemetry 100
with no controls gives ×4.00; telemetry 100 with full controls gives ×0.20. Bands: 0–19 Low,
20–44 Medium, 45–74 High, 75–100 Critical. The engine is a pure TypeScript module with published
test vectors (`requirements/QUICKRISK_LIVE.md`), and **the SOC data is synthetic** — no production SIEM,
EDR, SOAR or SOC feed is connected.
### 12. Decision Lab and Board Risk Pack

A treatment never claims "reduce risk by 40%". It declares which driver it changes — a multiplier
on **susceptibility** (frequency lever) or on the **loss-magnitude anchor** (magnitude lever).
Because the loss is linear in those inputs, a treatment scales every simulated year by the same
factor `k`, which allows:

- exact common random numbers: treated figures reuse the baseline draws, with no second simulation;
- candidate treatments compared from that one sample within an anonymous server-side compute budget:
  10,000 iterations, 30 candidate treatments and 256 portfolios per request (a larger request is
  rejected, and a bounded enumeration says so instead of dropping a candidate);
- effect uncertainty expressed as a three-point triangular estimate, realised from a seed derived
  from `(simulationSeed, treatmentId, version)`;
- overlap handled by independent coverage (later treatments in the same mechanism group deliver
  only 0.65 by default), never by adding percentages;
- deterministic decision rules: the exact comparison may test EAL, P90 and exceedance probability,
  but **portfolio selection uses expected annual loss only** and requires an annual-loss limit.
  High-end loss and exceedance criteria depend on a joint scenario-dependence model, so they are
  displayed and evaluated for the exact comparison but excluded from portfolio ranking and
  recommendation;
- portfolio ranking by cost, then EAL, then delivery time, then a deterministic portfolio id;
  `Recommended`, `Viable alternative`, `High value / above appetite`, `Dominated` and `Infeasible`
  labels, each with a one-sentence reason; break-even effectiveness by bisection on real runs,
  rounded up; and a Risk Reduction Efficiency ratio (`ΔEAL / annualised cost`, never called ROI).

Decision Lab sends the published assessment seed and the iteration count the results response
reports, so the server replays the results page configuration. The assessment is seeded randomly per
request, so the two figures are draws from the same model and agree to within Monte Carlo noise;
when the returned baseline is further from the portfolio figure than noise explains, the screen
states that the answers changed and asks for the assessment to be recalculated.

A nine-month rollout earns a transition year rather than an immediate full benefit. If a
documented input clamp or component loss cap binds, the analysis says so (`clampWarning`) instead
of pretending the effect is exact. A reachable component cap makes the paired-year magnitude
scaling an approximation, and that limitation is stated in the Decision Lab and Board Pack.

### 13. What the method deliberately does not do

- A full FAIR analysis decomposes frequency and magnitude into many factors; this uses a small,
  fixed factor set.
- Only five scenarios are assessed; other material scenarios are out of scope.
- Dependence is represented by shared posterior draws, not by an empirically estimated correlation
  matrix. Portfolio percentiles are model-dependent, and Decision Lab still selects portfolios on
  expected annual loss rather than joint P90.
- The active engine simulates annual counts and event-level severities. The legacy fallback uses
  one annualised-exposure magnitude per trial and is clearly labelled.
- Secondary loss is an uncertain allocation of total event severity, not a separately estimated
  occurrence and severity model.
- Control effectiveness is one organisation-level answer, not a per-scenario control assessment.
- Statutory fines, regulatory penalties and specific legal liabilities are excluded.
- The model does not capture all uncertainty about its own structure, distribution shapes,
  calibration or organisation-specific scenario dependence. Shared posterior draws are a
  documented structural approximation, not an estimated correlation matrix.
- Results are estimates, not facts; they depend on the quality of the answers and on the
  documented assumptions, and must not be the sole basis for a material business decision.

### 14. Verify the numbers

```bash
php tools/validate-model.php          # model structure, bands, clauses and limits
php tests/run-tests.php               # full PHP suite, including Live and Decision Lab
php tools/simulate-assessment.php     # one end-to-end assessment, printed
php tools/benchmark.php               # timing at 5,000 and 50,000 iterations
php tools/dump-model.php              # the effective model after loading and overrides
```

Reference: `docs/MODEL_DOCUMENTATION_FAIR-QK-2.0.md` (evidence roles, posterior model and known
validation gap), `calibration/` (offline fitting and validation), and `/methodology.html` (the same
explanation, in plain language, for users).

---

## What this application is

- Five predefined scenarios, two questions each, plus eight organisation-profile questions.
- A server-side Monte Carlo simulation (5,000 iterations per scenario by default) in PHP.
- Results expressed as expected annual loss, P10/P50/P90 ranges and threshold exceedance
  probabilities, with an explicit confidence indicator.
- **QuickRisk Live** (optional add-on): a deterministic SOC overlay that turns synthetic
  telemetry into a Real-Time Risk Index, a bounded SOC Threat Multiplier and an illustrative
  real-time EAL, with anonymous sessions, assessment history, timelines, shareable read-only
  assessments, a six-scenario demonstration library and an executive report.
- **Decision Lab** (optional add-on): a treatment-analysis layer over the same model, with a
  curated and session-owned treatment library, deterministic portfolio rules, a Risk Reduction
  Efficiency ratio, saved analyses, shareable Board Risk Packs and a read-only owner history.
- Three workspace tabs — **Risk Calculator**, **Board Brief** and **Saved Packs** — with
  methodology, data handling and the disclaimer available as dialogs rather than as separate
  destinations.
- Three entry paths on the entry page: a server-calculated 60-second sample, a one-scenario quick
  check (the other four scenarios are submitted as `Unknown`) and the full five-scenario
  assessment.
- A static React/TypeScript frontend, compiled to plain HTML/CSS/JavaScript, with no
  Node.js runtime in production.

## What this application is not

- Not a full FAIR analysis, audit, certification, compliance assessment or assurance opinion.
- Not a calculation or prediction of statutory fines or legal liabilities.
- Not a basis, on its own, for material business decisions.
- Not endorsed by the FAIR Institute, ENISA, Verizon, IBM or any regulator.

## QuickRisk Live in one paragraph

QuickRisk estimates baseline cyber-loss exposure. QuickRisk Live demonstrates how current SOC
observations and response actions could change the operational risk state. Its Live risk engine is
a pure TypeScript module (the only Live numerical implementation); for Live, PHP and MySQL only
validate, store and return what that engine calculated. QuickRisk Live methodology v1.0, coefficients
and the four mandatory test vectors are documented in `requirements/QUICKRISK_LIVE.md`. **The SOC data is synthetic: no
production SIEM, EDR, SOAR or SOC feed is connected.**

## Three retention models, deliberately

| | QuickRisk questionnaire | QuickRisk Live | Decision Lab |
|---|---|---|---|
| Storage | none (in memory only) | MySQL, anonymous session | MySQL, anonymous session |
| Identity | none | none (no name, email, organisation) | none (no name, email, organisation) |
| Lifetime | page lifetime | session TTL (default 30 days) | session TTL (default 30 days) |
| Sharing | none | explicit read-only link, revocable | explicit read-only Board Risk Pack link, revocable |

Assessment answers and results for the questionnaire are processed transiently and are **not
persisted by the application** — not in a database, file, PHP session, cookie, browser storage,
cache, queue, log, report or third-party service. There is no account, no assessment token, no
save/resume and no persistent results URL. See `requirements/ZERO_RETENTION_PROOF.md` for the evidence and
the exit test. QuickRisk Live and Decision Lab are the two deliberate exceptions: each stores only
anonymous technical state the user explicitly saves. Decision Lab stores the computed comparison,
portfolio search and treatment selection, not the questionnaire answers, and cannot recompute a
saved analysis from them.

The interface states these three models rather than leaving them to the documentation. The header
carries three workspace tabs — **Risk Calculator** (the questionnaire, the results and both
simulation branches), **Board Brief** (the print-ready summary of the result in this tab) and
**Saved Packs** (the saved-work list with archive and revoke controls) — while methodology, data
handling and the disclaimer open as dialogs rather than as destinations. Above them the
Assess → Results → Explore stepper keeps Live and Decision Lab unavailable until a baseline
exists. A persistent status line says what the tab is currently holding; a "Where your data goes"
dialog lists, per surface, what is stored, what deletes it and what can be exported; and "Start
over" confirms exactly what will be discarded. The entry page offers three paths — a
server-calculated 60-second sample, a one-scenario quick check and the full five-scenario
assessment — and says that none of them stores anything. The wording is defined once in
`frontend/src/content/dataLifecycle.ts` and pinned by `frontend/tests/data-lifecycle.test.ts` and
`frontend/tests/journey.test.ts`, so an interface change cannot silently contradict
`tests/zero_retention.test.php`.

---

## Repository layout

```text
requirements/                          local working notes (git-ignored; not published)
fairquickmodel/                        authoritative model -> deployed to ~/fairquickmodel/
  manifest.json                        identifiers, versions, iterations, thresholds
  content.json                         disclaimer, methodology, privacy, positioning
  questions.json                       organisation-profile questions + scenario templates
  answer-options.json                  answer option sets
  scenarios.json                       scenario presentation and wording
  parameters.json                      CALIBRATION - server only, never sent to the browser
  versions/1.3.0.json                  active model version record (1.0.0 is superseded)
server/                                PHP -> deployed to ~/public_html/quickrisk/
  api/calculate.php                    the questionnaire endpoint (POST, JSON, no-store)
  includes/                            config, model loader, engine, validation, hardening
  includes/live/                       QuickRisk Live: config, db, repository, validation, handlers
  includes/decision/                   Decision Lab: config, engine, validation, treatment library
  live/api/*.php                       Live and Decision Lab endpoints (same-origin JSON)
  live/api/.htaccess                   allow-list for those endpoints
  .htaccess                            deny rules, headers, caching policy
database/                              QuickRisk Live and Decision Lab migrations and seeds
  001_initial_schema.sql               anonymous_sessions, assessments, events, shares, library
  002_seed_methodology.sql             methodology_versions row for 1.0
  003_seed_scenarios.sql               Ransomware Outbreak
  004_seed_scenarios_more.sql          the other five demonstration scenarios
  005_decision_lab.sql                 treatment library, custom treatments, saved analyses, shares
frontend/                              React + TypeScript + Vite (build-time only)
  shared/publicModel.ts                build-time model adapter (public files only)
  src/                                 domain, state, api, validation, components, styles
  src/live/                            QuickRisk Live: engine, store, api client, views
  live/share/index.html                the read-only share shell (second HTML entry)
  public/                              robots.txt, sitemap.xml, the static methodology page,
                                       the licence and notice copies, the branded error pages and
                                       live/share/.htaccess (the share-token rewrite rules)
static-pages/                          hand-deployed pages, outside the build and never shipped
  UnderConstruction.html               temporary holding notice (self-contained, noindex)
images/                                the README banner and the GitHub social-preview card
                                       (never shipped to the site)
tests/                                 PHP test suite (no framework required)
tools/                                 validation, audit dump, benchmark, baseline, guards,
                                       live-smoke.php, serve-local.mjs, local-router.php
docs/                                  deployment runbook, model documentation, security and
                                       privacy notes (the plans, proofs and release checklist are
                                       held in requirements/)
```

## Build and verify

Requirements: Node.js LTS and npm for the frontend; PHP 8.x for the API, tests and tools.

```bash
# Frontend: type-check, guard checks, unit tests and the production build
cd frontend
npm ci
npm run build            # emits frontend/dist (static assets only, no source maps)
npm run test:e2e         # browser UI tests; install Chromium first if no local browser

# PHP: engine tests, model validation gate and an end-to-end smoke test
php tests/run-tests.php
php tools/validate-model.php
php tools/simulate-assessment.php
php tools/benchmark.php

# QuickRisk Live and Decision Lab: request/compute paths end to end
php tools/live-smoke.php
php tools/decision-smoke.php

# On the host: check the deployed configuration, database and web-root .htaccess
php tools/preflight.php --web-root="$HOME/public_html/quickrisk" --origin=https://quickrisk.iliadis.net
```

Deployment is documented in `requirements/DEPLOYMENT_FIRST_TIME.md` and
`docs/DEPLOYMENT_QUICKRISK_LIVE.md`; the runbook includes MySQL, the Live and Decision Lab
configuration file and the acceptance checks. The short version:

```bash
# 1 + 2. the model, the compiled application and the rendered web-server policy
./tools/deploy.sh

# Without shell access (cPanel / FTP): assemble an upload tree, then upload its contents
php tools/prepare-upload.php --append-beta-gate

# 3. QuickRisk Live and Decision Lab storage (once; run as a MySQL administrator)
mysql -u MYSQL_ADMIN -p iliadis_quickrisk < database/001_initial_schema.sql
mysql -u MYSQL_ADMIN -p iliadis_quickrisk < database/002_seed_methodology.sql
mysql -u MYSQL_ADMIN -p iliadis_quickrisk < database/003_seed_scenarios.sql
mysql -u MYSQL_ADMIN -p iliadis_quickrisk < database/004_seed_scenarios_more.sql
mysql -u MYSQL_ADMIN -p iliadis_quickrisk < database/005_decision_lab.sql
```

The web-root `.htaccess` is **rendered at publish time, never copied**: the versioned
`server/.htaccess` is deliberately fail-closed, and `tools/render-apache-policy.php` injects
the Cloudflare origin secret. Copying `server/.htaccess` by hand locks the site — that is the
intended failure mode, not a bug.

No database, no Node.js process and no background service is required for the questionnaire. The
database is required only by QuickRisk Live and Decision Lab; without it, the questionnaire works
normally and those modules report that storage is unavailable.

## Running it on your own machine

You need **Node.js 20+** and **PHP 8.2+** (any web server is *optional* — PHP's built-in
server is enough). If PHP is not on PATH, the local runner looks for a portable CLI at
`.tmp/php/php.exe` (downloaded into the git-ignored `.tmp/` directory, not shipped in the
repository); set `QUICKRISK_PHP` to use any PHP binary.

Run the questionnaire and calculation API from one terminal:

```bash
node tools/serve-local.mjs
```

The script, in order: loads the PHP CLI, runs the model deployment gate
(`tools/validate-model.php`), builds the frontend if `frontend/dist` is missing (add `--build`
to force a fresh build, or `--no-validate` to skip the gate), then serves the compiled React app and
the questionnaire API from one origin — so the endpoint's same-origin protection works exactly as it
does in production. It also routes the core QuickRisk Live endpoints. It does **not** start MySQL and
it does **not** route the Decision Lab `decision-*.php` endpoints; full Live and Decision Lab
persistence therefore requires the deployed PHP/MySQL setup described above.

- Open <http://127.0.0.1:8000/> (change the port with `--port 8080`).
- Methodology: <http://127.0.0.1:8000/methodology.html>.
- The questionnaire calculation API lives at `/api/calculate.php` and answers POST only. The same
  local runner also routes the core QuickRisk Live endpoints; Decision Lab endpoints require the
  deployed PHP/MySQL setup.

What the local runner does not do: it never starts Apache or a database, and it never stores an
assessment. It writes one generated override to `.tmp/local-config.php` that allows plain HTTP
and localhost origins (the production defaults require HTTPS and only allow the iliadis.net
origins), plus in-memory rate limiting so nothing touches disk. That override is gitignored and
must never be deployed.

```bash
node tools/serve-local.mjs --port 8080    # different port
node tools/serve-local.mjs --build         # force a fresh frontend build first
node tools/serve-local.mjs --no-validate   # skip the model gate (faster, less safe)
set QUICKRISK_PHP=C:\path\to\php.exe       # use an explicit PHP binary (Windows)
```

For UI development with live reload: keep the PHP server running and run `cd frontend && npm run
dev` for the Vite dev server, but note the API rejects cross-origin calls by design, so the page
you actually use for calculations must be the one served by the PHP server above.

## Model versioning

- Application release: `1.3.5`.
- Model: `FAIR-QK-2.0` · model version `2.0.0` · schema `2.0.0` · calibration `CAL-2.0` ·
  methodology `METH-2.0` · disclaimer `DISC-2.0`.
- Calibration changes require a new calibration version and a new version record; the
  meaning of an existing version is never edited in place.
- Public evidence, weak elicitation assumptions and the posterior package are documented in
  `docs/MODEL_DOCUMENTATION_FAIR-QK-2.0.md`. National evidence is not organisation-specific
  validation, and questionnaire multipliers remain explicit assumptions.
- Version 1.2.0 corrected defects found by an independent quantitative audit; 1.3.0 preserved
  those corrections. Version 2.0 changes the active inference and annual-total simulation.
  Historical 1.x calculations retain their original model and methodology identifiers.
- Because no assessment is retained, a calibration change cannot alter any past result.

## Origin access (Cloudflare only)

The origin answers only traffic that Cloudflare forwards. A Cloudflare Transform Rule sets
an `X-Origin-Secret` request header, and the deployed web-root policy refuses every request
that does not carry it. There is exactly one exemption: RFC 8615 `/.well-known/`, which must
stay reachable so that Let's Encrypt and cPanel AutoSSL can renew the certificate.

- The secret is **never in this repository**. It is read at publish time from
  `%USERPROFILE%\.quickrisk\cloudflare-origin-secret` or `QK_ORIGIN_SECRET`; on the host,
  `~/quickrisk-config/cloudflare-origin-secret` (mode 600).
- `server/.htaccess` contains a **fail-closed stub**, not a placeholder value: the repository
  is public, and a committed placeholder would be a known bypass.
- `tools/render-apache-policy.php` performs the substitution; `tools/deploy.sh` and
  `tools/prepare-upload.php` both call it and refuse to publish without a valid secret.
- Branded `ErrorDocument` pages for 403, 404, 500 and 503 ship in `frontend/public/errors/`.

Verified by `tests/apache_policy.test.php` and `tests/error_pages.test.php`, and by the
post-deployment checks in `tools/preflight.php`.

## Response security headers

One policy serves the static site, the JSON endpoints and the local development server, so a
scan of any of them sees the same controls.

| Finding a passive scan reports | Control |
|---|---|
| Cookie No HttpOnly Flag | The only cookie (the QuickRisk Live/Decision Lab session) is `HttpOnly`, `Secure`, `SameSite=Lax`; the session ini options are hardened in `includes/bootstrap.php` |
| Strict-Transport-Security Not Set / Disabled | `max-age=31536000; includeSubDomains` on every response, in the origin policy and (over TLS) from PHP |
| X-Content-Type-Options Header Missing | `nosniff` on every response, including error documents and JSON |
| Content Security Policy Not Set | `Content-Security-Policy` from Apache, from `QkHttp` and from the development router |
| CSP: directive with no fallback | `frame-ancestors 'none'`, `form-action 'self'` and `base-uri 'self'` are stated explicitly, with no wildcard |
| CSP: style-src unsafe-inline | No inline keyword: the inline `<style>` blocks of the static pages are allowed by sha256 hash |
| Cross-Domain Misconfiguration | Every `Access-Control-Allow-*` header is removed; the application is same-origin only |
| Missing Anti-clickjacking Header | `X-Frame-Options: DENY` **and** `frame-ancestors 'none'` |
| Sub Resource Integrity Attribute Missing | The build writes `integrity="sha384-…"` on every emitted script and stylesheet |
| Big Redirect Detected | The application issues no redirect at all; the only 3xx is the host's or the CDN's HTTPS redirect |

Where each control lives:

- **`server/.htaccess`** is the browser policy (the error documents are served without PHP).
  `includes/security_headers.php` is the same directive list for PHP; a test compares them.
- **Inline styles are hashed, never allowed inline.** `tools/render-apache-policy.php` reads
  the `<style>` block of each document it is about to publish (`--web-root`) and writes its
  sha256 into `style-src`. Editing that CSS changes the hash, so the policy must be
  re-rendered: `php tools/render-apache-policy.php --check` reports a mismatch, and so does
  the test suite. The check needs the deploy secret (or `--secret-file`/`QK_ORIGIN_SECRET`);
  without a usable gate it exits without writing a policy.
- **The beta gate must not restate a header.** It is appended after the policy, so its values
  win; the renderer now refuses such a fragment instead of publishing an HSTS `max-age=0`,
  `X-Frame-Options: SAMEORIGIN` or a CORS wildcard.

Two settings live outside this repository and are the only ones a deploy cannot fix:

1. **Cloudflare HSTS.** The origin states one year, but Cloudflare's *SSL/TLS → Edge
   Certificates → HSTS* setting is what a visitor actually receives. It must be **enabled**
   with a max-age of at least 12 months (and *Include subdomains*), never left at `0`.
2. **No minifying proxy.** Subresource Integrity compares the bytes the browser receives with
   the digest in the HTML, so a CDN feature that rewrites JavaScript or CSS will break the
   page. Leave Auto Minify and Rocket Loader off.

Check the result from outside, with no shell account needed:

```bash
node tools/verify-live-headers.mjs --url https://quickrisk.iliadis.net/
node tools/verify-live-headers.mjs --url https://quickrisk.iliadis.net/ --check-cookie
```

It verifies the headers a browser receives (transport security, CSP, framing, cross-origin,
cookie flags, Subresource Integrity) plus the size of the HTTP→HTTPS redirect body, prints a
`PASS`/`FAIL` line for each control and exits non-zero on any failure. The `--check-cookie`
flag starts one anonymous QuickRisk Live session to inspect its `Set-Cookie` line.


## Licence

FAIR QuickRisk is licensed under the **Apache License, Version 2.0** (`LICENSE`); the
copyright and attribution statement is in `NOTICE`.

The compiled browser assets bundle third-party packages. Their licence texts and attribution
notices are reproduced in `THIRD-PARTY-NOTICES.txt`, served at `/THIRD-PARTY-NOTICES.txt`;
`/LICENSE.txt` serves the Apache licence. Both are generated from the production dependency
tree:

```bash
cd frontend
npm run notices          # regenerate after a dependency change
npm run verify:licenses  # fails when the published copies are stale
```

No copyleft dependency is bundled: `verify:licenses` fails the build if one appears.
"FAIR" is a trademark of the FAIR Institute. This project is independent and is not endorsed,
certified or validated by the FAIR Institute, ENISA, Verizon, IBM or any regulator.

## Contributing rules

1. Read the requirements document before changing behaviour.
2. Never add a persistence mechanism for assessment content.
3. Never add a third-party analytics, telemetry or session-replay service.
4. Never import the calibration file into the browser build (the build fails if you try).
5. Keep the model explicit, documented, versioned, testable and separate from the UI.
6. Report a security problem privately, as described in [SECURITY.md](SECURITY.md) — never in a public issue.
