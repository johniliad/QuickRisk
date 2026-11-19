# QuickRisk Live — technical and methodology reference

**Module:** QuickRisk Live (add-on to FAIR QuickRisk)
**Methodology version:** 1.0 (`SOC_RISK_METHODOLOGY_VERSION = "1.0"`)
**Status:** implemented and tested; deployment runbook in `docs/DEPLOYMENT_QUICKRISK_LIVE.md`

---

## 1. What QuickRisk Live is, and what it is not

QuickRisk Live adds an operational layer to the existing QuickRisk quantitative assessment. It
converts **synthetic SOC evidence** and **simulated response actions** into:

| Output | Range | Meaning |
| --- | --- | --- |
| Telemetry score | 0–100 | Deterministic weight of the simulated SOC observations |
| Mitigation factor | 0.05–1.00 | Residual exposure after the simulated response actions |
| SOC Threat Multiplier | 0.20×–4.00× | Bounded overlay applied to the QuickRisk baseline EAL |
| Real-Time Risk Index | 0–100 | Application-defined index with four bands |
| Real-Time EAL | ≥ 0 | Baseline EAL × SOC multiplier (illustrative overlay) |

It is **not** a SIEM, SOC, EDR, SOAR, monitoring system, AI risk engine, a
probability-of-compromise engine or an incident-management platform. **No production feed is
connected**: the interface states `SIMULATION MODE — Synthetic SOC Data` on every screen that
shows a result.

The coefficients are application-defined. They are not FAIR, NIST, CVSS, MITRE ATT&CK or
regulatory values, and they are not claims about the real effectiveness of any product.

---

## 2. Architecture

```text
React / TypeScript (frontend)
  ├─ QuickRisk questionnaire  ── POST /api/calculate.php ── PHP QuickRisk engine (unchanged)
  └─ QuickRisk Live
       ├─ PURE TS RISK ENGINE  (src/live/engine/socRiskEngine.ts)  ← only numerical authority
       ├─ Live UI (simulator, timeline, history, executive, share, methodology)
       └─ same-origin JSON API ── PHP validation + persistence ── MySQL
```

Hard boundaries, enforced by `tests/live_architecture.test.php`:

* the telemetry, mitigation, multiplier, index and EAL formulas exist **once**, in TypeScript;
* PHP validates ranges, ownership, structure and the methodology version, then stores or returns
  the client-calculated result — it never recomputes it;
* MySQL stores state and results; it never calculates;
* the QuickRisk engine, model, Monte Carlo code, charts and navigation are untouched.

---

## 3. Methodology v1.0

### 3.1 Telemetry score

```text
telemetry = min(100, IOCs × 12 × confidence + stageScore + (velocity − 1) × 10)
```

| Incident stage | Score |
| --- | --- |
| `none` | 0 |
| `triage` | 20 |
| `anomaly` | 45 |
| `compromise` | 75 |

Input bounds (enforced in the browser **and** by the API): IOC count 0–15 (integer),
IOC confidence 0.10–1.00, alert velocity 1.0–5.0.

### 3.2 Mitigation factor

```text
mitigation = (1 − EDR) × (1 − network) × (1 − identity)
EDR = 0.75   network = 0.50   identity = 0.60
```

### 3.3 SOC Threat Multiplier

```text
multiplier = clamp(1 + telemetry/100 × (4 × mitigation − 1), 0.20, 4.00)
```

Mandatory invariants:

| Condition | Multiplier |
| --- | --- |
| telemetry = 0, any controls | 1.00× (baseline preserved) |
| telemetry = 100, no controls | 4.00× |
| telemetry = 100, all controls | 0.20× |

### 3.4 Real-Time Risk Index and bands

```text
riskIndex = min(100, round(telemetry × mitigation))
```

| Index | Band |
| --- | --- |
| 0–19 | Low |
| 20–44 | Medium |
| 45–74 | High |
| 75–100 | Critical |

### 3.5 Real-Time EAL

```text
realTimeEal = baselineEal × multiplier        (rounded to 2 decimals)
```

