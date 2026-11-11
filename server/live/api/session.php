<?php

declare(strict_types=1);

/**
 * GET  /live/api/session.php  — create or renew the anonymous session.
 * POST /live/api/session.php  — same behaviour (idempotent).
 */

require_once __DIR__ . '/_bootstrap.php';

qk_live_endpoint(
    static function (array $server, array $appConfig, QkLiveRepository $repository, array $cookies, string $body): array {
        return qk_live_handle_session($server, $appConfig, $repository, $cookies);
    },
    ['GET', 'POST']
);
