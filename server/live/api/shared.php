<?php

declare(strict_types=1);

/**
 * GET /live/api/shared.php?token={opaqueToken} — public, read-only shared assessment.
 *
 * No session is required and no private data is returned.
 */

require_once __DIR__ . '/_bootstrap.php';

qk_live_endpoint(
    static function (array $server, array $appConfig, QkLiveRepository $repository, array $cookies, string $body): array {
        return qk_live_handle_shared($server, $appConfig, $repository, (string) ($_GET['token'] ?? ''));
    },
    ['GET']
);
