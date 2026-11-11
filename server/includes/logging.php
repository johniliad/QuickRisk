<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — logging.
 *
 * Zero-retention rule: only a fixed set of event codes is ever logged. User
 * answers, results, seeds, client identifiers and payload fragments are never
 * logged. QkLog::event() ignores any code that is not in the allow-list, so a
 * caller cannot accidentally log a value through this helper.
 */
final class QkLog
{
    public const EVENT_CODES = [
        'MODEL_LOAD_FAILED',
        'MODEL_INVALID',
        'VALIDATION_FAILED',
        'ORIGIN_REJECTED',
        'HTTPS_REQUIRED',
        'METHOD_NOT_ALLOWED',
        'CONTENT_TYPE_REJECTED',
        'PAYLOAD_TOO_LARGE',
        'PAYLOAD_UNREADABLE',
        'RATE_LIMITED',
        'ENGINE_LIMIT_EXCEEDED',
        'CALCULATION_COMPLETED',
        'CALCULATION_FAILED',
        'INTERNAL_ERROR',
    ];

    private const FALLBACK_CODE = 'INTERNAL_ERROR';

    /**
     * Writes a fixed event code to the error log. Never writes assessment data.
     *
     * @param array<string,mixed> $config
     */
    public static function event(string $code, array $config): void
    {
        if (($config['logging']['enabled'] ?? true) !== true) {
            return;
        }

        if (!in_array($code, self::EVENT_CODES, true)) {
            $code = self::FALLBACK_CODE;
        }

        // Intentionally no interpolation of any runtime value.
        error_log('FAIR QuickRisk event: ' . $code);
    }
}
