# Changelog

All notable changes to FAIR QuickRisk are recorded here. Versions follow the release
identity in `fairquickmodel/manifest.json`; the model, schema and application versions move
together, and a published version's meaning is never edited in place.

## [Unreleased]

### Security

Remediation of the passive-scan findings reported against the published site. Each control
lives in the layer that owns it, and each is pinned by a test or by the deployment gate.

- **Cookies**: the only cookie the application sets (the QuickRisk Live anonymous session)
  is `HttpOnly`, `Secure` and `SameSite=Lax`; `session.cookie_httponly`,
  `session.cookie_secure` and `session.cookie_samesite` are also set in the bootstrap, so a
  session that a future change or the host starts is hardened before its cookie is created.
- **HSTS**: one year with `includeSubDomains` on every response, rendered into the deploy
  policy. `tools/render-apache-policy.php` refuses a beta-gate fragment that restates a
  security header — an appended `Strict-Transport-Security: max-age=0` or
  `X-Frame-Options: SAMEORIGIN` wins over the policy and silently downgrades the site.
- **Content-Security-Policy**: one policy for Apache, for the JSON endpoints
  (`includes/security_headers.php`) and for the development server. `'unsafe-inline'` is
  gone: the inline `<style>` blocks of `methodology.html`, the four branded error pages and
  the holding notice are allowed by their sha256, computed by the renderer from the bytes
  that are being published. `object-src`, `frame-src`, `child-src` and `worker-src` are
  `'none'`; `frame-ancestors`, `form-action` and `base-uri` are stated explicitly.
- **Cross-origin**: every `Access-Control-Allow-*` header is unset in the web-server policy
  and removed by `QkHttp`, so an inherited `Access-Control-Allow-Origin: *` cannot reach a
  response.
- **X-Content-Type-Options**, **X-Frame-Options**, **Referrer-Policy**,
  **Cross-Origin-Opener-Policy**, **Cross-Origin-Resource-Policy**,
  **X-Permitted-Cross-Domain-Policies** and **Permissions-Policy** are set on every
  response, including error documents and JSON replies, and are checked by the renderer.
- **Subresource Integrity**: the build now adds `integrity="sha384-…"` to every emitted
  `<script src>` and `<link rel="stylesheet">`, hashing the files on disk in `writeBundle`.
  The HTML is not minified by any proxy, so the digests stay valid.
- **Redirects**: the application issues none — no `Location` header and no `meta refresh`
  anywhere — so the only 3xx a scanner sees is the host's or the CDN's HTTP-to-HTTPS
  redirect.

### Added

- `tools/verify-live-headers.mjs` checks the headers a browser actually receives (HSTS,
  CSP, framing, CORS, cookie flags, Subresource Integrity, the redirect body size) and
  exits non-zero on a failure, so an edge setting such as HSTS `max-age=0` cannot pass a
  release unnoticed.
- `tests/security_headers.test.php` keeps the policy, the renderer, the build and the
  application honest.
- `SECURITY.md` states how to report a vulnerability privately (GitHub private advisories,
  with the `iliadis.net` contact route as the secondary channel), what is in and out of
  scope, the best-effort response targets, coordinated disclosure, safe harbour, and the
  behaviour that is deliberate rather than defective (zero retention, synthetic SOC data,
  same-origin only, strict policy, server-only calibration).
- The README now opens with **About**, **So what?** (the problem in one sentence, a short
  video demonstration, and what it solves for whom) and **Methodology** (the complete,
  test-pinned description of the questionnaire model, its distributions, modifiers,
  percentiles, confidence scoring, the QuickRisk Live overlay and the Decision Lab rules).
- **Decision Lab compute budget**: because Decision Lab has no accounts, one server-side budget
  now applies to every compute request — 10,000 iterations, 30 candidate treatments and 256
  enumerated portfolios. A request above the iteration or candidate limit is rejected with `422`
  and a message naming the budget; a candidate set that implies more portfolios than the budget
  allows is enumerated deterministically (empty portfolio, then every single treatment, then the
  smallest combinations) so no candidate is silently skipped, and the response sets `truncated`
  with an explanation in `notes`. The effective limits are echoed as
  `provenance.computeBudget`. The persistence endpoints are unaffected.

### Fixed

- `tools/render-apache-policy.php --secret-file` read the path as if it were the secret and
  therefore always failed; it now reads the file.
- The beta gate is merged by that renderer instead of `cat`, so a gate carrying its own
  header lines stops the deploy rather than weakening the published policy.

## [1.3.1] — 2026-11-14

Compliance release. The application version moves to 1.3.1; the model, schema, calibration,
methodology and disclaimer are unchanged (`FAIR-QK-1.3` / `1.3.0` / `CAL-1.3` / `METH-1.3` /
`DISC-1.2`), and the 1.3.0 version record is left exactly as published.

