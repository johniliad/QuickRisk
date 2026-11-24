# Security and privacy implementation notes

Requirements basis: requirements v2 §21 (security), §22 (privacy and zero-retention),
§23 (disclaimer and mandatory acknowledgement), plus
`requirements/QuickRisk_Live_Base_Requirements.md` for the QuickRisk Live module.
Companion documents: `requirements/ZERO_RETENTION_PROOF.md`, `docs/DEPLOYMENT_QUICKRISK_LIVE.md` and
`requirements/QUICKRISK_LIVE.md`.

> **Scope note.** Sections 1–7 describe the QuickRisk questionnaire and calculator, which remain
> zero-retention. Section 8 records the saved-result integrity boundary for the two persistence
> modules. QuickRisk Live and the Decision Lab are separate, opt-in modules that persist anonymous
> assessments in MySQL under an explicit anonymous-session policy. Their security and privacy model
> — hashed tokens, HttpOnly/SameSite/Secure cookie, CSRF header, origin check, ownership scoping,
> per-action rate limits and the stored-versus-collected data inventory — is documented in
> `requirements/QUICKRISK_LIVE.md` §6–7 and `requirements/QUICKRISK_DECISION_LAB.md` §6, and enforced by
> `tests/live_architecture.test.php` and the decision-lab tests.

---

## 1. Threat model in one paragraph

The questionnaire/calculator processes commercially sensitive information during a live calculation
but stores none of it. For that path there is no account, login, session or ambient authority, so the
classic web-application risks reduce to: request forgery against the calculation endpoint, resource
abuse, malformed input, injection into the rendered response, and accidental disclosure through logs
or error messages. Each is addressed below, and each has an automated test. QuickRisk Live and the
Decision Lab add the opt-in anonymous persistence paths described in Section 8.

## 2. Controls implemented

Unless a row says otherwise, this table describes the **questionnaire/calculator** path. The
QuickRisk Live and Decision Lab persistence paths, including their anonymous session cookie and
database, are described in Section 8 and `requirements/QUICKRISK_LIVE.md` §6–7.

