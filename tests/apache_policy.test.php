<?php

declare(strict_types=1);

/**
 * The web-server policy.
 *
 * The application is served by shared hosting with no `apache.conf` access, so the security
 * headers — the Content-Security-Policy and HSTS above all — ship in `server/.htaccess`, which
 * `tools/deploy.sh` writes to the web root. These tests keep that arrangement honest:
 *
 *  - the policy exists, once, with every directive the application needs;
 *  - it is defined in exactly one versioned file, because two CSP headers are enforced as two
 *    policies and a second copy silently contradicts the first;
 *  - no versioned `.htaccess` carries an address allow-list: the temporary beta gate holds real
 *    addresses and lives outside the repository, merged at deploy time;
 *  - the deploy script keeps both of those properties (notice exclusion and gate merge).
 */

return [
    'apache policy: the web-root .htaccess carries one complete Content-Security-Policy' => function (): void {
        $root = qk_test_repository_root();
        $htaccess = (string) file_get_contents($root . '/server/.htaccess');

        $guard = '<IfModule mod_headers.c>';
        $policyStart = strpos($htaccess, 'Header always set Content-Security-Policy');

        assertTrue($policyStart !== false, 'server/.htaccess must set the Content-Security-Policy');
        assertTrue(
            strpos($htaccess, $guard) !== false && strpos($htaccess, $guard) < $policyStart,
            'The Content-Security-Policy must sit inside the mod_headers guard, or the site 500s where the module is absent'
        );
        assertSame(
            1,
            substr_count($htaccess, 'Content-Security-Policy'),
            'The policy must be stated once; a second header would be enforced as a second policy'
        );

        foreach ([
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:",
            "font-src 'self'",
            "connect-src 'self'",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
        ] as $directive) {
            assertContains($directive, $htaccess, 'The CSP must keep the directive ' . $directive);
        }

        // `always` also stamps error responses, which is what makes the 403 holding notice carry
        // the policy and lets the header be verified from any address.
        assertContains(
            'Header always set Content-Security-Policy',
            $htaccess,
            'The CSP must use "always" so error responses carry it too'
        );
    },

    'apache policy: HSTS is enabled once and not left commented out' => function (): void {
        $root = qk_test_repository_root();
        $htaccess = (string) file_get_contents($root . '/server/.htaccess');

        assertContains(
            'Header always set Strict-Transport-Security "max-age=',
            $htaccess,
            'HSTS must be sent, because the vhost is not editable on shared hosting'
        );
        assertNotContains(
            '# Header always set Strict-Transport-Security',
            $htaccess,
            'HSTS must not be left commented out'
        );
        assertSame(
            1,
            substr_count($htaccess, 'Strict-Transport-Security'),
            'HSTS must be stated once'
        );
    },
    'apache policy: the policy is defined in exactly one versioned file' => function (): void {
        $root = qk_test_repository_root();

        // The places a duplicate could realistically appear: the Apache policies themselves, the
        // guides that quote snippets, and the page someone might add a <meta> tag to.
        $candidates = array_merge(
            glob($root . '/*.md') ?: [],
            glob($root . '/*.txt') ?: [],
            [$root . '/frontend/index.html'],
            qk_test_files($root . '/docs', ['md', 'txt']),
            qk_test_files($root . '/server', ['htaccess', 'php', 'conf']),
            qk_test_files($root . '/static-pages', ['html', 'md']),
            qk_test_files($root . '/tools', ['sh', 'php']),
            qk_test_files($root . '/frontend/public', ['html', 'htaccess'])
        );

        $defining = [];
        foreach ($candidates as $file) {
            if (!is_file($file)) {
                continue;
            }
            $contents = (string) file_get_contents($file);
            if (str_contains($contents, 'default-src')) {
                $defining[] = str_replace('\\', '/', substr($file, strlen($root) + 1));
            }
        }

        assertSame(
            ['server/.htaccess'],
            $defining,
            'The CSP must be defined in server/.htaccess and nowhere else; a copy in a vhost snippet or a <meta> tag would be enforced as a second policy'
        );
    },

    'apache policy: no versioned .htaccess carries an address allow-list' => function (): void {
        $root = qk_test_repository_root();

        $policies = array_merge(
            qk_test_files($root . '/server', ['htaccess']),
            qk_test_files($root . '/frontend/public', ['htaccess'])
        );

        assertTrue($policies !== [], 'The versioned Apache policies must exist');

        foreach ($policies as $file) {
            $relative = str_replace('\\', '/', substr($file, strlen($root) + 1));
            $contents = (string) file_get_contents($file);

            assertSame(
                0,
                preg_match('/\b\d{1,3}(?:\.\d{1,3}){3}\b/', $contents),
                'A versioned .htaccess must not contain an IPv4 address (' . $relative . '); the beta gate belongs in ~/quickrisk-config/beta-gate.htaccess'
            );
            assertNotContains(
                'Require ip',
                $contents,
                'A versioned .htaccess must not allow-list addresses (' . $relative . ')'
            );
        }
    },

    'apache policy: the deploy script preserves the notice and merges the beta gate' => function (): void {
        $root = qk_test_repository_root();
        $deploy = (string) file_get_contents($root . '/tools/deploy.sh');

        // The notice is published by hand, so the --delete sweep must not remove its folder.
        assertContains(
            "--exclude 'UnderConstruction/'",
            $deploy,
            'The deploy script must exclude the notice folder from the --delete sweep'
        );

        // The gate is not versioned, so the deploy has to re-apply it after overwriting the file.
        assertContains(
            'beta-gate.htaccess',
            $deploy,
            'The deploy script must merge the beta gate found in the configuration directory'
        );
        assertContains(
            'QK_BETA_GATE',
            $deploy,
            'The gate path must be overridable for a host that keeps it elsewhere'
        );
        assertContains(
            'cat "$BETA_GATE" >> "$WEB_DIR/.htaccess"',
            $deploy,
            'The gate must be appended to the deployed .htaccess, after the versioned policy'
        );

        // A deploy that lost the headers must fail loudly rather than publish an open, headerless site.
        assertContains(
            'Header always set Content-Security-Policy',
            $deploy,
            'The deploy script must verify that the deployed .htaccess still carries the CSP'
        );
        assertContains(
            "connect-src 'self'",
            $deploy,
            'The deploy script must verify that the deployed policy still allows the API calls'
        );
    },
];