The baseline EAL always comes from the QuickRisk quantitative model (or from a saved assessment
that recorded it). There is no fallback and no hard-coded value: without a baseline the module
shows *"Select a valid QuickRisk scenario before using QuickRisk Live."*

### 3.6 Worked example

Baseline EAL €125,000, 6 IOCs at 80%, active compromise, velocity 3.0×, no controls:

```text
6 × 12 × 0.80 = 57.6   stage 75   velocity 20   → raw 152.6 → capped 100
mitigation 1.00        multiplier 4.00×         → real-time EAL €500,000
risk index 100 / 100 — Critical
```

With all three controls: mitigation 0.05, multiplier 0.20×, real-time EAL €25,000, index 5 — Low.

### 3.7 Determinism

The engine uses no randomness, no clock, no network, no hidden state and no database state.
`frontend/tests/live-engine.test.ts` proves it, including the four mandatory test vectors, all
eight control combinations, the whole input space and the band boundaries.

---

## 4. Data model

Migrations live in `database/` and are version controlled:

```text
001_initial_schema.sql      anonymous_sessions, assessments, assessment_events,
                            share_links, scenario_library, methodology_versions,
                            assessment_snapshots
002_seed_methodology.sql    methodology_versions row for 1.0
003_seed_scenarios.sql      Ransomware Outbreak
004_seed_scenarios_more.sql Identity Compromise, Public Vulnerability Exploitation,
                            DDoS, Supplier Attack, SOC Containment
```

`assessments` stores the scenario snapshot, baseline EAL, baseline model id/version, the SOC
state, the result, the calculation trace, the methodology version and timestamps. Only
`session_token_hash` and `token_hash` are stored — never a raw token, and no name, email,
organisation or IP address is stored with an assessment.

---

## 5. API reference

All endpoints are same-origin under `/live/api/`, return the envelope
`{"ok":true,"data":…}` or `{"ok":false,"error":{"code","message"}}`, and never expose SQL,
paths, stack traces or PHP warnings.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET/POST` | `session.php` | Create or renew the anonymous session; returns a CSRF token |
| `GET` | `assessments.php` | List **this session's** assessments |
| `POST` | `assessments.php` | Save an assessment (validated, never recalculated) |
| `GET` | `assessment.php?id=` | Read one owned assessment |
| `PUT` | `assessment.php?id=` | Update one owned assessment |
| `POST` | `archive.php?id=` | Archive an owned assessment (revokes share links) |
| `POST` | `timeline.php?id=` | Replace the stored timeline |
| `POST` | `share.php?id=` | Create a read-only share link (replaces the previous one) |
| `DELETE` | `share.php?id=` | Revoke the share link |
| `GET` | `shared.php?token=` | Public read-only view of one assessment |
| `GET` | `scenarios.php` | Enabled demonstration scenario library |
| `GET` | `report.php?id=` | Stored data for the executive report (owner only) |

Required request headers on writes: `Content-Type: application/json`, `X-QuickRisk-Live: 1`,
`X-Live-Csrf: <token from session.php>`, plus a same-origin `Origin`.

```bash
# Typical sequence against a deployed host
curl -s -c jar.txt https://HOST/live/api/session.php
curl -s -b jar.txt -H 'X-QuickRisk-Live: 1' -H 'Content-Type: application/json' \
     -H 'X-Live-Csrf: <csrfToken>' -H 'Origin: https://HOST' \
     --data @payload.json https://HOST/live/api/assessments.php
