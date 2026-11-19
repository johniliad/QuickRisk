# FAIR QuickRisk — Model documentation and calibration review

**Model identifier:** `FAIR-QK-1.3`
**Model version:** `1.3.0` · **Schema version:** `1.3.0` · **Calibration version:** `CAL-1.3`
**Release status:** `provisional-release` · **Released:** 2026-11-07 · **Supersedes:** `1.2.0`
**Normative source:** `requirements/FAIR_QuickRisk_REQUIREMENTS_v2.md`

> **Read this first.** Every value in this document is an **application assumption or
> heuristic**, not a universally authoritative FAIR constant. The model is a simplified,
> FAIR-informed rapid-estimation model. It is not a full FAIR analysis and it is not
> endorsed by the FAIR Institute or by any other organisation.
>
> **Version 1.2.0 corrected defects found by an independent quantitative audit. Version 1.3.0 carries those corrections unchanged: it changes only the release identity (database and account name, disclaimer version) and adds the Decision Lab treatment layer.**
> The corrections are listed in §16, with the evidence that pins each one. The three
> material corrections are: the likelihood question now asks for threat event frequency
> before control effectiveness (§4.3); Unknown answers use a documented mixture prior whose
> central effect is disclosed and bounded (§4.1, §3); and the model now states that it
> reports an annualised exposure approximation rather than realised annual loss totals
> (§2, §11). Historical model documentation for the superseded 1.0 model is not included in the
> public repository.

Regenerate the resolved tables at any time with:

```bash
php tools/dump-model.php
```

Verify the deployment gates with:

```bash
php tools/validate-model.php
```

---

## 1. Classification legend

| Classification | Meaning |
|---|---|
| `externally-evidenced` | Supported by an identified external source cited in this document. |
| `internally-derived` | Derived inside this application from a stated construction or from another documented parameter. |
| `heuristic` | Expert-style judgement used because no reliable quantitative source exists. Provisional. |
| `placeholder` | Explicitly provisional; requires validation before the model should be relied on analytically. |

**In `CAL-1.3` there are no `externally-evidenced` parameters.** The published threat
reports referenced in the requirements inform *scenario selection* only; they are not used
as coefficients. This is stated deliberately so that no reader mistakes a cited report for
a calibrated model input.

## 2. Model chain

Per simulated trial, for each scenario:

```text
TEF (threat events / year, attempts or contact, before controls)  ×  Susceptibility  =  LEF (loss events / year)
Primary Loss  +  Secondary Loss (Bernoulli draw)  =  Loss Magnitude
Annualised exposure  =  LEF  ×  Loss Magnitude          (one magnitude per trial)
```

Both TEF and susceptibility are sampled every trial, so uncertainty in event frequency and
in event success is preserved. One loss magnitude is sampled per trial and multiplied by that
trial's loss event frequency — a deliberate simplification documented in §11.

**Terminology, corrected in 1.2.0.** The product above is an **annualised exposure
approximation**, not the total of the losses actually incurred in a year. The model does not
draw how many loss events occur in a year and does not sum per-event severities, so:

- the **mean** is the standard expected-loss construct (a frequency-weighted exposure) and is
  defensible as an expected annual loss;
- the **percentiles** are percentiles of the annualised exposure approximation. They are **not**
  percentiles of realised annual loss totals, and a year with no loss event is not represented
  as a zero-loss outcome.

Every calculation response declares this: `meta.annualisationMethod =
frequency-times-severity-annualised-exposure` and `meta.realisedAnnualTotalsModelled = false`.
The model loader rejects a model that claims otherwise, and the browser schema requires the
same declaration.

## 3. Distribution choice

| Setting | Value | Classification | Rationale |
|---|---|---|---|
| Sampling distribution | `triangular` | internally-derived | Easy to explain, inspect and reproduce; the questionnaire only supports min / most-likely / max reasoning. |
| PERT lambda (available, unused) | `4.0` | internally-derived | Provided for later calibration revisions. |
| **Widening mean-shift cap** | **1.5** | internally-derived | **Added in 1.2.0.** Widening a right-skewed range raises its arithmetic mean, so unbounded widening would let an Unknown answer inflate the central estimate instead of only widening the distribution. Widening is reduced until the mean of the range is at most 1.5× the un-widened mean, and never increased. Applied by `QkModifiers::applyRange` to every widened input. |
| TEF clamp | `0.001 – 100.0` events/year | internally-derived | Prevents degenerate extremes while never binding in realistic answers. |
| Susceptibility clamp | `0.005 – 0.99` | internally-derived | Susceptibility is a probability; it must not reach 0 or 1. |
| Impact multiplier clamp | `0.05 – 60.0` | internally-derived | Bounds the interval arithmetic of anchor × multiplier. |
| Loss magnitude clamp | `1,000 – 500,000,000` EUR | internally-derived | Prevents absurd magnitudes from compounding modifiers. |
| Secondary-loss probability clamp | `0.01 – 0.99` | internally-derived | Keeps the Bernoulli draw meaningful. |

