# QuickRisk Decision Lab and Board Risk Pack — specification and status

**Decision Lab methodology version:** `1.0` (`QK_DECISION_METHODOLOGY_VERSION`)
**Board Risk Pack structure version:** `1.0` (`QK_BOARD_PACK_VERSION`)
**Model:** `FAIR-QK-1.3` · model `1.3.0` · schema `1.3.0` · calibration `CAL-1.3`

**Status:** complete — engine, treatment library, decision rules, persistence, API, screens,
tests and smoke tools. Business Mode is the default; Analyst Mode exposes the technical detail.

**Decision Lab screen:** current risk and appetite → treatment selection → expected effect →
portfolio comparison → break-even effectiveness → save / share / print. The Board Risk Pack is a
five-page, print-ready document generated from the same stored values.

---

## 1. The one architectural decision that matters

The development plan assumes Monte Carlo lives in the browser. **In this codebase it lives in
PHP** (`server/includes/fair_engine.php`), it is the audited, regression-pinned source of truth,
and the single source of truth depends on it staying there. Decision Lab therefore **reuses that
engine** and adds no second numerical implementation:

```text
QuickRisk answers
      |
      v
FairEngine::lossVectors()        <- the existing engine, one run per analysis
      |  per-scenario, per-iteration annual losses (server memory only)
      v
treatment adapter (PHP)          <- driver-level transformation, no simulation
      |
      v
decision rules (PHP)             <- appetite, ranking, Pareto, break-even
      |
      v
stored result --> board report model (frontend, presentation only)
```

`FairEngine::lossVectors()` calls the same `simulateIteration()` that `calculateScenario()` calls,
with the same per-scenario seeds, so its baseline equals the assessment figures to 1e-6. That is
pinned by `tests/decision_lab.test.php` ("the paired vectors match the published assessment
figures").

---

## 2. How a treatment is modelled

A treatment never says "reduce risk by 40%". It declares **which QuickRisk driver it changes**:

| Lever | Transformation | Effect on the model |
| --- | --- | --- |
| Frequency | multiplier on the **susceptibility** input (probability that a threat event becomes a loss event) | scales `LEF = TEF x susceptibility` |
| Magnitude | multiplier on the **loss-magnitude anchor** | scales primary and secondary loss |

Because `L = TEF x S x A x (M + B x C)` is linear in `S` and in `A`, a treatment scales the annual
loss of *every* simulated year by the same factor `k = alpha x beta`. That gives:

* **exact common random numbers** — the treated figures use the same draws as the baseline;
* no second simulation, so 1,024 portfolios are evaluated in one request;
* `k` is computed from the *engine's own* scaled inputs (`QkModifiers::applyRange` plus analytic
  input means), so the treatment path cannot drift from the model;
* when a documented input clamp binds, the analysis reports `clampWarning` instead of pretending
  the effect is exact.

Effect uncertainty is a three-point triangular estimate (`min`, `most likely`, `max`), realised
once per analysis from a seed derived from `(simulationSeed, treatmentId, version)`. The same seed
reproduces the same realisation; a different seed explores the stated range.

### Overlap

Within one mechanism group the first treatment (id order, so deterministic) delivers its full
effect and each later one delivers only its independent coverage (default 0.65). Percentages are
never added. Across groups, effects multiply.

---

## 3. Decision rules (deterministic)

**Appetite** — only the configured criteria are evaluated; an unconfigured appetite reports
"Risk appetite has not been defined" and no threshold is ever invented.

| Criterion | Test |
| --- | --- |
| Annual loss | `EAL <= annualLossLimit` |
| High-end loss | `P90 <= highEndLimit` |
| Exceedance | `P(loss > annualLossLimit) <= maxExceedanceProbability` |

**Portfolio ranking** — enumerate every subset of the candidates (<= 10 candidates = 1,024
portfolios, <= 4,096 evaluated), then: drop constraint violations, sort by total first-year cost,
tie-break on lower EAL, then lower P90, then shorter implementation delay. If nothing qualifies:

> No evaluated portfolio satisfies the selected risk appetite within the stated constraints.

**Labels** — `Recommended` (cheapest feasible portfolio that meets appetite), `Viable alternative`
(another feasible portfolio that meets appetite), `High value / above appetite` (on the Pareto
frontier but still above appetite), `Dominated` (a cheaper portfolio is no riskier), `Infeasible`
(violates budget or implementation deadline). Every label carries a one-sentence reason.

**Break-even effectiveness** — bisection over real model runs on the shared sample, reported
rounded **up** to one hundredth so the published value itself satisfies the appetite (verified in
the tests). No interpolation.

**Risk Reduction Efficiency** — `delta EAL / annualised treatment cost`, where the annualised cost
is the annual operating cost plus the implementation cost spread over the planning horizon (3
years by default). It is never called ROI.

**Implementation delay** — reported as a transition year: `EAL_transition = EAL_now x (d/365) +
EAL_steady x (1 - d/365)`, so a nine-month rollout cannot claim an immediate full benefit.

---

## 4. Treatment library (curated, versions and evidence recorded)

