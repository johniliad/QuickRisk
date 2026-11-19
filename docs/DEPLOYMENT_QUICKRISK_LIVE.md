# Deploying FAIR QuickRisk + QuickRisk Live — first-time runbook

Follow the steps in order. Every command is copy-pasteable. `HOST` is your domain,
`USER` is your shell user, and `~/public_html/quickrisk` is the web directory used by the
supplied scripts — change them consistently if your host differs.

**What is new in this release:** QuickRisk Live is an optional module. It is the only part of the
application that persists data, so it needs **MySQL 8** and a configuration file. If you skip
section 2 and 3, the QuickRisk questionnaire still works exactly as before and QuickRisk Live
shows a clear "storage unavailable" message instead of saving.

---

## 0. Before you start — facts to confirm

| Item | Why it matters | Typical value |
| --- | --- | --- |
| Domain and path | decides the canonical URL, `VITE_BASE_PATH` and the share link base | `https://quickrisk.iliadis.net/` (root) or `https://example.com/quickrisk/` (subdirectory) |
| Web root | where the compiled app and PHP are published | `~/public_html/quickrisk` |
| Private directory | holds the model, outside the web root | `~/fairquickmodel` |
| PHP version | the engine requires 8.1+; the Live code uses PHP 8.0+ syntax | `php -v` → 8.1–8.4 |
| PHP extensions | `pdo_mysql`, `json`, `openssl`, `fileinfo` | check with `php -m` |
| MySQL | Live persistence (database, user, password) | MySQL 8.0 / MariaDB 10.6+ |
| Apache | `mod_rewrite`, `mod_headers`, `mod_expires`; `AllowOverride All` | Apache 2.4 |
| TLS certificate | session cookies are `Secure`; HTTPS is enforced | Let's Encrypt or host certificate |
| SSH or SFTP | to upload and run migrations | your host's method |

Check the essentials in one go:

```bash
php -v
php -m | grep -Ei 'pdo_mysql|json|openssl|fileinfo'
apache2ctl -M 2>/dev/null | grep -Ei 'rewrite|headers|expires'
```

---

## 1. Build and verify on your own machine

```bash
# From the repository root
cd frontend
npm ci
npm run build          # typecheck + zero-retention guards + 58 frontend tests + vite build
cd ..

php tools/validate-model.php     # 22 model gates
php tests/run-tests.php          # 94 PHP tests (no database needed)
php tools/live-smoke.php         # QuickRisk Live request flow, end to end
```

All four must pass. `npm run build` produces `frontend/dist/`, which includes:

```text
index.html                 the application
live/share/index.html      the read-only share shell
live/share/.htaccess       the one rewrite rule the application uses
methodology.html           the public QuickRisk methodology page
assets/…                   hashed JS/CSS
```

If you deploy under a subdirectory such as `https://example.com/quickrisk/`, build with the base
path so asset URLs and share links stay correct:

```bash
cd frontend
VITE_BASE_PATH=/quickrisk/ npm run build
```

---

## 2. Create the database and run the migrations

```bash
mysql -u root -p
```

```sql
CREATE DATABASE iliadis_quickrisk
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'iliadis_quickrisk_user'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON iliadis_quickrisk.* TO 'iliadis_quickrisk_user'@'localhost';
FLUSH PRIVILEGES;
```

No `CREATE`/`DROP`/`ALTER` privilege is needed at runtime; schema changes are applied by you, by
hand, from the versioned files.

Apply the four migrations **in order** (they are idempotent):

```bash
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/001_initial_schema.sql
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/002_seed_methodology.sql
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/003_seed_scenarios.sql
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/004_seed_scenarios_more.sql
```

Confirm the seed rows:

```bash
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk -e \
  "SELECT version, enabled FROM methodology_versions; SELECT slug, enabled FROM scenario_library ORDER BY sort_order;"
```

Expected: one methodology row (`1.0`, enabled) and six scenarios, all enabled.

---

## 3. Create the configuration file (outside the web root)

The application reads a single optional override file, in this order:

1. the path in the `QUICKRISK_CONFIG` environment variable, if set;
2. `~/quickrisk-config/config.php`.

