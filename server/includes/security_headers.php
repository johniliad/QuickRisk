<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — the response security-header policy.
 *
 * This file is the PHP half of one policy that is also served by Apache. The
 * authoritative browser policy is the `Header always set` block in server/.htaccess,
 * because shared hosting serves the static files and the branded error documents
 * without PHP. This module makes the PHP endpoints (the calculation endpoint and
 * every QuickRisk Live endpoint) answer with the same headers, so a JSON response
 * can never be sniffed, framed, cached or read cross-origin.
 *
 * The two copies are compared by tests/security_headers.test.php: the directive list
 * below and the one in server/.htaccess must stay identical. The Apache copy is the one
 * that matters for a visitor, and tools/render-apache-policy.php refreshes the inline-style
 * hashes in it from the documents it is about to publish.
 *
 * Policy notes (kept short so the literals below appear only once):
 *   - no 'unsafe-inline' anywhere: script-src is 'self' only, and the style
 *     directive accepts 'self' plus those per-document hashes;
 *   - the two directives that have no fallback (frame-ancestors, form-action) are
 *     stated explicitly and with no wildcard source, and base-uri is pinned;
 *   - object-src, frame-src and child-src are 'none'; this application embeds
 *     nothing and loads no plugin content.
 */
final class QkSecurityHeaders
{
    /**
     * Transport security. One year plus includeSubDomains is the shortest value that
     * browsers accept for preload, and the deployment verification tool refuses a
     * shorter max-age (in particular Cloudflare's "max-age=0", which switches HSTS
     * off for every visitor who has already seen it).
     */
    public const HSTS = 'max-age=31536000; includeSubDomains';

    /**
     * sha256 hashes of the inline <style> blocks of the static documents.
     *
     * The policy allows no inline keyword, so methodology.html, the branded error pages
     * and the holding notice are allowed exactly their own stylesheet by hash. A hash source
     * is a quoted token, so each value below carries its own single quotes. The digest is
     * taken over the block with its line endings normalised to LF, because that is the text
     * the HTML parser hands to the hash check. tools/render-apache-policy.php recomputes the
     * values from the documents it is about to publish.
     */
    public const INLINE_STYLE_HASHES = "'sha256-Lg4WFrcK9kjeRs8LDXjPQAaeooAmmysE1Y0BZM7wpBI=' 'sha256-WF7buxXEshblQVVTUx1RDs+RjeA3bdwWOZi1hUZAu9U=' 'sha256-rwphtFjau7AFUxYhXuH9NNjMw2I/1skWcSeIG/HDvAs='";

    /**
     * The Content-Security-Policy sent with PHP responses and by the development server.
     *
     * A JSON document contains no stylesheet and no script, so it needs none of the
     * hashes; they are present so that the same policy also covers the HTML documents the
     * development server serves from the build.
     */
    public const CONTENT_SECURITY_POLICY = "default-src 'self'; script-src 'self'; style-src 'self' "
        . self::INLINE_STYLE_HASHES
        . "; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'none'; object-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

    /**
     * Headers that are removed from every response.
     *
     * The application is same-origin only — the calculation endpoint and the Live API
     * are called by its own pages — so no cross-origin read is ever granted. Removing
     * the headers (rather than merely not setting them) also strips a permissive
     * `Access-Control-Allow-Origin: *` inherited from a parent policy or a provider
     * default vhost.
     */
    public const CORS_HEADERS = [
        'Access-Control-Allow-Origin',
        'Access-Control-Allow-Methods',
        'Access-Control-Allow-Headers',
        'Access-Control-Allow-Credentials',
        'Access-Control-Expose-Headers',
        'Access-Control-Max-Age',
    ];

    /**
     * The header policy every response carries, whatever the status code.
     *
     * The same map is written for PHP responses, for the built-in development server
     * and — as `Header always set` directives — in server/.htaccess.
     *
     * @return array<string,string>
     */
    public static function baseline(): array
    {
        return [
            'Content-Security-Policy' => self::CONTENT_SECURITY_POLICY,
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'DENY',
            'Referrer-Policy' => 'no-referrer',
            'Cross-Origin-Opener-Policy' => 'same-origin',
            'Cross-Origin-Resource-Policy' => 'same-origin',
            'X-Permitted-Cross-Domain-Policies' => 'none',
            'Permissions-Policy' => 'geolocation=(), microphone=(), camera=(), payment=()',
        ];
    }

    /**
     * True when the request reached the application over TLS.
     *
     * The Forwarded / X-Forwarded-Proto values are deliberately not trusted: on this
     * deployment Cloudflare always terminates TLS and the origin is reached over
     * HTTPS, so the process environment already reports it. A spoofable header must
     * never be able to make the application believe a plain-HTTP request was secure.
     *
     * @param array<string,mixed>|null $server
     */
    public static function isHttps(?array $server = null): bool
    {
        $server ??= $_SERVER;

        $https = strtolower((string) ($server['HTTPS'] ?? ''));
        $scheme = strtolower((string) ($server['REQUEST_SCHEME'] ?? ''));
        $port = (string) ($server['SERVER_PORT'] ?? '');

        return $https === 'on' || $https === '1' || $scheme === 'https' || $port === '443';
    }

    /**
     * Returns the complete header map for one response.
     *
     * HSTS is added only over TLS: sending it on a plain-HTTP response is ignored by
     * browsers and is itself a finding.
     *
     * @param array<string,mixed> $config
     * @param array<string,mixed>|null $server
     * @return array<string,string>
     */
    public static function forResponse(array $config, ?array $server = null): array
    {
        $headers = [];
        foreach ((array) ($config['headers'] ?? []) as $name => $value) {
            $name = (string) $name;
            if ($name === '' || self::isCorsHeader($name)) {
                // A cross-origin grant is never emitted, even if the deployment override
                // configures one: the application only ever calls its own endpoints.
                continue;
            }
            $headers[$name] = (string) $value;
        }

        if (self::isHttps($server)) {
            $headers['Strict-Transport-Security'] = self::HSTS;
        }

        return $headers;
    }

    /**
     * True when a header name belongs to the CORS family that must never be sent.
     */
    public static function isCorsHeader(string $name): bool
    {
        foreach (self::CORS_HEADERS as $cors) {
            if (strcasecmp($cors, $name) === 0) {
                return true;
            }
        }

        return false;
    }
}
