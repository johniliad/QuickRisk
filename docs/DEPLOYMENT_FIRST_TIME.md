# First-time deployment

Complete, ordered procedure for publishing FAIR QuickRisk to the shared host. It assumes
cPanel on Linux with Apache, PHP 8.2+ and MySQL 8, and Cloudflare in front of the domain.

Nothing here stores assessment data. The only database is the anonymous QuickRisk Live and
Decision Lab store, defined in `database/`.

---

## 1. Layout

| Path | Contents |
|---|---|
| `~/public_html/quickrisk/` | web root: compiled frontend, `api/`, `includes/`, `live/`, `errors/`, `.htaccess` |
| `~/fairquickmodel/` | authoritative model, read-only for PHP, outside the web root |
| `~/quickrisk-config/` | deployment configuration and secrets, outside the web root, mode 700 |
| `~/quickrisk-state/` | rate-limit store, outside the web root |

`~/quickrisk-config/` and `~/quickrisk-state/` must never be inside `public_html`.

## 2. Database and account

Create one schema and one account, shared by the questionnaire, QuickRisk Live and the
Decision Lab:

```sql
-- run as a MySQL administrator
CREATE DATABASE iliadis_quickrisk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'iliadis_quickrisk_user'@'localhost' IDENTIFIED BY 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD';
GRANT SELECT, INSERT, UPDATE, DELETE ON iliadis_quickrisk.*
  TO 'iliadis_quickrisk_user'@'localhost';
FLUSH PRIVILEGES;
```

Import the schema and the seeds, in order:

```bash
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/001_initial_schema.sql
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/002_seed_methodology.sql
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/003_seed_scenarios.sql
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/004_seed_scenarios_more.sql
mysql -u iliadis_quickrisk_user -p iliadis_quickrisk < database/005_decision_lab.sql
```

The application ships with the database name and account empty on purpose. Set them in
`~/quickrisk-config/config.php`, which is never committed:

```php
<?php
return [
    'application' => [
        // the exact origins that may call /api/calculate.php
        'allowedOrigins' => ['https://quickrisk.iliadis.net'],
        'requireHttps' => true,
    ],
    'rateLimit' => [
        // replace with `openssl rand -hex 32`
        'clientHashSalt' => 'REPLACE_WITH_A_LONG_RANDOM_SALT',
    ],
    'live' => [
        'database' => [
            'host' => '127.0.0.1',
            'port' => 3306,
            'name' => 'iliadis_quickrisk',
            'user' => 'iliadis_quickrisk_user',
            'password' => 'REPLACE_WITH_A_LONG_RANDOM_PASSWORD',
            'charset' => 'utf8mb4',
        ],
    ],
];
```

```bash
chmod 700 ~/quickrisk-config
chmod 600 ~/quickrisk-config/config.php
```

## 3. Cloudflare origin secret

The origin refuses every request that Cloudflare did not forward. Create the secret once:

```bash
openssl rand -hex 32
```

1. Store it at `~/quickrisk-config/cloudflare-origin-secret`, mode 600, and never commit it.
2. In Cloudflare: **Rules → Transform Rules → Modify request headers → Create rule**,
   filter `(http.host eq "quickrisk.iliadis.net")`, action **Set static**,
   header `X-Origin-Secret`, value = the secret.
3. Confirm the DNS record is proxied and SSL/TLS mode is **Full (strict)**.
4. Add a WAF/bot exception for `starts_with(http.request.uri.path, "/.well-known/")`, so
   certificate renewal is never challenged.

Do this **before** the first deploy, or the site answers 403 to everyone.

## 4. Build and publish

```bash
cd frontend && npm ci && npm run build && cd ..
php tools/validate-model.php
```

With shell access:

```bash
./tools/deploy.sh
```

`deploy.sh` validates the model, publishes `fairquickmodel/` read-only, sweeps the web root
(excluding `UnderConstruction/`, `index.app.html` and `.well-known/`), renders the web-root
`.htaccess`, merges `~/quickrisk-config/beta-gate.htaccess` if it exists, and verifies the
result. It refuses to publish without a valid origin secret.

Without shell access (cPanel File Manager or FTP):

```powershell
php tools\prepare-upload.php --append-beta-gate
```

Upload the **contents** of the folder it prints into `~/public_html/quickrisk/`, overwriting.
Never upload `server/.htaccess` (it is the fail-closed stub), `requirements/`, `docs/`,
`quickrisk-config/` or the model. Never delete `.well-known/`. Delete the upload folder
afterwards: its `.htaccess` contains the origin secret.

`~/public_html/quickrisk/errors/` must contain `403.html`, `404.html`, `500.html` and
`503.html`; the web-root policy references them through `ErrorDocument`.

## 5. Verify

```bash
# 1. through Cloudflare: 200, with the headers
curl -sI https://quickrisk.iliadis.net/ | grep -i 'content-security-policy\|strict-transport'

# 2. straight at the origin: 403 (the request did not come through Cloudflare)
curl -s -o /dev/null -w '%{http_code}\n' --resolve quickrisk.iliadis.net:443:ORIGIN_IP \
  https://quickrisk.iliadis.net/

# 3. wrong secret, straight at the origin: 403
curl -s -o /dev/null -w '%{http_code}\n' -H 'X-Origin-Secret: wrong' \
  --resolve quickrisk.iliadis.net:443:ORIGIN_IP https://quickrisk.iliadis.net/

# 4. ACME path, straight at the origin: 404 (absent probe), never 403
curl -s -o /dev/null -w '%{http_code}\n' --resolve quickrisk.iliadis.net:443:ORIGIN_IP \
  https://quickrisk.iliadis.net/.well-known/acme-challenge/qk-probe

# 5. branded 404 through Cloudflare
curl -s https://quickrisk.iliadis.net/this-page-does-not-exist | grep -c 'This page does not exist'

# 6. host-side preflight
php tools/preflight.php --web-root="$HOME/public_html/quickrisk" --origin=https://quickrisk.iliadis.net
```

Then run the zero-retention exit test in `docs/ZERO_RETENTION_PROOF.md` and record every
result in `docs/RELEASE_CHECKLIST.md`.

## 6. Rollback

1. `git checkout <previous-tag>` in the deployment checkout.
2. `php tools/validate-model.php && ./tools/deploy.sh` (the model directory is replaced, so
   the previous calibration returns with it).
3. Re-run the CF-07 checks. The origin gate is part of the policy, so a rollback that skips
   the renderer does not come back up.

## 7. Go-live checklist

| Item | Done |
|---|---|
| Database, account and grants created; seeds imported | ☐ |
| `~/quickrisk-config/config.php` holds the origin allow-list, salt and database credentials | ☐ |
| `~/quickrisk-config/cloudflare-origin-secret` exists, mode 600 | ☐ |
| Cloudflare Transform Rule sets `X-Origin-Secret`; DNS proxied; SSL Full (strict) | ☐ |
| WAF/bot exception for `/.well-known/` | ☐ |
| Build, model validation and test suite green | ☐ |
| `deploy.sh` or the upload tree published; `.htaccess` rendered | ☐ |
| Direct-to-origin probe returns 403; ACME probe is not 403 | ☐ |
| Branded 403/404/500/503 pages present | ☐ |
| Beta gate state understood (`~/quickrisk-config/beta-gate.htaccess`) | ☐ |
| Zero-retention exit test recorded | ☐ |
| Certificate expiry more than 21 days away | ☐ |