## 4. Threat event frequency (TEF)

### 4.1 Base bands — `internally-derived`

Source: requirements v2 §12 illustrative frequency mapping, retained unchanged as the
calibration basis.

| Answer | Min | Most likely | Max |
|---|---:|---:|---:|
| Very unlikely | 0.01 | 0.03 | 0.10 |
| Unlikely | 0.05 | 0.15 | 0.30 |
| Possible | 0.20 | 0.50 | 1.00 |
| Likely | 0.50 | 1.50 | 3.00 |
| Very likely | 1.50 | 4.00 | 10.00 |

**Unknown (1.2.0): an equal-weight mixture over the five answers above**, applied after the
scenario frequency scale and the frequency modifiers. Each of the five bands receives weight
0.2 and is sampled as a triangular range, so the mixture spans every answer the user could
have chosen.

| Property | Value |
|---|---|
| Mean of the mixture (base bands) | 1.5227 events/year |
| Average of the five band means | 1.5227 (identical by construction) |
| Middle answer ("Possible") mean | 0.5667 |
| Mixture mean ÷ middle-answer mean | 2.687 |
| Mixture envelope | 0.01 – 10.00 events/year |

**Why this replaced the 1.0 band.** `CAL-1.0` used a single wide band
(`0.01 / 0.50 / 10.00`, mean 3.50). That band was not merely wide: it raised the central
estimate by roughly 6× relative to the "Possible" answer, so an Unknown answer was punitive
rather than uninformative. An independent audit measured the effect at 6.19× on scenario
expected loss. The mixture removes that construction: its mean is exactly the average of the
five available answers, and it cannot exceed the range of the answers the user could have
chosen (asserted by `tests/audit_corrections.test.php`).

**The disclosed central effect.** Because the answer bands are multiplicative, the average of
the five answers sits above the middle answer. Measured on scenario S1 with the documented
fixture profile, seed 20261029, 20,000 iterations, answering both scenario questions Unknown
instead of Possible/Significant:

| Statistic | Change |
|---|---:|
| Median (typical simulated value) | ×1.14 |
| P90 (upper end of the range) | ×7.83 |
| Mean (expected annual loss) | ×5.99 |

That is the intended shape: the typical value barely moves while the tail widens substantially.
The mean rises because any distribution spanning all five multiplicative bands is strongly
right-skewed — a property of the answer scale, not a punitive adjustment. The measured values
are stored in `parameters.unknownAnswerDisclosure` and asserted by the test suite, so the
disclosed effect cannot drift silently. The mixture weights are configurable in
`parameters.frequency.unknownPolicy.weights`.

### 4.2 Scenario frequency scale — `heuristic`

| Scenario | Scale | Rationale |
|---|---:|---|
| S1 Ransomware / destructive extortion | 1.00 | Reference scale. |
| S2 Identity / phishing / social engineering | 1.15 | Identity compromise is the highest-volume intrusion pattern in public reporting. |
| S3 Public-facing vulnerability exploitation | 1.15 | Exploitation activity is elevated and broadly applicable. |
| S4 Third-party / supplier compromise | 0.85 | Depends on a separate party's exposure, not only on ours. |
| S5 DDoS / service disruption | 1.50 | Denial-of-service dominates incident volume. |

Scaled "Possible" band, for illustration:

| Scenario | Min | Most likely | Max |
|---|---:|---:|---:|
| S1 | 0.20 | 0.50 | 1.00 |
| S2 | 0.23 | 0.58 | 1.15 |
| S3 | 0.23 | 0.58 | 1.15 |
| S4 | 0.17 | 0.43 | 0.85 |
| S5 | 0.30 | 0.75 | 1.50 |

### 4.3 What the likelihood answer means — corrected in 1.2.0

The likelihood question asks **how often the scenario is attempted or contacted in a typical
12-month period, before considering whether controls would prevent it**. That is a threat event
frequency. The question text and help text state this explicitly, and the help text tells the
user not to discount the answer for existing controls.

Control effectiveness is applied **once**, as susceptibility (§5). In `CAL-1.0` the question
asked how "plausible" the scenario was *given existing controls*, while the engine still
multiplied the answer by susceptibility — so control effectiveness was counted twice. An
independent audit identified this as a conceptual defect. The correction changes the question
wording and the documented interpretation; the answer bands themselves are unchanged.

