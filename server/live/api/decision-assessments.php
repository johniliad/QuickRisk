<?php

declare(strict_types=1);

/**
 * GET  /live/api/decision-assessments.php — this session's decision analyses.
 * POST /live/api/decision-assessments.php — save a computed decision analysis.
 */

require_once __DIR__ . '/_decision_bootstrap.php';

qk_decision_endpoint(
    static function (array $server, array $appConfig, QkDecisionRepository $repository, array $cookies, string $body): array {
        $method = strtoupper((string) ($server['REQUEST_METHOD'] ?? 'GET'));

        return $method === 'POST'
            ? qk_decision_save($server, $appConfig, $repository, $cookies, $body)
            : qk_decision_list($server, $appConfig, $repository, $cookies);
    },
    ['GET', 'POST']
);
