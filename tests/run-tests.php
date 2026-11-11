<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — test runner.
 *
 * Usage:  php tests/run-tests.php [name-filter]
 *
 * Each *.test.php file returns an array of [test name => callable]. The runner
 * executes every test, prints a summary and exits non-zero on failure.
 */

require_once __DIR__ . '/bootstrap.php';

$filter = $argv[1] ?? '';

$tests = [];
foreach (glob(__DIR__ . '/*.test.php') ?: [] as $file) {
    $provided = require $file;
    if (!is_array($provided)) {
        fwrite(STDERR, 'Test file returned no tests: ' . basename($file) . "\n");
        exit(1);
    }
    foreach ($provided as $name => $callable) {
        $tests[(string) $name] = $callable;
    }
}

if ($tests === []) {
    fwrite(STDERR, "No tests were discovered.\n");
    exit(1);
}

$passed = 0;
$failed = 0;
$failures = [];
$startedAt = microtime(true);

foreach ($tests as $name => $callable) {
    if ($filter !== '' && !str_contains($name, $filter)) {
        continue;
    }

    $testStartedAt = microtime(true);
    try {
        $callable();
        $passed++;
        printf("  PASS  %-70s %6.0f ms\n", $name, (microtime(true) - $testStartedAt) * 1000);
    } catch (Throwable $throwable) {
        $failed++;
        $failures[$name] = $throwable;
        printf("  FAIL  %-70s %6.0f ms\n", $name, (microtime(true) - $testStartedAt) * 1000);
        printf("        %s: %s\n", get_class($throwable), $throwable->getMessage());
    }
}

$elapsed = microtime(true) - $startedAt;

echo "\n" . str_repeat('-', 90) . "\n";
printf("FAIR QuickRisk test suite: %d passed, %d failed (%.2fs)\n", $passed, $failed, $elapsed);

if ($failures !== []) {
    echo "\nFailures:\n";
    foreach (array_keys($failures) as $name) {
        echo '  - ' . $name . "\n";
    }
    exit(1);
}

exit(0);
