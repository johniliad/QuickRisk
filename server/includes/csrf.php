<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — stateless request-origin protection.
 *
 * There is no session, no cookie and no authentication for the assessment, so
 * there is no ambient authority for an attacker to abuse. The residual risk is a
 * third-party site causing a visitor's browser to spend calculation capacity.
 * That is addressed without any server-side state by requiring, together:
 *
 *   1. an HTTPS request;
 *   2. an Origin (or, failing that, a Referer) that matches the configured
 *      allow-list of iliadis.net origins;
 *   3. Sec-Fetch-Site of same-origin or same-site when the browser supplies it;
 *   4. a custom request header, which cannot be set by a simple cross-site form
 *      or image request without triggering a CORS preflight.
 *
 * No token is issued, stored or validated, so nothing about the assessment can be
 * reconstructed from the server afterwards.
 */
final class QkCsrf
{
    /**
     * @param array<string,mixed> $config
     * @param array<string,mixed> $server
     */
    public static function assertTrustedRequest(array $config, array $server): void
    {
        $application = (array) ($config['application'] ?? []);

        if (($application['requireHttps'] ?? true) === true) {
            self::assertHttps($server);
        }

        self::assertOrigin($application, $server);
        self::assertFetchMetadata($server);
        self::assertCustomHeader($application, $server);
    }

    /**
     * @param array<string,mixed> $server
     */
    private static function assertHttps(array $server): void
    {
        $https = strtolower((string) ($server['HTTPS'] ?? ''));
        $scheme = strtolower((string) ($server['REQUEST_SCHEME'] ?? ''));
        $port = (string) ($server['SERVER_PORT'] ?? '');

        if ($https === 'on' || $https === '1' || $scheme === 'https' || $port === '443') {
            return;
        }

        throw new QkRequestException('HTTPS_REQUIRED', 'This endpoint requires HTTPS.', 403);
    }

    /**
     * @param array<string,mixed> $application
     * @param array<string,mixed> $server
     */
    private static function assertOrigin(array $application, array $server): void
    {
        $origin = (string) ($server['HTTP_ORIGIN'] ?? '');
        if ($origin === '') {
            $referer = (string) ($server['HTTP_REFERER'] ?? '');
            if ($referer === '') {
                throw new QkRequestException(
                    'ORIGIN_REJECTED',
                    'The request origin could not be verified.',
                    403
                );
            }
            $parts = parse_url($referer);
            if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
                throw new QkRequestException('ORIGIN_REJECTED', 'The request origin could not be verified.', 403);
            }
            $origin = $parts['scheme'] . '://' . $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
        }

        $normalised = strtolower(rtrim($origin, '/'));

        $allowed = [];
        foreach ((array) ($application['allowedOrigins'] ?? []) as $candidate) {
            $allowed[] = strtolower(rtrim((string) $candidate, '/'));
        }
        if (in_array($normalised, $allowed, true)) {
            return;
        }

        foreach ((array) ($application['allowedOriginSuffixes'] ?? []) as $suffix) {
            $suffix = strtolower((string) $suffix);
            if ($suffix !== '' && str_ends_with($normalised, $suffix)) {
                return;
            }
        }

        throw new QkRequestException('ORIGIN_REJECTED', 'The request origin is not permitted.', 403);
    }

    /**
     * @param array<string,mixed> $server
     */
    private static function assertFetchMetadata(array $server): void
    {
        $site = strtolower((string) ($server['HTTP_SEC_FETCH_SITE'] ?? ''));
        if ($site === '') {
            return;
        }
        if (in_array($site, ['same-origin', 'same-site', 'none'], true)) {
            return;
        }

        throw new QkRequestException('ORIGIN_REJECTED', 'The request origin is not permitted.', 403);
    }

    /**
     * @param array<string,mixed> $application
     * @param array<string,mixed> $server
     */
    private static function assertCustomHeader(array $application, array $server): void
    {
        $headerName = strtolower((string) ($application['requireCustomHeader'] ?? ''));
        if ($headerName === '') {
            return;
        }

        $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $headerName));
        $value = (string) ($server[$serverKey] ?? '');
        $expected = (string) ($application['requireCustomHeaderValue'] ?? '');

        if ($value === '' || $value !== $expected) {
            throw new QkRequestException('ORIGIN_REJECTED', 'The request is missing the required client header.', 403);
        }
    }
}
