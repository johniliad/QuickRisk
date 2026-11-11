<?php

declare(strict_types=1);

/**
 * QuickRisk Live — request handlers.
 *
 * Each handler is a pure function of (request, configuration, repository) and returns a
 * response envelope. Endpoint scripts only bootstrap, dispatch and send, which keeps the
 * logic testable without a web server and without MySQL.
 *
 * Architectural rule: nothing here calculates a risk value. The handlers validate the result
 * the TypeScript engine produced, check ownership and persist or return it.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/response.php';
require_once __DIR__ . '/repository.php';
require_once __DIR__ . '/repository_pdo.php';
require_once __DIR__ . '/repository_array.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/validation.php';

/** Builds the production repository from configuration. */
function qk_live_repository(array $liveConfig): QkLiveRepository
{
    return new QkLivePdoRepository(qk_live_pdo($liveConfig));
}

/** A 26-character public identifier (Crockford base32 alphabet, cryptographically random). */
function qk_live_public_id(): string
{
    $alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    $identifier = '';
    for ($index = 0; $index < 26; $index++) {
        $identifier .= $alphabet[random_int(0, 31)];
    }

    return $identifier;
}

/** 256 bits of random material, hex encoded. */
function qk_live_token(): string
{
    return bin2hex(random_bytes(32));
}

/**
 * Resolves the anonymous session from the request cookie.
 *
 * @param array<string,mixed> $cookies
 * @param array<string,mixed> $liveConfig
 * @return array<string,mixed>|null
 */
function qk_live_current_session(QkLiveRepository $repository, array $cookies, array $liveConfig): ?array
{
    $token = qk_live_cookie_value($cookies, qk_live_cookie_name($liveConfig));
    if ($token === null) {
        return null;
    }

    $session = $repository->findSessionByTokenHash(hash('sha256', $token));
    if ($session === null) {
        return null;
    }

    $expiresAt = strtotime((string) $session['expires_at']);
    if ($expiresAt === false || $expiresAt <= time()) {
        return null;
    }

    return $session;
}

/**
 * @param array<string,mixed> $liveConfig
 * @return array{0:int,1:string} session id and expiry timestamp
 */
function qk_live_expiry(array $liveConfig, string $key = 'sessionTtlDays'): array
{
    $days = (int) ($liveConfig[$key] ?? 30);
    if ($days <= 0) {
        $days = 30;
    }
    $expiresAt = time() + ($days * 86400);

    return [$expiresAt, gmdate('Y-m-d H:i:s', $expiresAt)];
}

/**
 * Builds the public summary of a stored assessment.
 *
 * @param array<string,mixed> $row
 * @return array<string,mixed>
 */
function qk_live_summary(array $row): array
{
    $iso = static function (string $value): string {
        $timestamp = strtotime($value);

        return $timestamp === false ? $value : gmdate('Y-m-d\TH:i:s\Z', $timestamp);
    };

    return [
        'publicId' => (string) $row['publicId'],
        'title' => (string) $row['title'],
        'scenarioId' => (string) $row['scenarioId'],
        'scenarioName' => (string) $row['scenarioName'],
        'baselineEal' => (float) $row['baselineEal'],
        'telemetryScore' => (float) $row['telemetryScore'],
        'mitigationFactor' => (float) $row['mitigationFactor'],
        'socMultiplier' => (float) $row['socMultiplier'],
        'realTimeRisk' => (int) $row['realTimeRisk'],
        'riskBand' => (string) $row['riskBand'],
        'realTimeEal' => (float) $row['realTimeEal'],
        'methodologyVersion' => (string) $row['methodologyVersion'],
        'status' => (string) $row['status'],
        'createdAt' => $iso((string) $row['createdAt']),
        'updatedAt' => $iso((string) $row['updatedAt']),
        'hasActiveShare' => (int) ($row['has_active_share'] ?? 0) === 1,
    ];
}

/**
 * Decodes a JSON column that must contain an object.
 *
 * @return array<string,mixed>
 */
