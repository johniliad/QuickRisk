# Release checklist — FAIR QuickRisk v1.3.1

Model `FAIR-QK-1.3` · model version `1.3.0` · schema `1.3.0` · calibration `CAL-1.3` · methodology `METH-1.3` · disclaimer `DISC-1.2` · application `1.3.1`

Tick every item before publishing. Items marked **(blocker)** must not be waived.

> **Status: not yet releasable as a general-availability release.** Two blockers remain open: the
> compound-extreme plausibility review (item **M-14**) and the host-side verification items.
> Everything in the audit-correction group (M-15 … M-22) is implemented and verified.
>
> **1.3.1 is a compliance patch.** It changes only the served licensing documents and the
> application version. The model, schema, calibration, methodology, disclaimer and the 1.3.0
> version record are unchanged, so no calibration review is reopened by it. It is published as a
> pre-release alongside 1.3.0.

## Model

- [x] Five scenarios defined (`tests/model.test.php`)
- [x] Two questions per scenario enforced (`tests/model.test.php`, `tests/validation.test.php`)
- [x] Answer options and Unknown handling defined (`tests/model.test.php`)
- [x] Version defined: model, schema, calibration, methodology, disclaimer (`tools/validate-model.php`)
- [x] All parameters documented and classified (`docs/MODEL_DOCUMENTATION_FAIR-QK-1.3.md`)
- [x] Monte Carlo engine tested (`tests/engine.test.php`)
- [x] 5,000 iterations per scenario by default (`tools/validate-model.php`, `tests/engine.test.php`)
- [x] Fixed-seed repeatability tested (`tests/engine.test.php`)
- [x] P10/P50/P90 validated, ordered and finite (`tests/engine.test.php`)
- [x] Threshold probabilities validated as monotone and bounded (`tests/engine.test.php`)
- [x] Input-confidence logic tested (`tests/engine.test.php`, `tests/behaviour.test.php`)
- [x] Directional behaviour validated across three synthetic profiles (`tests/behaviour.test.php`)
- [x] Convergence checked at 1,000 / 5,000 / 10,000 / 50,000 iterations (`tests/engine.test.php`, `tools/benchmark.php`)
- [ ] **(blocker)** Compound-extreme plausibility reviewed by a risk professional, and
      `parameters.plausibilityReview.status` updated from `pending-expert-review`
      (`docs/MODEL_DOCUMENTATION_FAIR-QK-1.3.md` §13.9; `tools/validate-model.php`)

## Audit corrections (model 1.3.0)

- [x] QK-01 Likelihood question asks for threat event frequency **before** control effectiveness;
      control effectiveness applied once, as susceptibility (`tests/audit_corrections.test.php`,
      `frontend/tests/model.test.ts`)
- [x] QK-02 Unknown answers use an equal-weight mixture over the available answers, with the
      neutrality property asserted (`tests/audit_corrections.test.php`; audit
      `unknownPriors.neutralityVerdict = PASS`)
- [x] QK-02 Widening is bounded by the documented 1.5 mean-shift cap, and the cap cannot inflate a
      central estimate beyond the bound (`tests/audit_corrections.test.php`)
- [x] QK-02 The measured central effect of an Unknown answer is disclosed, quantified and asserted
      (`parameters.unknownAnswerDisclosure`)
- [x] QK-03 The response declares the annualisation method and that realised annual totals are not
      modelled; the loader rejects a model that claims otherwise
- [x] QK-04 Methodology, glossary, limitations, results view, report and scenario detail all match
      what the model computes
- [x] QK-05 Input confidence is relabelled, declared heuristic, and capped at Medium while the
      calibration is provisional (`tests/audit_corrections.test.php`)
- [x] QK-06 A genuine one-at-a-time sensitivity analysis is reported, and each factor is verified
      against a direct recalculation (`tests/audit_corrections.test.php`)
- [x] QK-07 Extreme-case magnitudes documented and flagged as calibration-limited
      (`docs/MODEL_DOCUMENTATION_FAIR-QK-1.3.md` §13.9)
- [x] QK-08 Model-form, distribution-shape, calibration and correlation uncertainty stated in the
      model, the methodology and the limitations (`tests/audit_corrections.test.php`)
- [x] QK-09 Zero exceedances reported as a count of simulated trials, with the impossibility
      statement (`tests/audit_corrections.test.php`, `frontend/tests/results.test.ts`)

