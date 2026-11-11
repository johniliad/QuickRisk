<?php

declare(strict_types=1);

/**
 * GET /live/api/decision-shared.php?token={opaqueToken} — public, read-only Board Risk Pack.
 */

require_once __DIR__ . '/_decision_bootstrap.php';

qk_decision_endpoint(
    static function (array $server, array $appConfig, QkDecisionRepository $repository, array $cookies, string $body): array {
        return qk_decision_shared($server, $appConfig, $repository, (string) ($_GET['token'] ?? ''));
    },
    ['GET']
);
