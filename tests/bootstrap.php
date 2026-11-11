<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — test bootstrap.
 *
 * Points the application at the repository copy of the authoritative model and at
 * the test configuration override, then loads the application includes.
 */

$qkRepositoryRoot = dirname(__DIR__);
$qkModelPath = realpath($qkRepositoryRoot . '/fairquickmodel');

if ($qkModelPath === false) {
    fwrite(STDERR, "Test bootstrap could not locate fairquickmodel/\n");
    exit(1);
}

putenv('QUICKRISK_MODEL_PATH=' . $qkModelPath);
putenv('QUICKRISK_APP_ENV=test');
putenv('QUICKRISK_CONFIG=' . __DIR__ . '/config.override.php');

require_once __DIR__ . '/assertions.php';
require_once $qkRepositoryRoot . '/server/includes/bootstrap.php';
require_once __DIR__ . '/helpers.php';
