<?php

declare(strict_types=1);

/**
 * GET /live/api/scenarios.php — the enabled demonstration scenario library (read-only).
 */

require_once __DIR__ . '/_bootstrap.php';

qk_live_endpoint(
    static function (array $server, array $appConfig, QkLiveRepository $repository, array $cookies, string $body): array {
        return qk_live_handle_scenarios($server, $appConfig, $repository);
    },
    ['GET']
);
