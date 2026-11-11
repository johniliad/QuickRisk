<?php

declare(strict_types=1);

/**
 * Monte Carlo benchmark.
 *
 * Usage: php tools/benchmark.php
 *
 * Benchmarks the documented production configuration (5 scenarios x 5,000 iterations)
 * and a deliberately larger stress test (5 scenarios x 50,000 iterations). Reports wall
 * time, peak memory and per-request cost so that the host can be sized before launch.
 */

require_once __DIR__ . '/bootstrap-cli.php';

$config = qk_config();
$model = QkModel::load($config);

/**
 * @return array<string,string>
 */
$profile = [
    'QP1' => '50_250M',
    'QP2' => 'HIGH',
    'QP3' => 'SIGNIFICANT',
    'QP4' => 'SIGNIFICANT',
    'QP5' => 'MODERATE',
    'QP6' => 'MODERATE',
    'QP7' => 'MODERATE',
    'QP8' => '100_500K',
];

$scenarioAnswers = [];
foreach ($model->scenarioOrder() as $code) {
    $scenario = $model->scenario($code);
    $scenarioAnswers[$code] = [
        (string) $scenario['likelihoodQuestion']['code'] => 'POSSIBLE',
        (string) $scenario['impactQuestion']['code'] => 'SIGNIFICANT',
    ];
}

$payload = [
    'profileAnswers' => $profile,
    'scenarioAnswers' => $scenarioAnswers,
];

printf(
    "FAIR QuickRisk benchmark — model %s (%s)\n",
    $model->modelId(),
    (string) $model->versionMeta()['calibrationVersion']
);
echo 'PHP ' . PHP_VERSION . ' · ' . PHP_OS_FAMILY . "\n";
echo str_repeat('=', 72) . "\n\n";

$modelLoadStart = microtime(true);
QkModel::load($config);
$modelLoadMs = (microtime(true) - $modelLoadStart) * 1000;

printf("Model file load (cold):        %8.2f ms\n\n", $modelLoadMs);

foreach ([
    'Production default (5,000 per scenario)' => 5000,
    'Interactive maximum (10,000 per scenario)' => 10000,
    'Stress test (50,000 per scenario)' => 50000,
] as $label => $iterations) {
    $startedAt = microtime(true);
    $beforeMemory = memory_get_usage(true);

    $response = FairEngine::calculateAssessment($model, $payload, 20261029, $iterations);

    $elapsedMs = (microtime(true) - $startedAt) * 1000;
    $peakMb = memory_get_peak_usage(true) / 1048576;
    $usedMb = (memory_get_usage(true) - $beforeMemory) / 1048576;

    $scenarioIterations = $iterations * count($model->scenarioOrder());

    printf("%s\n", $label);
    printf("  Iterations executed:        %10s\n", number_format($scenarioIterations));
    printf("  Wall time:                  %8.2f ms\n", $elapsedMs);
    printf("  Per scenario:               %8.2f ms\n", $elapsedMs / count($model->scenarioOrder()));
    printf("  Per 1,000 iterations:       %8.3f ms\n", $elapsedMs / max(1, $scenarioIterations / 1000));
    printf("  Memory used by engine:      %8.2f MB\n", $usedMb);
    printf("  Peak PHP memory:            %8.2f MB\n", $peakMb);
    printf(
        "  Portfolio expected loss:    %8s EUR\n\n",
        number_format((float) $response['portfolio']['expectedAnnualLoss'], 0, '.', ',')
    );
}

echo "Notes:\n";
echo "  - The engine holds every observation in memory for the duration of one request.\n";
echo "  - No result, answer or seed is written to disk, a session or a log.\n";
echo "  - If a host is slower than the interactive budget allows, reduce the iteration\n";
echo "    count in the model manifest rather than moving the calculation to the browser.\n";

exit(0);
