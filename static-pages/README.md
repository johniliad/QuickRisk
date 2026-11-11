# Standalone holding page

`UnderConstruction.html` is a self-contained, temporary notice page for the QuickRisk site.

- **Not part of the application.** It lives outside `frontend/` on purpose: it is not imported by
  React, not copied into `frontend/dist` by the build, and not served by the PHP layer. Nothing in
  the questionnaire, QuickRisk Live or the Decision Lab references it.
- **Self-contained.** All styling is inline in a single `<style>` block, using the same design
  tokens as `frontend/src/styles/index.css` (ink `#142b3b`, accent `#075e65`, canvas `#f3f7f8`,
  0.25rem radii, 70rem shell). No fonts, scripts, images or network requests.
- **Not indexable.** It declares `<meta name="robots" content="noindex, nofollow">` and no
  canonical URL, so a search engine never caches it as the site's home page.

## Publishing it by hand

The page is served as the body of a **403**, so the real entry point stays where it is and
allow-listed testers keep using the application.

```bash
# 1. publish the notice in its own folder
mkdir -p ~/public_html/quickrisk/UnderConstruction
cp static-pages/UnderConstruction.html \
   ~/public_html/quickrisk/UnderConstruction/UnderConstruction.html

# 2. create the gate outside the repository (it holds real addresses)
vi ~/quickrisk-config/beta-gate.htaccess
```

The gate file is short, and `tools/deploy.sh` appends it to the deployed `.htaccess` on every run:

```apache
ErrorDocument 403 /UnderConstruction/UnderConstruction.html
RewriteEngine On

# the notice must stay reachable for everyone
RewriteCond %{REQUEST_URI} !^/UnderConstruction/ [NC]

RewriteCond %{REMOTE_ADDR} !^203\.0\.113\.10$
RewriteRule ^ - [F,L]
```

To withdraw the notice: delete `~/quickrisk-config/beta-gate.htaccess`, redeploy, and remove
`~/public_html/quickrisk/UnderConstruction/`.

If the application is published under a subdirectory instead of the domain root, the `ErrorDocument`
path must carry that prefix (`/quickrisk/UnderConstruction/UnderConstruction.html`): Apache resolves
it against the domain, not against the document root.

**Deployment rules**

- This page must never be committed into `frontend/public/`, because that directory is copied verbatim
  into the production build and the page would then ship with every release.
- `tools/deploy.sh` excludes `UnderConstruction/`, `UnderConstruction.html` and `index.app.html` from
  its `--delete` sweep, so the notice survives a deploy.
- `tools/deploy.sh` **overwrites** `$WEBROOT/.htaccess` with `server/.htaccess` and then appends
  `~/quickrisk-config/beta-gate.htaccess` (`QK_BETA_GATE` overrides the path), so a deploy never
  silently opens a beta site. The gate itself is never versioned. Full procedure:
  `docs/DEPLOYMENT_FIRST_TIME.md`, Step 4.
- The notice inherits the web-root Content-Security-Policy. It complies by design: one inline
  `<style>` block, allowed by `style-src 'unsafe-inline'`, and no external requests.
