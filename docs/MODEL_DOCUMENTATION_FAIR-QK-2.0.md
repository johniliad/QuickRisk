# FAIR QuickRisk model documentation — FAIR-QK-2.0

Status: provisional release. Application 1.3.5. Model FAIR-QK-2.0 / 2.0.0, methodology METH-2.0,
calibration CAL-2.0, disclaimer DISC-2.0.

## 1. What changed in 2.0

Version 2.0 replaces the active heuristic answer-band calibration with a Bayesian reference-class posterior and a posterior-predictive annual-loss simulation. It keeps the five-scenario questionnaire, the FAIR vocabulary, zero-retention behaviour and the legacy engine as an explicit fallback when no validated posterior package is available.

The material modelling changes are:

1. Frequency, materiality and positive severity are informed by documented public evidence rather than only expert bands.
2. Each simulated year draws a Poisson count of material-loss events and sums a positive severity for each event. A zero-event year is a zero-loss year.
3. Scenario dependence is represented by shared posterior parameter draws, not by summing independent scenario percentiles.
4. One optional organisation-specific observation can update the shared posterior: `organisationEvidence.materialLossEventCount`.
5. Treatment effects are drawn across simulation iterations rather than once per analysis.
6. The actual in-memory simulation seed is disclosed so Decision Lab can replay the assessment; it is never persisted.
7. Legacy-fallback loss magnitudes are sampled from lognormal distributions moment-matched to the triangular ranges, giving heavier right tails; the posterior engine uses a lognormal severity directly.
8. Organisation-profile modifiers are triangular uncertainty ranges sampled per simulated year in the legacy fallback, so calibration uncertainty is propagated into the output.
9. Legacy-fallback frequency bands and scenario susceptibility bases are anchored to DSIT 2025/2026 prevalence and material-cost probability rather than illustrative mappings.

## 2. Evidence base

### DSIT Cyber Security Breaches Survey 2025/2026

Used for:

- organisation-size annual attack prevalence: 42% micro, 46% small, 65% medium, 69% large, 43% all-business;
- probability of a non-zero material financial cost among organisations reporting an attack, derived from published Table 4.2a and 4.1a bases;
- positive-cost severity quantiles for micro/small and medium/large organisations.

The `250M_1B` class uses the medium/large source quantiles with an explicit +0.5 log offset
(about 1.65× the source median) to represent the larger end of that band. That scaling is an
elicitation assumption, not a source estimate; the source-quantile fit is validated before the
offset is applied. The `GT1B` class uses the IBM sensitivity described below.

The survey measures identified breaches and perceived costs of the most disruptive incident. It is not a measure of all annual material losses. Its data are UK-specific and exclude sole traders and most public-sector organisations.

### IBM Cost of a Data Breach 2025

Used only for the `GT1B` large-enterprise severity class. The published average is USD 4.44 million. The source does not publish a median or variance, so a lognormal sigma of 1.25 is declared as a weak prior. The value is not pooled with DSIT respondent-level quantiles.

### Verizon DBIR 2026

Used only to inform scenario-composition sensitivity and narrative plausibility. It does not provide an organisation-level annual denominator for all five scenarios. No DBIR percentage is activated as a QuickRisk scenario frequency.

### ECB exchange rates

2025 annual averages are used for evidence conversion only:

- GBP: 1 EUR = 0.8567923137255 GBP, therefore EUR per GBP = 1.1671442611062.
- USD: 1 EUR = 1.1299831372549 USD, therefore EUR per USD = 0.8849690277343.

## 3. Joint model

For an organisation in reference class `c` and posterior draw `d`:

- annual attack rate `lambda_attack(c,d)` is derived from a Beta posterior on attack probability;
- material-loss probability `p_material(c,d)` follows a Beta posterior;
- scenario weights `w_s(d)` follow a weak Dirichlet prior;
- shared scenario offsets represent residual scenario variation in frequency, materiality and severity;
- positive event severity follows a lognormal distribution fitted to published quantiles;
- primary and secondary shares follow a Beta allocation;
- questionnaire answers apply declared, uncertain elicitation multipliers.

For each simulated year, the model computes the material-event rate for each scenario, draws a Poisson count, samples one lognormal severity per event, sums event severities and then applies the primary/secondary allocation. Scenario totals are summed into a joint portfolio total. All scenarios use the same posterior draw in a year; simulation noise uses scenario-specific random streams so an answer to one scenario cannot change another scenario's random sequence.