Create it and keep it out of the web root and out of version control:

```bash
mkdir -p ~/quickrisk-config
chmod 700 ~/quickrisk-config
cat > ~/quickrisk-config/config.php <<'PHP'
<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk + QuickRisk Live deployment configuration.
 * Never commit this file. Never place it inside the web root.
 */

return [
    'application' => [
        'environment' => 'production',
        // Every origin that may POST to /api/calculate.php or the Live API: scheme + host.
        //
        // This array REPLACES the built-in list element by element. One entry here removes
        // 'https://quickrisk.iliadis.net' from the defaults, so the page loads but every
        // calculation fails with ORIGIN_REJECTED. List every origin, not just the extra one.
        'allowedOrigins' => [
            'https://quickrisk.iliadis.net',
            'https://www.iliadis.net',
        ],
        // Optional safety net: accept any origin ending with one of these strings.
        // 'allowedOriginSuffixes' => ['.iliadis.net'],
        'requireHttps' => true,
    ],

    'rateLimit' => [
        'enabled' => true,
        'backend' => 'file',
        // A writable directory outside the web root.
        'storePath' => '/home/USER/quickrisk-ratelimit',
        // Generate once: php -r "echo bin2hex(random_bytes(32));"
        'clientHashSalt' => 'REPLACE_WITH_64_HEX_CHARACTERS',
    ],

    'live' => [
        'requireHttps' => true,
        'methodologyVersion' => '1.0',
        'sessionCookieName' => 'qrl_sid',
        'sessionTtlDays' => 30,
        // null = share links do not expire; or 1, 7, 30.
        'shareTtlDays' => null,
        'maxAssessmentsPerSession' => 100,
        'maxTimelineEvents' => 50,
        // Optional: override the share link base if it is not /live/share/ at the site root.
        // 'shareBaseUrl' => 'https://HOST/live/share',
        'database' => [
            'host' => '127.0.0.1',
            'port' => 3306,
            'name' => 'iliadis_quickrisk',
            'user' => 'iliadis_quickrisk_user',
            'password' => 'REPLACE_WITH_THE_DATABASE_PASSWORD',
            'charset' => 'utf8mb4',
        ],
        'rateLimit' => [
            'windowSeconds' => 300,
            'session' => 120,
            'save' => 40,
            'update' => 60,
            'shareCreate' => 20,
            'shareRead' => 120,
            'timelineWrite' => 60,
            'list' => 120,
        ],
    ],
];
PHP

mkdir -p /home/USER/quickrisk-ratelimit
chmod 700 /home/USER/quickrisk-ratelimit
php -l ~/quickrisk-config/config.php
```

Notes:

* `allowedOrigins` **must** list the exact scheme and host you serve; a trailing path is not
  allowed. Both QuickRisk and QuickRisk Live reject a foreign `Origin`.
* If the domain is `quickrisk.iliadis.net` or `www.iliadis.net`, the built-in defaults already
  match — but set the file anyway so the database and salt are configured.
* `shareBaseUrl` is only needed when the share page does not live at `/live/share/` relative to
  the site root.

---

## 4. Publish the files

The deployed layout (verified against `config.php`, the `.htaccess` files and `tools/deploy.sh`):

```text
~/public_html/quickrisk/            ← document root
├── index.html                      frontend/dist/
├── methodology.html
├── assets/…
├── live/
│   ├── share/index.html            the share shell
│   ├── share/.htaccess             the token → shell rewrite
│   └── api/*.php                   the ten QuickRisk Live endpoints + .htaccess
├── api/calculate.php               QuickRisk calculation endpoint
├── api/.htaccess
├── includes/                       bootstrap, engine, rate limit, logging
│   └── live/                       QuickRisk Live PHP library (denied by includes/.htaccess)
└── .htaccess

~/fairquickmodel/                   ← OUTSIDE the web root, read-only
```

Using the supplied script (rsync, model gate, permission pass):

```bash
MODEL_DIR=$HOME/fairquickmodel WEB_DIR=$HOME/public_html/quickrisk ./tools/deploy.sh
```

