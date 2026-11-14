# Changelog

All notable changes to FAIR QuickRisk are recorded here. Versions follow the release
identity in `fairquickmodel/manifest.json`; the model, schema and application versions move
together, and a published version's meaning is never edited in place.

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