Documented in `parameters.frequency.answerInterpretation`, asserted by
`tests/audit_corrections.test.php` and by the frontend model tests.

## 5. Susceptibility

Classification: `heuristic`. Susceptibility is the modelled probability that a threat event
becomes a loss event. It combines the scenario's structural resistance with one
organisation-level control-maturity modifier.

| Scenario | Min | Most likely | Max | Rationale |
|---|---:|---:|---:|---|
| S1 Ransomware | 0.10 | 0.30 | 0.60 | Success requires access, privilege, opportunity and failure of detection/recovery. |
| S2 Identity compromise | 0.15 | 0.35 | 0.65 | Phishing success rates are material even with MFA, and account takeover is common. |
| S3 Vulnerability exploitation | 0.08 | 0.25 | 0.55 | Requires a reachable, unpatched or misconfigured component. |
| S4 Third-party compromise | 0.05 | 0.20 | 0.50 | Propagation into our environment is the exception, not the rule. |
| S5 DDoS / disruption | 0.15 | 0.30 | 0.60 | Mitigation is common, but material disruption still occurs. |

Applied modifier: **security maturity (QP7)** — Very limited ×1.80, Limited ×1.40,
Moderate ×1.00, Strong ×0.70, Very strong ×0.50, Unknown ×1.00 with a ×1.50 widening.
Values are clamped to `0.005 – 0.99`.

**Potential bias:** one organisation-level answer carries the whole control dimension. An
organisation with excellent identity controls but poor backup, or the reverse, receives the
same modifier for every scenario. Scenario-specific control effectiveness is out of scope in
v1 and is listed as a limitation in the product.

## 6. Loss magnitude

### 6.1 Disruption-cost anchor (QP8) — `heuristic`

| Answer | Min (EUR/day) | Most likely | Max |
|---|---:|---:|---:|
| Less than €25k | 5,000 | 12,000 | 25,000 |
| €25–100k | 25,000 | 45,000 | 100,000 |
| €100–500k | 100,000 | 200,000 | 500,000 |
| €500k–€2m | 500,000 | 900,000 | 2,000,000 |
| €2–10m | 2,000,000 | 3,500,000 | 10,000,000 |
| More than €10m | 10,000,000 | 14,000,000 | 40,000,000 |
| Unknown / skipped | 8,000 | 60,000 | 1,500,000 |

When QP8 is Unknown, the fallback band is multiplied by the **organisation-size (QP1)**
modifier — Less than €10m ×0.25, €10–50m ×0.60, €50–250m ×1.20, €250m–€1bn ×3.00, more than
€1bn ×8.00, Unknown ×1.00 with a ×1.80 widening.

The anchor is the single most influential input in the model. It is optional in v1 for
usability, and skipping it both widens the range and reduces the confidence score.

### 6.2 Impact multiplier — `internally-derived`

Source: requirements v2 §12 illustrative impact multipliers, retained as the v1 basis.
Most-likely values inside each published range are internal derivations.

| Answer | Min | Most likely | Max |
|---|---:|---:|---:|
| Minor | 0.25 | 0.50 | 1.00 |
| Moderate | 0.50 | 1.00 | 2.00 |
| Significant | 1.00 | 2.20 | 5.00 |
| Severe | 3.00 | 6.00 | 15.00 |
| Critical | 8.00 | 16.00 | 40.00 |

**Unknown (1.2.0): an equal-weight mixture over the five answers above**, applied after the
scenario impact scale. Mean of the mixture (base bands) 6.7633, average of the five band means
6.7633 (identical by construction), middle answer ("Significant") mean 2.7333, ratio 2.474,
envelope 0.25 – 40.00. `CAL-1.0` used a single band (`0.25 / 2.00 / 40.00`, mean 14.08) which
raised the central estimate by roughly 5× relative to the "Significant" answer; an independent
audit measured 5.15× on scenario expected loss.

The multiplier is applied to the **daily** disruption-cost anchor, so "Significant" means
"a loss of roughly one to five days of disruption cost", not "a loss equal to daily cost".

### 6.3 Scenario impact scale — `heuristic`

| Scenario | Scale | Rationale |
|---|---:|---|
| S1 Ransomware | 1.20 | Combined disruption, restoration, forensics and extortion cost. |
| S2 Identity compromise | 0.90 | Often bounded by fraud and remediation scope. |
| S3 Vulnerability exploitation | 1.00 | Reference scale. |
| S4 Third-party compromise | 0.85 | Loss is mediated by contractual and substitution options. |
| S5 DDoS / disruption | 0.60 | Consequence is usually availability-bound and time-limited. |

