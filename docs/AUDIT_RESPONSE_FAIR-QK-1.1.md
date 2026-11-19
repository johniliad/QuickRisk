# FAIR QuickRisk — response to the independent quantitative audit

**Applies to:** model `FAIR-QK-1.1` / calibration `CAL-1.1` / application `1.1.0`
**Supersedes:** `FAIR-QK-1.0` / `CAL-1.0` (withdrawn before public release)
**Date:** 2026-10-29

## 1. What the audit found

An independent quantitative, statistical and FAIR-methodology audit examined model 1.0.0 by
re-implementing it from the parameter file (`audit/reference-model.mjs`), comparing its output
with the production engine and the recorded baseline, and testing the mathematics directly. Its
verdict was **pass with material corrections**, and it identified three high-severity defects, two
medium-severity defects and four claim/terminology defects.

The audit confirmed that the arithmetic itself was correct: the reference implementation and the
production engine agreed to about 1e-9 relative difference, the portfolio figure was exactly the
sum of scenario expected values, 5,000 iterations were adequate for P10/P50/P90, and the engine
did not incorrectly sum P90s.

## 2. Finding-to-correction map

| # | Severity | Finding | Correction | How it is verified |
|---|---|---|---|---|
| QK-01 | High | The likelihood question asked for "plausibility given existing controls" but was implemented as threat event frequency and then multiplied by susceptibility, so control effectiveness was counted twice. | The question now asks how often the scenario is **attempted or contacted** in a typical 12-month period, explicitly **before** considering whether controls would prevent it, and the help text says controls are applied separately. Control effectiveness enters the model once, as susceptibility. | `parameters.frequency.answerInterpretation`; `scenarios.json` and `questions.json` wording; `tests/audit_corrections.test.php`; `frontend/tests/model.test.ts`. |
| QK-02 | High | Unknown priors were punitive rather than merely wide: TEF mean 6.18× and impact mean 5.15× the typical answer. An all-Unknown portfolio was ≈ €260.5M against a ≈ €761k baseline. | Unknown answers are an equal-weight **mixture over the available answers**, whose mean is exactly the average of the five answer means and which cannot exceed the range of the answers the user could have chosen. Widening is additionally bounded by a documented 1.5 **mean-shift cap**, so widening can no longer inflate a central estimate. | `parameters.frequency.unknownPolicy`, `parameters.impactMultiplier.unknownPolicy`, `parameters.sampling.wideningMeanShiftCap`; audit `unknownPriors.neutralityVerdict = PASS`; `tests/audit_corrections.test.php`. |
| QK-03 | High | The reported percentiles were percentiles of an annualised `LEF × LM` approximation, not of realised annual losses, and were presented without that qualification. | The model declares its annualisation method and that realised annual totals are not modelled (`meta.annualisationMethod`, `meta.realisedAnnualTotalsModelled = false`). The methodology, results view, report and scenario detail all state that percentiles describe an annualised exposure approximation. The model loader rejects a model that claims realised totals, and the browser schema requires the literal `false`. | `parameters.annualisation`; `tests/audit_corrections.test.php`; `frontend/src/validation/schemas.ts`; `content.json` methodology, `annualisationNotice`, report labels. |
| QK-04 | High | User-facing claims had to match what the model actually computes: percentile interpretation, secondary-loss wording, and the presentation of zero exceedances. | Every affected string was rewritten: the percentile explanation, the glossary, the limitations list, the results view, the printable report and the scenario detail panel. Secondary loss is described as a per-trial draw, and a zero threshold result is displayed as "0 of 5,000 simulated trials". | `content.json`; `ThresholdTable`, `ScenarioTable`, `ReportView`, `ScenarioDetailPanel`; `tests/audit_corrections.test.php`. |
| QK-05 | Medium | "High confidence" was awarded to an unvalidated heuristic calibration. | The indicator is renamed **Input confidence**, declares `basis = heuristic-input-quality` and `isStatisticalConfidence = false`, and the highest level is **capped at Medium while the calibration is provisional**. A model that declares a provisional status while allowing High is rejected at load time. | `parameters.confidence`; `tests/audit_corrections.test.php`; the regenerated baseline records level `Medium` at score 85. |
| QK-06 | Medium | The "risk drivers" chart showed normalised components, not sensitivity, so it could be mistaken for a sensitivity analysis. | The chart is renamed **Modelled components** and says what it shows. A genuine **one-at-a-time sensitivity analysis** of the analytic expected annualised exposure is now computed for every answer option of every factor (18 factors), returned in the response and rendered as a chart, a table and a report section. | `FairEngine::sensitivity()`; `tests/audit_corrections.test.php` verifies every factor against a direct recalculation to 1e-9; `SensitivityChart`, `ModelledComponentsChart`. |
| QK-07 | Medium | Extreme inputs produced finite but non-credible estimates (an all-maximum profile ≈ €25.1bn) with no documented review. | The model records `plausibilityReview.status = pending-expert-review`, the model documentation quantifies the extreme cases, the limitations list tells the reader that extremes are calibration-limited, and the release checklist requires a risk-professional review before extremes are relied upon. | `parameters.plausibilityReview`; `tools/validate-model.php`; `docs/RELEASE_CHECKLIST.md`; model documentation §13.9. |
| QK-08 | Recommended | The model did not state that model-form, distribution-shape, calibration and correlation uncertainty are outside its scope. | The limitations list, the methodology and the model documentation now state explicitly that the simulation cannot validate the model structure, the distribution shapes, the calibration or the independence assumption, and that correlation is not modelled in either direction. | `content.json` limitations and methodology; `tests/audit_corrections.test.php`; model documentation §11.11–12. |
| QK-09 | Recommended | A zero exceedance was displayed as a bare zero, which reads as impossibility. | The response returns integer `thresholdExceedanceCounts` and the interface renders "0 of N simulated trials" with the statement that this is not evidence that the threshold cannot be exceeded. | `statistics.thresholdExceedanceCounts`; `ThresholdTable`, `ScenarioTable`, `ReportView`; `tests/audit_corrections.test.php`; `frontend/tests/results.test.ts`. |