function qk_live_decode_column(string $value): array
{
    $decoded = json_decode($value, true);

    return is_array($decoded) ? $decoded : [];
}

/**
 * Builds the full representation of a stored assessment, including its timeline.
 *
 * @param array<string,mixed> $row
 * @return array<string,mixed>
 */
function qk_live_detail(QkLiveRepository $repository, array $row, ?string $shareUrl = null): array
{
    $events = [];
    foreach ($repository->listEvents((int) $row['id']) as $event) {
        $events[] = [
            'sequenceNo' => (int) ($event['sequenceNo'] ?? 0),
            'offsetMs' => (int) ($event['offsetMs'] ?? 0),
            'eventType' => (string) ($event['eventType'] ?? 'STATE_RECORDED'),
            'label' => (string) ($event['label'] ?? ''),
            'state' => qk_live_decode_column((string) ($event['stateJson'] ?? '{}')),
            'result' => qk_live_decode_column((string) ($event['resultJson'] ?? '{}')),
        ];
    }

    return qk_live_summary($row) + [
        'inputState' => qk_live_decode_column((string) ($row['inputStateJson'] ?? '{}')),
        'result' => qk_live_decode_column((string) ($row['riskResultJson'] ?? '{}')),
        'timeline' => $events,
        'shareUrl' => $shareUrl,
        'baselineModelId' => (string) ($row['baselineModelId'] ?? ''),
        'baselineModelVersion' => (string) ($row['baselineModelVersion'] ?? ''),
    ];
}

/**
 * GET/POST session: creates the anonymous session, or rotates the CSRF token of an existing one.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_live_handle_session(
    array $server,
    array $appConfig,
    QkLiveRepository $repository,
    array $cookies
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'session');

    $csrfToken = qk_live_token();
    $csrfHash = hash('sha256', $csrfToken);
    $now = gmdate('Y-m-d H:i:s');
    [$expiresTimestamp, $expiresAt] = qk_live_expiry($liveConfig);

    $session = qk_live_current_session($repository, $cookies, $liveConfig);
    $cookieToken = qk_live_cookie_value($cookies, qk_live_cookie_name($liveConfig));

    if ($session === null) {
        $cookieToken = qk_live_token();
        $sessionId = $repository->createSession(hash('sha256', $cookieToken), $csrfHash, $now, $expiresAt);
        $session = ['id' => $sessionId, 'csrf_token_hash' => $csrfHash, 'expires_at' => $expiresAt];
    } else {
        // Rotate the CSRF token on every session read; only its hash is stored.
        $statementSessionId = (int) $session['id'];
        $repository->touchSession($statementSessionId, $now, $expiresAt);
        $repository->rotateCsrfToken($statementSessionId, $csrfHash);
    }

    return [
        'status' => 200,
        'payload' => [
            'ok' => true,
            'data' => [
                'csrfToken' => $csrfToken,
                'expiresAt' => gmdate('Y-m-d\TH:i:s\Z', $expiresTimestamp),
                'sessionLabel' => strtoupper(substr(hash('sha256', (string) $cookieToken), 0, 8)),
            ],
        ],
        'cookie' => ['token' => (string) $cookieToken, 'expiresAt' => $expiresTimestamp],
    ];
}

/**
 * GET assessments: the current session's own list.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_live_handle_list_assessments(
    array $server,
    array $appConfig,
    QkLiveRepository $repository,
    array $cookies
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'list');
    $session = qk_live_require_session($repository, $cookies, $liveConfig, $server);

    $summaries = [];
    foreach ($repository->listAssessments((int) $session['id']) as $row) {
        $summaries[] = qk_live_summary($row);
    }

    return QkLiveResponse::ok($summaries);
}

/**
 * Requires a live anonymous session or fails with 401.
 *
 * @param array<string,mixed> $cookies
 * @param array<string,mixed> $liveConfig
 * @param array<string,mixed> $server
 * @return array<string,mixed>
 */