## Security

- [x] HTTPS enforced by the endpoint
- [x] Stateless origin/CSRF defence (origin allow-list, `Sec-Fetch-Site`, custom header)
- [x] No SQL: prepared statements are not required because no database is used
- [x] Input validation on every field, with unexpected fields rejected
- [x] Output encoding (React escaping; no raw HTML injection anywhere)
- [x] Rate limiting (application-level, plus recommended edge limiting)
- [x] No assessment tokens
- [x] No secrets in the web root or repository
- [x] Error disclosure disabled; fixed error codes only
- [x] Read-only filesystem permissions documented for `~/fairquickmodel/`
- [x] Assessment payloads excluded from logs
- [x] Browser storage verified empty (automated guard + manual exit test)
- [x] `Cache-Control: no-store` verified (automated test + manual check)
- [x] No PHP session or cookie used for the assessment
- [x] No assessment persistence mechanism exists (`docs/ZERO_RETENTION_PROOF.md`)
- [ ] Backups tested on the host (model files and application only; no assessment data exists)
- [ ] Manual zero-retention exit test performed on the production host and recorded below

## Legal and positioning

- [x] Disclaimer gate implemented and required
- [x] Disclaimer present on the results view
- [x] Disclaimer present on the report
- [ ] Acknowledgements re-collected under `DISC-1.2` after deployment (the disclaimer wording changed — the free-demonstration framing, EAL/not-a-forecast, not-an-audit and compliance statements were added — so stored acknowledgements no longer match the current version)
- [x] "FAIR-informed" wording used consistently; no claim of endorsement or certification
- [x] No "certification", "accreditation" or "official FAIR" wording anywhere
- [ ] Legal review of the disclaimer completed or explicitly scheduled
- [ ] Trademark review of the "FAIR-informed" formulation completed or explicitly scheduled

## Website

- [x] Navigation link planned for the main site (`docs/ILIADIS_INTEGRATION.md`)
- [x] Sitemap entries (`frontend/public/sitemap.xml`)
- [x] Canonical URL (`frontend/index.html`)
- [x] Metadata: title, description, author, robots, theme colour
- [x] Open Graph and Twitter metadata
- [x] `SoftwareApplication` structured data with an explicit disclaimer property
- [x] Static, indexable methodology page (`/methodology.html`)
- [x] Mobile and responsive layout verified at desktop, tablet and mobile widths
- [x] Accessibility: labels, visible focus, non-colour-only indicators, chart summaries,
      keyboard navigation, semantic headings
- [ ] Side-by-side visual comparison with the current `iliadis.net` performed on the host
- [ ] Lighthouse / axe spot-check performed on the deployed build

## Build and artefact

- [x] Type-check clean (`npm run typecheck`)
- [x] Model-boundary guard passes (`npm run verify:boundary`)
- [x] Browser-storage guard passes (`npm run verify:storage`)
- [x] Frontend unit tests pass (`npm run test`)
- [x] Production build succeeds and contains no source maps (`npm run build`)
- [x] PHP test suite passes (`php tests/run-tests.php`)
- [x] Model validation gate passes (`php tools/validate-model.php`)
- [x] End-to-end smoke test passes (`php tools/simulate-assessment.php`)
- [x] Performance benchmark recorded (`php tools/benchmark.php`)
- [ ] Release artefact archived with the pinned `package-lock.json`

## QuickRisk Live (add-on)

Methodology `1.0` · scenarios seeded by migrations 003–004

