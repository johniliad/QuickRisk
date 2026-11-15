<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — development router for PHP's built-in web server.
 *
 * This file exists so the application can be run on a local machine without Apache.
 * It mirrors the deployed layout closely enough to be useful and, importantly, it
 * mirrors the deployed *security* decisions:
 *
 *   - the compiled frontend is the document root (frontend/dist);
 *   - /api/calculate.php is executed from the source tree, so no copy can drift;
 *   - /includes/, dotfiles, .htaccess files and the file types that Apache denies
 *     (json, md, map, ts, lock, log, bak, sql, yml, ini, env) are never served;
 *   - there is no SPA rewrite fallback, exactly as in production: an unknown path is
 *     a 404, so the calculation endpoint can never be rewritten;
 *   - the API is POST-only, which the endpoint itself enforces.
 *
 * Start it through tools/serve-local.mjs, which supplies the local configuration
 * override (HTTP allowed, localhost origins, in-memory rate limiting). This router is
 * for local development only and is never deployed.
 */

$repoRoot = dirname(__DIR__);
$docRoot = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), "/\\");
$uri = (string) ($_SERVER['REQUEST_URI'] ?? '/');
$path = (string) (parse_url($uri, PHP_URL_PATH) ?? '/');
$path = rawurldecode($path);

// ---------------------------------------------------------------------------
// The same response security policy that server/.htaccess serves in production.
//
// The development server has no .htaccess, so without this the local site would be
// missing the CSP, the framing, sniffing and transport headers — and a local security
// scan would report findings that only exist because the harness is not Apache.
// The policy itself lives in one place (server/includes/security_headers.php), so a
// change cannot drift between the two.
// ---------------------------------------------------------------------------
$securityHeaderSource = dirname(__DIR__) . '/server/includes/security_headers.php';
if (is_file($securityHeaderSource)) {
    require_once $securityHeaderSource;
}

if (class_exists('QkSecurityHeaders')) {
    if (!headers_sent()) {
        foreach (QkSecurityHeaders::CORS_HEADERS as $corsHeader) {
            header_remove($corsHeader);
        }
        foreach (QkSecurityHeaders::baseline() as $headerName => $headerValue) {
            header($headerName . ': ' . $headerValue);
        }
        if (QkSecurityHeaders::isHttps()) {
            header('Strict-Transport-Security: ' . QkSecurityHeaders::HSTS);
        }
    }
}

/**
 * Sends a minimal plain-text response and ends the request.
 */
$deny = static function (int $status, string $message): bool {
    http_response_code($status);
    header('Content-Type: text/plain; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo $message . "\n";

    return true;
};

// ---------------------------------------------------------------------------
// QuickRisk Live API endpoints are executed from the repository source tree.
// ---------------------------------------------------------------------------
if (str_starts_with($path, '/live/api/')) {
    $allowed = [
        'session.php',
        'assessments.php',
        'assessment.php',
        'archive.php',
        'timeline.php',
        'share.php',
        'shared.php',
        'scenarios.php',
        'report.php',
    ];
    $name = basename($path);
    $endpoint = $repoRoot . DIRECTORY_SEPARATOR . 'server' . DIRECTORY_SEPARATOR . 'live'
        . DIRECTORY_SEPARATOR . 'api' . DIRECTORY_SEPARATOR . $name;

    if (!in_array($name, $allowed, true) || !is_file($endpoint)) {
        return $deny(404, 'Not found');
    }

    require $endpoint;

    return true;
}

// ---------------------------------------------------------------------------
// The public share route: /live/share/{token} serves the static share shell.
// In production the same mapping is done by live/share/.htaccess.
// ---------------------------------------------------------------------------
if (preg_match('#^/live/share/(board/)?([A-Za-z0-9]{32,128})/?$#', $path, $matches) === 1) {
    $shell = $docRoot . DIRECTORY_SEPARATOR . 'live' . DIRECTORY_SEPARATOR . 'share' . DIRECTORY_SEPARATOR . 'index.html';
    if (!is_file($shell)) {
        return $deny(404, 'Not found');
    }
    // Both the shared assessment and the shared Board Risk Pack are served by the same shell;
    // the path tells the shell which one to render.
    header('Content-Type: text/html; charset=utf-8');
    readfile($shell);

    return true;
}

// ---------------------------------------------------------------------------
// The API is executed from the repository source tree.
// ---------------------------------------------------------------------------
if (str_starts_with($path, '/api/')) {
    $endpoint = $repoRoot . DIRECTORY_SEPARATOR . 'server' . str_replace('/', DIRECTORY_SEPARATOR, $path);
    if (basename($path) !== 'calculate.php' || !is_file($endpoint)) {
        return $deny(404, 'Not found');
    }

    require $endpoint;

    return true;
}

// ---------------------------------------------------------------------------
// Never serve the non-public directories, dotfiles or denied file types.
// ---------------------------------------------------------------------------
if (preg_match('#^/(includes|tests|tools|audit|requirements|fairquickmodel)/#', $path) === 1) {
    return $deny(404, 'Not found');
}

$basename = basename($path);
if ($basename !== '' && $basename[0] === '.') {
    return $deny(404, 'Not found');
}

if (preg_match('/\.(json|md|map|ts|tsx|jsx|lock|log|bak|sql|yml|yaml|ini|env|dist|htaccess)$/i', $basename) === 1) {
    return $deny(404, 'Not found');
}

// ---------------------------------------------------------------------------
// Static files from the compiled frontend; anything else is a 404 (no SPA rewrite).
// ---------------------------------------------------------------------------
$target = $docRoot . str_replace('/', DIRECTORY_SEPARATOR, $path);

/**
 * Serves an HTML document through PHP.
 *
 * The built-in server discards headers set by a router script when it streams a file
 * itself, so an HTML page served that way would arrive with no policy at all — exactly
 * the "Content-Security-Policy header not set" and "missing anti-clickjacking header"
 * findings, but only locally. Reading the file here keeps the development server's
 * responses equivalent to the deployed ones.
 */
$serveHtml = static function (string $file): bool {
    header('Content-Type: text/html; charset=utf-8');
    readfile($file);

    return true;
};

if ($path !== '/' && is_file($target)) {
    if (str_ends_with(strtolower($target), '.html')) {
        return $serveHtml($target);
    }
    // Returning false lets the built-in server stream the file with the right type.
    return false;
}

if ($path === '/' && is_file($docRoot . DIRECTORY_SEPARATOR . 'index.html')) {
    return $serveHtml($docRoot . DIRECTORY_SEPARATOR . 'index.html');
}

return $deny(404, 'Not found');
