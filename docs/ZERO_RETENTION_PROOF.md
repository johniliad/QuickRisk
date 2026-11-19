# Zero-retention proof and exit test (questionnaire and calculator)

This document is the evidence that the QuickRisk **questionnaire and calculator** have **no
persistence mechanism for assessment content**. QuickRisk Live and the Decision Lab are separate
modules that persist only anonymous assessments the user explicitly saves, and are out of scope
here (see `docs/QUICKRISK_LIVE.md` §7 and the scope note in `tests/zero_retention.test.php`). This
proof is a release blocker: the release must not be published until every item below passes.

The claim is stated precisely, as required:

> **The questionnaire and calculator do not persist assessment data.**
>
> It does not claim that no technical system anywhere can ever transiently process the data.
> Browser memory, operating-system memory management, network infrastructure and security
> monitoring controlled by the hosting provider are outside the application's architecture.

---

## 1. Architecture

```text
Browser (memory only)                Apache                    PHP (one request)
─────────────────────                ──────                    ─────────────────
answers in a Zustand store    POST   static assets      →       validate → engine
no storage, no cookie  ───────────►  /api/calculate.php ─────►  Monte Carlo in memory
no URL state                                     ◄──── JSON ────  response, then discard
results in memory only                                        no session, no file, no row
```

## 2. What is never persisted

This table is scoped to the questionnaire and calculator. QuickRisk Live and the Decision Lab
persist anonymous saved assessments in MySQL, and their paths are excluded by the test that backs
this table (`tests/zero_retention.test.php`).

| Vector | Status | Evidence |
|---|---|---|
| Database | Not used at all | No MySQL/MariaDB/PDO/mysqli anywhere; `tests/zero_retention.test.php` fails on any occurrence |
| Assessment tables (`assessments`, `organisation_answers`, `scenario_results`) | Do not exist | No schema, no migration, no ORM |
| PHP session | Never started | `session.use_cookies=0`, `session.auto_start=0`; no `session_start`, `$_SESSION` or `session_id` in the codebase |
| Cookies | None created | No `setcookie`; the calculation request is sent with `credentials: 'omit'` |
| Browser storage (local, session, IndexedDB, Cache API) | Not used | `tools/verify-no-browser-storage.mjs` fails the build on any reference |
| Service worker | Not registered | No service worker file; the guard fails the build on any reference |
| URL, query string, fragment, history | Never contains assessment data | No client-side router; `pushState`, `replaceState` and `location.hash` are forbidden by the guard |
| Files and temporary files | Never written for assessment content | Only `rate_limit.php` touches the filesystem, and only for a salted hash + counter |
| Application and error logs | Fixed event codes only | `QkLog::event()` accepts only a 14-item allow-list and interpolates nothing else; `error_log` exists in exactly one file |
| Apache access-log extensions | None | No request-body logging; the documented vhost uses a minimal `LogFormat` |
| Queues, jobs, webhooks, email | Not used | No queue client, no `curl_*`, no `mail()` |
| Generated reports/PDF | Client-side only | `window.print()` in the browser; no server-side PDF exists |
| Third-party analytics/telemetry | Not used | No analytics script, no external font, no CDN, no session replay |
| Assessment tokens / identifiers | Do not exist | The request schema rejects any unexpected field, including `token`, `assessmentId`, `userId`, `seed`, `iterations` |
| Calculation seed | Process memory only | Generated with `random_int()`, used for one request, never returned (`seedDisclosed: false`) and never logged |
| Model files | Read-only | The application never writes to `~/fairquickmodel/`; a test asserts the model contains no identity fields |

## 3. Automated evidence

```bash
php tests/run-tests.php --filter=zero-retention
```

Covers:

- no session, cookie, database, network-client or shell primitive in `server/**/*.php`;
- no filesystem write outside the documented rate-limiter store, and the rate limiter
  references no assessment field;
- `error_log` called from `logging.php` only, with the fixed-code pattern;
- no browser-storage, cookie, service-worker or persistence-middleware reference in the
  frontend sources;
- no assessment identifier, token or persistent results route in the frontend;
- `Cache-Control: no-store, no-cache, must-revalidate, max-age=0` and `Pragma: no-cache`
  configured on the endpoint;
- two identical live requests are not served from a cached result.

```bash
cd frontend && npm run verify:storage && npm run verify:boundary
```

`verify:boundary` additionally proves that the calibration file is never bundled into the
browser build.

## 4. Manual exit test (must be performed on the production host)

1. Start an assessment and enter **distinctive** test answers (for example `QP8 = More than
   €10m`, `S1A = Very likely`, `S1B = Critical`).
2. Open the browser developer tools and inspect:
   - **Application → Storage**: local storage, session storage, IndexedDB, cookies and cache
     storage must all be empty of application data;
   - **Network**: exactly one POST to `/api/calculate.php` carrying the answers, and no other
     request containing them; the response must show `Cache-Control: no-store`;
   - **Sources**: no service worker is registered.
3. Complete the calculation and confirm the response appears in memory only.
4. Close the tab, reopen the application, and confirm that **no previous assessment can be
   resumed or recovered** and that the landing page offers a fresh start.
5. On the server, confirm:
   - `~/fairquickmodel/` contains only the model files and no assessment record
     (`grep -ril "optionCode" ~/fairquickmodel/` returns nothing);
   - the Apache access log contains request lines only, and no line contains an answer code
     or a calculated value (`grep -i "POSSIBLE" access.log` returns nothing);
   - the PHP error log contains only `FAIR QuickRisk event: <CODE>` lines;
   - no new file exists under `~/public_html/quickrisk/` (compare a directory listing before
     and after).
6. Confirm the rate-limit store (if the file backend is used) contains only
   `{"window":<int>,"count":<int>}` entries with hashed file names.

Record the date, tester and result in `docs/RELEASE_CHECKLIST.md`.

## 5. Accepted, documented infrastructure metadata

Normal web infrastructure may process source IP address, timestamp, HTTP status and
user-agent. Assessment answers and results are **never** attached to those records. This is
stated to the user in the privacy notice, together with the precise limitation that
transient processing outside the application's architecture cannot be controlled by the
application.

## 6. Superseded acceptance criterion

Requirements v2 §31 item 9 ("The model version and simulation seed are stored") is
**superseded** by the v2 zero-retention requirements in §14 and §28, which state that the
seed may exist only in server memory for the duration of one calculation and must never be
persisted. Every response therefore reports:

```json
"seedPersisted": false,
"seedDisclosed": false,
"retentionMode": "zero-retention"
```

Reproducibility for testing is achieved with a fixed seed in the automated test suite and in
`tools/simulate-assessment.php`; production reproducibility of a historical user assessment
is neither required nor possible, because no user assessment is retained.