### 6.4 Primary-loss modifiers — `heuristic`

| Modifier | Question | Values | Widening when Unknown |
|---|---|---|---|
| Critical-service dependency | QP2 | Low ×0.60, Moderate ×0.80, High ×1.00, Very high ×1.30, Extreme ×1.60 | ×1.40 |
| Recovery capability | QP6 | Very low ×1.50, Low ×1.25, Moderate ×1.00, High ×0.80, Very high ×0.65 | ×1.40 |

Both act on the shared loss anchor; the effect propagates into both primary and secondary
loss magnitude. **Potential bias:** recovery capability is self-assessed, and self-assessment
of recovery readiness is frequently optimistic.

## 7. Secondary loss

Mechanism: `Secondary Loss = Bernoulli(SLEF) × SLM`, drawn **once per simulated trial**.

Classification: `heuristic`. **The model does not calculate or predict statutory fines,
regulatory penalties or specific legal liabilities.** Where regulatory or reputational
exposure influences the assumption, it is a generic financial-loss assumption only.

**Draw granularity (clarified in 1.2.0).** The secondary-loss Bernoulli draw is made once per
simulated trial, not once per realised loss event, because the model does not draw event counts
(§2). The reported secondary-loss occurrence rate is therefore the share of simulated trials in
which a secondary loss was drawn, not an event-level rate. The user interface labels it
accordingly.

| Scenario | SLEF min | mode | max | SLM min | mode | max |
|---|---:|---:|---:|---:|---:|---:|
| S1 Ransomware | 0.25 | 0.45 | 0.70 | 0.50 | 1.20 | 2.50 |
| S2 Identity compromise | 0.20 | 0.38 | 0.60 | 0.40 | 0.90 | 2.00 |
| S3 Vulnerability exploitation | 0.15 | 0.32 | 0.55 | 0.40 | 1.00 | 2.50 |
| S4 Third-party compromise | 0.15 | 0.35 | 0.60 | 0.40 | 0.90 | 2.00 |
| S5 DDoS / disruption | 0.10 | 0.22 | 0.45 | 0.30 | 0.60 | 1.50 |

SLM is a multiple of the same daily disruption-cost anchor used for primary loss.

Modifiers:

| Modifier | Question | Values | Applies to |
|---|---|---|---|
| Sensitive-information exposure | QP4 | Limited ×0.50, Moderate ×0.75, Significant ×1.00, Very significant ×1.35, Critical ×1.70 (Unknown ×1.00, ×1.50 widening) | SLEF, all scenarios |
| Third-party dependency (secondary) | QP5 | Low ×0.60, Moderate ×0.80, High ×1.00, Very high ×1.30, Extreme ×1.60 (Unknown ×1.00, ×1.40 widening) | SLEF, S4 only |

Additional widening of SLEF: ×1.30 when the impact answer is Unknown; ×1.20 when control
maturity (QP7) is Unknown.

## 8. Frequency modifier

| Modifier | Question | Values | Applies to |
|---|---|---|---|
| Public exposure | QP3 | Limited ×0.70, Moderate ×0.90, Significant ×1.00, Extensive ×1.25, Very extensive ×1.50 (Unknown ×1.00, ×1.40 widening) | S1, S2, S3, S5 |
| Third-party dependency (frequency) | QP5 | Low ×0.50, Moderate ×0.75, High ×1.00, Very high ×1.35, Extreme ×1.70 (Unknown ×1.00, ×1.40 widening) | S4 only |

Public exposure deliberately **does not** apply to S4: the third-party scenario is driven by
the supplier's exposure, not by our own attack surface. This is asserted by a test.

## 9. Input confidence

**Renamed and re-based in 1.2.0.** The indicator is now presented as **Input confidence**. It
describes the completeness of the answers and the width of the resulting distribution. It is
**not** statistical confidence, **not** a confidence interval and **not** a probability that the
result is correct. Every response declares this explicitly:
`confidence.basis = heuristic-input-quality`, `confidence.isStatisticalConfidence = false`.

Start at 100 and subtract:

| Condition | Penalty |
|---|---:|
| Scenario likelihood answer Unknown | −18 |
| Scenario impact answer Unknown | −20 |
| Daily disruption-cost anchor Unknown (derived instead) | −15 |
| Each Unknown organisation-profile answer | −5 |
| Simulated distribution wide (CV ≥ 1.20) | −8 |
| Simulated distribution very wide (CV ≥ 2.00) | −15 |
| Provisional calibration status | −15 |