```

Error codes: `SESSION_REQUIRED` (401), `ORIGIN_REJECTED` / `CSRF_REQUIRED` / `CSRF_INVALID` /
`CLIENT_HEADER_REQUIRED` / `HTTPS_REQUIRED` (403), `NOT_FOUND` (404), `METHOD_NOT_ALLOWED` (405),
`PAYLOAD_TOO_LARGE` (413), `UNSUPPORTED_MEDIA_TYPE` (415), `VALIDATION_ERROR` /
`METHODOLOGY_UNKNOWN` (422), `RATE_LIMITED` / `ASSESSMENT_LIMIT` (429), `STORAGE_UNAVAILABLE`
(503).

---

## 6. Security model

| Control | Implementation |
| --- | --- |
| Anonymous session | 256-bit random token in an HttpOnly, Secure (HTTPS), SameSite=Lax cookie; only its SHA-256 hash is stored |
| Session ownership | Every private operation resolves the session from the cookie and scopes the query with `session_id`; a foreign public id returns `404` |
| CSRF | Token returned by `session.php` (rotated on each read), stored as a hash, required in `X-Live-Csrf` on writes and compared with `hash_equals` |
| Origin | `Origin`/`Referer` must match the request host or the configured `allowedOrigins` |
| Share tokens | 256-bit random token in the URL; only the hash is stored; a new link replaces the old one; revocation and expiry are enforced server-side |
| SQL | PDO prepared statements only; no string concatenation |
| Validation | Content type, JSON syntax, required fields, ranges, booleans, scenario id format, methodology version, timeline length |
| Rate limiting | Per-client, per-action counters using the existing QuickRisk limiter |
| Output | JSON only; stored titles and labels are rendered as text by React, never as HTML |
| No outbound activity | The module never resolves an IP, fetches a URL, downloads a hash or queries a threat feed |
| No analytics | No SOC values are sent to any third party |

`server/live/api/.htaccess` allows only the ten endpoint scripts and denies the shared bootstrap,
dotfiles and everything else; `includes/.htaccess` continues to deny the PHP library.


---

## 7. Privacy and retention semantics

QuickRisk Live deliberately differs from the base questionnaire:

| Aspect | QuickRisk questionnaire | QuickRisk Live |
| --- | --- | --- |
| Storage | none (in memory only) | MySQL, anonymous session |
| Identity | none | none (no name, email, organisation) |
| Lifetime | page lifetime | session TTL (default 30 days, configurable) |
| Sharing | none | explicit read-only link, revocable |
| Browser storage | none | none (no `localStorage`, no `sessionStorage`, no IndexedDB) |

The base zero-retention guarantee is therefore scoped to the questionnaire and calculator, and
`tests/zero_retention.test.php` enforces it there. Live state stays in memory until the user
explicitly saves; the only cookie is the opaque session cookie, which JavaScript cannot read.
Clearing cookies, changing browser or device ends access to that history — by design.

---

## 8. Demonstration scenario library

Six seeded, deterministic presets: **Ransomware Outbreak**, **Identity Compromise**,
**Public Vulnerability Exploitation**, **DDoS**, **Supplier Attack**, **SOC Containment**.
Each preset stores input states and a timeline only — never a score. Applying a preset loads its
state and the engine recalculates the result, so a preset can never become stale relative to the
engine.

---

## 9. Tests

```bash
# Frontend: engine test vectors, component and validation tests
cd frontend
npm test

# PHP: QuickRisk suite + Live API and architecture tests (no MySQL required)
php tests/run-tests.php

# Live request flow end to end against the in-memory repository
php tools/live-smoke.php
```

Live coverage: 17 engine tests (mandatory vectors A–D, eight control combinations, the whole
input space, determinism, bands, validation), 13 API tests (session, ownership, save, list, read,
update, archive, timeline, share create/read/replace/revoke/expire, library) and 4 architecture
tests (no PHP formula, hashed tokens, hardened cookie, same-origin API).

---

## 10. Limitations and versioning

* No production SIEM, EDR, SOAR, SOC or incident-management feed is connected.
* Synthetic data; application-defined coefficients; the index is not a probability of compromise.
* The mitigation percentages are modelling choices, not measured effectiveness.
* Real-Time EAL is an illustrative overlay, not a forecast.
* Asset criticality, temporal decay and evidence correlation are deliberately out of scope.

Changing any formula, coefficient, range or band requires a new methodology version, new tests,
updated documentation and a review of the seeded presets. Historical assessments keep the
methodology version they were saved with (`methodology_versions` gates what the API accepts).

