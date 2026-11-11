<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — shared bootstrap for its API endpoints.
 *
 * Mirrors the Live bootstrap: one place for configuration, the repository and the error
 * envelope, so each endpoint script stays a few lines long.
 */

require_once __DIR__ . '/_bootstrap.php';
require_once qk_live_includes_base() . '/includes/decision/handlers.php';

/**
 * Dispatches one Decision Lab request.
 *
 * @param callable(array<string,mixed>, array<string,mixed>, QkDecisionRepository, array<string,mixed>, string): array<string,mixed> $handler
 * @param array<int,string> $allowedMethods
 */
function qk_decision_endpoint(callable $handler, array $allowedMethods, ?string $rawBody = null): void
{
    $appConfig = qk_config();
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    if (!in_array($method, $allowedMethods, true)) {
        header('Allow: ' . implode(', ', $allowedMethods));
        QkLiveResponse::send(
            QkLiveResponse::error(405, 'METHOD_NOT_ALLOWED', 'This endpoint does not accept that method.'),
            $appConfig
        );

        return;
    }

    try {
        $liveConfig = qk_live_config($appConfig);
        $repository = qk_decision_repository($liveConfig);
        $cookies = is_array($_COOKIE) ? $_COOKIE : [];
        $body = $rawBody ?? (string) file_get_contents('php://input');

        QkLiveResponse::send($handler($_SERVER, $appConfig, $repository, $cookies, $body), $appConfig);
    } catch (Throwable $error) {
        QkLiveResponse::send(QkLiveResponse::fromThrowable($error), $appConfig);
    }
}
