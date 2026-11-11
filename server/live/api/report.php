<?php

declare(strict_types=1);

/**
 * GET /live/api/report.php?id={publicId} — stored data for the executive report (owner only).
 *
 * The report is a presentation of stored values; this endpoint performs no calculation.
 */

require_once __DIR__ . '/_bootstrap.php';

qk_live_endpoint(
    static function (array $server, array $appConfig, QkLiveRepository $repository, array $cookies, string $body): array {
        $publicId = (string) ($_GET['id'] ?? '');
        if (preg_match('/^[A-Za-z0-9]{20,32}$/', $publicId) !== 1) {
            throw new QkLiveHttpError(404, 'NOT_FOUND', 'Assessment not found.');
        }

        return qk_live_handle_report($server, $appConfig, $repository, $cookies, $publicId);
    },
    ['GET']
);
