<?php

declare(strict_types=1);

/**
 * POST   /live/api/share.php?id={publicId} — create a read-only link (revokes any previous link).
 * DELETE /live/api/share.php?id={publicId} — revoke the link.
 */

require_once __DIR__ . '/_bootstrap.php';

qk_live_endpoint(
    static function (array $server, array $appConfig, QkLiveRepository $repository, array $cookies, string $body): array {
        $publicId = (string) ($_GET['id'] ?? '');
        if (preg_match('/^[A-Za-z0-9]{20,32}$/', $publicId) !== 1) {
            throw new QkLiveHttpError(404, 'NOT_FOUND', 'Assessment not found.');
        }

        $method = strtoupper((string) ($server['REQUEST_METHOD'] ?? 'POST'));

        return $method === 'DELETE'
            ? qk_live_handle_revoke_share($server, $appConfig, $repository, $cookies, $publicId)
            : qk_live_handle_create_share($server, $appConfig, $repository, $cookies, $publicId);
    },
    ['POST', 'DELETE']
);
