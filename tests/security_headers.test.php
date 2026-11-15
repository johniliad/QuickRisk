<?php

declare(strict_types=1);

/**
 * The response security-header policy.
 *
 * A passive security scan of the published site produced a list of header findings
 * (a cookie without HttpOnly, transport security disabled or missing, no
 * X-Content-Type-Options, no Content-Security-Policy, 'unsafe-inline' in the style
 * directive, a permissive cross-origin policy, no anti-clickjacking header, missing
 * Subresource Integrity). These tests pin the controls that close them, in the layer
 * that owns each one:
 *
 *  - the policy itself, in server/.htaccess and in includes/security_headers.php;
 *  - the renderer, which recomputes the inline-style hashes and refuses an appended
 *    fragment that would downgrade a header;
 *  - the build, which adds Subresource Integrity to every script and stylesheet;
 *  - the application, which must never emit a redirect body.
 */

/**
 * Runs tools/render-apache-policy.php and returns [status, stdout, stderr].
 *
 * @param array<int,string> $arguments
 * @return array{0:int,1:string,2:string}
 */
function qk_security_run_renderer(array $arguments): array
{
    $command = array_merge(
        [PHP_BINARY, qk_test_repository_root() . '/tools/render-apache-policy.php'],
        $arguments
    );

    $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $process = proc_open($command, $descriptors, $pipes, qk_test_repository_root());
    if (!is_resource($process)) {
        qk_fail('The policy renderer could not be started.');
    }

    $stdout = (string) stream_get_contents($pipes[1]);
    $stderr = (string) stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);

    return [proc_close($process), $stdout, $stderr];
}

/**
 * Writes a throw-away secret file and returns its path.
 */
function qk_security_secret_file(): string
{
    $path = (string) tempnam(sys_get_temp_dir(), 'qk-secret-');
    if ($path === '' || file_put_contents($path, str_repeat('k', 64)) === false) {
        qk_fail('A temporary origin secret could not be written.');
    }

    return $path;
}

/**
 * Returns the single Content-Security-Policy value from an Apache policy file.
 */
function qk_security_csp(string $policy): string
{
    if (preg_match('/Header\s+always\s+set\s+Content-Security-Policy\s+"([^"]*)"/', $policy, $match) !== 1) {
        qk_fail('The policy contains no readable Content-Security-Policy header.');
    }

    return $match[1];
}

/**
 * Drops the sha256 tokens so two copies of the directive list can be compared.
 */
function qk_security_without_hashes(string $csp): string
{
    $stripped = (string) preg_replace('/\ssha256-[A-Za-z0-9+\/=]+/', '', $csp);

    return (string) preg_replace('/\s+/', ' ', trim($stripped));
}


