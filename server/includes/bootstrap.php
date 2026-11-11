<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — bootstrap.
 *
 * Loads configuration and the application includes, and installs error handling
 * that can never disclose or log an assessment payload.
 *
 * Zero-retention rule: this file must never create a session, cookie, file,
 * queue entry or log record containing assessment content.
 */

if (!defined('QUICKRISK_INCLUDES')) {
    define('QUICKRISK_INCLUDES', __DIR__);
}

/** @var array<string,mixed> $QK_CONFIG */
$QK_CONFIG = require QUICKRISK_INCLUDES . '/config.php';

// Never display PHP errors to users. This must be set before anything can fail.
@ini_set('display_errors', '0');
@ini_set('display_startup_errors', '0');
@ini_set('log_errors', '1');
error_reporting(E_ALL);

// Zero-retention hardening: the assessment must never live in a PHP session.
@ini_set('session.use_cookies', '0');
@ini_set('session.auto_start', '0');

require_once QUICKRISK_INCLUDES . '/logging.php';
require_once QUICKRISK_INCLUDES . '/formatting.php';
require_once QUICKRISK_INCLUDES . '/distributions.php';
require_once QUICKRISK_INCLUDES . '/percentile.php';
require_once QUICKRISK_INCLUDES . '/model_loader.php';
require_once QUICKRISK_INCLUDES . '/modifiers.php';
require_once QUICKRISK_INCLUDES . '/confidence.php';
require_once QUICKRISK_INCLUDES . '/fair_engine.php';
require_once QUICKRISK_INCLUDES . '/validation.php';
require_once QUICKRISK_INCLUDES . '/csrf.php';
require_once QUICKRISK_INCLUDES . '/rate_limit.php';
require_once QUICKRISK_INCLUDES . '/http.php';
require_once QUICKRISK_INCLUDES . '/calculate_handler.php';

/**
 * Turns PHP notices/warnings into exceptions so that a partial calculation is
 * never returned as if it were valid.
 */
set_error_handler(static function (int $severity, string $message, string $file = '', int $line = 0): bool {
    if ((error_reporting() & $severity) === 0) {
        return false;
    }
    throw new ErrorException($message, 0, $severity, $file, $line);
});

/**
 * Returns the loaded configuration array.
 *
 * @return array<string,mixed>
 */
function qk_config(): array
{
    global $QK_CONFIG;

    return $QK_CONFIG;
}
