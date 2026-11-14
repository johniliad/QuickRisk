# QuickRisk Live

<img width="720" height="480" alt="image" src="https://github.com/user-attachments/assets/c77c2947-5ca5-4d7a-bf08-435b07bf84f1" />


Rapid, probabilistic, FAIR-informed estimation of financial cyber-risk exposure across
five common scenarios, with an optional deterministic real-time SOC overlay.

**Published at:** https://quickrisk.iliadis.net/


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
- A static React/TypeScript frontend, compiled to plain HTML/CSS/JavaScript, with no
  Node.js runtime in production.

## What this application is not

- Not a full FAIR analysis, audit, certification, compliance assessment or assurance opinion.
- Not a calculation or prediction of statutory fines or legal liabilities.
- Not a basis, on its own, for material business decisions.
- Not endorsed by the FAIR Institute, ENISA, Verizon, IBM or any regulator.

## QuickRisk Live in one paragraph

QuickRisk estimates baseline cyber-loss exposure. QuickRisk Live demonstrates how current SOC
observations and response actions could change the operational risk state. Its risk engine is a
pure TypeScript module (the only numerical implementation); PHP and MySQL only validate, store
and return what the engine calculated. Methodology v1.0, coefficients and the four mandatory test
vectors are documented in `docs/QUICKRISK_LIVE.md`. **The SOC data is synthetic: no production
SIEM, EDR, SOAR or SOC feed is connected.**

## Two retention models, deliberately

| | QuickRisk questionnaire | QuickRisk Live |
|---|---|---|
| Storage | none (in memory only) | MySQL, anonymous session |
| Identity | none | none |
| Lifetime | page lifetime | session TTL (default 30 days) |
| Sharing | none | explicit read-only link, revocable |

Assessment answers and results for the questionnaire are processed transiently and are **not
persisted by the application** — not in a database, file, PHP session, cookie, browser storage,
cache, queue, log, report or third-party service. There is no account, no assessment token, no
save/resume and no persistent results URL. See `docs/ZERO_RETENTION_PROOF.md` for the evidence and
the exit test. QuickRisk Live is the one deliberate exception, and it stores only anonymous
technical state that the user explicitly saves.

---

## Repository layout

```text
requirements/                          normative requirements document
FAIR_QuickRisk_DEVELOPMENT_PLAN_v2.md  development plan
fairquickmodel/                        authoritative model -> deployed to ~/fairquickmodel/
  manifest.json                        identifiers, versions, iterations, thresholds
  content.json                         disclaimer, methodology, privacy, positioning
  questions.json                       organisation-profile questions + scenario templates
  answer-options.json                  answer option sets
  scenarios.json                       scenario presentation and wording
  parameters.json                      CALIBRATION - server only, never sent to the browser
  versions/1.0.0.json                  model version record
server/                                PHP -> deployed to ~/public_html/quickrisk/
  api/calculate.php                    the only QuickRisk endpoint (POST, JSON, no-store)
  includes/                            config, model loader, engine, validation, hardening
  includes/live/                       QuickRisk Live: config, db, repository, validation, handlers
  live/api/*.php                       QuickRisk Live endpoints (same-origin JSON)
  live/api/.htaccess                   allow-list for those endpoints
  .htaccess                            deny rules, headers, caching policy
database/                              QuickRisk Live migrations and scenario seeds
  001_initial_schema.sql               anonymous_sessions, assessments, events, shares, library
  002_seed_methodology.sql             methodology_versions row for 1.0
  003_seed_scenarios.sql               Ransomware Outbreak
  004_seed_scenarios_more.sql          the other five demonstration scenarios
frontend/                              React + TypeScript + Vite (build-time only)
  shared/publicModel.ts                build-time model adapter (public files only)
  src/                                 domain, state, api, validation, components, styles
  src/live/                            QuickRisk Live: engine, store, api client, views
  live/share/index.html                the read-only share shell (second HTML entry)
  public/                              robots.txt, sitemap.xml, static methodology page,
                                       live/share/.htaccess (the one rewrite rule)
static-pages/                          hand-deployed pages, outside the build and never shipped
  UnderConstruction.html               temporary holding notice (self-contained, noindex)
tests/                                 PHP test suite (no framework required)
tools/                                 validation, audit dump, benchmark, baseline, guards,
                                       live-smoke.php, serve-local.mjs, local-router.php
docs/                                  deployment, model documentation, proofs, checklist
```

