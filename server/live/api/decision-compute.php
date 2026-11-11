<?php

declare(strict_types=1);

/**
 * POST /live/api/decision-compute.php
 *
 * Runs a Decision Lab analysis on the existing QuickRisk engine. Nothing is stored.
 * Actions: baseline | compare | portfolios | sensitivity.
 */

require_once __DIR__ . '/_decision_bootstrap.php';

qk_decision_endpoint(
    static function (array $server, array $appConfig, QkDecisionRepository $repository, array $cookies, string $body): array {
        return qk_decision_compute($server, $appConfig, $body);
    },
    ['POST']
);