- [x] Pure TypeScript engine passes the four mandatory vectors A–D (`frontend/tests/live-engine.test.ts`)
- [x] All eight control combinations, full input space, bands and determinism tested
- [x] No risk formula in PHP (`tests/live_architecture.test.php`)
- [x] Session and share tokens stored only as SHA-256 hashes
- [x] Session cookie is HttpOnly + SameSite=Lax + Secure over HTTPS; CSRF header required on writes
- [x] Same-origin enforcement; no `Access-Control-Allow-Origin` anywhere
- [x] Cross-session access returns 404 for read, update, archive and share
- [x] Invalid ranges, types, JSON and methodology versions rejected (400/422) and never stored
- [x] Share links: create, read without a session, replace, revoke, expire
- [x] Archive removes the assessment from history and revokes its link
- [x] Demonstration library serves six presets with no stored score
- [x] Live request flow verified end to end (`php tools/live-smoke.php`)
- [x] Simulation-mode label and disclaimer present in simulator, history, share page, executive report
- [ ] MySQL migrations 001–005 applied on the production host
- [ ] `~/quickrisk-config/config.php` created with real credentials, origin and salt
- [ ] `node tools/verify-live-headers.mjs --url https://quickrisk.iliadis.net/` passes every check (HSTS one year, CSP without `'unsafe-inline'`, framing, no CORS grant, Subresource Integrity, small redirect body)
- [ ] `node tools/verify-live-headers.mjs --url https://quickrisk.iliadis.net/ --check-cookie` shows the session cookie as `HttpOnly`, `Secure` and `SameSite`
- [ ] Cloudflare HSTS is enabled (SSL/TLS → Edge Certificates → HSTS, 12 months, include subdomains) and the public response is not `max-age=0`; no CDN JavaScript/CSS minification is enabled (it would invalidate Subresource Integrity)
- [ ] The beta gate carries no `Header` lines (the renderer refuses them: appended after the policy they would downgrade HSTS, framing or CORS)
- [ ] `curl -sI https://quickrisk.iliadis.net/` returns the Content-Security-Policy (it ships in the web-root `.htaccess`, not the vhost) with `connect-src 'self'` and quoted `'sha256-…'` inline-style hashes, plus `Strict-Transport-Security`
- [ ] `/live/api/session.php` and `/live/api/scenarios.php` return `ok: true` on the production host
- [ ] One real save → share → revoke cycle performed on the production host
- [ ] Retention cleanup scheduled (`DELETE FROM anonymous_sessions WHERE expires_at < UTC_TIMESTAMP()`)
- [ ] Beta gate in place at `~/quickrisk-config/beta-gate.htaccess`, merged by the last deploy (the script prints whether it merged one) and verified from inside and outside the allow-list
- [ ] Temporary holding notice withdrawn before general availability: delete `~/quickrisk-config/beta-gate.htaccess`, redeploy, and delete `$WEBROOT/UnderConstruction/`

## Decision Lab and Board Risk Pack

Decision Lab methodology `1.0` · Board Risk Pack `1.0`

- [x] Treatments transform the existing QuickRisk drivers; PHP contains no Monte Carlo and no EAL formula (`tests/decision_lab.test.php`)
- [x] The paired loss vectors reproduce the published assessment figures to 1e-6
- [x] No treatment reproduces the baseline exactly; the same seed is deterministic
- [x] Overlapping treatments never combine as if independent
- [x] Appetite evaluates only configured criteria and never invents a threshold
- [x] The portfolio rule is deterministic; nothing is recommended when nothing qualifies
- [x] Budget and deadline constraints mark portfolios infeasible
- [x] The Pareto frontier contains no dominated portfolio
- [x] The published break-even effectiveness itself satisfies the appetite
- [x] Compute path verified end to end (`php tools/decision-smoke.php`)
- [x] Custom treatments require a causal lever, an evidence class and an assumption note; a bare discount is rejected
- [x] Board Risk Pack values equal the stored decision result; acronyms are defined once per page (`frontend/tests/decision-board.test.ts`)
- [x] The report states modelled reduction and never promises a saving
- [ ] One real Decision Lab analysis saved, shared and printed on the production host
- [ ] Decision Lab and Board Risk Pack reviewed with a business risk owner
## Origin gate, error pages and licensing (always on)

- [x] The committed web-root policy is fail-closed and carries no secret or placeholder
      (`tests/apache_policy.test.php`)
- [x] `tools/render-apache-policy.php` renders the gate; both publishing paths use it
- [x] `tools/deploy.sh` refuses to finish without the gate, the exemption and a single CSP
- [x] `/.well-known/` is exempt before the gate, GET/HEAD only, and excluded from the
      deploy sweep
- [x] Branded 403/404/500/503 pages match the design tokens (`tests/error_pages.test.php`)
- [x] `NOTICE` is served at `/NOTICE.txt` and reproduced in `/THIRD-PARTY-NOTICES.txt`; the
      licence and the third-party notices are present and current
      (`tests/licensing.test.php`, `npm run verify:licenses`)
