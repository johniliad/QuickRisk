<?php

declare(strict_types=1);

/**
 * End-to-end assessment smoke test.
 *
 * Usage:
 *   php tools/simulate-assessment.php [--payload=path/to/payload.json] [--json] [--seed=123]
 *
 * Runs the same code path as the HTTP endpoint (validation, then the engine) without a
 * web server, so a release can be verified on a build machine. No assessment data is
 * written anywhere; the result is printed and discarded.
 *
 * The payload file, when supplied, must match the request schema documented in the
 * requirements:
 *   {
 *     "schemaVersion": "1.3.0",
 *     "modelId": "FAIR-QK-1.3",
 *     "disclaimer": { "acknowledged": true, "version": "DISC-1.2" },
 *     "organisationAnswers": [ { "questionCode": "QP1", "optionCode": "50_250M" } ],
 *     "scenarioAnswers": [ { "scenarioCode": "S1", "answers": [ ... ] } ]
 *   }
 */

require_once __DIR__ . '/bootstrap-cli.php';

$config = qk_config();
$model = QkModel::load($config);

$payloadPath = '';
$asJson = false;
$seed = 20261029;

foreach ($argv as $argument) {
    if (str_starts_with($argument, '--payload=')) {
        $payloadPath = substr($argument, strlen('--payload='));
    }
    if ($argument === '--json') {
        $asJson = true;
    }
    if (str_starts_with($argument, '--seed=')) {
        $seed = (int) substr($argument, strlen('--seed='));
    }
}

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
    'schemaVersion' => (string) $model->manifest()['schemaVersion'],
    'modelId' => $model->modelId(),
    'disclaimer' => [
        'acknowledged' => true,
        'version' => (string) $model->manifest()['disclaimerVersion'],
    ],
    'organisationAnswers' => [],
    'scenarioAnswers' => [],
];

foreach ($profile as $questionCode => $optionCode) {
    $payload['organisationAnswers'][] = ['questionCode' => $questionCode, 'optionCode' => $optionCode];
}
foreach ($model->scenarioOrder() as $code) {
    $answers = [];
    foreach ($scenarioAnswers[$code] as $questionCode => $optionCode) {
        $answers[] = ['questionCode' => $questionCode, 'optionCode' => $optionCode];
    }
    $payload['scenarioAnswers'][] = ['scenarioCode' => $code, 'answers' => $answers];
}

if ($payloadPath !== '') {
    if (!is_file($payloadPath)) {
        fwrite(STDERR, 'Payload file not found: ' . $payloadPath . "\n");
        exit(1);
    }
    $decoded = json_decode((string) file_get_contents($payloadPath), true);
    if (!is_array($decoded)) {
        fwrite(STDERR, "Payload file is not valid JSON.\n");
        exit(1);
    }
    $payload = $decoded;
}

try {
    $response = qk_handle_calculation($config, $payload, $model->defaultIterations(), $seed);
} catch (QkValidationException $exception) {
    fwrite(STDERR, 'Validation rejected the payload: ' . $exception->errorCode() . "\n");
    exit(1);
} catch (QkModelException $exception) {
    fwrite(STDERR, 'The model could not be loaded: ' . $exception->getMessage() . "\n");
    exit(1);
}

if ($asJson) {
    echo (string) json_encode($response, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    exit(0);
}

$symbol = (string) $response['meta']['currencySymbol'];
printf(
    "Indicative FAIR QuickRisk assessment — %s · model %s · calibration %s · %s iterations per scenario\n",
    (string) $response['meta']['modelId'],
    (string) $response['meta']['modelVersion'],
    (string) $response['meta']['calibrationVersion'],
    number_format((int) $response['meta']['iterations'])
);
echo str_repeat('=', 96) . "\n";
printf(
    "%-34s %14s %12s %12s %12s %9s %-10s\n",
    'Scenario',
    'Expected',
    'P10',
    'P50',
    'P90',
    'P(>1m)',
    'Confidence'
);

foreach ($response['scenarios'] as $scenario) {
    printf(
        "%-34s %14s %12s %12s %12s %9s %-10s\n",
        (string) $scenario['shortLabel'],
        QkFormatting::money((float) $scenario['statistics']['expectedAnnualLoss']),
        QkFormatting::money((float) $scenario['statistics']['p10']),
        QkFormatting::money((float) $scenario['statistics']['p50']),
        QkFormatting::money((float) $scenario['statistics']['p90']),
        QkFormatting::percent((float) ($scenario['statistics']['thresholdProbabilities']['1000000'] ?? 0.0)),
        (string) $scenario['confidence']['level']
    );
}

echo str_repeat('-', 96) . "\n";
printf(
    "%-34s %14s %54s %-10s\n",
    (string) $response['portfolio']['label'],
    QkFormatting::money((float) $response['portfolio']['expectedAnnualLoss']),
    '',
    (string) $response['portfolio']['confidence']['level']
);
echo "\n" . $response['portfolio']['summary'] . "\n";
echo $response['portfolio']['jointPercentilesNote'] . "\n";
echo "\nRetention: " . $response['meta']['retentionMode'] . ' (seed persisted: ';
echo $response['meta']['seedPersisted'] ? 'yes' : 'no';
echo ")\n";

unset($response, $payload);

exit(0);
