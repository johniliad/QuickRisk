# Offline posterior calibration

This directory builds the read-only Bayesian package consumed by the PHP runtime. It uses only
the Python standard library and is not deployed. The runtime never calls Python, fetches evidence
or runs MCMC.

## Inputs

- `evidence/dsit-2025-2026.json` — DSIT Cyber Security Breaches Survey 2025/2026 prevalence,
  material-cost probability bases and positive-cost quantiles.
- `evidence/ibm-2025.json` — IBM average large-breach cost and the explicitly weak lognormal shape.
- `evidence/dbir-2026.json` — contextual scenario-composition notes; no activated frequencies.
- `evidence/fx-2025.json` — ECB annual reference-rate provenance.
- `evidence/dsit-2024-2025-holdout.json` — prior-wave prevalence holdout.
- `evidence/treatment-priors.json` — existing curated treatment three-point assumptions.
- `evidence/manifest.json` — source roles, classifications and activation policy.

## Build

```bash
python calibration/run.py \
  --evidence calibration/evidence \
  --output fairquickmodel/inference \
  --draw-count 2000 \
  --seed 20261124 \
  --allow-activation
```

The output is deterministic for the same evidence, code, draw count and seed. It writes:

- `reference-classes.json` — fitted class parameters and questionnaire assumptions;
- `posterior-<class>.json` — one compact joint-draw file per size class;
- `treatment-posteriors.json` — assumption-only treatment draws;
- `calibration-report.json` — gate results, diagnostics, source list and known gap;
- `manifest.json` — versions, activation state and SHA-256 hashes.

`--allow-activation` returns a non-zero exit status if any activation gate fails. A package with
`synthetic=true` can never activate.

## Model summary

- Organisation-size attack probability follows a Beta posterior with capped survey effective
  sample size to retain transportability.
- Material-loss probability follows a Beta posterior derived from published non-zero-cost bases.
- Positive severity is a fitted lognormal for DSIT classes. The `GT1B` class uses the IBM mean and
  a declared weak-prior sigma. The `250M_1B` class applies a declared +0.5 log offset to the DSIT
  medium/large fit.
- Scenario weights use a weak Dirichlet prior.
- Shared draws carry attack rate, materiality, severity, primary share, scenario weights and
  scenario-specific offsets, preserving correlation.
- Questionnaire multipliers are labelled `elicitation-assumption`.
- Treatment effects are Beta draws fitted to the curated three-point ranges and remain
  assumption-only.

## Validation

`calibration/tests/test_model.py` checks the source model, lognormal recovery, joint draw
structure, interval coverage and exported hashes:

```bash
python -m unittest discover -s calibration/tests -v
```

The validation report includes:

1. positive-severity quantile absolute-log-error and calibration-error checks;
2. a temporal prevalence holdout from the prior DSIT wave;
3. source-role and activation checks;
4. joint-draw structural assertions performed by the PHP repository.

Known gap: none of this validates an individual organisation prospectively. DSIT measures
identified breaches and perceived costs of the most disruptive incident; IBM is not a
representative UK business sample; DBIR is case-based and cannot supply annual organisation
rates. Scenario composition remains an elicitation prior.

## Updating evidence

1. Add a new versioned source file; never edit the meaning of a published source in place.
2. Record its role and prohibited uses in `evidence/manifest.json`.
3. Change the package/version identifiers and calibration version deliberately.
4. Re-run the calibration and all PHP/frontend tests.
5. Do not set `manifest.active` by hand. Activation is produced by `--allow-activation` only when
   the validation gates pass.
