<?php

declare(strict_types=1);

/**
 * QuickRisk Live — database connection.
 *
 * A single PDO connection is created lazily. When no database is configured the application
 * raises a clear "unavailable" error instead of falling back to any other storage: the Live
 * module has no filesystem or in-memory persistence in production.
 *
 * All queries in this module use prepared statements.
 */

final class QkLiveDbUnavailable extends RuntimeException
{
}

/**
 * @param array<string,mixed> $liveConfig
 */
function qk_live_pdo(array $liveConfig): PDO
{
    static $connection = null;
    static $signature = null;

    $database = (array) ($liveConfig['database'] ?? []);
    $name = trim((string) ($database['name'] ?? ''));

    if ($name === '') {
        throw new QkLiveDbUnavailable('QuickRisk Live storage is not configured.');
    }

    $currentSignature = implode('|', [
        (string) ($database['host'] ?? ''),
        (string) ($database['port'] ?? ''),
        $name,
        (string) ($database['user'] ?? ''),
    ]);

    if ($connection instanceof PDO && $signature === $currentSignature) {
        return $connection;
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        (string) ($database['host'] ?? '127.0.0.1'),
        (int) ($database['port'] ?? 3306),
        $name,
        (string) ($database['charset'] ?? 'utf8mb4')
    );

    try {
        $connection = new PDO(
            $dsn,
            (string) ($database['user'] ?? ''),
            (string) ($database['password'] ?? ''),
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
                PDO::ATTR_STRINGIFY_FETCHES => false,
            ]
        );
    } catch (PDOException $exception) {
        // Never leak the driver message, the DSN or the credentials.
        throw new QkLiveDbUnavailable('QuickRisk Live storage is unavailable.', 0);
    }

    $signature = $currentSignature;

    return $connection;
}
