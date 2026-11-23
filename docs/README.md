# FAIR QuickRisk documentation

| Document | Purpose |
|---|---|
| [`DEPLOYMENT_QUICKRISK_LIVE.md`](DEPLOYMENT_QUICKRISK_LIVE.md) | **First-time runbook for the whole application**, including MySQL, the Live/Decision Lab configuration file and the Live/Decision Lab acceptance checks. |
| [`MODEL_DOCUMENTATION_FAIR-QK-1.3.md`](MODEL_DOCUMENTATION_FAIR-QK-1.3.md) | **Active model.** Every parameter with its distribution, range, source, rationale, classification, confidence and potential bias; includes the 1.2.0 audit corrections carried into 1.3.0. |
| [`SECURITY_AND_PRIVACY.md`](SECURITY_AND_PRIVACY.md) | Threat model, implemented controls, defence in depth, test coverage, residual risks. |

Every document in this directory except this index is listed above, and every entry links to a
file that exists in the repository. Historical model documentation for the superseded 1.0 model is
not included in the public repository.

## Documents maintained in `requirements/`

The deployment plan, the module references, the release gate and the review records now live in
the `requirements/` directory. That directory is deliberately kept outside version control (see
`.gitignore`), so these documents are held locally and are not part of the published repository:

| Document | Purpose |
|---|---|
| `DEPLOYMENT_FIRST_TIME.md` | Complete first-time deployment plan: prerequisites, database and migrations, configuration, publish, Apache, verification, go-live, rollback. |
| `QUICKRISK_LIVE.md` | QuickRisk Live: methodology v1.0, architecture, data model, API reference, security and privacy semantics. |
| `QUICKRISK_DECISION_LAB.md` | Decision Lab and Board Risk Pack: paired treatment model, decision rules, API, persistence, tests, status. |
| `AUDIT_RESPONSE_FAIR-QK-1.1.md` | The independent audit's findings, the correction made for each one, and the evidence that pins it. |
| `ZERO_RETENTION_PROOF.md` | Evidence that assessment data is never persisted, plus the manual exit test. |
| `RELEASE_CHECKLIST.md` | The release gate, with how each item is verified and where results are recorded. |
| `APPLICATION_LOGIC_REVIEW_A.md` | Dated whole-application logic review: confirmed defects, integrity weakness, incomplete workflows, evidence and severity. |
| `APPLICATION_LOGIC_REMEDIATION_PLAN.md` | Phased implementation plan for the review findings, with acceptance criteria, tests and handoff prompts. |

The directory also holds the product requirements, the module development plans, the disclaimer
improvement plan and `REFACTOR_SPEC.md` (the UX and decision-engine refactoring specification). Those
are working records rather than current-state guides; the documents in this `docs/` directory and the
repository `README.md` are the maintained descriptions of how the application works.

## Reading order for a new contributor

1. `README.md` at the repository root, for the methodology and the build and verification commands.
2. `docs/MODEL_DOCUMENTATION_FAIR-QK-1.3.md`, to understand what the numbers mean.
3. `requirements/AUDIT_RESPONSE_FAIR-QK-1.1.md`, to understand which model behaviours are deliberate
   corrections and which are still open review items.
4. `requirements/ZERO_RETENTION_PROOF.md`, before changing anything that touches request handling.

## Commands referenced by the documentation

```bash
# PHP
php tests/run-tests.php                 # full test suite
php tests/run-tests.php zero-retention  # one group
php tools/validate-model.php            # deployment gate
php tools/dump-model.php                # resolved calibration tables
php tools/simulate-assessment.php       # end-to-end smoke test
php tools/live-smoke.php                # QuickRisk Live request flow
php tools/decision-smoke.php            # Decision Lab compute path
php tools/benchmark.php                 # performance and memory
php tools/generate-baseline.php         # regenerate the regression baseline (deliberate)

# Run the questionnaire and calculation API locally (see the local-runner limits below)
node tools/serve-local.mjs              # then open http://127.0.0.1:8000/

# Frontend
cd frontend
npm run lint          # type-check + model-boundary, browser-storage and licence guards
npm run test          # unit tests
npm run test:e2e      # browser UI tests; install Chromium first if no local browser
npm run build         # lint + unit tests + production build
```

`tools/serve-local.mjs` serves the compiled frontend and the questionnaire API from one origin. It
routes the core QuickRisk Live endpoints but does not start MySQL and does not route the Decision
Lab `decision-*.php` endpoints; use the deployed PHP/MySQL setup for full Live and Decision Lab
persistence.
