<?php

declare(strict_types=1);

/**
 * QuickRisk Live — request security.
 *
 * The Live module is the only part of the application that persists anything, so it carries
 * its own request protections:
 *
 *   - a same-origin check on every state-changing request;
 *   - an anonymous session cookie (HttpOnly, Secure, SameSite=Lax) that the browser cannot read;
 *   - a CSRF token returned in the session payload and required in a header on writes;
 *   - a simple per-client rate limit per action.
 *
 * The cookie holds an opaque random token; the database stores only its SHA-256 hash.
 */

/**
 * @param array<string,mixed> $server
 */
function qk_live_client_identifier(array $server): string
{
    $address = (string) ($server['REMOTE_ADDR'] ?? 'unknown');

    return hash('sha256', 'quickrisk-live|' . $address);
}

/**
 * Reads a cookie value from the request without touching the session store.
 *
 * @param array<string,mixed> $cookies
 */
function qk_live_cookie_value(array $cookies, string $name): ?string
{
    $value = $cookies[$name] ?? null;
    if (!is_string($value) || preg_match('/^[a-f0-9]{64}$/', $value) !== 1) {
        return null;
    }

    return $value;
}

/**
 * Emits the anonymous session cookie.
 *
 * The value is the opaque token; PHP sessions are not used anywhere in this module.
 *
 * @param array<string,mixed> $liveConfig
 * @param array<string,mixed> $server
 */
function qk_live_send_session_cookie(array $liveConfig, array $server, string $token, int $expiresAt): void
{
    $options = [
        'expires' => $expiresAt,
        'path' => '/',
        'secure' => qk_live_is_https($server),
        'httponly' => true,
        'samesite' => 'Lax',
    ];

    setcookie(qk_live_cookie_name($liveConfig), $token, $options);
}

/**
 * Rejects a request whose Origin (or Referer) is not this host and not explicitly allowed.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 */
function qk_live_assert_same_origin(array $server, array $appConfig): void
{
    $origin = (string) ($server['HTTP_ORIGIN'] ?? '');
    if ($origin === '') {
        $referer = (string) ($server['HTTP_REFERER'] ?? '');
        if ($referer !== '') {
            $parts = parse_url($referer);
            if (is_array($parts) && isset($parts['scheme'], $parts['host'])) {
                $origin = $parts['scheme'] . '://' . $parts['host']
                    . (isset($parts['port']) ? ':' . $parts['port'] : '');
            }
        }
    }

    if ($origin === '') {
        throw new QkLiveHttpError(403, 'ORIGIN_REJECTED', 'The request origin could not be verified.');
    }

    $normalised = strtolower(rtrim($origin, '/'));
    $allowed = [];
    foreach ((array) ($appConfig['application']['allowedOrigins'] ?? []) as $candidate) {
        $allowed[] = strtolower(rtrim((string) $candidate, '/'));
    }

    $host = strtolower((string) ($server['HTTP_HOST'] ?? ''));
    if ($host !== '') {
        $scheme = qk_live_is_https($server) ? 'https' : 'http';
        $allowed[] = $scheme . '://' . $host;
    }

    if (!in_array($normalised, $allowed, true)) {
        throw new QkLiveHttpError(403, 'ORIGIN_REJECTED', 'The request origin is not permitted.');
    }
}

/**
 * Requires JSON content for a request that carries a body.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $liveConfig
 */
function qk_live_assert_json_request(array $server, array $liveConfig, string $rawBody): void
{
    $contentType = strtolower(trim(explode(';', (string) ($server['CONTENT_TYPE'] ?? ''))[0]));
    if ($contentType !== 'application/json') {
        throw new QkLiveHttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Requests must use application/json.');
    }

    $maxBytes = (int) ($liveConfig['maxRequestBytes'] ?? 262144);
    if (strlen($rawBody) > $maxBytes) {
        throw new QkLiveHttpError(413, 'PAYLOAD_TOO_LARGE', 'The request is larger than this endpoint accepts.');
    }

    if (strtolower((string) ($server['HTTP_X_QUICKRISK_LIVE'] ?? '')) !== '1') {
        throw new QkLiveHttpError(403, 'CLIENT_HEADER_REQUIRED', 'The request is missing the required client header.');
    }
}

/**
 * Verifies the CSRF header against the hash stored with the session.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $session
 */
function qk_live_assert_csrf(array $server, array $session): void
{
    $presented = (string) ($server['HTTP_X_LIVE_CSRF'] ?? '');
    if ($presented === '' || preg_match('/^[a-f0-9]{64}$/', $presented) !== 1) {
        throw new QkLiveHttpError(403, 'CSRF_REQUIRED', 'The request is missing its security token.');
    }

    $expected = (string) ($session['csrf_token_hash'] ?? '');
    if ($expected === '' || !hash_equals($expected, hash('sha256', $presented))) {
        throw new QkLiveHttpError(403, 'CSRF_INVALID', 'The request security token is not valid.');
    }
}

/**
 * Applies a per-action, per-client rate limit using the existing QuickRisk limiter.
 *
 * @param array<string,mixed> $liveConfig
 * @param array<string,mixed> $server
 */
function qk_live_rate_limit(array $liveConfig, array $server, string $action): void
{
    $limits = (array) ($liveConfig['rateLimit'] ?? []);
    $maximum = (int) ($limits[$action] ?? 60);
    if ($maximum <= 0) {
        return;
    }

    $settings = [
        'enabled' => true,
        'backend' => 'auto',
        'windowSeconds' => (int) ($limits['windowSeconds'] ?? 300),
        'maxRequestsPerWindow' => $maximum,
        'storePath' => (string) ($liveConfig['rateLimitStorePath'] ?? ''),
        'clientHashSalt' => 'quickrisk-live-rate-limit',
    ];

    try {
        QkRateLimiter::assertWithinLimit($settings, $action . '|' . qk_live_client_identifier($server));
    } catch (QkRequestException $exception) {
        throw new QkLiveHttpError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.');
    }
}
