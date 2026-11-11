#!/usr/bin/env php
<?php

declare(strict_types=1);

/**
 * QuickRisk Live — local smoke test.
 *
 * Exercises the whole Live request flow against the in-memory repository, so it runs on any
 * machine with PHP and no MySQL server. It proves the ordering the development plan requires:
 *
 *   risk input -> risk engine (TypeScript, verified by the frontend tests) -> save -> retrieve
 *   -> share -> executive report data
 *
 * Usage:  php tools/live-smoke.php
 *
 * Exit code 0 means every step succeeded. This script is development tooling and is never
 * deployed.
 */

$root = dirname(__DIR__);
require_once $root . '/server/includes/bootstrap.php';
require_once $root . '/server/includes/live/handlers.php';

$config = qk_config();
$config['live'] = [
    'requireHttps' => false,
    'rateLimit' => ['windowSeconds' => 300, 'session' => 10000, 'save' => 10000, 'update' => 10000, 'shareCreate' => 10000, 'shareRead' => 10000, 'timelineWrite' => 10000, 'list' => 10000],
];

$state = [
    'scenarioId' => 'S1',
    'incidentStage' => 'compromise',
    'iocCount' => 6,
    'iocConfidence' => 0.8,
    'alertVelocity' => 3.0,
    'isEdrIsolated' => false,
    'isNetworkBlocked' => false,
    'isIdentityRevoked' => false,
];

$result = [
    'telemetryScore' => 100.0,
    'mitigationFactor' => 1.0,
    'socMultiplier' => 4.0,
    'realTimeRisk' => 100,
    'riskBand' => 'Critical',
    'baselineEal' => 125000.0,
    'realTimeEal' => 500000.0,
    'methodologyVersion' => '1.0',
    'trace' => ['stage' => 'compromise', 'cappedTelemetry' => 100.0],
];

$payload = [
    'title' => 'Smoke test assessment',
    'scenarioId' => 'S1',
    'scenarioName' => 'Ransomware',
    'baselineEal' => 125000.0,
    'baselineSource' => ['modelId' => 'FAIR-QK-1.3', 'modelVersion' => '1.3.0'],
    'inputState' => $state,
    'riskResult' => $result,
    'timeline' => [[
        'offsetMs' => 0,
        'eventType' => 'STATE_RECORDED',
        'label' => 'Active compromise',
        'state' => $state,
        'result' => $result,
    ]],
    'methodologyVersion' => '1.0',
];

$scenarios = [[
    'slug' => 'ransomware-outbreak',
    'name' => 'Ransomware Outbreak',
    'category' => 'intrusion',
    'short_description' => 'Escalation to active compromise.',
    'long_description' => 'A simulated ransomware sequence.',
    'scenario_version' => '1.0',
    'default_state_json' => json_encode($state),
    'timeline_json' => json_encode([]),
    'executive_summary_template' => 'Simulated ransomware sequence.',
]];

$repository = new QkLiveArrayRepository($scenarios, ['1.0']);
$server = [
    'REQUEST_METHOD' => 'POST',
    'HTTP_HOST' => 'localhost:8080',
    'HTTP_ORIGIN' => 'http://localhost:8080',
    'HTTP_X_QUICKRISK_LIVE' => '1',
    'CONTENT_TYPE' => 'application/json',
    'REMOTE_ADDR' => '192.0.2.10',
    'SCRIPT_NAME' => '/live/api/share.php',
    'REQUEST_SCHEME' => 'http',
    'SERVER_PORT' => '8080',
];

$step = static function (string $label): void {
    echo str_pad($label, 46, '.') . ' ';
};

$ok = static function (bool $condition, string $message): void {
    if (!$condition) {
        echo "FAIL\n  " . $message . "\n";
        exit(1);
    }
    echo "ok\n";
};

$step('create anonymous session');
$session = qk_live_handle_session($server, $config, $repository, []);
$cookies = [qk_live_cookie_name(qk_live_config($config)) => (string) $session['cookie']['token']];
$ok(strlen((string) $session['payload']['data']['csrfToken']) === 64, 'The session must issue a CSRF token');

$request = array_merge($server, ['HTTP_X_LIVE_CSRF' => (string) $session['payload']['data']['csrfToken']]);

$step('save assessment');
$created = qk_live_handle_create_assessment($request, $config, $repository, $cookies, json_encode($payload));
$publicId = (string) $created['payload']['data']['publicId'];
$ok($created['status'] === 201 && strlen($publicId) === 26, 'Saving must return a 26-character public id');

$step('list history');
$list = qk_live_handle_list_assessments($server, $config, $repository, $cookies);
$ok(count($list['payload']['data']) === 1, 'The assessment must appear in the history');

$step('read assessment');
$detail = qk_live_handle_get_assessment($request, $config, $repository, $cookies, $publicId);
$ok(
    $detail['payload']['data']['realTimeRisk'] === 100 && $detail['payload']['data']['realTimeEal'] === 500000.0,
    'The stored result must be returned unchanged'
);

$step('create share link');
$share = qk_live_handle_create_share($request, $config, $repository, $cookies, $publicId);
$shareUrl = (string) $share['payload']['data']['shareUrl'];
$token = substr($shareUrl, strrpos($shareUrl, '/') + 1);
$ok(str_contains($shareUrl, '/live/share/') && strlen($token) === 64, 'The share URL must contain an opaque token');

$step('read share link without a session');
$shared = qk_live_handle_shared($server, $config, $repository, $token);
$ok($shared['payload']['data']['realTimeRisk'] === 100, 'The public view must show the stored result');

$step('revoke share link');
qk_live_handle_revoke_share($request, $config, $repository, $cookies, $publicId);
try {
    qk_live_handle_shared($server, $config, $repository, $token);
    $ok(false, 'A revoked link must not be readable');
} catch (QkLiveHttpError $error) {
    $ok($error->status === 404, 'A revoked link must return 404');
}

$step('archived assessment leaves history');
qk_live_handle_archive($request, $config, $repository, $cookies, $publicId);
$list = qk_live_handle_list_assessments($server, $config, $repository, $cookies);
$ok(count($list['payload']['data']) === 0, 'An archived assessment must leave the history');

$step('scenario library');
$library = qk_live_handle_scenarios(array_merge($server, ['REQUEST_METHOD' => 'GET']), $config, $repository);
$ok(count($library['payload']['data']) === 1, 'The scenario library must be readable');

echo "\nQuickRisk Live smoke test passed.\n";
