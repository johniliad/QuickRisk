<?php

declare(strict_types=1);

/**
 * GET /live/api/assessment.php?id={publicId} — read one owned assessment.
 * PUT /live/api/assessment.php?id={publicId} — update one owned assessment.
 */

require_once __DIR__ . '/_bootstrap.php';

qk_live_endpoint(
    static function (array $server, array $appConfig, QkLiveRepository $repository, array $cookies, string $body): array {
        $publicId = (string) ($_GET['id'] ?? '');
        if (preg_match('/^[A-Za-z0-9]{20,32}$/', $publicId) !== 1) {
            throw new QkLiveHttpError(404, 'NOT_FOUND', 'Assessment not found.');
        }

        $method = strtoupper((string) ($server['REQUEST_METHOD'] ?? 'GET'));

        return $method === 'PUT'
            ? qk_live_handle_update_assessment($server, $appConfig, $repository, $cookies, $publicId, $body)
            : qk_live_handle_get_assessment($server, $appConfig, $repository, $cookies, $publicId);
    },
    ['GET', 'PUT']
);