### Added

- `NOTICE` is now served with the application at `/NOTICE.txt`, and its text is reproduced at
  the head of `/THIRD-PARTY-NOTICES.txt`, so Apache-2.0 section 4(d) is satisfied for the
  compiled bundle as well as for the source form.
- The application footer and the static fallback link to the Notice.

### Changed

- `tools/prepare-upload.php` and `tools/deploy.sh` verify that `LICENSE.txt`, `NOTICE.txt`,
  `THIRD-PARTY-NOTICES.txt` and the branded error pages are published.
- A test keeps the error-page version line in step with the manifest, so a release cannot
  leave four stale pages behind.

## [1.3.0] — 2026-11-14

**Provisional release.** Model `FAIR-QK-1.3` · schema `1.3.0` · calibration `CAL-1.3` ·
methodology `METH-1.3` · disclaimer `DISC-1.2` · application `1.3.0`.

### Added

- **Questionnaire**: eight organisation-profile questions and two questions for each of five
  scenarios, with a server-side Monte Carlo simulation (5,000 iterations per scenario by
  default) reporting expected annualised exposure, P10/P50/P90, threshold-exceedance
  probabilities, a one-at-a-time sensitivity analysis and an input-confidence indicator.
- **QuickRisk Live**: a deterministic SOC overlay driven by synthetic telemetry, with
  anonymous sessions, assessment history, simulation timelines, revocable read-only share
  links, a six-scenario demonstration library and an executive report.
- **Decision Lab and Board Risk Pack**: paired treatment analysis over the same engine,
  deterministic decision rules, budget and deadline constraints, a Pareto frontier and a
  printable, shareable board pack.
- **Cloudflare origin gate**: the deployed web-root policy refuses every request that does
  not carry the Cloudflare `X-Origin-Secret` header. The secret is never versioned; it is
  injected at publish time by `tools/render-apache-policy.php`, which both
  `tools/deploy.sh` and `tools/prepare-upload.php` use. The committed policy is
  fail-closed, so a policy that escapes the pipeline locks the site instead of opening it.
- **Branded error pages**: `403`, `404`, `500` and `503` documents in the site's own design
  system, served through `ErrorDocument`, self-contained and free of diagnostics.
- **`/.well-known/` exemption**: a narrow, read-only rule before the gate keeps ACME
  HTTP-01 validation reachable, so Let's Encrypt and cPanel AutoSSL can renew certificates.
- **Licensing**: `NOTICE`, a generated `THIRD-PARTY-NOTICES.txt` covering all 76 production
  packages (MIT, ISC, BSD-3-Clause, 0BSD, Apache-2.0), a served copy of the Apache licence,
  footer links, and `npm run verify:licenses` in the build.
- **Tooling**: `tools/prepare-upload.php` assembles a cPanel/FTP upload tree with the
  rendered policy; `tools/preflight.php` now checks the gate, the exemption and the error
  pages; `.gitattributes` pins LF for shell scripts and Apache policy files.

### Changed

- `tools/deploy.sh` renders the web-root `.htaccess` instead of copying it, excludes
  `.well-known/` from its `--delete` sweep, and refuses to finish unless the gate, the
  exemption, the error documents and a single Content-Security-Policy are present.
- The web-root policy now declares `ErrorDocument` for 403/404/500/503; the beta gate's own
  403 notice overrides it while the holding page is in use.
- The README documents the rendered policy, the manual upload path and the licence.

### Fixed

- Audit corrections QK-01 to QK-09 from the independent quantitative review: control
  effectiveness counted once, Unknown answers modelled as an equal-weight mixture,
  annualisation declared, input confidence relabelled and capped, sensitivity analysis
  added, compound extremes documented and flagged, zero exceedances reported as trial
  counts, and uncertainty sources stated.
- The README's database commands now use the deployed `iliadis_quickrisk` schema and
  `iliadis_quickrisk_user` account.

### Security

- Content-Security-Policy and HSTS are served from the web-root policy; assessment data
  remains zero-retention for the questionnaire; the calculation endpoint stays same-origin,
  POST-only, size-limited and rate-limited; QuickRisk Live stores only anonymous state the
  user explicitly saves.
- The origin is reachable only through Cloudflare (see the Cloudflare origin gate above),
  and certificate renewal is verified separately from the application.

### Known limitations

- Calibration values remain documented application assumptions, not externally evidenced
  FAIR constants; the model reports an annualised exposure approximation, not realised
  annual loss totals.
- The compound-extreme plausibility review, the host-side verification items and the legal
  and trademark reviews recorded in the release checklist remain open, which is why this
  release is published as a pre-release.