Levels: **High** ≥ 85 · **Medium** ≥ 62 · **Low** < 62, **capped at Medium while the calibration
is provisional** (`confidence.maxLevelWhenProvisional = Medium`). The cap exists because the
calibration values are heuristics that have not been externally validated, so the model must not
present a "High" input-confidence badge on the strength of complete answers alone. The model
loader rejects a model that declares a provisional release status while allowing the High level,
so the cap cannot be removed by accident.

Worked examples:

| Case | Score | Level |
|---|---:|---|
| All answers provided including QP8, contained distribution | 85 | Medium (capped from High) |
| All answers provided, QP8 skipped | 70 | Medium |
| One scenario answer Unknown, QP8 provided | 67 | Medium |
| Both answers Unknown for one scenario, QP8 provided | 47 | Low |
| Both answers Unknown, QP8 skipped, several profile answers Unknown | < 20 | Low |

The published notice (`content.confidenceNotice`) is rendered in the results view, the
methodology and the report, and the browser model schema requires it to be present.

## 10. Thresholds and engine limits

| Setting | Value |
|---|---|
| Configurable loss thresholds | €100k, €500k, €1m, €5m, €10m |
| Default iterations per scenario | 5,000 |
| Minimum / maximum iterations | 1,000 / 50,000 |
| Scenarios | 5 (fixed) |
| Questions per scenario | 2 (fixed) |
| Histogram bins | 40 (final bin is an overflow bin above the 99th percentile) |

The threshold probabilities are the share of simulated trials above each threshold. Every
response also returns `statistics.thresholdExceedanceCounts`, the integer number of trials above
each threshold, and the interface reports a zero as "0 of 5,000 simulated trials" rather than as
a bare zero, so that a zero cannot be read as impossibility. They are not presented as
probabilities of a specific event occurring.

## 11. Structural simplifications

1. Only five scenarios are modelled; other material cyber risks are outside the model.
2. No correlation or dependency between scenarios is modelled. The portfolio figure is the
   **sum of scenario expected values**, explicitly labelled as such; no joint percentile is
   produced (`jointPercentilesAvailable: false`).
3. **Annualisation (clarified in 1.2.0).** The model computes an annualised exposure
   approximation: LEF × one sampled magnitude per trial. It does not draw event counts and does
   not sum per-event severities, so the reported percentiles are not percentiles of realised
   annual loss totals. An independent event-based model (Poisson event counts with per-event
   severities) reproduced the same expected value but materially different percentiles, which is
   why the model now declares this explicitly. See §2.
4. Loss magnitude is sampled once per trial rather than a separate magnitude per event.
5. Scenario-specific control effectiveness is not assessed; one organisation-level answer
   drives susceptibility.
6. Interval arithmetic (`min × min`, `mode × mode`, `max × max`) is used when combining the
   anchor with multipliers and ranges. The exact distribution of a product of triangular
   variables is not derived.
7. Secondary loss uses one probability and one magnitude distribution per scenario, drawn once
   per trial.
8. Statutory fines, regulatory penalties and specific legal liabilities are excluded.
9. Insurance recoveries, indemnities and contractual transfers of loss are not modelled.
10. Reputational loss is expressed only through a generic secondary-loss assumption.
11. **Model-form uncertainty is not represented.** The simulation propagates the uncertainty
    encoded in the answers and in the parameters. It does not propagate uncertainty about the
    model structure itself: the scenario set, the triangular distribution choice, the calibration
    multipliers, the interval arithmetic and the independence assumption are design choices that
    the simulation cannot validate. This is stated in the product's limitations list and in the
    methodology.
12. **Correlation uncertainty is not represented**, in either direction. Correlation would move a
    portfolio percentile up or down, which is why no portfolio percentile is presented at all.

## 12. Calibration review table (development plan phase 22)