return [
    'security headers: the PHP policy and the Apache policy are the same directive list' => function (): void {
        $root = qk_test_repository_root();
        $htaccess = (string) file_get_contents($root . '/server/.htaccess');

        $apache = qk_security_without_hashes(qk_security_csp($htaccess));
        $php = qk_security_without_hashes(QkSecurityHeaders::CONTENT_SECURITY_POLICY);

        assertSame($php, $apache, 'server/.htaccess and includes/security_headers.php must state the same policy');

        $configured = qk_config();
        assertSame(
            QkSecurityHeaders::CONTENT_SECURITY_POLICY,
            $configured['headers']['Content-Security-Policy'] ?? null,
            'The PHP responses must carry the Content-Security-Policy'
        );
        assertSame('DENY', $configured['headers']['X-Frame-Options'], 'Framing must be denied');
        assertSame('nosniff', $configured['headers']['X-Content-Type-Options'], 'Sniffing must be disabled');
        assertSame('no-referrer', $configured['headers']['Referrer-Policy'], 'The referrer policy must be restrictive');
        assertSame('same-origin', $configured['headers']['Cross-Origin-Opener-Policy'], 'Opener isolation');

        // The development server has no .htaccess, so it must serve the same policy or a
        // local scan would report findings that only exist because the harness is not Apache.
        $router = (string) file_get_contents($root . '/tools/local-router.php');
        assertContains('security_headers.php', $router, 'The development router must load the shared policy');
        assertContains('QkSecurityHeaders::baseline()', $router, 'The development router must serve the shared policy');
        assertContains('QkSecurityHeaders::CORS_HEADERS', $router, 'The development router must remove CORS headers');
    },

    'security headers: the policy allows no inline keyword and no wildcard source' => function (): void {
        $csp = QkSecurityHeaders::CONTENT_SECURITY_POLICY;

        assertNotContains("'unsafe-inline'", $csp, "The policy must not allow 'unsafe-inline'");
        assertNotContains("'unsafe-eval'", $csp, "The policy must not allow 'unsafe-eval'");
        assertNotContains('*', $csp, 'The policy must not contain a wildcard source');

        // The two directives that have no fallback are stated explicitly, with no wildcard:
        // a missing form-action or frame-ancestors is reported as a defect in its own right.
        assertContains("frame-ancestors 'none'", $csp, 'frame-ancestors must be stated explicitly');
        assertContains("form-action 'self'", $csp, 'form-action must be stated explicitly');
        assertContains("base-uri 'self'", $csp, 'base-uri must be pinned');
        assertContains("object-src 'none'", $csp, 'Plugin content must be refused');
        assertContains("script-src 'self'", $csp, 'Only same-origin scripts may run');
    },

    'security headers: transport security is one year and is never sent over plain HTTP' => function (): void {
        $root = qk_test_repository_root();
        $htaccess = (string) file_get_contents($root . '/server/.htaccess');

        assertContains(
            'Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"',
            $htaccess,
            'The origin policy must serve one year of HSTS'
        );
        assertSame(1, substr_count($htaccess, 'Strict-Transport-Security'), 'HSTS must be stated once');

        $config = qk_config();
        $overTls = QkSecurityHeaders::forResponse($config, ['HTTPS' => 'on', 'SERVER_PORT' => '443']);
        assertSame(QkSecurityHeaders::HSTS, $overTls['Strict-Transport-Security'] ?? null, 'HSTS over TLS');

        $overPlainHttp = QkSecurityHeaders::forResponse(
            $config,
            ['HTTPS' => 'off', 'REQUEST_SCHEME' => 'http', 'SERVER_PORT' => '80']
        );
        assertFalse(
            isset($overPlainHttp['Strict-Transport-Security']),
            'HSTS must not be sent on a plain-HTTP response: browsers ignore it and scanners report it'
        );
    },

    'security headers: every cross-origin header is removed' => function (): void {
        $root = qk_test_repository_root();
        $htaccess = (string) file_get_contents($root . '/server/.htaccess');

        foreach (QkSecurityHeaders::CORS_HEADERS as $header) {
            assertContains(
                'Header always unset ' . $header,
                $htaccess,
                'The web-server policy must remove ' . $header . ' so an inherited wildcard cannot survive'
            );
        }

        // A CORS header configured by mistake must never reach the response.
        $config = qk_config();
        $config['headers']['Access-Control-Allow-Origin'] = '*';
        $filtered = QkSecurityHeaders::forResponse($config, ['HTTPS' => 'on']);
        assertFalse(isset($filtered['Access-Control-Allow-Origin']), 'The configured CORS header must be dropped');
        assertTrue(
            QkSecurityHeaders::isCorsHeader('access-control-allow-origin'),
            'CORS names are matched case-insensitively'
        );

        foreach (qk_test_files($root . '/server', ['php']) as $file) {
            $contents = (string) file_get_contents($file);
            assertSame(
                0,
                preg_match('/header\s*\(\s*[\'"]Access-Control-Allow-Origin/i', $contents),
                basename($file) . ' must not emit a cross-origin grant'
            );
            assertSame(
                0,
                preg_match('/[\'"]Access-Control-Allow-Origin[\'"]\s*=>/i', $contents),
                basename($file) . ' must not configure a cross-origin grant'
            );
        }
    },

    'security headers: the inline style hashes match the documents that are published' => function (): void {
        $root = qk_test_repository_root();
        $csp = qk_security_csp((string) file_get_contents($root . '/server/.htaccess'));

        $documents = [
            'frontend/public/methodology.html',
            'frontend/public/errors/403.html',
            'frontend/public/errors/404.html',
            'frontend/public/errors/500.html',
            'frontend/public/errors/503.html',
            'static-pages/UnderConstruction.html',
        ];

        $hashed = 0;
        foreach ($documents as $relative) {
            $html = (string) file_get_contents($root . '/' . $relative);

            preg_match_all('#<style\b[^>]*>(.*?)</style>#is', $html, $blocks);
            foreach ($blocks[1] as $css) {
                // The browser hashes the block after the HTML parser has normalised CRLF to LF.
                $normalised = str_replace(["\r\n", "\r"], "\n", (string) $css);
                $hash = "'sha256-" . base64_encode(hash('sha256', $normalised, true)) . "'";
                assertContains(
                    $hash,
                    $csp,
                    $relative . ': the inline style block must be allowed by the hash of the bytes that are served'
                        . ' (a changed style block or a different line ending invalidates it)'
                );
                $hashed++;
            }

            // The policy no longer allows the inline keyword, so a style attribute would be
            // dropped by the browser. These documents must not use one.
            assertSame(
                0,
                preg_match('/\sstyle\s*=\s*"/i', $html),
                $relative . ' must not carry a style attribute: the policy allows stylesheets and hashes only'
            );
        }

        assertTrue($hashed >= 3, 'The static documents must contribute their inline style hashes');
    },

    'security headers: the renderer hashes the published documents and refuses a downgraded gate' => function (): void {
        $root = qk_test_repository_root();
        $secret = qk_security_secret_file();

        try {
            [$status, $stdout, $stderr] = qk_security_run_renderer([
                '--check',
                '--web-root=' . $root . '/frontend/public',
                '--secret-file=' . $secret,
            ]);
            assertSame(0, $status, 'The policy must render: ' . trim($stdout . ' ' . $stderr));
            assertContains('content security', $stdout, 'The renderer must report the policy it produced');

            // A beta gate is appended after the policy, so a header in it wins. The renderer
            // must refuse rather than publish weaker headers than the policy states.
            $fragment = (string) tempnam(sys_get_temp_dir(), 'qk-gate-');
            file_put_contents($fragment, "Header always set Strict-Transport-Security \"max-age=0\"\n");
            try {
                [$fragmentStatus, , $fragmentStderr] = qk_security_run_renderer([
                    '--check',
                    '--web-root=' . $root . '/frontend/public',
                    '--secret-file=' . $secret,
                    '--append=' . $fragment,
                ]);
                assertTrue($fragmentStatus !== 0, 'A fragment that downgrades HSTS must abort the render');
                assertContains(
                    'restates a security header',
                    $fragmentStderr,
                    'The renderer must explain why the fragment was refused'
                );
            } finally {
                @unlink($fragment);
            }
        } finally {
            @unlink($secret);
        }
    },

    'security headers: the build marks every external script and stylesheet with Subresource Integrity' => function (): void {
        $root = qk_test_repository_root();
        $vite = (string) file_get_contents($root . '/frontend/vite.config.ts');

        assertContains('subresourceIntegrity', $vite, 'The build must inject integrity attributes');
        assertContains("createHash('sha384')", $vite, 'The integrity attribute must be a sha384 digest');

        $dist = $root . '/frontend/dist';
        if (!is_dir($dist)) {
            // The build output is deliberately not versioned; `npm run build` produces it and
            // the deployment refuses to publish a build that was not verified.
            return;
        }

        $documents = qk_test_files($dist, ['html']);
        assertTrue($documents !== [], 'The build output must contain HTML entries');

        $checked = 0;
        foreach ($documents as $document) {
            $html = (string) file_get_contents($document);
            preg_match_all('/<(?:script|link)\b[^>]*>/i', $html, $tags);

            foreach ($tags[0] as $tag) {
                if (preg_match('/\b(?:src|href)="([^"]+)"/i', $tag, $reference) !== 1) {
                    continue;
                }
                $url = $reference[1];
                if (!str_starts_with($url, '/') || str_starts_with($url, '//')) {
                    continue;
                }
                if (stripos($tag, '<link') === 0 && preg_match('/rel="(?:stylesheet|modulepreload)"/i', $tag) !== 1) {
                    continue;
                }

                assertContains(
                    'integrity="sha384-',
                    $tag,
                    basename($document) . ': ' . $url . ' must carry an integrity attribute'
                );

                $asset = $dist . '/' . ltrim($url, '/');
                if (!is_file($asset)) {
                    continue;
                }
                assertContains(
                    'integrity="sha384-' . base64_encode(hash('sha384', (string) file_get_contents($asset), true)) . '"',
                    $tag,
                    basename($document) . ': the integrity attribute of ' . $url . ' must match the file that is served'
                );
                $checked++;
            }
        }

        assertTrue($checked > 0, 'At least one built asset must be integrity-checked');
    },

    'security headers: the application never answers with a redirect of its own' => function (): void {
        $root = qk_test_repository_root();

        // A redirect whose body is large is reported as a potential information leak. This
        // application needs no server-side redirect at all: the pages are static, the API is
        // POST-only and the share route is an internal rewrite. The HTTP-to-HTTPS redirect
        // belongs to the host or the CDN, not to PHP.
        $sources = array_merge(
            qk_test_files($root . '/server', ['php']),
            [$root . '/tools/local-router.php']
        );

        foreach ($sources as $file) {
            $contents = (string) file_get_contents($file);
            assertSame(
                0,
                preg_match('/header\s*\(\s*[\'"]\s*location\s*:/i', $contents),
                basename($file) . ' must not issue a redirect'
            );
        }

        foreach (array_merge(qk_test_files($root . '/frontend/public', ['html']), qk_test_files($root . '/static-pages', ['html'])) as $file) {
            $html = (string) file_get_contents($file);
            assertSame(
                0,
                preg_match('/http-equiv\s*=\s*[\'"]?\s*refresh/i', $html),
                basename($file) . ' must not carry a meta refresh'
            );
        }
    },

    'security headers: the only cookie is HttpOnly, Secure and SameSite' => function (): void {
        $root = qk_test_repository_root();
        $security = (string) file_get_contents($root . '/server/includes/live/security.php');

        assertContains("'httponly' => true", $security, 'The session cookie must be HttpOnly');
        assertContains("'secure' =>", $security, 'The session cookie must be Secure over HTTPS');
        assertContains("'samesite' => 'Lax'", $security, 'The session cookie must be SameSite');
        assertContains("'path' => '/'", $security, 'The session cookie must be scoped to the whole application');

        // Defence in depth: if a PHP session ever starts, its cookie is hardened before it
        // is created. The option must be set in the bootstrap, which runs first.
        $bootstrap = (string) file_get_contents($root . '/server/includes/bootstrap.php');
        assertContains("session.cookie_httponly", $bootstrap, 'The session cookie must be HttpOnly by default');
        assertContains("session.cookie_secure", $bootstrap, 'The session cookie must be Secure by default');
        assertContains("session.cookie_samesite", $bootstrap, 'The session cookie must be SameSite by default');

        $cookies = 0;
        foreach (qk_test_files($root . '/server', ['php']) as $file) {
            $cookies += substr_count((string) file_get_contents($file), 'setcookie(');
        }
        assertSame(1, $cookies, 'Exactly one cookie may be set in the whole application: the Live session');
    },
];
