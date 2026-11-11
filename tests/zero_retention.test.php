<?php

declare(strict_types=1);

/**
 * Zero-retention verification tests (development plan phase 16).
 *
 * These tests are a release blocker: they prove that the application has no
 * persistence mechanism for assessment content, in the server code, in the
 * browser code and in the configured headers.
 *
 * Scope: the zero-retention guarantee applies to the QuickRisk questionnaire and calculator.
 * QuickRisk Live and the Decision Lab are separate modules with an explicit anonymous-session
 * policy, so their paths are excluded here and verified by tests/live_architecture.test.php
 * and tests/decision_architecture.test.php instead.
 */

if (!function_exists('qk_test_is_live_path')) {
    /**
     * True when a path belongs to a module with its own persistence policy.
     */
    function qk_test_is_live_path(string $path): bool
    {
        $normalised = str_replace('\\', '/', $path);

        return str_contains($normalised, '/live/') || str_contains($normalised, '/decision/');
    }
}

if (!function_exists('qk_test_base_paths')) {
    /**
     * Filters out the QuickRisk Live module from a list of paths.
     *
     * @param array<int,string> $paths
     * @return array<int,string>
     */
    function qk_test_base_paths(array $paths): array
    {
        return array_values(array_filter($paths, static fn (string $path): bool => !qk_test_is_live_path($path)));
    }
}

