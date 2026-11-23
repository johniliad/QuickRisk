<?php

declare(strict_types=1);

/**
 * QuickRisk Live — per-action rate-limit settings shape.
 *
 * Regression test for P4.5: a configured limit must reach QkRateLimiter through the
 * `rateLimit` key. With the old flat settings array the limiter fell back to 30 requests,
 * so a configured limit of 1 allowed the second request through.
 */

require_once dirname(__DIR__) . '/server/includes/live/handlers.php';

/** A unique client for each run, so a shared APCu/file limiter cannot leak a counter in. */
function qk_live_rate_limit_test_client(): array
{
    return ['REMOTE_ADDR' => 'p45-' . bin2hex(random_bytes(12))];
}

return [
    'live rate limit: a configured per-action limit of one rejects the second request' => function (): void {
        $liveConfig = [
            'rateLimit' => [
                'windowSeconds' => 300,
                'save' => 1,
            ],
        ];
        $server = qk_live_rate_limit_test_client();

        qk_live_rate_limit($liveConfig, $server, 'save');

        try {
            qk_live_rate_limit($liveConfig, $server, 'save');
            qk_fail('The second request must exceed the configured limit of one');
        } catch (QkLiveHttpError $error) {
            assertSame(429, $error->status, 'A rate-limited Live request must return 429');
        }
    },

    'live rate limit: different actions have independent counters' => function (): void {
        $liveConfig = [
            'rateLimit' => [
                'windowSeconds' => 300,
                'shareCreate' => 1,
                'shareRead' => 1,
            ],
        ];
        $server = qk_live_rate_limit_test_client();

        qk_live_rate_limit($liveConfig, $server, 'shareCreate');
        qk_live_rate_limit($liveConfig, $server, 'shareRead');
    },
];
