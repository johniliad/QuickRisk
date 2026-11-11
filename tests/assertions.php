<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — minimal assertion helpers for the PHP test suite.
 *
 * Deliberately dependency-free: the test suite must run with nothing more than a
 * PHP CLI binary and the repository itself.
 */

final class QkTestFailure extends RuntimeException
{
}

function qk_fail(string $message): void
{
    throw new QkTestFailure($message);
}

function assertTrue(mixed $condition, string $message): void
{
    if ($condition !== true) {
        qk_fail($message . ' (expected true)');
    }
}

function assertFalse(mixed $condition, string $message): void
{
    if ($condition !== false) {
        qk_fail($message . ' (expected false)');
    }
}

function assertSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        qk_fail($message . ' (expected ' . var_export($expected, true) . ', got ' . var_export($actual, true) . ')');
    }
}

function assertClose(float $expected, float $actual, float $tolerance, string $message): void
{
    if (!is_finite($actual)) {
        qk_fail($message . ' (value was not finite)');
    }
    if (abs($expected - $actual) > $tolerance) {
        qk_fail($message . ' (expected ' . $expected . ' +/- ' . $tolerance . ', got ' . $actual . ')');
    }
}

function assertRelativeClose(float $expected, float $actual, float $relativeTolerance, string $message): void
{
    $scale = max(1.0, abs($expected));

    assertClose($expected, $actual, $scale * $relativeTolerance, $message);
}

function assertBetween(float $value, float $min, float $max, string $message): void
{
    if (!is_finite($value) || $value < $min || $value > $max) {
        qk_fail($message . ' (expected between ' . $min . ' and ' . $max . ', got ' . $value . ')');
    }
}

function assertGreaterThan(float $threshold, float $value, string $message): void
{
    if (!is_finite($value) || $value <= $threshold) {
        qk_fail($message . ' (expected > ' . $threshold . ', got ' . $value . ')');
    }
}

function assertLessThan(float $threshold, float $value, string $message): void
{
    if (!is_finite($value) || $value >= $threshold) {
        qk_fail($message . ' (expected < ' . $threshold . ', got ' . $value . ')');
    }
}

function assertCount(int $expected, array $actual, string $message): void
{
    if (count($actual) !== $expected) {
        qk_fail($message . ' (expected ' . $expected . ' entries, got ' . count($actual) . ')');
    }
}

function assertContains(string $needle, string $haystack, string $message): void
{
    if (!str_contains($haystack, $needle)) {
        qk_fail($message . ' (missing "' . $needle . '")');
    }
}

function assertNotContains(string $needle, string $haystack, string $message): void
{
    if (str_contains($haystack, $needle)) {
        qk_fail($message . ' (unexpectedly found "' . $needle . '")');
    }
}

/**
 * @param callable():mixed $callback
 */
function assertThrows(callable $callback, string $expectedClass, string $message): Throwable
{
    try {
        $callback();
    } catch (Throwable $throwable) {
        if (!$throwable instanceof $expectedClass) {
            qk_fail($message . ' (threw ' . get_class($throwable) . ': ' . $throwable->getMessage() . ')');
        }

        return $throwable;
    }

    qk_fail($message . ' (no exception was thrown)');
}