return [
    'zero-retention: the server never creates a session, cookie or database connection' => function (): void {
        $root = qk_test_repository_root();
        $files = qk_test_base_paths(qk_test_files($root . '/server', ['php']));

        assertTrue(count($files) >= 10, 'The server sources must be present');

        $forbidden = [
            'session_start',
            '$_SESSION',
            'session_id',
            'setcookie(',
            'mysqli',
            'new PDO',
            'pg_connect',
            'INSERT INTO',
            'UPDATE ',
            'DELETE FROM',
            'curl_init',
            'mail(',
            'proc_open',
            'shell_exec',
        ];

        foreach ($files as $file) {
            $contents = (string) file_get_contents($file);
            foreach ($forbidden as $needle) {
                assertNotContains($needle, $contents, basename($file) . ' must not use ' . $needle);
            }
        }
    },

    'zero-retention: assessment data is never written to a file' => function (): void {
        $root = qk_test_repository_root();
        $files = qk_test_base_paths(qk_test_files($root . '/server', ['php']));

        foreach ($files as $file) {
            $name = basename($file);
            $contents = (string) file_get_contents($file);

            // Only the rate limiter may touch the filesystem, and only for a
            // salted client hash plus a counter.
            if ($name !== 'rate_limit.php') {
                foreach (['file_put_contents', 'fwrite(', 'fopen(', 'tempnam', 'tmpfile', 'sys_get_temp_dir'] as $needle) {
                    assertNotContains($needle, $contents, $name . ' must not write files (' . $needle . ')');
                }
            }
        }

        $rateLimiter = (string) file_get_contents($root . '/server/includes/rate_limit.php');
        foreach (['profileAnswers', 'scenarioAnswers', 'optionCode', 'questionCode', 'expectedAnnualLoss'] as $needle) {
            assertNotContains($needle, $rateLimiter, 'The rate limiter must not reference assessment content');
        }
        assertContains('hash(', $rateLimiter, 'The rate limiter must hash the client identifier');
    },

    'zero-retention: only fixed event codes are ever logged' => function (): void {
        $root = qk_test_repository_root();
        $files = qk_test_base_paths(qk_test_files($root . '/server', ['php']));

        foreach ($files as $file) {
            $contents = (string) file_get_contents($file);
            if (!str_contains($contents, 'error_log(')) {
                continue;
            }
            assertSame(basename($file), 'logging.php', 'error_log must only be called from logging.php');
            assertContains(
                "error_log('FAIR QuickRisk event: ' . \$code)",
                $contents,
                'The logger must interpolate nothing but the validated event code'
            );
        }

        $logger = (string) file_get_contents($root . '/server/includes/logging.php');
        assertContains('EVENT_CODES', $logger, 'The logger must use an allow-list of event codes');
        assertContains('in_array($code, self::EVENT_CODES, true)', $logger, 'Unknown codes must be replaced, not logged');
    },

    'zero-retention: the frontend uses no browser storage, cookie or service-worker API' => function (): void {
        $root = qk_test_repository_root();
        $sources = [];
        foreach (['/frontend/src', '/frontend/shared'] as $directory) {
            if (is_dir($root . $directory)) {
                $sources = array_merge($sources, qk_test_files($root . $directory, ['ts', 'tsx', 'js', 'jsx', 'css']));
            }
        }

        assertTrue($sources !== [], 'The frontend sources must be present');

        $forbidden = [
            'localStorage',
            'sessionStorage',
            'indexedDB',
            'document.cookie',
            'caches.',
            'serviceWorker',
            'zustand/middleware',
            'persist(',
            'history.pushState',
            'history.replaceState',
        ];

        foreach ($sources as $file) {
            $contents = (string) file_get_contents($file);
            foreach ($forbidden as $needle) {
                assertNotContains($needle, $contents, basename($file) . ' must not use ' . $needle);
            }
        }
    },

    'zero-retention: the frontend holds no assessment identifier or persistent results route' => function (): void {
        $root = qk_test_repository_root();
        $sources = [];
        foreach (['/frontend/src', '/frontend/shared'] as $directory) {
            if (is_dir($root . $directory)) {
                $sources = array_merge($sources, qk_test_files($root . $directory, ['ts', 'tsx']));
            }
        }

        foreach ($sources as $file) {
            $contents = (string) file_get_contents($file);
            foreach (['assessmentId', 'assessmentToken', 'resumeToken', 'location.hash', '?results=', '&results='] as $needle) {
                assertNotContains($needle, $contents, basename($file) . ' must not contain ' . $needle);
            }
        }
    },

    'zero-retention: the calculation endpoint declares no-store headers' => function (): void {
        $headers = QkHttp::CACHE_HEADERS;

        assertSame('no-store, no-cache, must-revalidate, max-age=0', $headers['Cache-Control'], 'Cache-Control must prevent caching');
        assertSame('no-cache', $headers['Pragma'], 'Pragma must prevent caching');

        $config = qk_config();
        assertSame(
            'no-store, no-cache, must-revalidate, max-age=0',
            $config['headers']['Cache-Control'],
            'The configured response headers must prevent caching'
        );
        assertSame('no-referrer', $config['headers']['Referrer-Policy'], 'The referrer policy must be restrictive');
        assertSame('DENY', $config['headers']['X-Frame-Options'], 'Framing must be denied');
    },

    'zero-retention: no assessment state is retained between two calculations' => function (): void {
        $first = qk_test_calculate(qk_test_payload(qk_test_profile()));
        $second = qk_test_calculate(qk_test_payload(qk_test_profile(['QP7' => 'VERY_LIMITED'])));

        assertTrue(
            (float) $first['portfolio']['expectedAnnualLoss'] !== (float) $second['portfolio']['expectedAnnualLoss'],
            'Each request must be calculated independently'
        );
        assertFalse($first['meta']['seedPersisted'], 'No seed may be persisted between requests');
        assertSame('zero-retention', $first['meta']['retentionMode'], 'The retention mode must be declared in every response');

        // Two identical requests through the real handler, each with a freshly generated
        // in-memory seed, must not be served from a cached result.
        $third = qk_handle_calculation(qk_config(), qk_test_payload(qk_test_profile()), 5000, null);
        $fourth = qk_handle_calculation(qk_config(), qk_test_payload(qk_test_profile()), 5000, null);
        assertTrue(
            (float) $third['portfolio']['expectedAnnualLoss'] !== (float) $fourth['portfolio']['expectedAnnualLoss'],
            'A live calculation must not be served from a cached result'
        );
        assertFalse($third['meta']['seedDisclosed'], 'The generated seed must never be disclosed');
    },
];