## 3. Measured effect of the corrections

| Case | Model 1.0.0 | Model 1.1.0 | Note |
|---|---:|---:|---|
| Fixture baseline portfolio (all answers known) | €761,350 | €761,350 | Unchanged: the corrections do not alter known-answer arithmetic. |
| All-Unknown portfolio | ≈ €260.5M | ≈ €32.5M | Mixture prior plus widening cap. |
| Unknown disruption cost only | ≈ €1.80M | ≈ €1.80M | The fallback anchor policy is unchanged apart from the widening cap. |
| TEF mean for an Unknown answer | 3.50 (punitive band) | 1.5227 (average of the five answers) | Neutrality verdict PASS. |
| Impact mean for an Unknown answer | 14.08 (punitive band) | 6.7633 (average of the five answers) | Neutrality verdict PASS. |
| Input confidence for a complete assessment | High (85) | Medium (85, capped) | Cap applies while the calibration is provisional. |
| Reference-vs-production agreement | ≈ 1e-9 | ≈ 1e-9 | Independent implementations still agree after the corrections. |

## 4. What the corrections do **not** change

- The answer bands, scenario scales, susceptibility ranges, modifiers and secondary-loss
  parameters are unchanged, so a fully answered assessment produces the same numbers as before.
- The zero-retention architecture, the stateless endpoint, the rate limiting, the origin/CSRF
  defences and the build-time guards are untouched.
- The portfolio figure remains the sum of scenario expected values, and no joint percentile is
  presented.

## 5. Residual items and honest limitations

1. **Compound extremes remain unreviewed.** The all-maximum profile still produces ≈ €25.1bn.
   The arithmetic is correct; the plausibility of compounding every worst case has not been
   validated. This is a release-blocking review item, not a code defect.
2. **Unknown-answer conservatism is disclosed, not eliminated.** An Unknown answer raises the
   modelled mean (×5.99) while leaving the median close to the middle answer (×1.14) and widening
   the tail (P90 ×7.83), because the answer bands are multiplicative. The figures are stored in
   the model and asserted by tests; the weights are configurable if a calibration review decides
   otherwise.
3. **Calibration remains heuristic.** No parameter is externally evidenced. The input-confidence
   indicator now says so, and the highest level is capped accordingly.
4. **Annualised exposure is still an approximation.** The model now declares it rather than
   presenting percentiles as realised annual totals. Implementing true event-count aggregation
   with per-event severities remains a candidate for the next model version; the audit's
   event-based comparison (`audit/results/reference-audit.json`, `eventAggregationComparison`) is
   retained so the decision can be re-examined with data.
5. **Host-side verification is still outstanding**: legal/trademark review of the disclaimer, a
   manual zero-retention exit test on the production host, and a side-by-side visual comparison
   with iliadis.net.

## 6. Reproducing the evidence

```bash
php tests/run-tests.php            # PHP tests, including tests/audit_corrections.test.php
php tools/validate-model.php       # deployment gates, including the correction gates
cd frontend && npm run build       # lint, typecheck, boundary guards, tests, production build
node audit/run-audit.mjs           # independent reference-model comparison and audit results
```
