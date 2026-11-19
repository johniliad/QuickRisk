# FAIR QuickRisk documentation

| Document | Purpose |
|---|---|
| [`DEPLOYMENT_FIRST_TIME.md`](DEPLOYMENT_FIRST_TIME.md) | **Complete first-time deployment plan**: prerequisites, database and migrations, configuration, publish, Apache, verification, go-live, rollback. |
| [`DEPLOYMENT_QUICKRISK_LIVE.md`](DEPLOYMENT_QUICKRISK_LIVE.md) | **First-time runbook for the whole application**, including MySQL, the Live configuration file and the Live acceptance checks. |
| [`QUICKRISK_LIVE.md`](QUICKRISK_LIVE.md) | QuickRisk Live: methodology v1.0, architecture, data model, API reference, security and privacy semantics. |
| [`QUICKRISK_DECISION_LAB.md`](QUICKRISK_DECISION_LAB.md) | Decision Lab and Board Risk Pack: paired treatment model, decision rules, API, persistence, tests, status. |
| [`MODEL_DOCUMENTATION_FAIR-QK-1.3.md`](MODEL_DOCUMENTATION_FAIR-QK-1.3.md) | **Active model.** Every parameter with its distribution, range, source, rationale, classification, confidence, potential bias, and the audit corrections made in 1.3.0. |
| [`AUDIT_RESPONSE_FAIR-QK-1.1.md`](AUDIT_RESPONSE_FAIR-QK-1.1.md) | The independent audit's findings, the correction made for each one, and the evidence that pins it. |
| [`ZERO_RETENTION_PROOF.md`](ZERO_RETENTION_PROOF.md) | Evidence that assessment data is never persisted, plus the manual exit test. |
| [`SECURITY_AND_PRIVACY.md`](SECURITY_AND_PRIVACY.md) | Threat model, implemented controls, defence in depth, test coverage, residual risks. |
| [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) | The release gate, with how each item is verified and where results are recorded. |

Every document in this directory except this index is listed above, and every entry links to a
file that exists in the repository. Working notes that are not part of the published repository —
the normative requirements, development plans and private review material — are deliberately kept
outside version control (see `.gitignore`) and are therefore not listed here. Historical model
documentation for the superseded 1.0 model is not included in the public repository.

## Reading order for a new contributor

1. `README.md` at the repository root, for the methodology and the build and verification commands.
2. `docs/MODEL_DOCUMENTATION_FAIR-QK-1.3.md`, to understand what the numbers mean.
3. `docs/AUDIT_RESPONSE_FAIR-QK-1.1.md`, to understand which model behaviours are deliberate
   corrections and which are still open review items.
4. `docs/ZERO_RETENTION_PROOF.md`, before changing anything that touches request handling.

## Commands referenced by the documentation

```bash
# PHP
php tests/run-tests.php                 # full test suite
php tests/run-tests.php zero-retention  # one group
php tools/validate-model.php            # deployment gate
php tools/dump-model.php                # resolved calibration tables
php tools/simulate-assessment.php       # end-to-end smoke test
php tools/benchmark.php                 # performance and memory
php tools/generate-baseline.php         # regenerate the regression baseline (deliberate)

# Run the whole application locally (frontend + API, single origin)
node tools/serve-local.mjs              # then open http://127.0.0.1:8000/

# Frontend
cd frontend
npm run lint          # type-check + model-boundary guard + browser-storage guard
npm run test          # unit tests
npm run build         # lint + test + production build
```