Or by hand:

```bash
# compiled application (includes live/share/*)
rsync -a --delete frontend/dist/ ~/public_html/quickrisk/

# PHP: calculation endpoint, Live endpoints, libraries, control files
rsync -a server/api/            ~/public_html/quickrisk/api/
rsync -a server/live/           ~/public_html/quickrisk/live/
rsync -a server/includes/       ~/public_html/quickrisk/includes/
rsync -a server/.htaccess       ~/public_html/quickrisk/.htaccess

# the model stays outside the web root and is read-only for PHP
rsync -a fairquickmodel/ ~/fairquickmodel/
chmod -R a-w ~/fairquickmodel
```

Permissions:

```bash
find ~/public_html/quickrisk -type d -exec chmod 755 {} \;
find ~/public_html/quickrisk -type f -exec chmod 644 {} \;
```

Do **not** make anything writable by the web server: QuickRisk Live writes only to MySQL.


---

## 5. Apache configuration

Required modules and overrides:

```apache
<VirtualHost *:443>
    ServerName HOST
    DocumentRoot /home/USER/public_html/quickrisk

    # .htaccess files must be honoured (Live needs FileInfo for mod_rewrite and for the
    # Header directives; Indexes for Options -Indexes).
    <Directory /home/USER/public_html/quickrisk>
        AllowOverride All
        Options -Indexes +FollowSymLinks
        Require all granted
    </Directory>

    SSLEngine on
    SSLCertificateFile      /etc/letsencrypt/live/HOST/fullchain.pem
    SSLCertificateKeyFile   /etc/letsencrypt/live/HOST/privkey.pem

    # No Header directives: the CSP, HSTS and the remaining security headers ship in
    # server/.htaccess, which tools/deploy.sh writes to $WEBROOT/.htaccess. That keeps one
    # source for both deployment shapes, because shared hosting has no apache.conf access.
    # Setting the CSP twice would send two headers, which browsers enforce as two policies.
    ErrorLog  ${APACHE_LOG_DIR}/quickrisk-error.log
    CustomLog ${APACHE_LOG_DIR}/quickrisk-access.log combined
</VirtualHost>

<VirtualHost *:80>
    ServerName HOST
    Redirect permanent / https://HOST/
</VirtualHost>
```

`style-src 'unsafe-inline'` is needed because `methodology.html`, the holding notice and the React
charts and progress bars use inline styles. `connect-src 'self'` is required by QuickRisk Live;
without it every Live request is blocked by the browser and the module reports that the server is
unreachable. Both are already in `server/.htaccess`, which is what actually serves them, so a host
without `apache.conf` access needs no change here — see `DEPLOYMENT_FIRST_TIME.md`, Step 5.

**Shared hosting / php-fpm:** `php_flag` / `php_value` are not allowed inside `.htaccess` under
php-fpm. If your host uses php-fpm, remove any such lines and put the equivalents in a
`.user.ini` inside the web root:

```ini
display_errors = Off
log_errors = On
expose_php = Off
```

Reload Apache after the change:

```bash
sudo apache2ctl configtest && sudo systemctl reload apache2
```

---

## 6. Verify the deployment

Run these from any machine. Replace `HOST`.

| # | Check | Expected |
| --- | --- | --- |
| 1 | `curl -sI https://HOST/` | `200`, `text/html` |
| 2 | `curl -sI https://HOST/methodology.html` | `200` |
| 3 | `curl -sI https://HOST/live/share/index.html` | `200` (share shell deployed) |
| 4 | `curl -s -o /dev/null -w '%{http_code}' https://HOST/api/calculate.php` | `405` (POST only) |
| 5 | `curl -s -o /dev/null -w '%{http_code}' https://HOST/includes/config.php` | `403` |
| 6 | `curl -s -o /dev/null -w '%{http_code}' https://HOST/live/api/_bootstrap.php` | `404` or `403` |
| 7 | `curl -s -o /dev/null -w '%{http_code}' https://HOST/fairquickmodel/parameters.json` | `404` |
| 8 | `curl -s https://HOST/live/api/session.php` | `{"ok":true,"data":{"csrfToken":"…","expiresAt":"…","sessionLabel":"…"}}` |
| 9 | `curl -s https://HOST/live/api/scenarios.php` | `{"ok":true,"data":[…]}` with six scenarios |