- [ ] Cloudflare Transform Rule sets `X-Origin-Secret`; DNS proxied; SSL Full (strict)
- [ ] WAF/bot exception for `/.well-known/`
- [ ] Direct-to-origin probe returns 403 and the ACME probe is not 403, on the live host
- [ ] Certificate expiry more than 21 days away

## Recorded results

| Item | Date | Tester | Result |
|---|---|---|---|
| PHP test suite | 2026-10-29 | build | 77 passed, 0 failed (includes 11 endpoint tests and 9 audit-correction tests) |
| Frontend unit tests | 2026-10-29 | build | 41 passed, 0 failed |
| Production build | 2026-10-29 | build | succeeded; no source maps; initial bundle ~135 kB gzip |
| Model validation gate | 2026-10-29 | build | passed, including the 11 audit-correction gates |
| Independent audit, reference vs production | 2026-10-29 | audit | agreed to ≤ 1.2e-9 relative difference after the corrections |
| Independent audit, Unknown-prior neutrality | 2026-10-29 | audit | PASS: mixture mean equals the average of the available answers |
| Independent audit, all-Unknown portfolio | 2026-10-29 | audit | €32.5M (×42.5 the all-known baseline); €260.5M before the correction |
| Benchmark, 5 × 5,000 iterations | 2026-10-29 | build | ~155 ms wall, 4 MB peak memory |
| Benchmark, 5 × 50,000 iterations | 2026-10-29 | build | ~1.38 s wall, 22 MB peak memory |
| PHP test suite (1.3.0) | 2026-11-07 | build | 106 passed, 0 failed (includes 13 Live API, 4 Live architecture, 12 Decision Lab) |
| Frontend test suite (1.3.0) | 2026-11-07 | build | 65 passed, 0 failed (includes 7 Board Risk Pack tests) |
| Model validation gate (1.3.0) | 2026-11-07 | build | passed; version record `1.3.0.json` present |
| Live and Decision Lab smoke tools (1.3.0) | 2026-11-07 | build | both passed |
| Known-answer regression after the version bump | 2026-11-07 | build | baseline fixture `baseline-1.3.0.json` unchanged in value: no numeric drift from 1.2.0 |
| PHP test suite (1.3.0, final) | 2026-11-07 | build | 118 passed, 0 failed — the 106 above plus 4 release-identity, 3 holding-page and 5 web-server-policy guards |
| Deploy script (`tools/deploy.sh`) | 2026-11-07 | build | `bash -n` clean; excludes the notice folder, merges the unversioned beta gate, and verifies the CSP in the deployed `.htaccess` |
| PHP test suite (1.3.1) | 2026-11-14 | build | 133 passed, 0 failed — adds the served-NOTICE test and the error-page version guard |
| Frontend build (1.3.1) | 2026-11-14 | build | typecheck, boundary, storage, licence check, unit tests and Vite build all succeeded |
| Licence notices (1.3.1) | 2026-11-14 | build | `verify:licenses` current: 76 production packages, all permissive; `NOTICE.txt` served and reproduced |
| Model validation gate (1.3.1) | 2026-11-14 | build | passed; the 1.3.0 model, calibration and version record are unchanged |
| Deploy and upload script (1.3.1) | 2026-11-14 | build | `bash -n` clean; both paths render the gate and require `LICENSE.txt`, `NOTICE.txt`, the notices and the error pages |
| Release v1.3.1 | 2026-11-14 | build | pre-release published; tag tree carries `LICENSE`, `NOTICE`, `NOTICE.txt`, the notices and the four error pages |
| Compound-extreme plausibility review | *(pending)* | | **blocker** |
| Zero-retention exit test on the production host | *(pending)* | | |
| Legal review of the disclaimer | *(pending)* | | |
| Trademark review of "FAIR-informed" | *(pending)* | | |
| Side-by-side visual comparison with iliadis.net | *(pending)* | | |
| Lighthouse / axe spot-check on the deployed build | *(pending)* | | |

## Sign-off

- [ ] Requirements document reviewed against the implementation
- [ ] Zero-retention exit test completed on the production host
- [ ] Legal and trademark reviews completed or explicitly accepted as pending
- [ ] Model documentation reviewed by a risk professional
- [ ] Compound-extreme plausibility reviewed and the review status updated in the model
- [ ] `/LICENSE.txt`, `/NOTICE.txt` and `/THIRD-PARTY-NOTICES.txt` return 200 on the live host
