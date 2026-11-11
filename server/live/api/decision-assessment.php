<?php

declare(strict_types=1);

/**
 * GET    /live/api/decision-assessment.php?id={publicId} — read one owned analysis.
 * DELETE /live/api/decision-assessment.php?id={publicId} — archive it.
 */

require_once __DIR__ . '/_decision_bootstrap.php';

qk_decision_endpoint(
    static function (array $server, array $appConfig, QkDecisionRepository $repository, array $cookies, string $body): array {
        $publicId = (string) ($_GET['id'] ?? '');
        if (preg_match('/^[A-Za-z0-9]{20,32}$/', $publicId) !== 1) {
            throw new QkLiveHttpError(404, 'NOT_FOUND', 'Decision analysis not found.');
        }

        $method = strtoupper((string) ($server['REQUEST_METHOD'] ?? 'GET'));

        return $method === 'DELETE'
            ? qk_decision_archive($server, $appConfig, $repository, $cookies, $publicId)
            : qk_decision_get($server, $appConfig, $repository, $cookies, $publicId);
    },
    ['GET', 'DELETE']
);