function qk_live_require_session(
    QkLiveRepository $repository,
    array $cookies,
    array $liveConfig,
    array $server
): array {
    $session = qk_live_current_session($repository, $cookies, $liveConfig);
    if ($session === null) {
        throw new QkLiveHttpError(401, 'SESSION_REQUIRED', 'Reload the page to start an anonymous session.');
    }
    if (qk_live_is_https($server) === false && ($liveConfig['requireHttps'] ?? true) === true) {
        throw new QkLiveHttpError(403, 'HTTPS_REQUIRED', 'QuickRisk Live requires HTTPS.');
    }

    return $session;
}

/**
 * Builds the event rows to persist from a validated timeline.
 *
 * @param array<int,array<string,mixed>> $timeline
 * @return array<int,array<string,mixed>>
 */
function qk_live_event_rows(array $timeline): array
{
    $rows = [];
    foreach ($timeline as $event) {
        $rows[] = [
            'offsetMs' => (int) $event['offsetMs'],
            'eventType' => (string) $event['eventType'],
            'label' => (string) $event['label'],
            'stateJson' => qk_live_encode((array) $event['state']),
            'resultJson' => qk_live_encode((array) $event['result']),
            'createdAt' => gmdate('Y-m-d H:i:s'),
        ];
    }

    return $rows;
}

/**
 * Builds the absolute read-only share URL for an assessment token.
 *
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $server
 */
function qk_live_share_url(array $appConfig, array $server, string $token): string
{
    $liveConfig = qk_live_config($appConfig);
    $configured = trim((string) ($liveConfig['shareBaseUrl'] ?? ''));
    if ($configured !== '') {
        return rtrim($configured, '/') . '/' . $token;
    }

    $scheme = qk_live_is_https($server) ? 'https' : 'http';
    $host = (string) ($server['HTTP_HOST'] ?? 'localhost');
    $script = (string) ($server['SCRIPT_NAME'] ?? '/live/api/share.php');
    $base = rtrim(str_replace('\\', '/', dirname(dirname(dirname($script)))), '/');

    return $scheme . '://' . $host . $base . '/live/share/' . $token;
}