| Parameter | Scenario | Distribution | Min | Mode | Max | Source | Rationale | Confidence in parameter | Potential bias | Classification |
|---|---|---|---|---:|---:|---:|---|---|---|---|---|
| TEF — Very unlikely | all | triangular | 0.01 | 0.03 | 0.10 | requirements v2 §12 | Illustrative frequency band retained as v1 basis | Medium | Anchored to a published example, not to observed data | internally-derived |
| TEF — Unlikely | all | triangular | 0.05 | 0.15 | 0.30 | requirements v2 §12 | as above | Medium | as above | internally-derived |
| TEF — Possible | all | triangular | 0.20 | 0.50 | 1.00 | requirements v2 §12 | as above | Medium | as above | internally-derived |
| TEF — Likely | all | triangular | 0.50 | 1.50 | 3.00 | requirements v2 §12 | as above | Medium | as above | internally-derived |
| TEF — Very likely | all | triangular | 1.50 | 4.00 | 10.00 | requirements v2 §12 | as above | Medium | as above | internally-derived |
| TEF — Unknown | all | mixture (5 components, equal weight) | 0.01 | 1.5227 (mean) | 10.00 | internal | Mean is exactly the average of the five answers; cannot exceed the range of the answers | Medium | Mean sits 2.69× above the middle answer because the bands are multiplicative; disclosed and asserted | internally-derived |
| Frequency scale | S1–S5 | scalar | — | 0.85–1.50 | — | internal | Relative threat activity per scenario | Low | Sector-specific activity differences | heuristic |
| Susceptibility | S1–S5 | triangular | 0.05–0.15 | 0.20–0.35 | 0.50–0.65 | internal | Structural resistance per scenario | Low | Depends on the scenario's real control profile | heuristic |
| Security-maturity modifier | all | scalar | 0.50 | 1.00 | 1.80 | internal | One organisation-level control signal | Low–Medium | Self-assessment optimism; one factor for all scenarios | heuristic |
| Public-exposure modifier | S1,S2,S3,S5 | scalar | 0.70 | 1.00 | 1.50 | internal | Attack surface drives contact frequency | Low–Medium | Inventory completeness is often poor | heuristic |
| Disruption-cost anchor | all | triangular | 5,000 | 12,000–14,000,000 | 40,000,000 | questionnaire bands | Mirrors the option bands; modes are internal | Medium when reported, Low when derived | User-supplied; may be under- or over-stated | heuristic |
| Anchor fallback | all | triangular | 8,000 | 60,000 | 1,500,000 | internal | Wide prior when QP8 is skipped | Low | Very wide by design; lowers confidence | heuristic |
| Organisation-size modifier | all | scalar | 0.25 | 1.20 | 8.00 | internal | Scales the fallback anchor | Low | Size is a weak proxy for disruption cost | heuristic |
| Impact multiplier | all | triangular | 0.25 | 0.50–16.00 | 40.00 | requirements v2 §12 | Illustrative multipliers retained as basis | Medium | Bands are broad; modes are internal | internally-derived |
| Impact multiplier — Unknown | all | mixture (5 components, equal weight) | 0.25 | 6.7633 (mean) | 40.00 | internal | Mean is exactly the average of the five answers | Medium | Mean sits 2.47× above the middle answer; disclosed and asserted | internally-derived |
| Widening mean-shift cap | all | scalar | — | 1.5 | — | internal | Bounds how far widening may raise a range's mean | Medium | Reduces the tail expressed by an Unknown answer; disclosed | internally-derived |
| Unknown-answer disclosure | all | deterministic | — | ×5.99 mean / ×1.14 median / ×7.83 P90 | — | internal audit | Records the measured central effect of an Unknown answer | Medium | Measured on one fixture profile; asserted by tests | internally-derived |
| Sensitivity configuration | all | deterministic | — | 10 factors | — | internal | One-at-a-time sensitivity of the expected value | Medium | Not a variance-based attribution | internally-derived |
| Impact scale | S1–S5 | scalar | 0.60 | 1.00 | 1.20 | internal | Consequence profile per scenario | Low | Sector differences | heuristic |
| Critical-service dependency | all | scalar | 0.60 | 1.00 | 1.60 | internal | Outage consequence | Low–Medium | Self-assessment | heuristic |
| Recovery capability | all | scalar | 0.65 | 1.00 | 1.50 | internal | Restoration duration and cost | Low | Self-assessment is typically optimistic | heuristic |
| Secondary-loss probability | S1–S5 | triangular | 0.10 | 0.22–0.45 | 0.70 | internal | Scenario-specific consequential-loss likelihood | Low | Not evidenced; needs future validation | placeholder |
| Secondary-loss magnitude | S1–S5 | triangular | 0.30 | 0.60–1.20 | 2.50 | internal | Multiple of the daily disruption-cost anchor | Low | Not evidenced; needs future validation | placeholder |
| Sensitive-information modifier | all | scalar | 0.50 | 1.00 | 1.70 | internal | Consequential-cost pressure | Low | Not evidenced; explicitly not a legal estimate | heuristic |
| Third-party dependency modifier | S4 | scalar | 0.50 | 1.00 | 1.70 | internal | Supplier propagation | Low | Provider portfolios change quickly | heuristic |
| Confidence weights and thresholds | all | deterministic | — | — | — | internal | Simple, inspectable, explainable to an executive | Medium | Arbitrary weights; documented and versioned | heuristic |

## 13. Known biases

1. **Self-assessment bias.** Six of the eight profile answers are self-assessed. Optimism in
   QP6 and QP7 moves the result in the direction the organisation hopes for.
