<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — calculation rate limiting.
 *
 * Zero-retention note: this component stores only a salted hash of a client
 * identifier together with a request counter and a window index. It never stores,
 * references or derives assessment content. When APCu is available no filesystem
 * writes occur at all; the file backend is used only when configured and writable,
 * and the in-memory backend (per PHP process) is the final fallback. Edge-level
 * limiting (Apache/mod_security) is recommended as well.
 */
final class QkRateLimiter
{
    /** @var array<string,array{window:int,count:int}> */
    private static array $memoryStore = [];

    /**
     * @param array<string,mixed> $config
     */
    public static function assertWithinLimit(array $config, string $clientIdentifier): void
    {
        $settings = (array) ($config['rateLimit'] ?? []);
        if (($settings['enabled'] ?? true) !== true) {
            return;
        }

        $windowSeconds = max(1, (int) ($settings['windowSeconds'] ?? 300));
        $limit = max(1, (int) ($settings['maxRequestsPerWindow'] ?? 30));
        $window = (int) floor(time() / $windowSeconds);
        $key = self::key($settings, $clientIdentifier);

        $count = self::increment($settings, $key, $window, $windowSeconds);

        if ($count > $limit) {
            QkHttp::setHeader('Retry-After', (string) $windowSeconds);
            throw new QkRequestException(
                'RATE_LIMITED',
                'Too many calculation requests from this client. Please try again shortly.',
                429
            );
        }
    }

    /**
     * @param array<string,mixed> $settings
     */
    private static function key(array $settings, string $clientIdentifier): string
    {
        $salt = (string) ($settings['clientHashSalt'] ?? '');

        return substr(hash('sha256', $salt . '|' . $clientIdentifier), 0, 40);
    }

    /**
     * @param array<string,mixed> $settings
     */
    private static function increment(array $settings, string $key, int $window, int $windowSeconds): int
    {
        $backend = (string) ($settings['backend'] ?? 'auto');

        if ($backend === 'none') {
            return 1;
        }

        if ($backend === 'apcu' || ($backend === 'auto' && self::apcuAvailable())) {
            if (self::apcuAvailable()) {
                return self::incrementApcu($key, $window, $windowSeconds);
            }
            if ($backend === 'apcu') {
                return self::incrementMemory($key, $window);
            }
        }

        if ($backend === 'file' || $backend === 'auto') {
            $directory = (string) ($settings['storePath'] ?? '');
            if ($directory !== '' && self::ensureDirectory($directory)) {
                $count = self::incrementFile($directory, $key, $window, $windowSeconds);
                if ($count !== null) {
                    return $count;
                }
            }
            if ($backend === 'file') {
                return self::incrementMemory($key, $window);
            }
        }

        return self::incrementMemory($key, $window);
    }

    private static function apcuAvailable(): bool
    {
        if (!function_exists('apcu_inc') || !function_exists('apcu_fetch')) {
            return false;
        }
        if (function_exists('apcu_enabled')) {
            return apcu_enabled();
        }

        return true;
    }

    private static function incrementApcu(string $key, int $window, int $windowSeconds): int
    {
        $cacheKey = 'qk_rl_' . $key . '_' . $window;
        $success = false;
        $count = apcu_inc($cacheKey, 1, $success);
        if ($success === false || $count === false) {
            apcu_store($cacheKey, 1, $windowSeconds * 2);

            return 1;
        }

        return (int) $count;
    }

    private static function incrementMemory(string $key, int $window): int
    {
        $cacheKey = $key . '_' . $window;
        if (!isset(self::$memoryStore[$cacheKey]) || self::$memoryStore[$cacheKey]['window'] !== $window) {
            self::$memoryStore[$cacheKey] = ['window' => $window, 'count' => 0];
        }
        self::$memoryStore[$cacheKey]['count']++;

        return self::$memoryStore[$cacheKey]['count'];
    }

    private static function incrementFile(string $directory, string $key, int $window, int $windowSeconds): ?int
    {
        $path = $directory . DIRECTORY_SEPARATOR . 'qk_' . $key . '_' . $window . '.json';
        $handle = @fopen($path, 'c+');
        if ($handle === false) {
            return null;
        }

        try {
            if (!flock($handle, LOCK_EX)) {
                return null;
            }
            $contents = stream_get_contents($handle);
            $count = 1;
            if (is_string($contents) && $contents !== '') {
                $decoded = json_decode($contents, true);
                if (is_array($decoded) && (int) ($decoded['window'] ?? -1) === $window) {
                    $count = (int) ($decoded['count'] ?? 0) + 1;
                }
            }
            ftruncate($handle, 0);
            rewind($handle);
            fwrite($handle, (string) json_encode(['window' => $window, 'count' => $count]));
            fflush($handle);
            flock($handle, LOCK_UN);

            if (random_int(1, 50) === 1) {
                self::pruneDirectory($directory, $window, $windowSeconds);
            }

            return $count;
        } finally {
            fclose($handle);
        }
    }

    private static function ensureDirectory(string $directory): bool
    {
        if (is_dir($directory)) {
            return is_writable($directory);
        }

        return @mkdir($directory, 0700, true) && is_writable($directory);
    }

    private static function pruneDirectory(string $directory, int $window, int $windowSeconds): void
    {
        $entries = @scandir($directory);
        if (!is_array($entries)) {
            return;
        }

        $cutoff = time() - ($windowSeconds * 4);
        foreach ($entries as $entry) {
            if (!str_starts_with($entry, 'qk_') || !str_ends_with($entry, '.json')) {
                continue;
            }
            $path = $directory . DIRECTORY_SEPARATOR . $entry;
            $modified = @filemtime($path);
            if ($modified !== false && $modified < $cutoff) {
                @unlink($path);
            }
        }
    }
}
