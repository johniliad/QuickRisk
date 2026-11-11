<?php

declare(strict_types=1);

/**
 * GET  /live/api/assessments.php — the current session's assessment history.
 * POST /live/api/assessments.php — save a new assessment.
 */

require_once __DIR__ . '/_bootstrap.php';

qk_live_endpoint(
    static function (array $server, array $appConfig, QkLiveRepository $repository, array $cookies, string $body): array {
        $method = strtoupper((string) ($server['REQUEST_METHOD'] ?? 'GET'));

        return $method === 'POST'
            ? qk_live_handle_create_assessment($server, $appConfig, $repository, $cookies, $body)
            : qk_live_handle_list_assessments($server, $appConfig, $repository, $cookies);
    },
    ['GET', 'POST']
);
