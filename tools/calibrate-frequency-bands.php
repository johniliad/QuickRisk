<?php

declare(strict_types=1);

/**
 * FAIR QuickRisk — evidence-anchored frequency-band calibration (legacy fallback).
 *
 * Derives fallback frequency bands from documented public evidence:
 *   - DSIT Cyber Security Breaches Survey 2025/2026 prevalence by organisation size
 *   - DSIT probability of a non-zero material cost among breached organisations
 *   - DBIR 2026 action/type composition for the five-scenario split
 *
 * Usage:
 *   php tools/calibrate-frequency-bands.php            # print derived bands
 *   php tools/calibrate-frequency-bands.php --write    # update parameters.json in place
 *
 * This only affects the legacy fallback engine. The active posterior engine uses
 * reference-class posterior draws and is not changed here.
 */

const PARAMETERS_PATH = __DIR__ . '/../fairquickmodel/parameters.json';

const DSIT_PREVALENCE = [
    'micro' => 0.42,
    'small' => 0.46,
    'medium' => 0.65,
    'large' => 0.69,
];

const DSIT_MATERIAL_COST_PROBABILITY = 0.6029411765;

const SCENARIO_COMPOSITION = [
    'S1' => 0.22,
    'S2' => 0.28,
    'S3' => 0.20,
    'S4' => 0.12,
    'S5' => 0.18,
];

const LIKELIHOOD_MULTIPLIERS = [
    'VERY_UNLIKELY' => 0.10,
    'UNLIKELY' => 0.30,
    'POSSIBLE' => 1.00,
    'LIKELY' => 2.50,
    'VERY_LIKELY' => 6.00,
];

function prevalenceToPoissonRate(float $prevalence): float
{
    $prevalence = max(0.0001, min(0.9999, $prevalence));

    return -log(1.0 - $prevalence);
}

/** @return array{min:float,mode:float,max:float} */
function deriveBand(float $baseRate, float $multiplier): array
{
    $mode = $baseRate * $multiplier;

    return [
        'min' => round(max(0.001, $mode * 0.3), 4),
        'mode' => round($mode, 4),
        'max' => round($mode * 2.5, 4),
    ];
}

function computeBaseScenarioRate(string $scenarioCode, string $size = 'medium'): float
{
    $baseLambda = prevalenceToPoissonRate(DSIT_PREVALENCE[$size] ?? DSIT_PREVALENCE['medium']);

    return $baseLambda * DSIT_MATERIAL_COST_PROBABILITY * (SCENARIO_COMPOSITION[$scenarioCode] ?? 0.2);
}

/** @return array<string,array<string,array{min:float,mode:float,max:float}>> */
function deriveAllBands(): array
{
    $result = [];
    foreach (array_keys(SCENARIO_COMPOSITION) as $code) {
        $baseRate = computeBaseScenarioRate($code);
        $bands = [];
        foreach (LIKELIHOOD_MULTIPLIERS as $answer => $multiplier) {
            $bands[$answer] = deriveBand($baseRate, $multiplier);
        }
        $result[$code] = $bands;
    }

    return $result;
}

/** The base bands written to parameters.json are the average across scenarios. */
function averageBaseRate(): float
{
    $total = 0.0;
    foreach (array_keys(SCENARIO_COMPOSITION) as $code) {
        $total += computeBaseScenarioRate($code);
    }

    return $total / count(SCENARIO_COMPOSITION);
}

/** @return array<string,array{min:float,mode:float,max:float}> */
function deriveSusceptibilityBases(): array
{
    // Anchored to DSIT P(material cost | breach) = 0.603 (medium/large) and differentiated
    // by DBIR 2026 action/type exploitability. These are the reviewed base ranges.
    return [
        'S1' => ['min' => 0.12, 'mode' => 0.35, 'max' => 0.65],
        'S2' => ['min' => 0.15, 'mode' => 0.40, 'max' => 0.70],
        'S3' => ['min' => 0.08, 'mode' => 0.28, 'max' => 0.58],
        'S4' => ['min' => 0.05, 'mode' => 0.22, 'max' => 0.52],
        'S5' => ['min' => 0.18, 'mode' => 0.38, 'max' => 0.65],
    ];
}

$base = averageBaseRate();
echo "=== Evidence-Anchored Frequency Calibration (legacy fallback) ===\n\n";
printf("Base material-loss rate (medium org): %.6f events/year\n", $base);

$baseBands = [];
foreach (LIKELIHOOD_MULTIPLIERS as $answer => $multiplier) {
    $baseBands[$answer] = deriveBand($base, $multiplier);
    printf("  %-14s min=%-10s mode=%-10s max=%-10s\n",
        $answer, $baseBands[$answer]['min'], $baseBands[$answer]['mode'], $baseBands[$answer]['max']);
}

echo "\nSusceptibility bases:\n";
foreach (deriveSusceptibilityBases() as $code => $range) {
    printf("  %s: min=%.2f mode=%.2f max=%.2f\n", $code, $range['min'], $range['mode'], $range['max']);
}

$write = in_array('--write', $argv ?? [], true);
if ($write) {
    $raw = file_get_contents(PARAMETERS_PATH);
    $parameters = $raw === false ? null : json_decode($raw, true);
    if (!is_array($parameters)) {
        fwrite(STDERR, "ERROR: cannot read parameters.json\n");
        exit(1);
    }
    $parameters['frequency']['bands'] = $baseBands;
    $parameters['frequency']['classification'] = 'externally-evidenced';
    $parameters['frequency']['source'] = 'DSIT Cyber Security Breaches Survey 2025/2026 prevalence and material-cost probability, decomposed into scenario-level Poisson rates via DBIR 2026 action/type composition. Derived by tools/calibrate-frequency-bands.php; applies to the legacy fallback engine, while the active posterior engine uses reference-class posterior draws.';
    foreach (deriveSusceptibilityBases() as $code => $range) {
        if (isset($parameters['scenarioScaling']['scenarios'][$code])) {
            $parameters['scenarioScaling']['scenarios'][$code]['susceptibility'] = $range;
        }
    }
    file_put_contents(
        PARAMETERS_PATH,
        json_encode($parameters, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n"
    );
    echo "\nWrote frequency bands and susceptibility bases to " . PARAMETERS_PATH . "\n";
}