## 4. Optional evidence update

When `materialLossEventCount = y` is supplied, the likelihood for a posterior draw is:

`P(y | lambda_material) = exp(-lambda_material) * lambda_material^y / y!`

Likelihood weights are normalised, and the model resamples the joint draws. The response reports the count and effective sample size. A low effective sample size is disclosed. When the count is Unknown, no likelihood update is applied.

The update assumes that the previous 12 months are exchangeable with the modelled future year, that the count is complete for material financial losses, and that a Poisson count model is adequate. These assumptions are not validated for an individual organisation.

## 5. Questionnaire multipliers

Frequency and impact option multipliers, profile factors and the daily-cost elasticity are elicitation assumptions. They are versioned in `reference-classes.json` and labelled `elicitation-assumption`. They are not estimated causal effects. Scenario weights are a weak Dirichlet prior because no public source supplies all five annual rates.

Organisation-profile modifiers are stored as triangular uncertainty ranges (min, mode, max). The central estimate uses the mode and the deviation is sampled per simulated year in the legacy fallback, so the output distribution reflects calibration uncertainty as well as input uncertainty. The active posterior engine applies the questionnaire multiplier means from the validated inference package. The legacy frequency bands are derived by `tools/calibrate-frequency-bands.php` from DSIT prevalence and material-cost probability, and the scenario susceptibility bases are anchored to the same evidence.

## 6. Annual totals and dependence

The response declares `posterior-predictive-compound-poisson-annual-total` and `realisedAnnualTotalsModelled: true`. Percentiles are posterior-predictive intervals for annual total losses under the model. They are not confidence intervals, guarantees, audited accounts or forecasts.

Because material-event counts are often zero and severity is heavy-tailed, P50 can be zero and the mean can exceed P90. This is a property of the declared distribution, not an arithmetic inconsistency; the response states it explicitly.

**Terminology.** The user-facing label for this posterior-predictive mean is *indicative annual exposure*; the JSON field remains `expectedAnnualLoss` for API compatibility. This is a labelling clarification — the quantity, its computation and its caveats are unchanged.

Joint percentiles are available only while the posterior engine is active. The legacy fallback declares the annualised-exposure method, `realisedAnnualTotalsModelled: false` and no joint percentile.

## 7. Calibration and validation

The independently generated package contains:

- `reference-classes.json` — fitted reference classes and elicitation assumptions;
- `posterior-<class>.json` — joint posterior draws per size class;
- `treatment-posteriors.json` — assumption-only treatment draws;
- `calibration-report.json` — validation gates, predictive checks and known gaps;
- `manifest.json` — versions, activation state and SHA-256 hashes.

Activation requires a package whose model and calibration versions match the runtime, whose status is `reference-posterior-validated`, whose synthetic flag is false and whose hashes validate. Invalid packages fail closed to the legacy engine.

Validation includes positive-severity quantile calibration, temporal prevalence holdout, source-role checks and joint-draw structural checks. **Known gap:** no independent organisation-level prospective loss dataset is available. National aggregate evidence cannot validate individual organisations, and scenario composition remains an elicitation prior.

## 8. Confidence and diagnostics

Input confidence remains a heuristic about answer completeness and distribution width; it is not statistical confidence. The provisional release caps it below High. Threshold exceedance is reported as a count and a Wilson score interval, with a warning when fewer than ten simulated years exceed the threshold. Mean standard error is also reported.

## 9. Decision Lab

Decision Lab consumes posterior annual-loss vectors. A treatment with a frequency effect changes the Poisson count using the same count uniform; a severity effect scales each event severity. Effects and their uncertainty are integrated across iterations. Common random numbers preserve comparability between baseline and treated states.

All treatment effects remain curated, assumption-only estimates. The Board Risk Pack must state that treatment savings are model outputs, not measured savings.

## 10. Provenance and retention

The browser receives the actual simulation seed in `meta.simulationSeed` so the analysis can be replayed. It receives no assessment identifier and no persisted seed. The seed and all answers remain in process memory only; no calculation state is stored server-side.

## 11. Historical compatibility

Calculations performed under FAIR-QK-1.3 and earlier remain historical records under their original methodology and model identifiers. They must not be relabelled or recalculated as 2.0.

