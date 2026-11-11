<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — request validation.
 *
 * Two rules govern this file:
 *   1. the assessment answers are validated by the same validator the calculator uses, so a
 *      Decision Lab analysis can only ever be built on a valid QuickRisk assessment;
 *   2. treatment definitions are validated structurally (a causal lever, a three-point effect,
 *      both cost components, an evidence class and an assumption note). A custom treatment can
 *      never degrade into a bare "reduce risk by X%" input.
 */

require_once dirname(__DIR__) . '/validation.php';
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/treatment_library.php';

/**
 * @param mixed $value
 */
function qk_decision_number($value, string $label, float $minimum, float $maximum): float
{
    if (!is_numeric($value)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' must be a number.');
    }
    $number = (float) $value;
    if (!is_finite($number) || $number < $minimum || $number > $maximum) {
        throw new QkLiveHttpError(
            422,
            'VALIDATION_ERROR',
            sprintf('%s must be between %s and %s.', $label, (string) $minimum, (string) $maximum)
        );
    }

    return $number;
}

/**
 * Validates one three-point effect estimate.
 *
 * @param mixed $estimate
 * @param string $label
 * @return array{min:float,mostLikely:float,max:float}
 */
function qk_decision_effect($estimate, string $label): array
{
    if (!is_array($estimate)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' must be a minimum/most likely/maximum estimate.');
    }

    $min = qk_decision_number($estimate['min'] ?? null, $label . ' minimum', 0.0, 0.95);
    $mostLikely = qk_decision_number($estimate['mostLikely'] ?? null, $label . ' most likely value', 0.0, 0.95);
    $max = qk_decision_number($estimate['max'] ?? null, $label . ' maximum', 0.0, 0.95);

    if ($min > $mostLikely || $mostLikely > $max) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' must satisfy minimum <= most likely <= maximum.');
    }

    return ['min' => $min, 'mostLikely' => $mostLikely, 'max' => $max];
}

/**
 * Validates the risk appetite object. Unconfigured criteria stay unconfigured.
 *
 * @param mixed $appetite
 * @return array<string,mixed>|null
 */
function qk_decision_appetite($appetite): ?array
{
    if ($appetite === null || $appetite === []) {
        return null;
    }
    if (!is_array($appetite) || array_is_list($appetite)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The risk appetite must be an object.');
    }

    $validated = [];
    if (isset($appetite['annualLossLimit'])) {
        $validated['annualLossLimit'] = qk_decision_number($appetite['annualLossLimit'], 'The annual loss limit', 1.0, 1.0e12);
    }
    if (isset($appetite['highEndLimit'])) {
        $validated['highEndLimit'] = qk_decision_number($appetite['highEndLimit'], 'The high-end loss limit', 1.0, 1.0e12);
    }
    if (isset($appetite['maxExceedanceProbability'])) {
        $probability = qk_decision_number(
            $appetite['maxExceedanceProbability'],
            'The maximum acceptable probability',
            0.0001,
            1.0
        );
        $validated['maxExceedanceProbability'] = $probability;
    }
    if (isset($appetite['exceedanceThreshold'])) {
        $validated['exceedanceThreshold'] = qk_decision_number(
            $appetite['exceedanceThreshold'],
            'The exceedance threshold',
            1.0,
            1.0e12
        );
    }

    return $validated === [] ? null : $validated;
}

/**
 * Validates a treatment reference or a complete custom definition.
 *
 * A curated treatment is referenced by id only: the server resolves the reviewed definition,
 * so a client can never substitute its own numbers for a curated treatment.
 *
 * @param mixed $entry
 * @param array<string,mixed> $appConfig
 * @return array<string,mixed>
 */
