<?php

declare(strict_types=1);

/**
 * POST   /live/api/decision-share.php?id={publicId} — create a read-only Board Risk Pack link.
 * DELETE /live/api/decision-share.php?id={publicId} — revoke it.
 */

require_once __DIR__ . '/_decision_bootstrap.php';

qk_decision_endpoint(
    static function (array $server, array $appConfig, QkDecisionRepository $repository, array $cookies, string $body): array {
        $publicId = (string) ($_GET['id'] ?? '');
        if (preg_match('/^[A-Za-z0-9]{20,32}$/', $publicId) !== 1) {
            throw new QkLiveHttpError(404, 'NOT_FOUND', 'Decision analysis not found.');
        }

        $method = strtoupper((string) ($server['REQUEST_METHOD'] ?? 'POST'));

        return $method === 'DELETE'
            ? qk_decision_share_revoke($server, $appConfig, $repository, $cookies, $publicId)
            : qk_decision_share_create($server, $appConfig, $repository, $cookies, $publicId);
    },
    ['POST', 'DELETE']
);