## Build and verify

Requirements: Node.js LTS and npm for the frontend; PHP 8.x for the API, tests and tools.

```bash
# Frontend: type-check, guard checks, unit tests and the production build
cd frontend
npm ci
npm run build            # emits frontend/dist (static assets only, no source maps)

# PHP: engine tests, model validation gate and an end-to-end smoke test
php tests/run-tests.php
php tools/validate-model.php
php tools/simulate-assessment.php
php tools/benchmark.php

# QuickRisk Live: request flow end to end against the in-memory repository (no MySQL needed)
php tools/live-smoke.php

# On the host: check the deployed configuration, database and web-root .htaccess
php tools/preflight.php --web-root="$HOME/public_html/quickrisk" --origin=https://quickrisk.iliadis.net
```

Deployment is documented in `docs/DEPLOYMENT.md`, and the complete first-time runbook
(including MySQL, the Live configuration file and the acceptance checks) is
`docs/DEPLOYMENT_FIRST_TIME.md` and `docs/DEPLOYMENT_QUICKRISK_LIVE.md`. The short version:

```bash
# 1 + 2. the model, the compiled application and the rendered web-server policy
./tools/deploy.sh

# Without shell access (cPanel / FTP): assemble an upload tree, then upload its contents
php tools/prepare-upload.php --append-beta-gate

# 3. QuickRisk Live storage (once)
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/001_initial_schema.sql
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/002_seed_methodology.sql
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/003_seed_scenarios.sql
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/004_seed_scenarios_more.sql
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/005_decision_lab.sql
```

The web-root `.htaccess` is **rendered at publish time, never copied**: the versioned
`server/.htaccess` is deliberately fail-closed, and `tools/render-apache-policy.php` injects
the Cloudflare origin secret. Copying `server/.htaccess` by hand locks the site — that is the
intended failure mode, not a bug.

No database, no Node.js process and no background service is required for the questionnaire. The
database is required only by QuickRisk Live; without it, the questionnaire works normally and Live
reports that storage is unavailable.

## Running it on your own machine

You need **Node.js 20+** and **PHP 8.2+** (any web server is *optional* — PHP's built-in
server is enough). If PHP is not on PATH, this repository ships a portable CLI at
`.tmp/php/php.exe`, or set `QUICKRISK_PHP` to any PHP binary.

Run the entire application from one terminal:

```bash
node tools/serve-local.mjs
```

The script, in order: loads the PHP CLI, runs the model deployment gate
(`tools/validate-model.php`), builds the frontend if `frontend/dist` is missing (add `--build`
to force a fresh build, or `--no-validate` to skip the gate), then serves everything from one
origin — the compiled React app *and* the API — so the endpoint's same-origin protection works
exactly as it does in production.

- Open <http://127.0.0.1:8000/> (change the port with `--port 8080`).
- Methodology: <http://127.0.0.1:8000/methodology.html>.
- The API lives at `/api/calculate.php` and answers POST only.

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

- Model: `FAIR-QK-1.3` · model version `1.3.0` · schema `1.3.0` · calibration `CAL-1.3`.
- Calibration changes require a new calibration version and a new version record; the
  meaning of an existing version is never edited in place.
- Calibration values are application assumptions/heuristics, documented and classified in
  `docs/MODEL_DOCUMENTATION_FAIR-QK-1.3.md`. They are not universally authoritative FAIR
  constants.
- Version 1.3.0 corrects defects found by an independent quantitative audit; the findings and
  the corrections made for each one are recorded in `docs/AUDIT_RESPONSE_FAIR-QK-1.1.md`.
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
