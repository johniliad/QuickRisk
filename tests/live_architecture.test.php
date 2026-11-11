<?php

declare(strict_types=1);

/**
 * QuickRisk Live — architectural and privacy guarantees.
 *
 * These tests enforce the permanent rules of the QuickRisk Live base requirements:
 * the risk mathematics exists once (TypeScript), the PHP layer only validates and stores,
 * tokens are hashed, cookies are hardened and the documentation and schema are present.
 */

return [
    'live architecture: PHP never reimplements the risk mathematics' => function (): void {
        $root = qk_test_repository_root();
        $files = array_merge(
            qk_test_files($root . '/server/includes/live', ['php']),
            qk_test_files($root . '/server/live', ['php'])
        );

        assertTrue(count($files) >= 10, 'The Live PHP sources must be present');

        // None of these tokens may appear in PHP: they are the engine's formulas.
        $forbidden = [
            '(4 * $mitigation',
            '4 * $mitigationFactor',
            '* 12 *',
            '$telemetryScore = $',
            'clamp(1 +',
            '(1 - $edrReduction)',
        ];

        foreach ($files as $file) {
            $contents = (string) file_get_contents($file);
            foreach ($forbidden as $needle) {
                assertNotContains($needle, $contents, basename($file) . ' must not contain a risk formula');
            }
        }

        // The engine lives in the TypeScript module and is the only place with the coefficients.
        $engine = (string) file_get_contents($root . '/frontend/src/live/engine/socRiskEngine.ts');
        assertContains('4 * mitigationFactor - 1', $engine, 'The multiplier formula must live in the TypeScript engine');
        assertContains('LIVE_METHODOLOGY_VERSION', $engine, 'The engine must stamp its methodology version');
        assertContains('Math.min(100, Math.round', $engine, 'The index formula must live in the TypeScript engine');
    },

    'live architecture: session and share tokens are stored only as hashes' => function (): void {
        $root = qk_test_repository_root();
        $handlers = (string) file_get_contents($root . '/server/includes/live/handlers.php');

        assertContains("hash('sha256', \$token)", $handlers, 'Share tokens must be hashed before storage');
        assertContains("hash('sha256', \$cookieToken)", $handlers, 'Session tokens must be hashed before storage');
        assertContains('random_bytes(32)', $handlers, 'Tokens must use 256 bits of random material');
        assertNotContains('token_plain', $handlers, 'The raw share token must never be recoverable from storage');

        $schema = (string) file_get_contents($root . '/database/001_initial_schema.sql');
        assertContains('session_token_hash CHAR(64)', $schema, 'The session table must store a hash');
        assertContains('token_hash CHAR(64)', $schema, 'The share table must store a hash');
        assertNotContains('session_token VARCHAR', $schema, 'The raw session token must never be stored');
    },

    'live architecture: the session cookie is hardened and HTTPS is enforced' => function (): void {
        $root = qk_test_repository_root();
        $security = (string) file_get_contents($root . '/server/includes/live/security.php');

        assertContains("'httponly' => true", $security, 'The session cookie must be HttpOnly');
        assertContains("'samesite' => 'Lax'", $security, 'The session cookie must be SameSite');
        assertContains("'secure' => qk_live_is_https(\$server)", $security, 'The session cookie must be Secure over HTTPS');
        assertContains('qk_live_assert_same_origin', $security, 'State-changing requests must verify their origin');
        assertContains("hash_equals(\$expected, hash('sha256', \$presented))", $security, 'CSRF tokens must be compared in constant time');

        $config = qk_live_config(qk_config());
        assertSame('', (string) $config['database']['password'], 'No database password may be committed');
        assertSame('1.0', (string) $config['methodologyVersion'], 'The methodology version must be 1.0');
        assertTrue((int) $config['sessionTtlDays'] > 0, 'The session lifetime must be configurable and positive');
    },

    'live architecture: the API is same-origin only and denies direct access to internals' => function (): void {
        $root = qk_test_repository_root();

        $htaccess = (string) file_get_contents($root . '/server/live/api/.htaccess');
        assertContains('Require all denied', $htaccess, 'The endpoint directory must deny unspecified files');
        assertContains('_bootstrap\\.php', $htaccess, 'The shared bootstrap must be denied');
        assertNotContains('Access-Control-Allow-Origin', $htaccess, 'Cross-origin sharing must not be enabled');

        foreach (qk_test_files($root . '/server/live', ['php']) as $file) {
            $contents = (string) file_get_contents($file);
            assertNotContains(
                'Access-Control-Allow-Origin',
                $contents,
                basename($file) . ' must not enable cross-origin requests'
            );
        }

        // The includes directory is already denied; the Live library must live there.
        $includesHtaccess = (string) file_get_contents($root . '/server/includes/.htaccess');
        assertContains('Require all denied', $includesHtaccess, 'The Live library must sit behind the includes deny rule');
    },
];
