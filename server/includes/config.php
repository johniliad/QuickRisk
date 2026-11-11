<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — server configuration.
 *
 * This file lives in the non-public includes directory and must never be
 * reachable through Apache. Deployment-specific values (model path, secrets,
 * rate-limit store) should be supplied by an override file that lives OUTSIDE
 * the public web root, for example ~/quickrisk-config/config.php.
 *
 * Resolution order:
 *   1. built-in defaults below;
 *   2. the override file (path from the QUICKRISK_CONFIG environment variable,
 *      otherwise <home>/quickrisk-config/config.php);
 *   3. environment variables (QUICKRISK_MODEL_PATH, QUICKRISK_APP_ENV).
 *
 * Nothing in this file may contain assessment data. No assessment data is ever
 * written by this application.
 */

$qkDefaults = [
    'environment' => 'production',

    // Authoritative model directory. Default assumes the documented layout:
    //   ~/public_html/quickrisk/includes/config.php  ->  ~/fairquickmodel
    'modelPath' => dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'fairquickmodel',

    // Optional per-request model cache file. Never contains assessment data.
    'modelCacheEnabled' => false,

    'application' => [
        'name' => 'FAIR QuickRisk',
        // Allowed public origins for the calculation endpoint (scheme + host).
        'allowedOrigins' => [
            'https://quickrisk.iliadis.net',
            'https://www.iliadis.net',
        ],
        'allowedOriginSuffixes' => [],
        'requireHttps' => true,
        'trustProxyHeaders' => false,
        'maxRequestBytes' => 8192,
        'allowedContentType' => 'application/json',
        'requireCustomHeader' => 'x-quickrisk-request',
        'requireCustomHeaderValue' => '1',
    ],

    'rateLimit' => [
        'enabled' => true,
        // auto | apcu | file | memory | none
        'backend' => 'auto',
        'windowSeconds' => 300,
        'maxRequestsPerWindow' => 30,
        'maxConcurrentPerClient' => 2,
        // Only used by the file backend. Must be outside the public web root.
        'storePath' => dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'quickrisk-state' . DIRECTORY_SEPARATOR . 'ratelimit',
        // Salt for the client identifier hash. Override in the deployment config.
        // The store contains only a salted hash and counters: no assessment data.
        'clientHashSalt' => 'set-a-random-salt-in-the-deployment-config',
    ],

    'logging' => [
        // Only fixed event codes are ever logged. Never payloads or results.
        'enabled' => true,
        'logAssessmentPayloads' => false,
        'logCalculatedResults' => false,
    ],

    'headers' => [
        'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma' => 'no-cache',
        'X-Content-Type-Options' => 'nosniff',
        'Referrer-Policy' => 'no-referrer',
        'X-Frame-Options' => 'DENY',
        'Cross-Origin-Resource-Policy' => 'same-origin',
        'Permissions-Policy' => 'geolocation=(), microphone=(), camera=(), payment=()',
    ],
];

$qkOverrideFile = getenv('QUICKRISK_CONFIG');
if (!is_string($qkOverrideFile) || $qkOverrideFile === '') {
    $qkOverrideFile = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'quickrisk-config' . DIRECTORY_SEPARATOR . 'config.php';
}

if (is_file($qkOverrideFile)) {
    /** @var array<string,mixed> $qkOverride */
    $qkOverride = require $qkOverrideFile;
    if (is_array($qkOverride)) {
        $qkDefaults = array_replace_recursive($qkDefaults, $qkOverride);
    }
}

$qkModelPathEnv = getenv('QUICKRISK_MODEL_PATH');
if (is_string($qkModelPathEnv) && $qkModelPathEnv !== '') {
    $qkDefaults['modelPath'] = $qkModelPathEnv;
}

$qkAppEnv = getenv('QUICKRISK_APP_ENV');
if (is_string($qkAppEnv) && $qkAppEnv !== '') {
    $qkDefaults['environment'] = $qkAppEnv;
}

return $qkDefaults;
