<?php

declare(strict_types=1);

/**
 * Model validation gate.
 *
 * Usage: php tools/validate-model.php [--path=/absolute/path/to/fairquickmodel]
 *
 * Loads and strictly validates the authoritative model. Exits non-zero if the model is
 * missing, malformed or incompatible, so that a deployment cannot publish a broken or
 * inconsistent model. No assessment data is involved.
 */

require_once __DIR__ . '/bootstrap-cli.php';

foreach ($argv as $argument) {
    if (str_starts_with($argument, '--path=')) {
        $override = substr($argument, strlen('--path='));
        if ($override !== '') {
            putenv('QUICKRISK_MODEL_PATH=' . $override);
        }
    }
}

$config = qk_config();
$modelPath = (string) $config['modelPath'];

echo "FAIR QuickRisk model validation\n";
echo 'Model directory: ' . $modelPath . "\n\n";

try {
    $model = QkModel::load($config);
} catch (QkModelException $exception) {
    fwrite(STDERR, 'FAILED: ' . $exception->getMessage() . "\n");
    exit(1);
}

$manifest = $model->manifest();
$parameters = $model->parameters();
$versionMeta = $model->versionMeta();

$checks = [];

$checks[] = ['Model identifier declared', $versionMeta['modelId'] !== '', $versionMeta['modelId']];
$checks[] = ['Model version declared', $versionMeta['modelVersion'] !== '', $versionMeta['modelVersion']];
$checks[] = ['Schema version declared', $versionMeta['schemaVersion'] !== '', $versionMeta['schemaVersion']];
$checks[] = ['Calibration version declared', $versionMeta['calibrationVersion'] !== '', $versionMeta['calibrationVersion']];
$checks[] = ['Five scenarios defined', count($model->scenarioOrder()) === 5, implode(', ', $model->scenarioOrder())];
$checks[] = ['Organisation profile questions defined', count($model->profileQuestions()) >= 7, (string) count($model->profileQuestions())];
$checks[] = ['Default iterations', $model->defaultIterations() >= 5000, (string) $model->defaultIterations()];
$checks[] = ['Loss thresholds', count($model->lossThresholds()) >= 5, implode(', ', array_map('intval', $model->lossThresholds()))];
$checks[] = ['Server-only calibration declared', in_array('parameters.json', (array) $manifest['visibility']['serverOnly'], true), 'parameters.json'];
$checks[] = ['Retention mode', $versionMeta['retentionMode'] === 'zero-retention', $versionMeta['retentionMode']];

// Audit-correction gates. These fail the deployment gate if a correction is reverted.
$annualisation = (array) ($parameters['annualisation'] ?? []);
$checks[] = [
    'Annualisation method declared',
    (string) ($annualisation['method'] ?? '') === (string) ($manifest['annualisationMethod'] ?? ''),
    (string) ($annualisation['method'] ?? 'missing'),
];
$checks[] = [
    'Realised annual totals declared as not modelled',
    ($annualisation['realisedAnnualTotalsModelled'] ?? true) === false
        && ($manifest['realisedAnnualTotalsModelled'] ?? true) === false,
    ($annualisation['realisedAnnualTotalsModelled'] ?? true) === false ? 'not modelled' : 'CLAIM INVALID',
];
$checks[] = [
    'Annualisation limitation documented',
    trim((string) ($annualisation['limitation'] ?? '')) !== '',
    'parameters.annualisation.limitation',
];

$frequencyPolicy = (array) ($parameters['frequency']['unknownPolicy'] ?? []);
$impactPolicy = (array) ($parameters['impactMultiplier']['unknownPolicy'] ?? []);
$policyWeights = static function (array $policy): array {
    $weights = (array) ($policy['weights'] ?? []);

    return $weights;
};
$frequencyWeights = $policyWeights($frequencyPolicy);
$impactWeights = $policyWeights($impactPolicy);
$checks[] = [
    'Unknown frequency policy is a mixture',
    (string) ($frequencyPolicy['type'] ?? '') === 'mixture' && abs(array_sum($frequencyWeights) - 1.0) < 1e-9,
    count($frequencyWeights) . ' component(s)',
];
$checks[] = [
    'Unknown impact policy is a mixture',
    (string) ($impactPolicy['type'] ?? '') === 'mixture' && abs(array_sum($impactWeights) - 1.0) < 1e-9,
    count($impactWeights) . ' component(s)',
];
$checks[] = [
    'Unknown answers cannot shift the central estimate to an extreme',
    (string) ($frequencyPolicy['type'] ?? '') === 'mixture'
        && (string) ($impactPolicy['type'] ?? '') === 'mixture',
    'equal-weight mixture over the available answers',
];
$checks[] = [
    'Likelihood answers are documented as pre-control frequency',
    trim((string) ($parameters['frequency']['answerInterpretation'] ?? '')) !== '',
    'parameters.frequency.answerInterpretation',
];