| Requirement | Implementation |
|---|---|
| HTTPS only | `QkCsrf::assertHttps()` rejects non-TLS requests when `requireHttps` is enabled; `Strict-Transport-Security: max-age=31536000; includeSubDomains` is served from the web-root policy on every response, and from PHP over TLS. The Cloudflare edge returns the same value (verified 2026-11-19) |
| `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` | `QkHttp::CACHE_HEADERS` and the configured `headers` map, asserted by a test |
| `Pragma: no-cache` | Same |
| Secure security headers | `Content-Security-Policy` (no inline keyword; inline style blocks by sha256), `X-Content-Type-Options`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`, `Permissions-Policy`, and every `Access-Control-Allow-*` header removed |
| Subresource Integrity | The build writes `integrity="sha384-…"` on every emitted script and stylesheet |
| No PHP session for assessment state | `session.use_cookies=0`, `session.auto_start=0`; no session call anywhere |
| No authentication or assessment cookie | The questionnaire browser sends `credentials: 'omit'` and the questionnaire server never sets a cookie. The separate Live/Decision anonymous session cookie is covered in Section 8 |
| No browser storage of assessment data | Zustand without persistence middleware; build-time guard script |
| No assessment data in URLs | No client-side router; no query string or fragment use |
| Answers submitted only by HTTPS POST | Single POST endpoint; `requirePost()`; `api/.htaccess` rejects non-POST at the edge |
| Server-side validation of every answer | `QkValidation::validatePayload()` validates version, disclaimer, question codes, option codes, duplicates, completeness and unknown fields |
| Strict request-size limits | `CONTENT_LENGTH` and body-length checks against `maxRequestBytes` (8 KiB default) |
| Stateless CSRF/origin defence | `QkCsrf`: HTTPS + Origin/Referer allow-list + `Sec-Fetch-Site` + a custom header that forces a preflight. No token is issued, stored or validated |
| Output encoding to prevent XSS | React escapes all interpolated values; no `dangerouslySetInnerHTML` anywhere; user input is never echoed into a response |
| Rate limiting | `QkRateLimiter` (APCu, file or in-memory), `429` with `Retry-After`; edge limiting recommended as well |
| No sensitive values in logs | `QkLog::event()` writes only an allow-listed event code and interpolates nothing else |
| No request/response body logging | No body logging exists; the documented vhost `LogFormat` records the request line only |
| Error handling never leaks internals | Fixed JSON error codes and generic messages; `display_errors=0`; exceptions are caught and mapped; validation messages never echo submitted values (asserted by a test) |
| No SQL string concatenation | The questionnaire/calculator uses no database at all; Live and Decision Lab use PDO prepared statements (Section 8) |
| No third-party analytics/telemetry/session replay | None included; the questionnaire frontend makes exactly one network request, to its own endpoint. Live and Decision Lab make same-origin API requests only |
| No server-side temporary files, reports or PDFs | Reports are rendered and printed in the browser |
| No queues, jobs, webhooks or email | None exist |
| No secrets in the web root or repository | Configuration lives in `includes/config.php` (denied by `.htaccess`) with deployment overrides in `~/quickrisk-config/config.php`, outside the web root. No credential is committed |
| Least privilege | `~/fairquickmodel/` is read-only for the PHP process; no write access is required at runtime |
| Model files never exposed | The model lives outside the document root; `.htaccess` also denies `.json` in defence in depth |
| Model files never modified at runtime | The loader is read-only and the directory is not writable by PHP |

## 3. Defence in depth

1. **Edge**: `.htaccess` deny rules, non-POST rejection, security headers, optional WAF or
   `mod_ratelimit`, plus the always-on Cloudflare origin gate in the deployed web-root
   policy (a request without `X-Origin-Secret` is refused; `/.well-known/` is the only
   exemption, so certificate renewal keeps working). Requirement document:
   `requirements/QuickRisk_Cloudflare_Origin_Gate_Requirements.md`.
2. **Request**: origin/fetch-metadata/custom-header checks, size limits, JSON content type.
3. **Schema**: strict allow-list validation; unexpected fields are rejected, not ignored.
4. **Engine**: typed ranges, clamps, finite-value guarantees; a malformed model fails the
   request instead of producing a wrong number.
5. **Response**: `no-store`, JSON only, no internal identifiers or persisted seed and no stack traces. The disposable in-memory simulation seed is disclosed as `meta.simulationSeed` solely so the run can be replayed; it is generated per request and stored nowhere.
6. **Build**: type-check, model-boundary guard, browser-storage guard, unit tests, and a PHP
   test suite that includes security payload cases.

## 4. Security test coverage

`tests/validation.test.php` exercises: unacknowledged disclaimer, stale disclaimer version,
smuggled fields (`assessmentId`, `token`, `seed`, `iterations`, `modelParameters`, `userId`,
`organisationName`, `retention`), unknown question and option codes, cross-option-set values,
a sixth scenario, missing required answers, duplicate answers, XSS payloads, SQL-injection
payloads, path-traversal strings, embedded JSON, lowercase and over-length codes, non-string
codes, and version mismatches. It also asserts that error messages do not echo submitted
values.

`tests/zero_retention.test.php` provides the persistence evidence listed in
`requirements/ZERO_RETENTION_PROOF.md`.

## 5. Privacy position

The statements below describe the questionnaire and calculator (see the scope note at the top of
this document). QuickRisk Live and the Decision Lab persist only anonymous assessments the user
explicitly saves, under the policies in `requirements/QUICKRISK_LIVE.md` §7 and
`requirements/QUICKRISK_DECISION_LAB.md` §6.

- No name, email address, organisation name or any identity field is collected by the questionnaire.
- No account or login exists for the questionnaire.
- No assessment token, identifier, timestamp or result is stored by the questionnaire.
- The user is told, before the assessment and again near the calculation controls, that the
  questionnaire does not retain their answers or results, and that closing or refreshing the
  page discards the assessment.
- The acknowledgement of the disclaimer is held in browser memory only.
- The product claim is stated as **"the questionnaire and calculator do not persist assessment
  data, and QuickRisk Live and the Decision Lab store only what you explicitly save"**, and the
  limits of that claim (transient processing outside the application's architecture) are
  disclosed in the privacy notice.
- The lifecycle is also stated in the interface itself: a one-line trust strip on the entry page
  ("Zero-retention by default · Synthetic SOC signals · Indicative FAIR-QK model") whose claims open
  the data-handling and methodology dialogs, a "Where your data goes" dialog, a persistent "what
  this tab is holding" line, a questionnaire banner, a results note, a session-save note on the two
  saving surfaces and a start-over confirmation. The wording lives in
  `frontend/src/content/dataLifecycle.ts` and is asserted by
  `frontend/tests/data-lifecycle.test.ts`, so the 30-day anonymous-session retention and the
  zero-retention questionnaire are described identically on every screen.

## 6. Residual risks and accepted limitations

| Risk | Status |
|---|---|
| Resource abuse by repeated calculation requests | Mitigated by rate limiting and size limits; residual risk accepted with edge limiting recommended |
| Transient copies in browser, OS or network memory | Outside the application's control; disclosed to the user |
| Hosting-provider monitoring that captures traffic | Outside the application's control; disclosed to the user |
| Legal review of the disclaimer wording | Recommended before production use; recorded in the disclaimer model content |
| Trademark review of the "FAIR-informed" wording | Recommended before production use; the UI never implies endorsement or certification |

## 7. Logging contract

The only logging call in the application is `QkLog::event()`. It accepts a code, rejects
anything outside a fixed allow-list, and writes the literal string
`FAIR QuickRisk event: <CODE>`. It is impossible to pass an answer, a result, a seed, a
client identifier or an exception message through it. A test asserts that `error_log` appears
in exactly one file and with exactly that pattern.

## 8. Saved-result integrity (Decision Lab and QuickRisk Live)

Decision Lab and QuickRisk Live have different trust boundaries, and neither is a substitute for
the base questionnaire's zero-retention path.

**Decision Lab.** The save handler now re-validates the submitted result before storing it:
arithmetic between baseline, residual, delta and reduction share; cost sums and annualisation
against the server-resolved treatments; appetite criteria and pass flags; treatment identity and
definitions; portfolio and recommendation membership; provenance, seed, iteration budget, model,
Board Pack and methodology versions; and the report basis. Portfolio rows are validated against the
expected-annual-loss criterion only; joint P90 and exceedance criteria are recorded as excluded
from portfolio selection. A mismatch returns `422` and nothing is stored. This is documented in
`requirements/QUICKRISK_DECISION_LAB.md` §6.1.

A custom treatment's identity is the SHA-256 of its canonical validated definition, not its name.
The server re-derives that identity on create, compute and save, and rejects two selected treatments
that resolve to the same identity (`422`). A client-supplied custom id is never trusted. Saved
analyses keep their stored definitions and are replayed, not recomputed. The owner history is a
read-only replay of those records: it stores no QuickRisk assessment answers and offers no route to
recalculate from history.

Every Decision Lab compute response also carries `provenance.inputFingerprint`, a SHA-256 of the
validated input set. The client refuses to attach a response to a snapshot unless it is present.
This is an input-identity and staleness control, not a security token or a proof that the server
performed the calculation.

**P2.2 decision: rejected by the owner on 2026-11-22.** The application's user is the person
seeking their own decision-support results; the owner judged a new receipt secret unnecessary for
that use. No `decision.receiptKeys` map, receipt key or receipt code exists. P2.1 consistency
validation is the accepted save-boundary control.

**Accepted residual risk:** a caller who constructs a fully self-consistent Decision Lab result
can still assert it, save it and share it. The product does not claim that a Decision Lab save is
server-origin-proven. No receipt must be described as active or planned as a delivered control.

**QuickRisk Live.** The result remains client-calculated. The server validates ranges, ownership,
structure, scenario equality and the methodology version, but it does not independently reproduce
the telemetry, mitigation, multiplier or risk-index formula. **P2.3 Option C** was selected by the
owner on 2026-11-22: saved and shared Live values are explicitly labelled **user-recorded
simulation data**, not independently verified by the server. A shared Live assessment is a
read-only record of what was saved, not a cryptographic proof that the server calculated it. No PHP
verifier was added and `tests/live_architecture.test.php` remains unchanged.

The Live per-action rate-limit settings shape was corrected in P4.5: the configured limits are now
passed to the limiter through its `rateLimit` key. The limiter uses the `auto` backend; if APCu is
unavailable and no Live store path is configured, it falls back to process-local memory. This is
recorded in `requirements/QUICKRISK_LIVE.md` §6.

**Trust boundary.** The anonymous session owner can affect their own saved record. The public
share reader relies on the server's structural validation and on the explicit user-recorded label;
neither can protect against a compromised browser or a user who is determined to assert data from
their own endpoint.
