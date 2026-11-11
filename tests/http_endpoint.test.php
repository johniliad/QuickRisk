<?php

declare(strict_types=1);

/**
 * HTTP endpoint tests.
 *
 * These exercise the real request decision path (method, origin, fetch metadata, custom
 * header, HTTPS, content type, size limit, JSON parsing, validation, rate limiting) without
 * a web server, by supplying the request server variables directly.
 */

/**
 * @return array<string,mixed>
 */
function qk_test_server(array $overrides = []): array
{
    return array_replace([
        'REQUEST_METHOD' => 'POST',
        'HTTPS' => 'on',
        'HTTP_ORIGIN' => 'https://test.local',
        'HTTP_SEC_FETCH_SITE' => 'same-origin',
        'HTTP_X_QUICKRISK_REQUEST' => '1',
        'CONTENT_TYPE' => 'application/json',
        'CONTENT_LENGTH' => '0',
        'REMOTE_ADDR' => '203.0.113.9',
    ], $overrides);
}

function qk_test_body(): string
{
    return (string) json_encode(qk_test_payload(qk_test_profile()));
}

return [
    'endpoint: a well-formed same-origin POST is calculated' => function (): void {
        $result = qk_dispatch_calculation(qk_config(), qk_test_server(), qk_test_body(), 1000);

        assertSame(200, $result['status'], 'A valid request must succeed');
        assertSame('ok', $result['payload']['status'], 'The response must report success');
        assertSame('zero-retention', $result['payload']['meta']['retentionMode'], 'The retention mode must be declared');
        assertFalse($result['payload']['meta']['seedDisclosed'], 'The seed must not be disclosed');
        assertFalse($result['payload']['meta']['seedPersisted'], 'The seed must not be persisted');
        assertSame(5, $result['payload']['meta']['scenarioCount'], 'Five scenarios must be returned');
    },

    'endpoint: the response never contains the seed or an assessment identifier' => function (): void {
        $result = qk_dispatch_calculation(qk_config(), qk_test_server(), qk_test_body(), 1000);
        $encoded = (string) json_encode($result['payload']);

        foreach (['"seed":', 'assessmentId', 'assessmentToken', 'sessionId', 'cookie'] as $needle) {
            assertNotContains($needle, $encoded, 'The response must not contain ' . $needle);
        }
    },

    'endpoint: only POST is accepted' => function (): void {
        foreach (['GET', 'PUT', 'DELETE', 'OPTIONS'] as $method) {
            $result = qk_dispatch_calculation(
                qk_config(),
                qk_test_server(['REQUEST_METHOD' => $method]),
                qk_test_body(),
                1000
            );
            assertSame(405, $result['status'], 'Method ' . $method . ' must be rejected');
            assertSame('METHOD_NOT_ALLOWED', $result['payload']['error']['code'], 'The error code must be reported');
        }
    },

    'endpoint: an untrusted or missing origin is rejected' => function (): void {
        $noOrigin = qk_test_server();
        unset($noOrigin['HTTP_ORIGIN']);
        $result = qk_dispatch_calculation(qk_config(), $noOrigin, qk_test_body(), 1000);
        assertSame(403, $result['status'], 'A request without an origin must be rejected');
        assertSame('ORIGIN_REJECTED', $result['payload']['error']['code'], 'The origin rejection must be reported');

        $result = qk_dispatch_calculation(
            qk_config(),
            qk_test_server(['HTTP_ORIGIN' => 'https://evil.example']),
            qk_test_body(),
            1000
        );
        assertSame(403, $result['status'], 'A foreign origin must be rejected');

        $result = qk_dispatch_calculation(
            qk_config(),
            qk_test_server(['HTTP_ORIGIN' => 'http://test.local']),
            qk_test_body(),
            1000
        );
        assertSame(403, $result['status'], 'A scheme mismatch must be rejected');
    },

    'endpoint: a cross-site fetch metadata signal is rejected' => function (): void {
        $result = qk_dispatch_calculation(
            qk_config(),
            qk_test_server(['HTTP_SEC_FETCH_SITE' => 'cross-site']),
            qk_test_body(),
            1000
        );
        assertSame(403, $result['status'], 'A cross-site request must be rejected');
    },

    'endpoint: the required custom header is enforced' => function (): void {
        $server = qk_test_server();
        unset($server['HTTP_X_QUICKRISK_REQUEST']);
        $result = qk_dispatch_calculation(qk_config(), $server, qk_test_body(), 1000);
        assertSame(403, $result['status'], 'A request without the custom header must be rejected');

        $result = qk_dispatch_calculation(
            qk_config(),
            qk_test_server(['HTTP_X_QUICKRISK_REQUEST' => '0']),
            qk_test_body(),
            1000
        );
        assertSame(403, $result['status'], 'A wrong custom header value must be rejected');
    },

    'endpoint: HTTPS can be required explicitly' => function (): void {
        $httpsConfig = array_replace_recursive(qk_config(), ['application' => ['requireHttps' => true]]);

        $result = qk_dispatch_calculation(
            $httpsConfig,
            qk_test_server(['HTTPS' => 'off', 'REQUEST_SCHEME' => 'http']),
            qk_test_body(),
            1000
        );
        assertSame(403, $result['status'], 'A plain-HTTP request must be rejected when HTTPS is required');
        assertSame('HTTPS_REQUIRED', $result['payload']['error']['code'], 'The HTTPS requirement must be reported');

        $result = qk_dispatch_calculation($httpsConfig, qk_test_server(), qk_test_body(), 1000);
        assertSame(200, $result['status'], 'An HTTPS request must be accepted');
    },

    'endpoint: content type and payload size are enforced' => function (): void {
        $result = qk_dispatch_calculation(
            qk_config(),
            qk_test_server(['CONTENT_TYPE' => 'text/plain']),
            qk_test_body(),
            1000
        );
        assertSame(415, $result['status'], 'A non-JSON content type must be rejected');

        $result = qk_dispatch_calculation(
            qk_config(),
            qk_test_server(['CONTENT_LENGTH' => '999999']),
            qk_test_body(),
            1000
        );
        assertSame(413, $result['status'], 'An oversized declared payload must be rejected');

        $oversized = '{"padding":"' . str_repeat('A', 9000) . '"}';
        $result = qk_dispatch_calculation(qk_config(), qk_test_server(), $oversized, 1000);
        assertSame(413, $result['status'], 'An oversized actual payload must be rejected');
    },

    'endpoint: malformed JSON and invalid payloads are rejected' => function (): void {
        $result = qk_dispatch_calculation(qk_config(), qk_test_server(), 'not json at all', 1000);
        assertSame(400, $result['status'], 'Malformed JSON must be rejected');
        assertSame('PAYLOAD_UNREADABLE', $result['payload']['error']['code'], 'The parse failure must be reported');

        $result = qk_dispatch_calculation(qk_config(), qk_test_server(), '[]', 1000);
        assertSame(400, $result['status'], 'A JSON array must be rejected');

        $invalid = qk_test_payload(qk_test_profile());
        $invalid['assessmentId'] = 'abc-123';
        $result = qk_dispatch_calculation(qk_config(), qk_test_server(), (string) json_encode($invalid), 1000);
        assertSame(422, $result['status'], 'An invalid payload must be rejected');
        assertSame('UNEXPECTED_FIELD', $result['payload']['error']['code'], 'The field rejection must be reported');
    },

    'endpoint: repeated requests from one client are rate limited' => function (): void {
        $limited = array_replace_recursive(qk_config(), [
            'rateLimit' => [
                'enabled' => true,
                'backend' => 'memory',
                'windowSeconds' => 300,
                'maxRequestsPerWindow' => 2,
            ],
        ]);

        $server = qk_test_server(['REMOTE_ADDR' => '198.51.100.77']);

        $first = qk_dispatch_calculation($limited, $server, qk_test_body(), 1000);
        $second = qk_dispatch_calculation($limited, $server, qk_test_body(), 1000);
        $third = qk_dispatch_calculation($limited, $server, qk_test_body(), 1000);

        assertSame(200, $first['status'], 'The first request must succeed');
        assertSame(200, $second['status'], 'The second request must succeed');
        assertSame(429, $third['status'], 'The third request must be rate limited');
        assertSame('RATE_LIMITED', $third['payload']['error']['code'], 'The rate limit must be reported');

        $other = qk_dispatch_calculation(
            $limited,
            qk_test_server(['REMOTE_ADDR' => '198.51.100.78']),
            qk_test_body(),
            1000
        );
        assertSame(200, $other['status'], 'A different client must not be limited');
    },

    'endpoint: errors never leak internal detail' => function (): void {
        $result = qk_dispatch_calculation(
            qk_config(),
            qk_test_server(['HTTP_ORIGIN' => 'https://evil.example']),
            qk_test_body(),
            1000
        );
        $encoded = (string) json_encode($result['payload']);

        foreach (['\\', 'Exception', 'Stack trace', 'FAIR-QK', 'QkModel', 'includes'] as $needle) {
            assertNotContains($needle, $encoded, 'The error response must not contain ' . $needle);
        }
    },
];