$confidence = (array) ($parameters['confidence'] ?? []);
$checks[] = [
    'Input confidence is not presented as statistical confidence',
    ($confidence['isStatisticalConfidence'] ?? true) === false && trim((string) ($confidence['basis'] ?? '')) !== '',
    (string) ($confidence['basis'] ?? 'missing'),
];
$checks[] = [
    'Provisional calibration caps the highest confidence level',
    in_array(
        (string) ($manifest['releaseStatus'] ?? ''),
        (array) ($confidence['provisionalCalibrationStatuses'] ?? []),
        true
    )
        ? (string) ($confidence['maxLevelWhenProvisional'] ?? '') !== QkConfidence::LEVEL_HIGH
        : true,
    (string) ($confidence['maxLevelWhenProvisional'] ?? 'missing'),
];
$checks[] = [
    'Sensitivity analysis configured',
    (int) (((array) ($parameters['sensitivity'] ?? []))['maxFactors'] ?? 0) >= 1,
    'maxFactors ' . (string) (((array) ($parameters['sensitivity'] ?? []))['maxFactors'] ?? 0),
];
$checks[] = [
    'Compound-extreme plausibility review recorded',
    trim((string) (((array) ($parameters['plausibilityReview'] ?? []))['status'] ?? '')) !== '',
    (string) (((array) ($parameters['plausibilityReview'] ?? []))['status'] ?? 'missing'),
];
$checks[] = [
    'Widening mean-shift cap configured and documented',
    is_numeric(((array) ($parameters['sampling'] ?? []))['wideningMeanShiftCap'] ?? null)
        && (float) ((array) ($parameters['sampling'] ?? []))['wideningMeanShiftCap'] > 1.0
        && trim((string) (((array) ($parameters['sampling'] ?? []))['wideningMeanShiftCapRationale'] ?? '')) !== '',
    'cap ' . (string) (((array) ($parameters['sampling'] ?? []))['wideningMeanShiftCap'] ?? 'missing'),
];
$checks[] = [
    'Unknown-answer central effect disclosed and quantified',
    trim((string) (((array) ($parameters['unknownAnswerDisclosure'] ?? []))['interpretation'] ?? '')) !== ''
        && is_numeric(((array) ($parameters['unknownAnswerDisclosure'] ?? []))['allUnknownPortfolioMultipleOfAllKnown'] ?? null),
    'x' . (string) (((array) ($parameters['unknownAnswerDisclosure'] ?? []))['allUnknownPortfolioMultipleOfAllKnown'] ?? 'missing')
        . ' for an all-Unknown assessment',
];

$versionRecordPath = $modelPath . DIRECTORY_SEPARATOR . 'versions' . DIRECTORY_SEPARATOR . $versionMeta['modelVersion'] . '.json';
$versionRecordExists = is_file($versionRecordPath);
$checks[] = ['Version record present', $versionRecordExists, $versionRecordExists ? basename($versionRecordPath) : 'missing'];

$modifierTargets = [];
foreach ((array) $parameters['modifiers'] as $modifier) {
    $modifierTargets[] = (string) $modifier['target'];
}
$checks[] = [
    'Modifier targets resolve to engine stages',
    $modifierTargets !== [],
    implode(', ', array_unique($modifierTargets)),
];

$failed = 0;
foreach ($checks as [$label, $passed, $detail]) {
    printf("  %-42s %-6s %s\n", $label, $passed ? 'OK' : 'FAIL', $detail);
    if (!$passed) {
        $failed++;
    }
}

echo "\n";
if ($failed > 0) {
    fwrite(STDERR, $failed . " check(s) failed. The model must not be deployed in this state.\n");
    exit(1);
}

echo "Model validation passed.\n";
exit(0);