function qk_decision_treatment_selection($entry, array $appConfig): array
{
    if (!is_array($entry) || array_is_list($entry)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'Every treatment selection must be an object.');
    }

    $source = (string) ($entry['source'] ?? 'curated');
    if ($source === 'curated') {
        $id = $entry['id'] ?? null;
        if (!is_string($id)) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A curated treatment must reference its id.');
        }
        $treatment = qk_decision_curated_treatment($id);
        if ($treatment === null) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'That curated treatment does not exist.');
        }

        return $treatment;
    }

    if ($source !== 'custom') {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'Unknown treatment source.');
    }

    $definition = $entry['definition'] ?? null;
    if (!is_array($definition) || array_is_list($definition)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A custom treatment must include its definition.');
    }

    $config = qk_decision_config($appConfig);
    $name = qk_live_text($definition['name'] ?? null, 'The treatment name', 160, false);
    $businessOutcome = qk_live_text($definition['businessOutcome'] ?? null, 'The business outcome', 400, false);
    $description = qk_live_text($definition['shortDescription'] ?? $businessOutcome, 'The description', 400);
    $assumptionNote = qk_live_text($definition['assumptionNotes'] ?? null, 'The assumption note', 1000, false);

    $mechanism = (string) ($definition['mechanismGroup'] ?? '');
    if (!array_key_exists($mechanism, QK_DECISION_MECHANISM_GROUPS)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The mechanism group is not recognised.');
    }

    $evidence = (string) ($definition['evidenceQuality'] ?? '');
    if (!array_key_exists($evidence, QK_DECISION_EVIDENCE_LEVELS)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The evidence classification is not recognised.');
    }

    $applicable = $definition['applicableScenarios'] ?? [];
    if (!is_array($applicable) || $applicable === []) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A custom treatment must name the scenarios it applies to.');
    }
    $codes = [];
    foreach ($applicable as $code) {
        if (!is_string($code) || !in_array($code, ['S1', 'S2', 'S3', 'S4', 'S5'], true)) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A custom treatment names an unknown scenario.');
        }
        $codes[] = $code;
    }

    $frequency = null;
    $magnitude = null;
    if (isset($definition['causalEffects']['frequency'])) {
        $frequency = qk_decision_effect($definition['causalEffects']['frequency'], 'The frequency effect');
    }
    if (isset($definition['causalEffects']['magnitude'])) {
        $magnitude = qk_decision_effect($definition['causalEffects']['magnitude'], 'The magnitude effect');
    }
    if ($frequency === null && $magnitude === null) {
        throw new QkLiveHttpError(
            422,
            'VALIDATION_ERROR',
            'A custom treatment must state whether it affects event frequency, loss magnitude or both.'
        );
    }

    $delay = (int) qk_decision_number(
        $definition['implementationDelayDays'] ?? 0,
        'The implementation delay',
        0.0,
        (float) ($config['maxImplementationDelayDays'] ?? 1095)
    );
    $initial = qk_decision_number($definition['initialCost'] ?? 0, 'The implementation cost', 0.0, 1.0e10);
    $annual = qk_decision_number($definition['annualOperatingCost'] ?? 0, 'The annual operating cost', 0.0, 1.0e10);

    $id = 'custom-' . substr(hash('sha256', strtolower($name)), 0, 12);

    return [
        'id' => $id,
        'version' => '1.0',
        'name' => $name,
        'shortDescription' => $description,
        'businessOutcome' => $businessOutcome,
        'applicableScenarios' => $codes,
        'causalEffects' => ['frequency' => $frequency, 'magnitude' => $magnitude],
        'implementationDelayDays' => $delay,
        'initialCost' => ['amount' => $initial, 'currency' => 'EUR'],
        'annualOperatingCost' => ['amount' => $annual, 'currency' => 'EUR'],
        'evidenceQuality' => $evidence,
        'mechanismGroup' => $mechanism,
        'interactionDefaults' => [
            'sameGroupIndependentCoverage' => (float) ($config['sameGroupIndependentCoverage'] ?? 0.65),
        ],
        'assumptions' => [$assumptionNote],
        'reviewedAt' => '',
        'reviewOwner' => '',
        'evidenceReference' => QK_DECISION_EVIDENCE_LEVELS[$evidence]['label'] . ': ' . $assumptionNote,
        'origin' => 'custom',
        'enabled' => true,
    ];
}


/**
 * Validates the portfolio constraints object.
 *
 * @param mixed $constraints
 * @return array<string,mixed>
 */
function qk_decision_constraints($constraints): array
{
    if ($constraints === null || $constraints === []) {
        return [];
    }
    if (!is_array($constraints) || array_is_list($constraints)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The constraints must be an object.');
    }

    $validated = [];
    if (isset($constraints['maxInitialInvestment'])) {
        $validated['maxInitialInvestment'] = qk_decision_number(
            $constraints['maxInitialInvestment'],
            'The maximum initial investment',
            0.0,
            1.0e11
        );
    }
    if (isset($constraints['implementationDeadlineDays'])) {
        $validated['implementationDeadlineDays'] = (int) qk_decision_number(
            $constraints['implementationDeadlineDays'],
            'The implementation deadline',
            0.0,
            3650.0
        );
    }

    return $validated;
}