2. **Anchor dominance.** The daily disruption-cost anchor drives the magnitude of every
   scenario. An error in QP8 scales the entire result.
3. **No sector calibration.** A hospital, a bank and a software vendor with the same answers
   receive the same result. Sector presets are deferred and require validated data.
4. **No correlation.** The portfolio sum understates portfolio risk if scenarios are
   positively correlated, which they generally are during a real incident.
5. **Discretisation.** Five likelihood levels and five impact levels cannot represent a
   continuous distribution of organisational circumstances.
6. **No insurance or transfer effects.** The result is a gross loss exposure.
7. **Scenario-set completeness.** Cyber risk beyond the five scenarios is invisible, so the
   total must be read as exposure to these five scenarios, never as total cyber risk.
8. **Unknown-answer conservatism (disclosed).** An Unknown answer is an equal-weight mixture
   over the available answers. Its median is close to the middle answer (×1.14) but its mean is
   higher (×5.99) and its tail much wider (×7.83), because the answer bands are multiplicative.
   An assessment in which every answer is Unknown is about ×42 the all-known baseline. These
   figures are stored in `parameters.unknownAnswerDisclosure` and asserted by the test suite, so
   a reviewer can see exactly what an Unknown answer does. The weights are configurable if a
   calibration review concludes that the mixture should be weighted differently.
9. **Compound extremes (pending review).** Combinations of the highest option levels produce very
   large compounded figures. The all-maximum profile yields an expected annual loss of
   approximately €25.1bn on the documented fixture, which is arithmetically valid but has not
   been validated as a realistic forecast. `parameters.plausibilityReview.status` is
   `pending-expert-review`, and the release checklist requires a risk-professional review of the
   compound multipliers before extreme results are relied upon.
10. **Widening is capped, which is itself a judgement.** The 1.5 mean-shift cap reduces how much
    an Unknown answer widens the upper tail. It exists to stop widening from inflating the
    central estimate, and it is documented rather than hidden, but it is a modelling choice
    rather than a measured quantity.

## 14. Change policy

- Calibration values are changed only by publishing a new calibration version together with
  a new version record under `fairquickmodel/versions/`.
- The meaning of an existing version is never edited in place.
- The regression baseline in `tests/expected/` is regenerated deliberately, as part of the
  same change, and the change is recorded in the version record.
- Because the questionnaire retains no assessment, a calibration change cannot alter any past
  result.
- When a value moves from `heuristic` or `placeholder` to `externally-evidenced`, the source
  must be cited in this document and in the parameter's `source` field.

## 15. Reference implementation note

The engine that implements this model is `server/includes/fair_engine.php`. Inputs are assembled
in exactly one place (`buildScenarioInputs`), so the Monte Carlo path, the analytic expectation
and the sensitivity analysis cannot diverge. The engine is independent of the HTTP layer and of
the presentation layer, and it is exercised by `tests/distributions.test.php`,
`tests/engine.test.php`, `tests/behaviour.test.php`, `tests/regression.test.php` and
`tests/audit_corrections.test.php`. `tools/dump-model.php` prints the resolved tables above
directly from the active model files, so this document can always be checked against the code.

The independent audit model, `audit/reference-model.mjs`, is a separate implementation written
from the parameter file. It reproduces the production engine to about 1e-9 relative difference
and independently implements the mixture prior and the widening cap, so a change to either is
detected as a divergence rather than silently accepted.

## 16. Audit corrections in 1.2.0

An independent quantitative, statistical and FAIR-methodology audit of model 1.0.0 concluded
"pass with material corrections". The four mandatory and five recommended corrections are listed
below with the evidence that pins each one. `docs/AUDIT_RESPONSE_FAIR-QK-1.1.md` records the
finding-to-correction mapping in full.