/**
 * POST assessments: saves the client-calculated result for the current anonymous session.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_live_handle_create_assessment(
    array $server,
    array $appConfig,
    QkLiveRepository $repository,
    array $cookies,
    string $rawBody
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'save');
    qk_live_assert_same_origin($server, $appConfig);
    qk_live_assert_json_request($server, $liveConfig, $rawBody);

    $session = qk_live_require_session($repository, $cookies, $liveConfig, $server);
    qk_live_assert_csrf($server, $session);

    $record = qk_live_validate_assessment_payload(qk_live_decode_object($rawBody), $liveConfig);

    if (!$repository->methodologyVersionEnabled((string) $record['methodologyVersion'])) {
        throw new QkLiveHttpError(
            422,
            'METHODOLOGY_UNKNOWN',
            'This assessment uses a methodology version that this server does not accept.'
        );
    }

    $limit = (int) ($liveConfig['maxAssessmentsPerSession'] ?? 100);
    if ($repository->countAssessments((int) $session['id']) >= $limit) {
        throw new QkLiveHttpError(
            429,
            'ASSESSMENT_LIMIT',
            'This anonymous session has reached its saved-assessment limit. Archive an assessment first.'
        );
    }

    $record['publicId'] = qk_live_public_id();
    $timeline = (array) $record['timeline'];
    unset($record['timeline']);

    $row = $repository->createAssessment((int) $session['id'], $record);
    $repository->replaceEvents((int) $row['id'], qk_live_event_rows($timeline));

    return QkLiveResponse::ok(qk_live_detail($repository, $row), 201);
}

/**
 * GET assessment: one assessment owned by the current session.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_live_handle_get_assessment(
    array $server,
    array $appConfig,
    QkLiveRepository $repository,
    array $cookies,
    string $publicId
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'list');
    $session = qk_live_require_session($repository, $cookies, $liveConfig, $server);

    $row = $repository->findAssessment((int) $session['id'], $publicId);
    if ($row === null) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'Assessment not found.');
    }

    // Only the hash of a share token is stored, so an existing link cannot be re-displayed.
    // The response reports that a link is active; creating a new link replaces it.
    return QkLiveResponse::ok(qk_live_detail($repository, $row, null));
}

/**
 * PUT assessment: updates an assessment owned by the current session.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_live_handle_update_assessment(
    array $server,
    array $appConfig,
    QkLiveRepository $repository,
    array $cookies,
    string $publicId,
    string $rawBody
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'update');
    qk_live_assert_same_origin($server, $appConfig);
    qk_live_assert_json_request($server, $liveConfig, $rawBody);

    $session = qk_live_require_session($repository, $cookies, $liveConfig, $server);
    qk_live_assert_csrf($server, $session);

    $row = $repository->findAssessment((int) $session['id'], $publicId);
    if ($row === null) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'Assessment not found.');
    }

    $record = qk_live_validate_assessment_payload(qk_live_decode_object($rawBody), $liveConfig);
    if (!$repository->methodologyVersionEnabled((string) $record['methodologyVersion'])) {
        throw new QkLiveHttpError(
            422,
            'METHODOLOGY_UNKNOWN',
            'This assessment uses a methodology version that this server does not accept.'
        );
    }

    $timeline = (array) $record['timeline'];
    unset($record['timeline'], $record['createdAt']);

    $repository->updateAssessment((int) $row['id'], (int) $session['id'], $record);
    $repository->replaceEvents((int) $row['id'], qk_live_event_rows($timeline));

    $updated = $repository->findAssessment((int) $session['id'], $publicId);

    return QkLiveResponse::ok(qk_live_detail($repository, $updated ?? $row));
}


/**
 * POST archive: archives an assessment owned by the current session.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_live_handle_archive(
    array $server,
    array $appConfig,
    QkLiveRepository $repository,
    array $cookies,
    string $publicId
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'update');
    qk_live_assert_same_origin($server, $appConfig);

    $session = qk_live_require_session($repository, $cookies, $liveConfig, $server);
    qk_live_assert_csrf($server, $session);

    $row = $repository->findAssessment((int) $session['id'], $publicId);
    if ($row === null) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'Assessment not found.');
    }

    $now = gmdate('Y-m-d H:i:s');
    $repository->archiveAssessment((int) $row['id'], (int) $session['id'], $now);
    $repository->revokeShares((int) $row['id'], $now);

    $row['status'] = 'archived';
    $row['updatedAt'] = $now;

    return QkLiveResponse::ok(qk_live_summary($row));
}

/**
 * POST timeline: replaces the stored timeline of an assessment owned by the session.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_live_handle_save_timeline(
    array $server,
    array $appConfig,
    QkLiveRepository $repository,
    array $cookies,
    string $publicId,
    string $rawBody
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'timelineWrite');
    qk_live_assert_same_origin($server, $appConfig);
    qk_live_assert_json_request($server, $liveConfig, $rawBody);

    $session = qk_live_require_session($repository, $cookies, $liveConfig, $server);
    qk_live_assert_csrf($server, $session);

    $row = $repository->findAssessment((int) $session['id'], $publicId);
    if ($row === null) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'Assessment not found.');
    }

    $payload = qk_live_decode_object($rawBody);
    $timeline = qk_live_validate_timeline(
        $payload['timeline'] ?? [],
        (int) ($liveConfig['maxTimelineEvents'] ?? 50)
    );
    $repository->replaceEvents((int) $row['id'], qk_live_event_rows($timeline));

    return QkLiveResponse::ok(qk_live_detail($repository, $row)['timeline']);
}

/**
 * POST share: creates a new read-only link, revoking any previous link for that assessment.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_live_handle_create_share(
    array $server,
    array $appConfig,
    QkLiveRepository $repository,
    array $cookies,
    string $publicId
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'shareCreate');
    qk_live_assert_same_origin($server, $appConfig);

    $session = qk_live_require_session($repository, $cookies, $liveConfig, $server);
    qk_live_assert_csrf($server, $session);

    $row = $repository->findAssessment((int) $session['id'], $publicId);
    if ($row === null) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'Assessment not found.');
    }

    $now = gmdate('Y-m-d H:i:s');
    $repository->revokeShares((int) $row['id'], $now);

    $token = qk_live_token();
    $ttlDays = $liveConfig['shareTtlDays'] ?? null;
    $expiresAt = null;
    if (is_int($ttlDays) && $ttlDays > 0) {
        $expiresAt = gmdate('Y-m-d H:i:s', time() + ($ttlDays * 86400));
    }

    $repository->createShare((int) $row['id'], hash('sha256', $token), $expiresAt, $now);

    return QkLiveResponse::ok(['shareUrl' => qk_live_share_url($appConfig, $server, $token)], 201);
}

/**
 * DELETE share: revokes every active link for an assessment owned by the session.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_live_handle_revoke_share(
    array $server,
    array $appConfig,
    QkLiveRepository $repository,
    array $cookies,
    string $publicId
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'shareCreate');
    qk_live_assert_same_origin($server, $appConfig);

    $session = qk_live_require_session($repository, $cookies, $liveConfig, $server);
    qk_live_assert_csrf($server, $session);

    $row = $repository->findAssessment((int) $session['id'], $publicId);
    if ($row === null) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'Assessment not found.');
    }

    $repository->revokeShares((int) $row['id'], gmdate('Y-m-d H:i:s'));

    return QkLiveResponse::ok(['revoked' => true]);
}


/**
 * GET shared: public read-only retrieval by opaque token.
 *
 * Returns only public-safe fields, never the session, the private history or internal ids.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @return array<string,mixed>
 */
