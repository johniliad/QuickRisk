<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — number and currency formatting.
 *
 * Used for server-generated executive narrative text. The browser formats the
 * detailed table values itself; both must round the same way so that a report
 * and the on-screen dashboard agree.
 */
final class QkFormatting
{
    public const CURRENCY_SYMBOL = "\u{20AC}";

    /**
     * Rounds a monetary value to an executive-readable unit.
     * Examples: 0.4M, 1.8M, 5.7M, 480k, 1.2bn.
     */
    public static function money(float $value): string
    {
        $symbol = self::CURRENCY_SYMBOL;
        $abs = abs($value);

        if ($abs >= 1_000_000_000.0) {
            return $symbol . self::trim((string) round($value / 1_000_000_000.0, 1)) . 'bn';
        }
        if ($abs >= 1_000_000.0) {
            return $symbol . self::trim((string) round($value / 1_000_000.0, 1)) . 'M';
        }
        if ($abs >= 1_000.0) {
            return $symbol . self::trim((string) round($value / 1_000.0)) . 'k';
        }

        return $symbol . self::trim((string) round($value));
    }

    /**
     * Formats a probability as a percentage string.
     */
    public static function percent(float $probability, int $decimals = 1): string
    {
        $value = $probability * 100.0;
        if ($value > 0.0 && $value < 0.1) {
            return '<0.1%';
        }

        return self::trim(number_format($value, $decimals, '.', '')) . '%';
    }

    /**
     * Formats a count with a sensible number of decimals.
     */
    public static function rate(float $value, int $decimals = 2): string
    {
        return self::trim(number_format($value, $decimals, '.', ''));
    }

    private static function trim(string $number): string
    {
        if (str_contains($number, '.')) {
            $number = rtrim(rtrim($number, '0'), '.');
        }

        return $number === '' || $number === '-' ? '0' : $number;
    }
}