If check 8 returns `STORAGE_UNAVAILABLE`, the database settings in
`~/quickrisk-config/config.php` are wrong or MySQL is unreachable. If it returns
`ORIGIN_REJECTED`, the `allowedOrigins` entry does not match the host.

A real saved assessment, end to end (cookie jar, CSRF, same-origin):

```bash
BASE=https://HOST
JAR=$(mktemp)

CSRF=$(curl -s -c "$JAR" "$BASE/live/api/session.php" \
      | sed -n 's/.*"csrfToken":"\([a-f0-9]*\)".*/\1/p')

cat > payload.json <<'JSON'
{
  "title": "Deployment smoke test",
  "scenarioId": "S1",
  "scenarioName": "Ransomware",
  "baselineEal": 125000,
  "baselineSource": { "modelId": "FAIR-QK-1.3", "modelVersion": "1.3.0" },
  "inputState": {
    "scenarioId": "S1", "incidentStage": "compromise", "iocCount": 6,
    "iocConfidence": 0.8, "alertVelocity": 3.0,
    "isEdrIsolated": false, "isNetworkBlocked": false, "isIdentityRevoked": false
  },
  "riskResult": {
    "telemetryScore": 100, "mitigationFactor": 1, "socMultiplier": 4,
    "realTimeRisk": 100, "riskBand": "Critical",
    "baselineEal": 125000, "realTimeEal": 500000,
    "methodologyVersion": "1.0", "trace": { "cappedTelemetry": 100 }
  },
  "timeline": [],
  "methodologyVersion": "1.0"
}
JSON

curl -s -b "$JAR" -c "$JAR" \
  -H 'Content-Type: application/json' \
  -H 'X-QuickRisk-Live: 1' \
  -H "X-Live-Csrf: $CSRF" \
  -H "Origin: $BASE" \
  --data @payload.json "$BASE/live/api/assessments.php"

# Expect: {"ok":true,"data":{"publicId":"…","realTimeRisk":100,…}}
curl -s -b "$JAR" "$BASE/live/api/assessments.php"     # the saved assessment appears
```

Finally delete the test assessment (`POST /live/api/archive.php?id=<publicId>` with the same
headers) or simply leave it; the anonymous session expires on its own.

---

## 7. Functional acceptance (five minutes, in a browser)

1. **QuickRisk still works** — complete the questionnaire and confirm the results, charts and
   printable report are unchanged.
2. **Open QuickRisk Live** — from the results page ("Open QuickRisk Live") or the header. The
   simulator must appear with the QuickRisk baseline EAL already filled in.
3. **Move the controls** — the risk index, multiplier and Real-Time EAL update instantly, and the
   "Why this result" panel shows the trace.
4. **Apply a scenario** — the library shows six presets; applying one loads a state and timeline.
   Replay reproduces the same scores.
5. **Save, share, revoke** — save, open the history view, create a share link, open it in a
   private window (it must be read-only), then revoke it and confirm it shows
   "This shared assessment is no longer available."
6. **Executive view** — opens from a saved assessment and prints cleanly (Ctrl/Cmd+P).
7. **Privacy** — clear cookies, reload: the history is empty, and the previous session's
   assessments are unreachable.


---

## 8. Operations after go-live

### Backups

```bash
# nightly database backup (keep 14 days)
mysqldump --single-transaction --routines --default-character-set=utf8mb4 \
  -u iliadis_quickrisk_user -p iliadis_quickrisk | gzip > ~/backups/quickrisk-$(date +%F).sql.gz
find ~/backups -name 'quickrisk-*.sql.gz' -mtime +14 -delete
```

### Retention cleanup

Anonymous sessions expire (`sessionTtlDays`, default 30). Deleting an expired session cascades to
its assessments, timeline events and share links:

```sql
-- run daily from cron (example: 03:20)
DELETE FROM anonymous_sessions WHERE expires_at < UTC_TIMESTAMP();
```

