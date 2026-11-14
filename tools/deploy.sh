#!/usr/bin/env bash
#
# FAIR QuickRisk — deployment script for the Linux/Apache/PHP host.
#
# Usage:
#   ./tools/deploy.sh                 # deploy model + application
#   ./tools/deploy.sh --model-only    # deploy only the authoritative model
#   ./tools/deploy.sh --app-only      # deploy only the built application
#
# Environment overrides:
#   MODEL_DIR               default: $HOME/fairquickmodel
#   WEB_DIR                 default: $HOME/public_html/quickrisk
#   QK_ORIGIN_SECRET        Cloudflare origin secret (preferred: not stored on disk)
#   QK_ORIGIN_SECRET_FILE   default: $HOME/quickrisk-config/cloudflare-origin-secret
#   QK_BETA_GATE            default: $HOME/quickrisk-config/beta-gate.htaccess
#
# Prerequisites: the frontend has been built (cd frontend && npm run build) and the
# model passes php tools/validate-model.php.
#
# Nothing in this script creates a database, a session, a queue or any assessment
# storage. The questionnaire is stateless and retains no assessment data.

set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_DIR="${MODEL_DIR:-$HOME/fairquickmodel}"
WEB_DIR="${WEB_DIR:-$HOME/public_html/quickrisk}"
DEPLOY_MODEL=1
DEPLOY_APP=1

for argument in "$@"; do
  case "$argument" in
    --model-only) DEPLOY_APP=0 ;;
    --app-only) DEPLOY_MODEL=0 ;;
    *) echo "Unknown option: $argument" >&2; exit 2 ;;
  esac
done

echo "FAIR QuickRisk deployment"
echo "  repository: $REPOSITORY_ROOT"
echo "  model:      $MODEL_DIR"
echo "  web:        $WEB_DIR"
echo

# ---------------------------------------------------------------------------
# 1. Model validation gate: never publish a malformed or incompatible model.
# ---------------------------------------------------------------------------
echo "[1/5] Validating the authoritative model"
php "$REPOSITORY_ROOT/tools/validate-model.php"

if [ "$DEPLOY_MODEL" -eq 1 ]; then
  echo "[2/5] Publishing the model to $MODEL_DIR"
  mkdir -p "$MODEL_DIR"
  rsync -a --delete "$REPOSITORY_ROOT/fairquickmodel/" "$MODEL_DIR/"
  # PHP must only read the model at runtime.
  chmod -R a-w "$MODEL_DIR"
  chmod 755 "$MODEL_DIR"
else
  echo "[2/5] Skipping the model"
fi

if [ "$DEPLOY_APP" -eq 1 ]; then
  if [ ! -f "$REPOSITORY_ROOT/frontend/dist/index.html" ]; then
    echo "The frontend build is missing. Run: cd frontend && npm run build" >&2
    exit 1
  fi

  if find "$REPOSITORY_ROOT/frontend/dist" -name '*.map' | grep -q .; then
    echo "Source maps were found in the build output and must not be published." >&2
    exit 1
  fi

  echo "[3/5] Publishing the compiled application to $WEB_DIR"
  mkdir -p "$WEB_DIR"
  # The temporary holding notice, the manual backup of the entry point and the
  # ACME challenge directory are not build artefacts. Without these exclusions the
  # --delete sweep would remove them, so the notice would vanish, and Let's Encrypt
  # would lose the directory it writes the renewal challenge into mid-renewal.
  # The notice is published as $WEB_DIR/UnderConstruction/UnderConstruction.html
  # and served through `ErrorDocument 403` in the beta gate.
  rsync -a --delete \
    --exclude 'UnderConstruction/' \
    --exclude 'UnderConstruction.html' \
    --exclude 'index.app.html' \
    --exclude '.well-known/' \
    "$REPOSITORY_ROOT/frontend/dist/" "$WEB_DIR/"

  echo "[4/5] Publishing the PHP application files"
  rsync -a --exclude '.htaccess' "$REPOSITORY_ROOT/server/api/" "$WEB_DIR/api/"
  rsync -a "$REPOSITORY_ROOT/server/api/.htaccess" "$WEB_DIR/api/.htaccess"
  rsync -a "$REPOSITORY_ROOT/server/includes/" "$WEB_DIR/includes/"
  # The origin gate is RENDERED here, never copied: server/.htaccess is deliberately
  # fail-closed, so a raw copy would lock the site. The renderer refuses to write a
  # policy without a usable secret, and this deploy then stops.
  php "$REPOSITORY_ROOT/tools/render-apache-policy.php" --out "$WEB_DIR/.htaccess" \
    || { echo "The Cloudflare origin gate could not be rendered; the deploy was stopped." >&2; exit 1; }

  # The beta access gate is not versioned — it contains real addresses — so it lives in
  # ~/quickrisk-config/ and is appended here on every run. Without this merge a deploy
  # silently opens a beta site to the public, because the copy above overwrote the gate.
  BETA_GATE="${QK_BETA_GATE:-$HOME/quickrisk-config/beta-gate.htaccess}"
  if [ -f "$BETA_GATE" ]; then
    printf '\n' >> "$WEB_DIR/.htaccess"
    cat "$BETA_GATE" >> "$WEB_DIR/.htaccess"
    echo "         beta access gate merged from $BETA_GATE"
  else
    echo "         no beta access gate at $BETA_GATE: the site is publicly reachable"
  fi

  # QuickRisk Live: its endpoints are published under /live/api/ and its PHP library lives
  # in includes/, which the existing deny rules already protect.
  rsync -a "$REPOSITORY_ROOT/server/live/" "$WEB_DIR/live/"
