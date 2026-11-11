<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — treatment adapter.
 *
 * A treatment is never expressed as "reduce risk by X%". It states which QuickRisk driver it
 * changes and by how much, and this adapter turns that statement into a factor on the two
 * drivers the model actually samples:
 *
 *   frequency effect  -> multiplier on the susceptibility input
 *                        (the probability that a threat event becomes a loss event)
 *   magnitude effect  -> multiplier on the loss-magnitude anchor
 *
 * Because the model's annual loss for one simulated year is linear in both drivers, a
 * treatment scales that year's loss by exactly alpha x beta. The Decision Lab therefore
 * evaluates treatments and portfolios on the *same* simulated years the QuickRisk engine
 * already produced — exact common random numbers, no second simulation, no second model.
 */

require_once __DIR__ . '/config.php';
require_once dirname(__DIR__) . '/distributions.php';
require_once dirname(__DIR__) . '/modifiers.php';

/**
 * Realises each treatment's uncertain effect from its three-point estimate.
 *
 * One draw per treatment per analysis, seeded from the analysis seed and the treatment
 * identity, so the same seed always produces the same effect while a different seed explores
 * the stated range. The draw is reported to the analyst and stored with the result.
 *
 * @param array<int,array<string,mixed>> $treatments
 * @return array<string,mixed>
 */
function qk_decision_realise_effects(array $treatments, int $seed): array
{
    $effects = [];
    $draws = [];

    foreach ($treatments as $treatment) {
        $id = (string) $treatment['id'];
        $version = (string) ($treatment['version'] ?? '1.0');
        $treatmentSeed = (int) (abs(crc32($seed . '|' . $id . '|' . $version)) % 2147483647);
        $rng = new QkDistributions($treatmentSeed === 0 ? 1 : $treatmentSeed);

        $entry = ['frequency' => null, 'magnitude' => null];
        $draw = ['treatmentId' => $id, 'seed' => $treatmentSeed, 'frequency' => null, 'magnitude' => null];

        foreach (['frequency', 'magnitude'] as $lever) {
            $estimate = $treatment['causalEffects'][$lever] ?? null;
            if (!is_array($estimate)) {
                continue;
            }
            [$min, $mode, $max] = QkDistributions::normaliseRange(
                (float) ($estimate['min'] ?? 0.0),
                (float) ($estimate['mostLikely'] ?? 0.0),
                (float) ($estimate['max'] ?? 0.0)
            );
            $value = QkDistributions::clamp($rng->sampleTriangular($min, $mode, $max), 0.0, 0.99);
            $entry[$lever] = $value;
            $draw[$lever] = [
                'min' => $min,
                'mostLikely' => $mode,
                'max' => $max,
                'realised' => $value,
            ];
        }

        $effects[$id] = $entry;
        $draws[] = $draw;
    }

    return ['effects' => $effects, 'draws' => $draws];
}

/**
 * Scales one built input (triangular or mixture) by a multiplier, using the model's own
 * clamping rules so a treatment can never push an input outside documented bounds.
 *
 * @param array<string,mixed> $input
 * @param array<string,float> $clamp
 * @return array<string,mixed>
 */
function qk_decision_scale_input(array $input, float $multiplier, array $clamp): array
{
    $clampBounds = [
        'min' => (float) ($clamp['min'] ?? 0.0),
        'max' => (float) ($clamp['max'] ?? 1.0e12),
    ];

    if (($input['kind'] ?? 'triangular') !== 'mixture') {
        $scaled = QkModifiers::applyRange(
            [
                'min' => (float) $input['min'],
                'mode' => (float) $input['mode'],
                'max' => (float) $input['max'],
            ],
            $multiplier,
            1.0,
            $clampBounds
        );

        return [
            'kind' => 'triangular',
            'min' => $scaled['min'],
            'mode' => $scaled['mode'],
            'max' => $scaled['max'],
            'components' => [],
        ];
    }

    $components = [];
    $minimum = INF;
    $maximum = -INF;
    $modeTotal = 0.0;
    $weightTotal = 0.0;

    foreach ((array) ($input['components'] ?? []) as $component) {
        $scaled = QkModifiers::applyRange(
            [
                'min' => (float) $component['min'],
                'mode' => (float) $component['mode'],
                'max' => (float) $component['max'],
            ],
            $multiplier,
            1.0,
            $clampBounds
        );
        $weight = (float) $component['weight'];
        $components[] = [
            'optionCode' => (string) ($component['optionCode'] ?? ''),
            'weight' => $weight,
            'min' => $scaled['min'],
            'mode' => $scaled['mode'],
            'max' => $scaled['max'],
        ];
        $minimum = min($minimum, (float) $scaled['min']);
        $maximum = max($maximum, (float) $scaled['max']);
        $modeTotal += $weight * (float) $scaled['mode'];
        $weightTotal += $weight;
    }

    return [
        'kind' => 'mixture',
        'min' => is_finite($minimum) ? $minimum : 0.0,
        'mode' => $weightTotal > 0.0 ? $modeTotal / $weightTotal : (is_finite($minimum) ? $minimum : 0.0),
        'max' => is_finite($maximum) ? $maximum : 0.0,
        'components' => $components,
    ];
}

