<?php

declare(strict_types=1);

/**
 * Test configuration override. Loaded through the QUICKRISK_CONFIG environment
 * variable set in tests/bootstrap.php. Never used in production.
 */
return [
    'environment' => 'test',
    'application' => [
        'allowedOrigins' => ['https://test.local'],
        'requireHttps' => false,
    ],
    'rateLimit' => [
        'enabled' => false,
        'backend' => 'memory',
    ],
    'logging' => [
        'enabled' => false,
    ],
];
