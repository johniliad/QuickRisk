<?php

declare(strict_types=1);

/**
 * GET    /live/api/decision-treatments.php            — curated library + this session's customs.
 * POST   /live/api/decision-treatments.php            — save a custom treatment.
 * DELETE /live/api/decision-treatments.php?id={id}    — delete a custom treatment.
 */

require_once __DIR__ . '/_decision_bootstrap.php';

qk_decision_endpoint(
    static function (array $server, array $appConfig, QkDecisionRepository $repository, array $cookies, string $body): array {
        $method = strtoupper((string) ($server['REQUEST_METHOD'] ?? 'GET'));

        if ($method === 'POST') {
            return qk_decision_custom_create($server, $appConfig, $repository, $cookies, $body);
        }
        if ($method === 'DELETE') {
            $publicId = (string) ($_GET['id'] ?? '');
            if (preg_match('/^[A-Za-z0-9]{20,32}$/', $publicId) !== 1) {
                throw new QkLiveHttpError(404, 'NOT_FOUND', 'Custom treatment not found.');
            }

            return qk_decision_custom_delete($server, $appConfig, $repository, $cookies, $publicId);
        }

        return qk_decision_treatment_catalogue($server, $appConfig, $repository, $cookies);
    },
    ['GET', 'POST', 'DELETE']
);
