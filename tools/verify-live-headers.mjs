#!/usr/bin/env node
/**
 * FAIR QuickRisk — verify the security headers of a running deployment.
 *
 * Usage:
 *   node tools/verify-live-headers.mjs
 *   node tools/verify-live-headers.mjs --url https://quickrisk.iliadis.net/
 *   node tools/verify-live-headers.mjs --url https://quickrisk.iliadis.net/ --check-cookie
 *
 * Every check below corresponds to one finding that a passive security scan reports
 * when it is wrong:
 *
 *   Strict-Transport-Security Header Not Set / Disabled   a missing or max-age=0 HSTS
 *   X-Content-Type-Options Header Missing                a sniffable response
 *   Content Security Policy (CSP) Header Not Set         no policy on a page or API reply
 *   CSP: Failure to Define Directive with No Fallback    frame-ancestors/form-action absent
 *   CSP: style-src unsafe-inline                         the inline keyword in the policy
 *   Missing Anti-clickjacking Header                     no framing control
 *   Cross-Domain Misconfiguration                        a permissive CORS grant
 *   Cookie No HttpOnly Flag / Without Secure Flag        a cookie the page can read
 *   Big Redirect Detected                                a 3xx with a large body
 *   Sub Resource Integrity Attribute Missing             a script or stylesheet without one
 *
 * The application's policy lives in server/.htaccess and includes/security_headers.php.
 * This tool exists because the headers a browser finally sees are produced by the whole
 * chain: the origin policy, the host's default vhost and the CDN. A CDN setting such as
 * HSTS "max-age=0" overrides a correct origin policy, and only the public response shows it.
 *
 * It writes nothing and stores nothing, and it exits non-zero when any check fails.
 */

const REQUIRED_CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const MIN_HSTS_SECONDS = 15552000; // 180 days; the origin policy states one year.

const options = { url: 'https://quickrisk.iliadis.net/', checkCookie: false };

for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument === '--url' && index + 1 < process.argv.length) {
    options.url = process.argv[index + 1];
    index += 1;
  } else if (argument.startsWith('--url=')) {
    options.url = argument.slice('--url='.length);
  } else if (argument === '--check-cookie') {
    options.checkCookie = true;
  } else if (argument === '--help' || argument === '-h') {
    console.log('Usage: node tools/verify-live-headers.mjs [--url URL] [--check-cookie]');
    process.exit(0);
  } else {
    console.error('Unknown option: ' + argument);
    process.exit(2);
  }
}

const failures = [];

function check(condition, message) {
  console.log((condition ? '  PASS  ' : '  FAIL  ') + message);
  if (!condition) {
    failures.push(message);
  }
}

function note(message) {
  console.log('  note  ' + message);
}

const request = (url) =>
  fetch(url, { redirect: 'manual', headers: { 'user-agent': 'QuickRisk-header-verifier' } });

const cspOf = (headers) => (headers.get('content-security-policy') || '').trim();