else
  echo "[3/5] Skipping the application"
  echo "[4/5] Skipping the PHP files"
fi

echo "[5/5] Verifying the deployment"
test -f "$MODEL_DIR/manifest.json" || { echo "Model manifest is missing." >&2; exit 1; }
if [ "$DEPLOY_APP" -eq 1 ]; then
  test -f "$WEB_DIR/index.html" || { echo "index.html is missing." >&2; exit 1; }
  test -f "$WEB_DIR/live/share/index.html" || { echo "The QuickRisk Live share shell is missing." >&2; exit 1; }
  test -f "$WEB_DIR/live/api/.htaccess" || { echo "The QuickRisk Live API control file is missing." >&2; exit 1; }
  test -f "$WEB_DIR/includes/live/handlers.php" || { echo "The QuickRisk Live PHP library is missing." >&2; exit 1; }
  test -f "$WEB_DIR/api/calculate.php" || { echo "calculate.php is missing." >&2; exit 1; }
  test -f "$WEB_DIR/includes/.htaccess" || { echo "includes/.htaccess is missing." >&2; exit 1; }
  # The licence, the NOTICE and the third-party notices are part of the distribution,
  # not documentation: a deploy that lost them publishes a non-compliant site.
  test -f "$WEB_DIR/LICENSE.txt" || { echo "The served licence (LICENSE.txt) is missing." >&2; exit 1; }
  test -f "$WEB_DIR/NOTICE.txt" || { echo "The served NOTICE (NOTICE.txt) is missing." >&2; exit 1; }
  test -f "$WEB_DIR/THIRD-PARTY-NOTICES.txt" || { echo "The served third-party notices are missing." >&2; exit 1; }
  test -f "$WEB_DIR/errors/404.html" || { echo "The branded error pages are missing." >&2; exit 1; }
  # The security headers are served from the web-root .htaccess on shared hosting, so a
  # truncated copy would leave the site without a CSP.
  grep -q 'Header always set Content-Security-Policy' "$WEB_DIR/.htaccess" \
    || { echo "The web-root .htaccess carries no Content-Security-Policy header." >&2; exit 1; }
  grep -q "connect-src 'self'" "$WEB_DIR/.htaccess" \
    || { echo "The Content-Security-Policy in the web-root .htaccess lacks connect-src 'self'." >&2; exit 1; }

  # The origin gate, the error documents and the ACME exemption are release-critical:
  # a deploy that lost one of them fails here rather than on the live site.
  grep -q 'RewriteCond %{HTTP:X-Origin-Secret} !^' "$WEB_DIR/.htaccess" \
    || { echo "The deployed .htaccess carries no Cloudflare origin gate." >&2; exit 1; }
  if grep -q 'Fail-closed stub' "$WEB_DIR/.htaccess"; then
    echo "The deployed .htaccess still contains the unrendered gate stub." >&2
    exit 1
  fi
  grep -q 'ErrorDocument 404 /errors/404.html' "$WEB_DIR/.htaccess" \
    || { echo "The deployed .htaccess carries no branded error documents." >&2; exit 1; }
  grep -q 'RewriteRule ^\.well-known/' "$WEB_DIR/.htaccess" \
    || { echo "The deployed policy gates /.well-known: certificate renewal would fail." >&2; exit 1; }
fi

cat <<'EOF'

Deployment complete.

Next steps (documented in docs/DEPLOYMENT_FIRST_TIME.md):
  1. Ensure ~/quickrisk-config/config.php exists with the production origin allow-list
     and a random rate-limit salt.
  2. Confirm the CSP and HSTS arrive, and that HTTPS is forced:
       curl -sI https://HOST/ | grep -i 'content-security-policy'
     On cPanel use Domains -> Force HTTPS Redirect for the redirect, and Metrics ->
     Errors for the log. The headers come from the web-root .htaccess written above.
  3. Confirm the beta gate state: a file at ~/quickrisk-config/beta-gate.htaccess closes
     the site to everyone except its allow-list, and is merged by this script.
  4. Confirm the Cloudflare origin gate and the ACME exemption:
       curl -s -o /dev/null -w '%{http_code}\n' --resolve HOST:443:ORIGIN_IP https://HOST/
       curl -s -o /dev/null -w '%{http_code}\n' --resolve HOST:443:ORIGIN_IP \
         https://HOST/.well-known/acme-challenge/probe
     The first must be 403 (the request bypassed Cloudflare); the second must be 404
     (the challenge file is absent) and never 403, or certificate renewal will fail.
     The secret lives in ~/quickrisk-config/cloudflare-origin-secret (chmod 600) or
     in QK_ORIGIN_SECRET; it is never in the repository.
  5. Run the post-deployment checks, then the zero-retention exit test in
     docs/ZERO_RETENTION_PROOF.md, and record both in docs/RELEASE_CHECKLIST.md.
EOF
