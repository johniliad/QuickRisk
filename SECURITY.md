# Security policy

FAIR QuickRisk — <https://quickrisk.iliadis.net/> — is an independently developed,
Apache-2.0 licensed cyber-risk estimation tool. This policy says how to report a security
problem, what is in scope, and what you can expect in return.

Read *Scope* and *Deliberate behaviour that is not a vulnerability* before you test
anything: the application deliberately stores nothing from the questionnaire, and its "SOC
data" is synthetic. Neither is a vulnerability.

## Supported versions

| Version | Supported |
|---|---|
| The current application version on the published site | Yes |
| Older application versions, and older model, schema or calibration versions | No |

Fixes ship in the current version. Every result states the model identifier, model version,
schema version, calibration version and methodology version, and the footer of the compiled
site states the application version, so a report can name exactly which build and model were
affected.

## How to report a vulnerability

Do **not** open a public GitHub issue with technical detail, and do not post exploit steps
publicly.

1. **Preferred — GitHub private vulnerability reporting:**
   <https://github.com/johniliad/QuickRisk/security/advisories/new>
   (*Security → Advisories → Report a vulnerability*). The report, the discussion and the
   fix stay private until an advisory is published.
2. **Alternative —** the contact route at <https://www.iliadis.net/> with the subject
   line “QuickRisk security”.

If neither is reachable, open a public issue that says only that you have a security report
and ask for a private channel. Leave the technical detail out of it.

### What to include

- The affected URL and the application/model version shown in the page footer or in a
  calculation response.
- What you did, what happened and what you expected. Reproduction steps or a minimal proof
  of concept are worth far more than a scanner title.
- Your assessment of impact: what an attacker gains, and what they need to start with.
- Any suggested fix, if you have one.
- How you would like to be credited, or that you prefer to stay anonymous.

Please redact: no real organisational answers, no real personal data, no production
credentials, and no data belonging to anyone else.

## What to expect

These are best-effort targets for a project maintained by one person, not a contractual
service level:

| Stage | Target |
|---|---|
| Acknowledgement that the report was received | 5 working days |
| Initial triage, severity and reproduction | 10 working days |
| Fix or mitigation for a critical or high finding | 30 days where feasible |
| Fix or mitigation for anything else | next release |

You will be told what happened to the report, including when it is decided that something is
working as intended. There is **no bug bounty and no payment** for reports: the project is
free to use and independently funded.

## Coordinated disclosure

- Please give the project a reasonable opportunity to fix the issue before publishing.
- Advisories are published through GitHub Security Advisories once a fix is available, with
  the affected versions, the impact and the credit you asked for.
- A report about a third-party dependency is welcome: it will be fixed by upgrading, and the
  upstream project should be told as well.


## Safe harbour

Good-faith research on the published site or on your own copy of this repository is welcome.
The project will not pursue or support legal action for it, provided you:

- do not access, modify, delete or exfiltrate data that is not yours, and do not attempt to;
- do not degrade the service: no volumetric or resource-exhaustion testing, no automated
  scanning that ignores `robots.txt` or the rate limits, no load that would affect other
  users;
- do not use social engineering, phishing or physical intrusion against the maintainer, the
  hosting provider or any user;
- test only against accounts, sessions and data you created yourself;
- keep the details private until an advisory is published.

## Scope

In scope:

- The application at <https://quickrisk.iliadis.net/> and its JSON endpoints
  (`/api/calculate.php`, `/live/api/*`).
- The source at <https://github.com/johniliad/QuickRisk> — server code, model files, build
  tooling, tests and the shipped Apache policy.
- Authentication and authorisation of QuickRisk Live sessions and share links.
- Cross-site scripting, injection, request forgery, cache and header weaknesses, data
  exposure, access-control mistakes and unsafe deserialisation.
- Anything that lets one visitor read, alter or delete another visitor's saved assessment or
  share link.

Out of scope:

- Findings from an automated scanner with no demonstrated impact, and reports that only
  restate a header value. The response headers are documented in `README.md` (“Response
  security headers”), so a deliberate choice is not a defect.
- The hosting provider, the CDN and DNS: TLS termination, edge caching and DDoS protection
  are operated by third parties. Report those to the provider.
- Volumetric denial of service, and any testing that degrades availability.
- The synthetic SOC telemetry being synthetic, the public model files being public, and the
  absence of a login for the questionnaire: these are design decisions, described in
  `README.md` and `/methodology.html`.
- The disclaimer, the estimates themselves or disagreement with the calibration: those are
  product and methodology questions. Open an issue instead.
- Third-party dependencies: report to the upstream project (this project will still take the
  report and upgrade).

## Deliberate behaviour that is not a vulnerability

- **The questionnaire stores nothing.** Answers and results are processed in memory for one
  request and discarded; there is no session, cookie, database row, log line or result URL.
  “A result disappeared when I refreshed the page” is the intended zero-retention behaviour.
  See `docs/ZERO_RETENTION_PROOF.md`.
- **QuickRisk Live stores only what the user explicitly saves**, under an anonymous session
  with an opaque `HttpOnly; Secure; SameSite` cookie, hashed server-side. There is no name,
  email, address or account.
- **There is no cross-origin access.** The API is same-origin only, POST-only, size-limited
  and rate-limited, and it deliberately grants no CORS origin.
- **The Content-Security-Policy is strict on purpose.** A blocked inline script or style, or
  a style attribute that loses its effect, is the policy working: `'unsafe-inline'` is not
  allowed, and the static pages are allowed their own stylesheet by sha256 hash.
- **`parameters.json` is not public.** It holds calibration values and is read only by the
  server; a request that returned it would be a finding, not a feature.

## Handling of your report

- Reports are read by the maintainer, Dr. John ILIADIS.
- A report is kept only as long as needed to fix the issue and publish the advisory. Do not
  send production credentials, personal data or real organisational assessment content; if a
  proof of concept needs an assessment, use fictitious values.
- If a report contains personal data by accident, say so and it will be deleted.

## Contact

- Security reports: the GitHub private advisory link above, or
  <https://www.iliadis.net/> (subject “QuickRisk security”).
- Everything else (bugs, model questions, documentation): a normal GitHub issue at
  <https://github.com/johniliad/QuickRisk/issues>.