async function main() {
  const base = new URL(options.url);
  const origin = base.origin;
  console.log('FAIR QuickRisk — live security headers');
  console.log('  ' + base.toString() + '\n');

  const home = await request(base.toString());
  check([200, 401, 403].includes(home.status), 'the home page answers (' + home.status + ')');

  // ---- Strict-Transport-Security ------------------------------------------------------
  const hsts = home.headers.get('strict-transport-security');
  if (base.protocol === 'http:') {
    // A local run over plain HTTP must not send HSTS, so there is nothing to verify here.
    check(hsts === null, 'no Strict-Transport-Security is sent over plain HTTP');
    note('transport security is only meaningful over HTTPS; run this tool against the public URL');
  } else {
    check(hsts !== null, 'Strict-Transport-Security is present');
    if (hsts !== null) {
      const maxAge = /max-age\s*=\s*(\d+)/i.exec(hsts);
      const seconds = maxAge === null ? 0 : Number(maxAge[1]);
      check(seconds > 0, 'Strict-Transport-Security is not disabled (max-age is not 0)');
      check(seconds >= MIN_HSTS_SECONDS,
        'Strict-Transport-Security max-age is at least ' + MIN_HSTS_SECONDS + ' seconds (found ' + seconds + ')');
      check(/includesubdomains/i.test(hsts), 'Strict-Transport-Security covers subdomains');
      note('HSTS as served: ' + hsts);
    }
  }

  // ---- X-Content-Type-Options ---------------------------------------------------------
  check((home.headers.get('x-content-type-options') || '').toLowerCase().includes('nosniff'),
    'X-Content-Type-Options: nosniff is present');

  // ---- Content-Security-Policy --------------------------------------------------------
  const csp = cspOf(home.headers);
  check(csp.length > 0, 'Content-Security-Policy is present');
  if (csp.length > 0) {
    for (const directive of REQUIRED_CSP_DIRECTIVES) {
      check(csp.toLowerCase().includes(directive.toLowerCase()), 'Content-Security-Policy keeps ' + directive);
    }
    check(!/'unsafe-inline'/i.test(csp), "Content-Security-Policy does not allow 'unsafe-inline'");
    check(!/'unsafe-eval'/i.test(csp), "Content-Security-Policy does not allow 'unsafe-eval'");
    check(!/(^|;)\s*\*(\s|;|$)/.test(csp), 'Content-Security-Policy contains no wildcard source');
    check(/sha256-[A-Za-z0-9+/=]{43,44}/.test(csp),
      'Content-Security-Policy allows the static pages their inline style block by hash');
  }
  check(!home.headers.get('x-content-security-policy') && !home.headers.get('x-webkit-csp'),
    'No deprecated Content-Security-Policy header variants are sent');


  // ---- Anti-clickjacking --------------------------------------------------------------
  const framePolicy = /frame-ancestors\s+([^;]+)/i.exec(csp);
  check(framePolicy !== null && /'none'/i.test(framePolicy[1]),
    "frame-ancestors 'none' is present in the Content-Security-Policy");
  const xfo = (home.headers.get('x-frame-options') || '').trim();
  check(xfo.length > 0, 'X-Frame-Options is present');
  if (xfo.length > 0 && xfo.toUpperCase() !== 'DENY') {
    note('X-Frame-Options is "' + xfo + '", not DENY. Framing is still refused by frame-ancestors, ' +
      'but the value is rewritten between the origin and the browser (a CDN transform rule).');
  }

  // ---- Cross-origin -------------------------------------------------------------------
  const allowOrigin = home.headers.get('access-control-allow-origin');
  check(allowOrigin === null || allowOrigin.trim() !== '*', 'No permissive Access-Control-Allow-Origin is sent');
  check(home.headers.get('access-control-allow-credentials') === null, 'No Access-Control-Allow-Credentials is sent');

  // ---- The API and the error documents carry the same policy --------------------------
  for (const [label, url] of [
    ['the calculation endpoint', origin + '/api/calculate.php'],
    ['a missing page', origin + '/this-page-does-not-exist-' + Date.now()],
  ]) {
    const response = await request(url);
    check(cspOf(response.headers).length > 0, 'Content-Security-Policy is present on ' + label);
    check((response.headers.get('x-content-type-options') || '').toLowerCase().includes('nosniff'),
      'X-Content-Type-Options is present on ' + label);
  }

  // ---- Subresource Integrity ----------------------------------------------------------
  const page = await request(base.toString());
  const html = await page.text();
  const tags = html.match(/<(?:script|link)\b[^>]*>/gi) || [];
  let external = 0;
  for (const tag of tags) {
    const reference = /\b(?:src|href)\s*=\s*"([^"]+)"/i.exec(tag);
    if (reference === null || !reference[1].startsWith('/')) {
      continue;
    }
    if (/^<link/i.test(tag) && !/rel\s*=\s*"(?:stylesheet|modulepreload)"/i.test(tag)) {
      continue;
    }
    external += 1;
    check(/integrity\s*=\s*"sha(256|384|512)-/.test(tag), 'Subresource Integrity on ' + reference[1]);
  }
  check(external > 0, 'the home page references at least one local script or stylesheet');

  // ---- The HTTP-to-HTTPS redirect body ------------------------------------------------
  if (base.protocol === 'https:') {
    try {
      const redirect = await request('http://' + base.host + base.pathname);
      const body = await redirect.text();
      if (redirect.status >= 300 && redirect.status < 400) {
        const location = redirect.headers.get('location') || '';
        check(body.length <= location.length + 300,
          'the HTTP-to-HTTPS redirect body is small (' + body.length + ' bytes for a ' +
          location.length + '-character Location)');
      } else {
        note('the plain-HTTP request answered ' + redirect.status + ' instead of a redirect; ' +
          'HTTPS is not being enforced for plain-HTTP requests');
      }
    } catch (error) {
      note('the plain-HTTP probe failed: ' + error.message);
    }
  }

  // ---- Cookies ------------------------------------------------------------------------
  if (options.checkCookie) {
    const response = await request(origin + '/live/api/session.php');
    const cookie = (response.headers.get('set-cookie') || '').trim();
    if (cookie === '') {
      note('no cookie was issued by /live/api/session.php');
    } else {
      check(/;\s*httponly/i.test(cookie), 'the session cookie is HttpOnly');
      check(/;\s*secure/i.test(cookie), 'the session cookie is Secure');
      check(/;\s*samesite\s*=\s*(lax|strict)/i.test(cookie), 'the session cookie is SameSite');
      check(/;\s*path=\//i.test(cookie), 'the session cookie is scoped to the application path');
    }
  } else {
    note('cookie flags were not checked; re-run with --check-cookie (it starts one anonymous session)');
  }

  console.log('\n' + '-'.repeat(78));
  if (failures.length > 0) {
    console.log('FAILED: ' + failures.length + ' check(s) did not hold:');
    for (const failure of failures) {
      console.log('  - ' + failure);
    }
    process.exit(1);
  }

  console.log('PASSED: every live security-header check held.');
}

main().catch((error) => {
  console.error('The verification could not run: ' + error.message);
  process.exit(1);
});