Twelve reviewed starting points: Privileged MFA, Endpoint Detection and Response, Immutable Backup
Resilience, Network Segmentation, Security Awareness, Email Security, Vulnerability Management,
Identity Monitoring, Incident Response Improvement, Data Recovery Improvement, DDoS Protection,
Privileged Access Management. Each states its business outcome, applicable scenarios, causal
levers, three-point effects, delay, both cost components, mechanism group, assumption notes,
version, review date and **evidence quality** (measured internal / validated benchmark / industry /
vendor / expert judgement / illustrative).

The catalogue is defined once in `server/includes/decision/treatment_library.php`. Every entry is
labelled with the evidence that actually supports it, and nothing is described as validated unless
the evidence field says so. Custom treatments are session-owned, cannot appear in the curated
library, and are structurally validated: they must name a mechanism group, an evidence class, the
scenarios they apply to, at least one causal lever with a three-point effect, and an assumption
note. A bare "reduce risk by X%" payload is rejected with `422`.

---

## 5. API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/live/api/decision-compute.php` | `action`: `baseline` / `compare` / `portfolios` / `sensitivity` |
| `GET` | `/live/api/decision-treatments.php` | curated library, this session's custom treatments, vocabulary |
| `POST` | `/live/api/decision-treatments.php` | save a custom treatment |
| `DELETE` | `/live/api/decision-treatments.php?id=` | delete a custom treatment |
| `GET` | `/live/api/decision-assessments.php` | this session's saved analyses |
| `POST` | `/live/api/decision-assessments.php` | save a computed analysis |
| `GET` | `/live/api/decision-assessment.php?id=` | read one |
| `DELETE` | `/live/api/decision-assessment.php?id=` | archive one |
| `POST` | `/live/api/decision-share.php?id=` | create a read-only Board Risk Pack link |
| `DELETE` | `/live/api/decision-share.php?id=` | revoke it |
| `GET` | `/live/api/decision-shared.php?token=` | public read-only Board Risk Pack |

A compute request carries the assessment answers (exactly as the calculator receives them) plus
optional `seed`, `iterations`, `appetite`, `constraints`, `treatments` and, for the portfolio
action, `candidateTreatments`. Treatments are `{"source":"curated","id":"edr"}` or
`{"source":"custom","definition":{...}}`.

A curated treatment is referenced **by id only**: the server resolves the reviewed definition, so a
client can never substitute its own numbers for a curated treatment. Compute endpoints are
same-origin, JSON-only, require the `X-QuickRisk-Live: 1` header and are rate-limited. Saving,
sharing and custom treatments additionally require the anonymous session and the CSRF header, and
every query is scoped to that session.

---

## 6. Persistence

Migration `005_decision_lab.sql`, in the same `iliadis_quickrisk` database as migrations 001–004:

| Table | Purpose |
| --- | --- |
| `treatment_library` | governance record for the curated catalogue (id + version, evidence, review) |
| `custom_treatments` | session-owned user-defined treatments |
| `decision_assessments` | one row per saved analysis: provenance, seed, iterations, appetite status, baseline/residual EAL, costs, full result JSON |
| `decision_share_links` | read-only Board Risk Pack tokens (hash only, expiry, revocation) |
| `decision_methodology_versions` | versions the API accepts, so an old analysis keeps its meaning |

---

## 7. Tests and observed output

```bash
php tests/run-tests.php decision      # 12 Decision Lab tests
php tools/decision-smoke.php          # full compute path, no web server and no database
```

The twelve tests pin: no treatment reproduces the baseline exactly; the paired vectors match the
published assessment figures; the same seed is deterministic and a different seed moves the
realisation; a treatment acts only on its own scenarios and only through the named driver; overlap
never combines as independence; appetite evaluates only configured criteria and measures the
probability at the configured threshold; cost, efficiency and delay stay separate; the portfolio
rule is deterministic and recommends the cheapest qualifying portfolio; nothing is recommended when
nothing qualifies; the budget constraint marks portfolios infeasible; the Pareto frontier contains
no dominated point; the published break-even value satisfies the appetite.

Reference profile (seed 20261107, 2,000 iterations):

```text
baseline expected annual loss:  765,484.70
EDR residual:                   499,611.07  (-265,873.64, S1 factor 0.520)
recommended: privileged-mfa + incident-response + network-segmentation
             investment 225,000 - residual 221,099.83 - Recommended
break-even modeled effectiveness for EDR at a 600,000 appetite: 59%
```

---

## 8. The screens

`frontend/src/decision/DecisionLabView.tsx` implements the guided business workflow: appetite
(explicit "how much risk are we prepared to accept?"), curated treatment selection with cost,
evidence quality and mechanism, comparison of the baseline with the treated position, the
portfolio table with deterministic labels and reasons, break-even effectiveness, save/share and
print. Analyst Mode reveals the seed, iteration count, realised effect draws and per-scenario
driver factors without changing any number.

`frontend/src/decision/board/` holds the report: `boardModel.ts` is the pure projection (tested),
`BoardRiskPack.tsx` renders the five pages with page-level acronym definitions and a print
stylesheet, and `SharedBoardPack.tsx` serves `/live/share/board/{token}` read-only.

`frontend/src/decision/domain/decisionTypes.ts` carries the vocabulary, labels and acronym
definitions; `frontend/src/decision/api/decisionClient.ts` is the same-origin client.