```cron
20 3 * * * mysql -u iliadis_quickrisk_user -p'…' iliadis_quickrisk -e "DELETE FROM anonymous_sessions WHERE expires_at < UTC_TIMESTAMP();"
```

Keep the password out of cron: use a `~/.my.cnf` with `chmod 600`.

### Operational checks

| What | How | Cadence |
| --- | --- | --- |
| Storage reachable | `curl -s https://HOST/live/api/scenarios.php` | daily |
| Rate-limit directory writable | logs contain no `RATE_LIMITED` storms | weekly |
| Disk/database growth | `SELECT COUNT(*) FROM assessments;` | monthly |
| Model integrity | `php tools/validate-model.php` after any model change | per change |
| Secrets rotated | database password, `clientHashSalt` | annually |

### Changing the methodology later

1. Bump the version in `frontend/src/live/domain/socTypes.ts` and in the PHP defaults.
2. Update the engine tests, the public methodology page and `docs/QUICKRISK_LIVE.md`.
3. Add a row to `methodology_versions` (keep the old row enabled so historical assessments stay
   readable) — the API refuses a version it does not know.
4. Review the seeded scenario presets against the new coefficients.

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Live shows "could not reach the server" | CSP without `connect-src 'self'`, or no CSP served at all, or a proxy rewriting `/live/api/` | `curl -sI https://HOST/` must show the policy (it ships in `server/.htaccess`); confirm `/live/api/session.php` returns JSON |
| `STORAGE_UNAVAILABLE` | database name/user/password wrong, MySQL down, `pdo_mysql` missing | check `~/quickrisk-config/config.php`, `php -m`, MySQL socket/host |
| `ORIGIN_REJECTED` | `allowedOrigins` does not match scheme+host (http vs https, `www`), or the override replaced the built-in list element by element | list every origin, or set `allowedOriginSuffixes => ['.iliadis.net']` |
| `HTTPS_REQUIRED` | request arrived over plain HTTP while `requireHttps` is true | terminate TLS or set `requireHttps => false` deliberately |
| `SESSION_REQUIRED` on every save | cookies blocked (SameSite/Secure over HTTP, or a proxy dropping cookies) | serve over HTTPS; confirm `Set-Cookie` has `Secure; HttpOnly; SameSite=Lax` |
| Share link 404 | link revoked/replaced, expired (`shareTtlDays`), or the assessment was archived | create a new link; links are single-use-by-replacement |
| Share page 404 but `/live/share/index.html` works | `AllowOverride` does not include `FileInfo`, so the rewrite rule is ignored | set `AllowOverride All` (or at least `FileInfo Indexes Headers`) |
| Library shows fewer than six presets (for example only “Ransomware Outbreak”) | migration 004 was skipped or its rows are disabled | `SELECT slug, enabled FROM scenario_library ORDER BY sort_order` — one row means `database/004_seed_scenarios_more.sql` was never applied; re-run it, then reload |
| 500 on a Live endpoint | PHP fatal (version < 8.0, missing extension) | check `error_log`; `php -l` each file; confirm PHP ≥ 8.1 |
| Upload of results/save fails with 413 | request body over `maxRequestBytes` (256 KB) | shorten the timeline (`maxTimelineEvents`) |

Never paste database credentials into a support ticket; the API never returns them, and the
configuration file must stay outside the web root.

---

## 10. Rollback

```bash
# Application only (keeps the database and saved assessments)
rsync -a --delete ~/releases/quickrisk-previous/ ~/public_html/quickrisk/

# Remove QuickRisk Live entirely
rm -rf ~/public_html/quickrisk/live ~/public_html/quickrisk/includes/live
# and drop the database, or keep it for a later re-enable:
# mysql -u root -p -e "DROP DATABASE iliadis_quickrisk;"
```

Because QuickRisk and QuickRisk Live share only the deployed `includes/` directory and the
frontend bundle, removing `live/` and `includes/live/` leaves the questionnaire untouched. The
header navigation and the results page then show the Live entry point; if you want it gone as
well, deploy the previous build of `frontend/dist`.

