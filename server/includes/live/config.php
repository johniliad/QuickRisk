<?php

declare(strict_types=1);

/**
 * QuickRisk Live — configuration.
 *
 * The base QuickRisk configuration already merges an optional deployment override file
 * (QUICKRISK_CONFIG, or <home>/quickrisk-config/config.php). Any `live` key in that override
 * therefore arrives here automatically; this file only supplies defaults.
 *
 * Secrets (database password, cookie name, TTLs) belong in the override file outside the web
 * root and are never committed.
 *
 * This layer never performs risk mathematics: it validates, stores and returns the result that
 * the TypeScript engine calculated in the browser.
 */

/**
 * @param array<string,mixed> $appConfig
 * @return array<string,mixed>
 */
function qk_live_config(array $appConfig): array
{
    $defaults = [
        'methodologyVersion' => '1.0',
        'sessionCookieName' => 'qrl_sid',
        'sessionTtlDays' => 30,
        'shareTtlDays' => null,
        'maxAssessmentsPerSession' => 100,
        'maxTimelineEvents' => 50,
        'maxRequestBytes' => 262144,
        'database' => [
            'host' => '127.0.0.1',
            'port' => 3306,
            'name' => '',
            'user' => '',
            'password' => '',
            'charset' => 'utf8mb4',
        ],
        'rateLimit' => [
            // Requests allowed per client per 5-minute window, per action.
            'windowSeconds' => 300,
            'session' => 120,
            'save' => 40,
            'update' => 60,
            'shareCreate' => 20,
            'shareRead' => 120,
            'timelineWrite' => 60,
            'list' => 120,
        ],
    ];

    $configured = $appConfig['live'] ?? [];
    if (!is_array($configured)) {
        $configured = [];
    }

    $merged = array_replace_recursive($defaults, $configured);

    // The methodology version is a single source of truth for the API layer. It must match the
    // version the frontend ships and the version seeded into methodology_versions.
    $environmentVersion = getenv('QUICKRISK_LIVE_METHODOLOGY_VERSION');
    if (is_string($environmentVersion) && $environmentVersion !== '') {
        $merged['methodologyVersion'] = $environmentVersion;
    }

    return $merged;
}

/**
 * Returns the cookie name used for the anonymous session.
 *
 * @param array<string,mixed> $liveConfig
 */
function qk_live_cookie_name(array $liveConfig): string
{
    $name = (string) ($liveConfig['sessionCookieName'] ?? 'qrl_sid');

    return preg_match('/^[A-Za-z0-9_]{1,32}$/', $name) === 1 ? $name : 'qrl_sid';
}

/**
 * Returns true when the request arrived over HTTPS.
 *
 * @param array<string,mixed> $server
 */
function qk_live_is_https(array $server): bool
{
    $https = strtolower((string) ($server['HTTPS'] ?? ''));
    $scheme = strtolower((string) ($server['REQUEST_SCHEME'] ?? ''));
    $port = (string) ($server['SERVER_PORT'] ?? '');

    return $https === 'on' || $https === '1' || $scheme === 'https' || $port === '443';
}
