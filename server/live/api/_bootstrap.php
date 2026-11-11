<?php

declare(strict_types=1);

/**
 * QuickRisk Live — shared bootstrap for the API endpoints.
 *
 * Each endpoint includes this file, calls the handler for its responsibility and sends the
 * response. Configuration, the repository and the error envelope live here so the endpoints
 * stay small (base requirement 93 forbids a monolithic PHP file).
 */

/**
 * Locates the application's includes directory.
 *
 * The deployed layout publishes `live/api/` beside `includes/` at the document root, while the
 * repository keeps everything under `server/`. Both are supported explicitly so the same files
 * run unchanged in development and in production.
 */
function qk_live_includes_base(): string
{
    $documentRootStyle = dirname(__DIR__, 2);
    if (is_file($documentRootStyle . '/includes/bootstrap.php')) {
        return $documentRootStyle;
    }

    $repositoryStyle = dirname(__DIR__, 3) . '/server';
    if (is_file($repositoryStyle . '/includes/bootstrap.php')) {
        return $repositoryStyle;
    }

    throw new RuntimeException('The QuickRisk application includes could not be located.');
}

$qkLiveBase = qk_live_includes_base();
require_once $qkLiveBase . '/includes/bootstrap.php';
require_once $qkLiveBase . '/includes/live/handlers.php';

/**
 * Dispatches one Live request.
 *
 * @param callable(array<string,mixed>, array<string,mixed>, QkLiveRepository, array<string,mixed>, string): array<string,mixed> $handler
 * @param array<int,string> $allowedMethods
 */
function qk_live_endpoint(callable $handler, array $allowedMethods, ?string $rawBody = null): void
{
    $appConfig = qk_config();
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));

    if (!in_array($method, $allowedMethods, true)) {
        header('Allow: ' . implode(', ', $allowedMethods));
        QkLiveResponse::send(QkLiveResponse::error(405, 'METHOD_NOT_ALLOWED', 'This endpoint does not accept that method.'), $appConfig);

        return;
    }

    try {
        $liveConfig = qk_live_config($appConfig);
        $repository = qk_live_repository($liveConfig);
        $cookies = is_array($_COOKIE) ? $_COOKIE : [];
        $body = $rawBody ?? (string) file_get_contents('php://input');

        $result = $handler($_SERVER, $appConfig, $repository, $cookies, $body);

        if (isset($result['cookie']) && is_array($result['cookie'])) {
            qk_live_send_session_cookie($liveConfig, $_SERVER, (string) $result['cookie']['token'], (int) $result['cookie']['expiresAt']);
        }

        QkLiveResponse::send($result, $appConfig);
    } catch (Throwable $error) {
        QkLiveResponse::send(QkLiveResponse::fromThrowable($error), $appConfig);
    }
}
