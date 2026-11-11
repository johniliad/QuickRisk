<?php

declare(strict_types=1);

/**
 * Resolved-calibration audit dump.
 *
 * Usage: php tools/dump-model.php
 *
 * Prints the fully resolved parameter tables that the engine actually uses: base
 * frequency bands, scenario-scaled frequency bands, impact multipliers, susceptibility
 * bases, secondary-loss parameters and modifier tables. This is the artefact an
 * experienced risk professional inspects when reviewing the model, and it is the input
 * to the calibration review document.
 */

require_once __DIR__ . '/bootstrap-cli.php';

$config = qk_config();
$model = QkModel::load($config);
$parameters = $model->parameters();
$scaling = $parameters['scenarioScaling']['scenarios'];

$line = static fn (string $label, string $value): string => sprintf("  %-34s %s\n", $label, $value);

echo "FAIR QuickRisk — resolved calibration (" . $parameters['calibrationVersion'] . ")\n";
echo str_repeat('=', 84) . "\n";

echo "\nModel\n";
echo $line('Model identifier', (string) $parameters['modelId']);
echo $line('Calibration version', (string) $parameters['calibrationVersion']);
echo $line('Sampling distribution', (string) $parameters['sampling']['distribution']);
echo $line('Default iterations', (string) $model->defaultIterations());
echo $line('Annualisation method', (string) ($parameters['annualisation']['method'] ?? ''));
echo $line('Realised annual totals modelled', ($parameters['annualisation']['realisedAnnualTotalsModelled'] ?? true) ? 'yes' : 'no');
echo $line('Plausibility review', (string) ($parameters['plausibilityReview']['status'] ?? ''));

echo "\nBase annual threat event frequency (TEF)\n";
foreach ($parameters['frequency']['bands'] as $code => $band) {
    printf("  %-34s min %-8s mode %-8s max %-8s\n", $code, $band['min'], $band['mode'], $band['max']);
}
echo $line(
    'UNKNOWN (mixture)',
    implode(', ', array_map(
        static fn (string $code, float $weight): string => $code . ' ' . round($weight * 100, 1) . '%',
        array_keys((array) $parameters['frequency']['unknownPolicy']['weights']),
        array_values((array) $parameters['frequency']['unknownPolicy']['weights'])
    ))
);

echo "\nScenario-scaled frequency bands (base x frequencyScale)\n";
foreach ($model->scenarioOrder() as $code) {
    $scale = (float) $scaling[$code]['frequencyScale'];
    echo '  ' . $code . ' (scale ' . $scale . ")\n";
    foreach ($parameters['frequency']['bands'] as $optionCode => $band) {
        printf(
            "    %-30s min %-10s mode %-10s max %-10s\n",
            $optionCode,
            round((float) $band['min'] * $scale, 4),
            round((float) $band['mode'] * $scale, 4),
            round((float) $band['max'] * $scale, 4)
        );
    }
}

echo "\nImpact multiplier bands (multiplied by the scenario impactScale)\n";
foreach ($parameters['impactMultiplier']['bands'] as $code => $band) {
    printf("  %-34s min %-8s mode %-8s max %-8s\n", $code, $band['min'], $band['mode'], $band['max']);
}
printf("  %-34s min %-8s mode %-8s max %-8s\n", 'UNKNOWN (mixture)', '-', '-', '-');
echo $line(
    '  mixture weights',
    implode(', ', array_map(
        static fn (string $code, float $weight): string => $code . ' ' . round($weight * 100, 1) . '%',
        array_keys((array) $parameters['impactMultiplier']['unknownPolicy']['weights']),
        array_values((array) $parameters['impactMultiplier']['unknownPolicy']['weights'])
    ))
);

echo "\nLoss-magnitude anchor (daily disruption cost)\n";
foreach ($parameters['disruptionCostAnchor']['bands'] as $code => $band) {
    printf("  %-34s min %-12s mode %-12s max %-12s\n", $code, $band['min'], $band['mode'], $band['max']);
}
$fallback = $parameters['disruptionCostAnchor']['fallback'];
printf("  %-34s min %-12s mode %-12s max %-12s\n", 'FALLBACK (QP8 unknown)', $fallback['min'], $fallback['mode'], $fallback['max']);

echo "\nPer-scenario structure\n";
foreach ($model->scenarioOrder() as $code) {
    $entry = $scaling[$code];
    echo '  ' . $code . ' — ' . (string) $model->scenario($code)['name'] . "\n";
    printf(
        "    %-30s min %-8s mode %-8s max %-8s\n",
        'Susceptibility',
        $entry['susceptibility']['min'],
        $entry['susceptibility']['mode'],
        $entry['susceptibility']['max']
    );
    printf(
        "    %-30s min %-8s mode %-8s max %-8s\n",
        'Secondary-loss probability',
        $entry['secondaryLossProbability']['min'],
        $entry['secondaryLossProbability']['mode'],
        $entry['secondaryLossProbability']['max']
    );
    printf(
        "    %-30s min %-8s mode %-8s max %-8s\n",
        'Secondary-loss multiplier',
        $entry['secondaryLossMultiplier']['min'],
        $entry['secondaryLossMultiplier']['mode'],
        $entry['secondaryLossMultiplier']['max']
    );
    printf("    %-30s %s\n", 'Impact scale', $entry['impactScale']);
}

echo "\nOrganisation-profile modifiers\n";
foreach ($parameters['modifiers'] as $modifier) {
    printf(
        "  %-32s %-28s target=%-28s appliesTo=%s\n",
        (string) $modifier['code'],
        (string) $modifier['questionCode'],
        (string) $modifier['target'],
        implode('|', (array) $modifier['appliesTo'])
    );
    $values = [];
    foreach ((array) $modifier['values'] as $optionCode => $value) {
        $values[] = $optionCode . '=' . $value;
    }
    echo '    ' . implode(', ', $values) . ' (unknownWiden ' . $modifier['unknownWiden'] . ")\n";
}

echo "\nConfidence scoring\n";
$confidence = $parameters['confidence'];
echo $line('Base score', (string) $confidence['baseScore']);
echo $line('Thresholds', 'High >= ' . $confidence['thresholds']['high'] . ', Medium >= ' . $confidence['thresholds']['medium']);
foreach ($confidence['penalties'] as $name => $value) {
    echo $line('Penalty: ' . $name, (string) $value);
}

echo "\nEngine limits\n";
foreach ($parameters['engineLimits'] as $name => $value) {
    echo $line((string) $name, is_scalar($value) ? (string) $value : json_encode($value));
}

echo "\n";
exit(0);