function qk_live_handle_shared(
    array $server,
    array $appConfig,
    QkLiveRepository $repository,
    string $token
): array {
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'shareRead');

    if (preg_match('/^[a-f0-9]{64}$/', $token) !== 1) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'This shared assessment is no longer available.');
    }

    $share = $repository->findActiveShareByHash(hash('sha256', $token), gmdate('Y-m-d H:i:s'));
    if ($share === null) {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'This shared assessment is no longer available.');
    }

    $detail = qk_live_detail($repository, $share, null);
    if (($detail['status'] ?? '') === 'archived') {
        throw new QkLiveHttpError(404, 'NOT_FOUND', 'This shared assessment is no longer available.');
    }

    return QkLiveResponse::ok($detail);
}

/**
 * GET scenarios: the enabled demonstration library.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @return array<string,mixed>
 */
function qk_live_handle_scenarios(array $server, array $appConfig, QkLiveRepository $repository): array
{
    $liveConfig = qk_live_config($appConfig);
    qk_live_rate_limit($liveConfig, $server, 'list');

    $scenarios = [];
    foreach ($repository->listScenarios() as $row) {
        $defaultState = qk_live_decode_column((string) ($row['default_state_json'] ?? '{}'));
        $timeline = json_decode((string) ($row['timeline_json'] ?? '[]'), true);
        if (!is_array($timeline)) {
            $timeline = [];
        }

        $scenarios[] = [
            'slug' => (string) $row['slug'],
            'name' => (string) $row['name'],
            'category' => (string) $row['category'],
            'shortDescription' => (string) $row['short_description'],
            'longDescription' => (string) $row['long_description'],
            'scenarioVersion' => (string) $row['scenario_version'],
            'defaultState' => $defaultState,
            'timeline' => array_values($timeline),
            'executiveSummaryTemplate' => (string) $row['executive_summary_template'],
        ];
    }

    return QkLiveResponse::ok($scenarios);
}

/**
 * GET report: the stored data required by the executive report, for the owning session.
 *
 * @param array<string,mixed> $server
 * @param array<string,mixed> $appConfig
 * @param array<string,mixed> $cookies
 * @return array<string,mixed>
 */
function qk_live_handle_report(
    array $server,
    array $appConfig,
    QkLiveRepository $repository,
    array $cookies,
    string $publicId
): array {
    return qk_live_handle_get_assessment($server, $appConfig, $repository, $cookies, $publicId);
}

