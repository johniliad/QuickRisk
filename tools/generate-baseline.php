<?php

declare(strict_types=1);

/**
 * Regression-baseline generator.
 *
 * Usage: php tools/generate-baseline.php [--seed=20261029] [--iterations=5000]
 *
 * Runs a fixed assessment fixture with a fixed seed and writes the result envelope to
 * tests/expected/baseline-<modelVersion>.json. The regression test compares future runs
 * against that envelope, so an unintended change to the model or the engine is detected.
 *
 * A new baseline must be generated deliberately, together with a new calibration or
 * model version, and the change recorded in the version record.
 */

require_once __DIR__ . '/bootstrap-cli.php';

$seed = 20261029;
$iterations = 5000;

foreach ($argv as $argument) {
    if (str_starts_with($argument, '--seed=')) {
        $seed = (int) substr($argument, strlen('--seed='));
    }
    if (str_starts_with($argument, '--iterations=')) {
        $iterations = (int) substr($argument, strlen('--iterations='));
    }
}

$config = qk_config();
$model = QkModel::load($config);

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

$response = FairEngine::calculateAssessment($model, $payload, $seed, $iterations);

$envelope = [
    'modelId' => $response['meta']['modelId'],
    'modelVersion' => $response['meta']['modelVersion'],
    'schemaVersion' => $response['meta']['schemaVersion'],
    'calibrationVersion' => $response['meta']['calibrationVersion'],
    'generatedAt' => gmdate('Y-m-d\TH:i:s\Z'),
    'generator' => 'tools/generate-baseline.php',
    'fixture' => [
        'profileAnswers' => $profile,
        'scenarioAnswers' => $scenarioAnswers,
        'seed' => $seed,
        'iterations' => $iterations,
    ],
    'tolerances' => [
        'expectedAnnualLoss' => 0.02,
        'percentiles' => 0.03,
        'thresholdProbability' => 0.05,
        'portfolio' => 0.02,
    ],
    'portfolio' => [
        'expectedAnnualLoss' => $response['portfolio']['expectedAnnualLoss'],
        'confidenceScore' => $response['portfolio']['confidence']['score'],
        'confidenceLevel' => $response['portfolio']['confidence']['level'],
    ],
    'scenarios' => [],
];

foreach ($response['scenarios'] as $scenario) {
    $envelope['scenarios'][$scenario['code']] = [
        'expectedAnnualLoss' => $scenario['statistics']['expectedAnnualLoss'],
        'p10' => $scenario['statistics']['p10'],
        'p50' => $scenario['statistics']['p50'],
        'p90' => $scenario['statistics']['p90'],
        'expectedLossEventFrequency' => $scenario['statistics']['expectedLossEventFrequency'],
        'expectedLossMagnitude' => $scenario['statistics']['expectedLossMagnitude'],
        'confidenceScore' => $scenario['confidence']['score'],
        'thresholdProbabilities' => $scenario['statistics']['thresholdProbabilities'],
    ];
}

$directory = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'tests' . DIRECTORY_SEPARATOR . 'expected';
if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
    fwrite(STDERR, "Could not create the baseline directory.\n");
    exit(1);
}

$path = $directory . DIRECTORY_SEPARATOR . 'baseline-' . $response['meta']['modelVersion'] . '.json';
$encoded = json_encode($envelope, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

if ($encoded === false || file_put_contents($path, $encoded . "\n") === false) {
    fwrite(STDERR, "Could not write the baseline file.\n");
    exit(1);
}

echo 'Baseline written: ' . $path . "\n";
echo 'Portfolio expected annual loss: ' . $response['portfolio']['expectedAnnualLoss'] . "\n";
echo 'Seed: ' . $seed . ' · iterations: ' . $iterations . "\n";

exit(0);