/**
 * Computes the driver factors a set of treatments produces for every scenario.
 *
 * Overlap handling (requirement 23/24): within one mechanism group only the first treatment
 * (ordered by id, so the result is deterministic) delivers its full standalone effect; later
 * treatments in the same group deliver `sameGroupIndependentCoverage` of it. Agents in
 * different groups are treated as independent. No percentages are ever added together.
 *
 * @param array<string,mixed> $vectors output of FairEngine::lossVectors()
 * @param array<int,array<string,mixed>> $treatments selected treatments (resolved definitions)
 * @param array<string,array<string,float|null>> $effects realised effects by treatment id
 * @param array<string,mixed> $config decision configuration
 * @return array<string,mixed>
 */
function qk_decision_scenario_factors(array $vectors, array $treatments, array $effects, array $config): array
{
    $defaultCoverage = (float) ($config['sameGroupIndependentCoverage'] ?? 0.65);
    $ordered = $treatments;
    usort($ordered, static fn (array $left, array $right): int => strcmp((string) $left['id'], (string) $right['id']));

    $byScenario = [];
    $notes = [];
    $clampWarning = false;

    foreach ($vectors['scenarios'] as $scenario) {
        $code = (string) $scenario['code'];
        $frequencyMultiplier = 1.0;
        $magnitudeMultiplier = 1.0;
        $groupSeen = [];
        $applied = [];

        foreach ($ordered as $treatment) {
            $applicable = (array) ($treatment['applicableScenarios'] ?? []);
            if (!in_array($code, $applicable, true) && !in_array('all', $applicable, true)) {
                continue;
            }
            $id = (string) $treatment['id'];
            $group = (string) ($treatment['mechanismGroup'] ?? 'governance');
            $coverage = $groupSeen[$group] ?? 0;
            $groupCoverage = $coverage === 0
                ? 1.0
                : (float) (($treatment['interactionDefaults']['sameGroupIndependentCoverage'] ?? $defaultCoverage));
            $groupSeen[$group] = $coverage + 1;

            $effect = $effects[$id] ?? ['frequency' => null, 'magnitude' => null];
            if ($effect['frequency'] !== null) {
                $frequencyMultiplier *= max(0.0, 1.0 - $groupCoverage * (float) $effect['frequency']);
            }
            if ($effect['magnitude'] !== null) {
                $magnitudeMultiplier *= max(0.0, 1.0 - $groupCoverage * (float) $effect['magnitude']);
            }
            $applied[] = ['id' => $id, 'group' => $group, 'coverage' => $groupCoverage];
        }

        $inputs = [
            'susceptibility' => qk_decision_scale_input(
                (array) $scenario['ranges']['susceptibility'],
                $frequencyMultiplier,
                (array) $scenario['clamps']['susceptibility']
            ),
            'anchor' => qk_decision_scale_input(
                (array) $scenario['ranges']['lossMagnitudeAnchor'],
                $magnitudeMultiplier,
                (array) $scenario['clamps']['lossMagnitude']
            ),
        ];

        $originalSusceptibility = (float) $scenario['inputExpectations']['susceptibility'];
        $originalAnchor = (float) $scenario['inputExpectations']['lossMagnitudeAnchor'];

        $alpha = $originalSusceptibility > 0.0
            ? FairEngine::inputExpectation($inputs['susceptibility']) / $originalSusceptibility
            : 1.0;
        $beta = $originalAnchor > 0.0
            ? FairEngine::inputExpectation($inputs['anchor']) / $originalAnchor
            : 1.0;

        // Report when the documented input bounds, rather than the treatment, limit the effect.
        $clamped = false;
        if ($frequencyMultiplier < 1.0 && abs($alpha - $frequencyMultiplier) > 1.0e-6 * max($frequencyMultiplier, 1.0e-9)) {
            $clamped = true;
        }
        if ($magnitudeMultiplier < 1.0 && abs($beta - $magnitudeMultiplier) > 1.0e-6 * max($magnitudeMultiplier, 1.0e-9)) {
            $clamped = true;
        }
        if ($clamped) {
            $clampWarning = true;
            $notes[] = sprintf(
                'In %s, the modelled effect is limited by the documented input bounds for at least one driver.',
                $code
            );
        }

        $byScenario[$code] = [
            'frequencyFactor' => $alpha,
            'magnitudeFactor' => $beta,
            'kappa' => $alpha * $beta,
            'frequencyMultiplierRequested' => $frequencyMultiplier,
            'magnitudeMultiplierRequested' => $magnitudeMultiplier,
            'clampBound' => $clamped,
            'applied' => $applied,
        ];
    }

    return [
        'byScenario' => $byScenario,
        'notes' => array_values(array_unique($notes)),
        'clampWarning' => $clampWarning,
    ];
}

