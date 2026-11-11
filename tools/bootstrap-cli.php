<?php

declare(strict_types=1);

/**
 * Shared CLI bootstrap for the release and audit tools.
 *
 * Points the application at the repository copy of the authoritative model and loads
 * the server includes. Nothing here writes assessment data.
 */

$qkRepositoryRoot = dirname(__DIR__);
$qkModelPath = getenv('QUICKRISK_MODEL_PATH');
if (!is_string($qkModelPath) || $qkModelPath === '') {
    $qkModelPath = $qkRepositoryRoot . DIRECTORY_SEPARATOR . 'fairquickmodel';
}

putenv('QUICKRISK_MODEL_PATH=' . $qkModelPath);
putenv('QUICKRISK_APP_ENV=cli');
putenv('QUICKRISK_CONFIG=' . $qkRepositoryRoot . '/tests/config.override.php');

require_once $qkRepositoryRoot . '/server/includes/bootstrap.php';

function qk_cli_model_path(): string
{
    $path = getenv('QUICKRISK_MODEL_PATH');

    return is_string($path) ? $path : '';
}