| # | Audit finding | Correction in 1.2.0 | Evidence |
|---|---|---|---|
| QK-01 | The likelihood question asked for plausibility *given existing controls* but was implemented as TEF and then multiplied by susceptibility, counting controls twice. | The question now asks how often the scenario is attempted or contacted **before** control effectiveness, and says so in the help text. Control effectiveness is applied once, as susceptibility. | §4.3; `parameters.frequency.answerInterpretation`; `tests/audit_corrections.test.php`; frontend `model.test.ts`; `scenarios.json` wording. |
| QK-02 | The Unknown priors were punitive, not merely wide: TEF mean 6.18× and impact mean 5.15× the typical answer, making an all-Unknown portfolio ≈ €260.5M against a €761k baseline. | Unknown answers are an equal-weight mixture over the available answers, whose mean is exactly the average of the five answers and cannot exceed their range. Widening is additionally bounded by a 1.5 mean-shift cap. | §4.1, §6.2; `parameters.unknownAnswerDisclosure`; audit `unknownPriors.neutralityVerdict = PASS`; all-Unknown portfolio now €32.5M (×42.5) instead of €260.5M (×342). |
| QK-03 | Reported percentiles were of an annualised LEF × LM approximation, not realised annual losses, and were presented as if they were. | The model declares its annualisation method; every response sets `realisedAnnualTotalsModelled = false`; the methodology, results view and report state that percentiles describe an annualised exposure approximation. The model loader rejects a model that claims otherwise. | §2, §11; `parameters.annualisation`; `tests/audit_corrections.test.php`; frontend schema literal `false`. |
| QK-04 | User-facing claims had to match what is computed (percentile explanation, secondary-loss wording, threshold-zero wording). | The methodology, glossary, limitations, results view, report and scenario detail were rewritten; secondary loss is described as a per-trial draw; a zero threshold result is shown as "0 of 5,000 simulated trials". | §2, §7, §10; `content.json` methodology, terminology, limitations, `annualisationNotice`, `confidenceNotice`; `ThresholdTable`, `ScenarioTable`, `ReportView`, `ScenarioDetailPanel`. |
| QK-05 | "High confidence" was awarded to an unvalidated heuristic calibration. | The indicator is renamed **Input confidence**, declares `basis = heuristic-input-quality` and `isStatisticalConfidence = false`, and is capped at Medium while the calibration is provisional. The loader rejects a provisional model that allows High. | §9; `parameters.confidence`; `tests/audit_corrections.test.php`; the baseline records level `Medium` at score 85. |
| QK-06 | The "risk drivers" chart showed normalised components, not sensitivity. | The chart is renamed **Modelled components**, and a genuine one-at-a-time sensitivity analysis of the analytic expected annualised exposure is computed for every answer option of every factor, returned in the response and rendered as a chart, a table and a report section. | §15; `FairEngine::sensitivity()`; `tests/audit_corrections.test.php` verifies each factor against a direct recalculation to 1e-9. |
| QK-07 | Extreme inputs produced finite but non-credible estimates (all-max ≈ €25.1bn) with no documented review. | `parameters.plausibilityReview` records `pending-expert-review`; §13.9 documents the extreme-case magnitudes; the release checklist requires a risk-professional review before extremes are relied upon. | §13.9; `tools/validate-model.php` gate; `docs/RELEASE_CHECKLIST.md`. |
| QK-08 | The model did not state that model-form, distribution-shape, calibration and correlation uncertainty are outside its scope. | The limitations list, the methodology and this document state it explicitly. | §11.11–12; `content.json` limitations and methodology; `tests/audit_corrections.test.php`. |
| QK-09 | Zero exceedances were displayed as a bare zero, implying impossibility. | The response returns integer exceedance counts and the interface renders "0 of N simulated trials" with the statement that this is not evidence of impossibility. | §10; `statistics.thresholdExceedanceCounts`; `ThresholdTable`, `ScenarioTable`, `ReportView`. |

## 17. Test evidence for this version

| Suite | What it protects |
|---|---|
| `tests/audit_corrections.test.php` | One test per audit correction: the mixture neutrality property, the disclosed central effect, the widening cap, the annualisation declaration, the exceedance counts, the input-confidence cap, the sensitivity analysis, and the model-form-uncertainty statements. |
| `tests/behaviour.test.php` | Monotonic behaviour of every answer and modifier, Unknown widening without improvement, extreme profiles, and that incident volume alone does not determine financial ranking. |
| `tests/engine.test.php` | Portfolio identity (sum of expected values), percentile ordering, frequency/magnitude consistency, histogram completeness, seed reproducibility, iteration convergence. |
| `tests/regression.test.php` | The recorded baseline envelope for the fixture profile, including the input-confidence score and level. |
| `tests/model.test.php` | Model integrity: version record, option sets, modifier coverage, calibration classification, and that `parameters.json` never reaches the browser. |
| `frontend/tests/*` | Browser model schema (including the required annualisation and confidence notices), request/response validation, formatting, and the threshold/Unknown display helpers. |
| `audit/run-audit.mjs` | Independent cross-implementation agreement, analytic expectation, Monte Carlo error, sensitivity, extreme cases, the effect of the widening cap, and the event-aggregation comparison. |

Run everything with:

```bash
php tests/run-tests.php                 # 110 PHP tests
php tools/validate-model.php            # deployment gates
cd frontend && npm run build            # lint, typecheck, boundary guards, 65 tests, production build
node audit/run-audit.mjs                # independent reference-model comparison
```
