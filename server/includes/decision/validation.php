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
require_once __DIR__ . '/decision_engine.php';

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
        $hasAnnualLimit = isset($appetite['annualLossLimit']);
        $hasThreshold = isset($appetite['exceedanceThreshold']);
        if (!$hasAnnualLimit && !$hasThreshold) {
            throw new QkLiveHttpError(
                422,
                'VALIDATION_ERROR',
                'The probability criterion needs a loss threshold. Enter an annual loss limit or an exceedance threshold.'
            );
        }
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
    $codes = array_values(array_unique($codes));
    sort($codes, SORT_STRING);

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

    // Identity is derived from every validated definition field, never from the name. Two
    // user-defined treatments may share a name and still be different analyses.
    $identity = [
        'name' => $name,
        'shortDescription' => $description,
        'businessOutcome' => $businessOutcome,
        'applicableScenarios' => $codes,
        'causalEffects' => ['frequency' => $frequency, 'magnitude' => $magnitude],
        'implementationDelayDays' => $delay,
        'initialCost' => $initial,
        'annualOperatingCost' => $annual,
        'evidenceQuality' => $evidence,
        'mechanismGroup' => $mechanism,
        'assumptions' => [$assumptionNote],
        'origin' => 'custom',
    ];
    $id = 'custom-' . substr(hash('sha256', qk_decision_canonical_json($identity)), 0, 16);

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

/**
 * Canonical JSON for equality checks. Object keys are sorted recursively; list order is kept.
 *
 * @param mixed $value
 */
function qk_decision_canonical_json($value): string
{
    $normalise = static function ($item) use (&$normalise) {
        if (!is_array($item)) {
            return $item;
        }
        if (array_is_list($item)) {
            return array_map($normalise, $item);
        }
        ksort($item);
        foreach ($item as $key => $child) {
            $item[$key] = $normalise($child);
        }

        return $item;
    };

    $encoded = json_encode($normalise($value), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    return is_string($encoded) ? $encoded : '';
}
/**
 * Canonical fingerprint of one Decision Lab compute input.
 *
 * The same inputs and seed produce the same fingerprint; changing an answer, treatment, set of
 * candidates, appetite, constraint, seed or model version changes it. It hashes canonical JSON, so
 * object key order does not matter.
 *
 * @param array<string,mixed> $validated
 * @param array<int,array<string,mixed>> $treatments the effective treatment set for the action
 * @param array<string,mixed>|null $appetite
 * @param array<string,mixed> $constraints
 * @param array<string,mixed> $versionMeta
 * @param array<string,mixed> $decisionConfig
 */
function qk_decision_input_fingerprint(
    array $validated,
    array $treatments,
    ?array $appetite,
    array $constraints,
    int $seed,
    int $iterations,
    array $versionMeta,
    array $decisionConfig = []
): string {
    $byId = static function (array $items): array {
        usort(
            $items,
            static fn (array $left, array $right): int => strcmp(
                (string) ($left['id'] ?? ''),
                (string) ($right['id'] ?? '')
            )
        );

        return array_values($items);
    };

    $answers = $validated;
    if (isset($answers['organisationAnswers']) && is_array($answers['organisationAnswers'])) {
        usort(
            $answers['organisationAnswers'],
            static fn (array $left, array $right): int => strcmp(
                (string) ($left['questionCode'] ?? ''),
                (string) ($right['questionCode'] ?? '')
            )
        );
    }
    if (isset($answers['scenarioAnswers']) && is_array($answers['scenarioAnswers'])) {
        foreach ($answers['scenarioAnswers'] as $index => $scenario) {
            if (isset($scenario['answers']) && is_array($scenario['answers'])) {
                usort(
                    $scenario['answers'],
                    static fn (array $left, array $right): int => strcmp(
                        (string) ($left['questionCode'] ?? ''),
                        (string) ($right['questionCode'] ?? '')
                    )
                );
                $answers['scenarioAnswers'][$index]['answers'] = $scenario['answers'];
            }
        }
        usort(
            $answers['scenarioAnswers'],
            static fn (array $left, array $right): int => strcmp(
                (string) ($left['scenarioCode'] ?? ''),
                (string) ($right['scenarioCode'] ?? '')
            )
        );
    }

    return hash('sha256', qk_decision_canonical_json([
        'answers' => $answers,
        'treatments' => $byId($treatments),
        'appetite' => $appetite,
        'constraints' => $constraints,
        'seed' => $seed,
        'iterations' => $iterations,
        'quickriskModelId' => (string) ($versionMeta['modelId'] ?? ''),
        'quickriskModelVersion' => (string) ($versionMeta['modelVersion'] ?? ''),
        'decisionMethodologyVersion' => QK_DECISION_METHODOLOGY_VERSION,
        'boardPackVersion' => QK_BOARD_PACK_VERSION,
        'effectModel' => QK_DECISION_EFFECT_MODEL,
        'planningHorizonYears' => (int) ($decisionConfig['planningHorizonYears'] ?? 3),
        'sameGroupIndependentCoverage' => (float) ($decisionConfig['sameGroupIndependentCoverage'] ?? 0.65),
        'portfolioAppetiteBasis' => 'expected-annual-loss-only',
    ]));
}



/**
 * @param mixed $value
 * @return array<string,mixed>
 */
function qk_decision_saved_map($value, string $label): array
{
    if (!is_array($value)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' must be an object.');
    }

    return $value;
}

/**
 * @param mixed $value
 * @return array<int,mixed>
 */
function qk_decision_saved_list($value, string $label): array
{
    if (!is_array($value) || !array_is_list($value)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' must be a list.');
    }

    return $value;
}

function qk_decision_close(float $left, float $right, float $tolerance = 1.0e-6): bool
{
    return abs($left - $right) <= $tolerance;
}

function qk_decision_assert_close(float $left, float $right, string $message): void
{
    if (!qk_decision_close($left, $right)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $message);
    }
}

/**
 * Validates a saved distribution summary and its internal ordering.
 *
 * @param mixed $value
 * @return array<string,mixed>
 */
function qk_decision_saved_summary($value, string $label): array
{
    $summary = qk_decision_saved_map($value, $label);
    $fields = ['expectedAnnualLoss', 'p10', 'p25', 'p50', 'p75', 'p90', 'minimum', 'maximum'];
    $numbers = [];
    foreach ($fields as $field) {
        $numbers[$field] = qk_decision_number($summary[$field] ?? null, $label . ' ' . $field, 0.0, 1.0e15);
    }

    $ordered = ['minimum', 'p10', 'p25', 'p50', 'p75', 'p90', 'maximum'];
    for ($index = 1; $index < count($ordered); $index++) {
        if ($numbers[$ordered[$index]] + 1.0e-9 < $numbers[$ordered[$index - 1]]) {
            throw new QkLiveHttpError(
                422,
                'VALIDATION_ERROR',
                $label . ' is not ordered from minimum to maximum.'
            );
        }
    }

    $summary['iterations'] = (int) qk_decision_number(
        $summary['iterations'] ?? null,
        $label . ' iterations',
        1.0,
        50000.0
    );

    $probabilities = qk_decision_saved_map($summary['thresholdProbabilities'] ?? [], $label . ' threshold probabilities');
    foreach ($probabilities as $threshold => $probability) {
        if (!is_numeric($threshold)) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' has a non-numeric threshold.');
        }
        qk_decision_number($probability, $label . ' threshold probability', 0.0, 1.0);
    }

    $counts = qk_decision_saved_map($summary['thresholdExceedanceCounts'] ?? [], $label . ' threshold counts');
    foreach ($counts as $threshold => $count) {
        if (!is_numeric($threshold)) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' has a non-numeric threshold count.');
        }
        $value = qk_decision_number($count, $label . ' threshold count', 0.0, 50000.0);
        if (floor($value) !== $value) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' threshold count must be whole.');
        }
    }

    $contributions = $summary['scenarioContributions'] ?? null;
    if (!is_array($contributions) || !array_is_list($contributions)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' scenario contributions must be a list.');
    }
    $contributionTotal = 0.0;
    $seenCodes = [];
    foreach ($contributions as $contribution) {
        $contribution = qk_decision_saved_map($contribution, $label . ' scenario contribution');
        $code = qk_live_text($contribution['code'] ?? null, $label . ' contribution code', 16, false);
        if (isset($seenCodes[$code])) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' repeats a scenario contribution.');
        }
        $seenCodes[$code] = true;
        qk_live_text($contribution['name'] ?? null, $label . ' contribution name', 160, false);
        qk_live_text($contribution['shortLabel'] ?? null, $label . ' contribution short label', 80, false);
        $contributionEal = qk_decision_number(
            $contribution['expectedAnnualLoss'] ?? null,
            $label . ' contribution EAL',
            0.0,
            1.0e15
        );
        qk_decision_number($contribution['factor'] ?? null, $label . ' contribution factor', 0.0, 10.0);
        $contributionTotal += $contributionEal;
    }
    if ($contributions !== []) {
        $expected = (float) $summary['expectedAnnualLoss'];
        if (abs($contributionTotal - $expected) > max(1.0, abs($expected)) * 1.0e-9) {
            throw new QkLiveHttpError(
                422,
                'VALIDATION_ERROR',
                $label . ' scenario contributions do not sum to the expected annual loss.'
            );
        }
    }

    return $summary;
}



/**
 * The actual value a saved appetite criterion must report, derived from its summary.
 *
 * @param array<string,mixed> $criterion
 * @param array<string,mixed> $summary
 */
function qk_decision_saved_appetite_actual(array $criterion, array $summary): float
{
    $id = (string) ($criterion['id'] ?? '');
    if ($id === 'annualLoss') {
        return (float) $summary['expectedAnnualLoss'];
    }
    if ($id === 'highEndLoss') {
        return (float) $summary['p90'];
    }

    $threshold = (float) ($criterion['threshold'] ?? 0.0);
    $probabilities = (array) ($summary['thresholdProbabilities'] ?? []);
    $key = qk_decision_threshold_key($threshold);
    if (!array_key_exists($key, $probabilities)) {
        throw new QkLiveHttpError(
            422,
            'VALIDATION_ERROR',
            'The saved appetite criterion uses a threshold that is not present in the summary.'
        );
    }

    return (float) $probabilities[$key];
}

/**
 * Re-evaluates one stored appetite result from its limits, the matching summary and the
 * server-derived criteria. Both the pass flags and the overall status must agree.
 *
 * @param mixed $value
 * @param array<string,mixed> $summary
 * @param array<int,array<string,mixed>> $criteria
 */
function qk_decision_validate_appetite_evaluation(
    $value,
    string $label,
    array $summary,
    array $criteria
): void {
    $evaluation = qk_decision_saved_map($value, $label);
    $status = (string) ($evaluation['status'] ?? '');
    if (!in_array($status, ['within', 'above', 'undefined'], true)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' has an unrecognised status.');
    }

    $storedCriteria = qk_decision_saved_list($evaluation['criteria'] ?? null, $label . ' criteria');
    if (count($storedCriteria) !== count($criteria)) {
        throw new QkLiveHttpError(
            422,
            'VALIDATION_ERROR',
            $label . ' does not contain exactly the criteria that were configured.'
        );
    }

    $allPass = true;
    foreach ($criteria as $expected) {
        $stored = null;
        foreach ($storedCriteria as $candidate) {
            if (!is_array($candidate)) {
                throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' contains a malformed criterion.');
            }
            if (($candidate['id'] ?? null) === $expected['id']) {
                $stored = $candidate;
                break;
            }
        }
        if ($stored === null) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' is missing a configured criterion.');
        }

        $limit = qk_decision_number($stored['limit'] ?? null, $label . ' criterion limit', 0.0, 1.0e15);
        if (!qk_decision_close($limit, (float) $expected['limit'])) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' has a criterion limit that does not match the appetite.');
        }

        $actual = qk_decision_number($stored['actual'] ?? null, $label . ' criterion actual', 0.0, 1.0e15);
        $expectedActual = qk_decision_saved_appetite_actual($stored, $summary);
        if (!qk_decision_close($actual, $expectedActual)) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' has a criterion result that does not match the summaries.');
        }

        $passes = $actual <= $limit + 1.0e-9;
        if (($stored['passes'] ?? null) !== $passes) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' has a criterion pass flag that is not correct.');
        }

        if ((string) ($stored['unit'] ?? '') !== (string) $expected['unit']) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' has a criterion unit that is not recognised.');
        }
        if ((string) ($stored['label'] ?? '') !== (string) $expected['label']) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' has a criterion label that does not match the configured criterion.');
        }

        $threshold = $stored['threshold'] ?? null;
        if ((string) $expected['unit'] === 'probability') {
            if (!is_numeric($threshold)) {
                throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' probability criterion has no threshold.');
            }
            if (!qk_decision_close((float) $threshold, (float) $expected['threshold'])) {
                throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' probability criterion uses the wrong threshold.');
            }
        } elseif ($threshold !== null) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' has a threshold on a non-probability criterion.');
        }

        $allPass = $allPass && $passes;
    }

    $expectedStatus = $criteria === [] ? 'undefined' : ($allPass ? 'within' : 'above');
    if ($status !== $expectedStatus) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' status does not match its criteria.');
    }
    $expectedLabel = $criteria === []
        ? 'Risk appetite has not been defined'
        : ($allPass ? 'Within appetite' : 'Above appetite');
    if ((string) ($evaluation['label'] ?? '') !== $expectedLabel) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' label does not match its criteria.');
    }
}


/**
 * Re-resolves one stored treatment from the library or its custom definition and checks that
 * the stored identity, costs and delay agree with the resolved definition.
 *
 * @param mixed $value
 * @return array<string,mixed>
 */
function qk_decision_saved_treatment_resolved($value, array $appConfig): array
{
    $stored = qk_decision_saved_map($value, 'A saved treatment');
    $id = qk_live_text($stored['id'] ?? null, 'A saved treatment id', 64, false);
    $origin = (string) ($stored['origin'] ?? (str_starts_with($id, 'custom-') ? 'custom' : 'curated'));

    if ($origin === 'custom') {
        $initial = qk_decision_saved_map($stored['initialCost'] ?? null, 'A custom treatment implementation cost');
        $annual = qk_decision_saved_map($stored['annualOperatingCost'] ?? null, 'A custom treatment operating cost');
        $assumptions = $stored['assumptions'] ?? [];
        if (!is_array($assumptions)) {
            $assumptions = [];
        }
        $notes = trim(implode(' ', array_map(static fn ($item): string => (string) $item, $assumptions)));
        $resolved = qk_decision_treatment_selection(
            [
                'source' => 'custom',
                'definition' => [
                    'name' => $stored['name'] ?? null,
                    'businessOutcome' => $stored['businessOutcome'] ?? null,
                    'shortDescription' => $stored['shortDescription'] ?? ($stored['businessOutcome'] ?? null),
                    'assumptionNotes' => $notes === '' ? 'No assumption note was stored.' : $notes,
                    'mechanismGroup' => $stored['mechanismGroup'] ?? null,
                    'evidenceQuality' => $stored['evidenceQuality'] ?? null,
                    'applicableScenarios' => $stored['applicableScenarios'] ?? null,
                    'causalEffects' => $stored['causalEffects'] ?? null,
                    'implementationDelayDays' => $stored['implementationDelayDays'] ?? null,
                    'initialCost' => $initial['amount'] ?? null,
                    'annualOperatingCost' => $annual['amount'] ?? null,
                ],
            ],
            $appConfig
        );
    } else {
        $resolved = qk_decision_curated_treatment($id);
        if ($resolved === null) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A saved treatment does not exist in the curated library.');
        }
    }

    if ((string) $resolved['id'] !== $id) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A saved treatment identity does not match its definition.');
    }
    if ((string) ($stored['version'] ?? '') !== (string) $resolved['version']) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A saved treatment version does not match its definition.');
    }
    if ((string) ($stored['name'] ?? '') !== (string) $resolved['name']) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A saved treatment name does not match its definition.');
    }

    $storedInitial = qk_decision_saved_map($stored['initialCost'] ?? null, 'A saved treatment implementation cost');
    $storedAnnual = qk_decision_saved_map($stored['annualOperatingCost'] ?? null, 'A saved treatment operating cost');
    qk_decision_assert_close(
        (float) ($storedInitial['amount'] ?? -1.0),
        (float) $resolved['initialCost']['amount'],
        'A saved treatment implementation cost does not match its definition.'
    );
    qk_decision_assert_close(
        (float) ($storedAnnual['amount'] ?? -1.0),
        (float) $resolved['annualOperatingCost']['amount'],
        'A saved treatment operating cost does not match its definition.'
    );
    if ((int) ($stored['implementationDelayDays'] ?? -1) !== (int) $resolved['implementationDelayDays']) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A saved treatment delay does not match its definition.');
    }

    return $resolved;
}

/**
 * @param mixed $value
 * @return array<string,mixed>
 */
function qk_decision_saved_provenance($value): array
{
    $provenance = qk_decision_saved_map($value, 'The result provenance');

    return [
        'quickriskModelId' => qk_live_text($provenance['quickriskModelId'] ?? null, 'The result model id', 32, false),
        'quickriskModelVersion' => qk_live_text($provenance['quickriskModelVersion'] ?? null, 'The result model version', 32, false),
        'decisionMethodologyVersion' => qk_live_text($provenance['decisionMethodologyVersion'] ?? null, 'The result decision methodology version', 32, false),
        'boardPackVersion' => qk_live_text($provenance['boardPackVersion'] ?? null, 'The result Board Pack version', 32, false),
        'effectModel' => qk_live_text($provenance['effectModel'] ?? null, 'The result effect model', 64, false),
        'simulationSeed' => (int) qk_decision_number($provenance['simulationSeed'] ?? null, 'The result simulation seed', 1.0, 2147483646.0),
        'iterations' => (int) qk_decision_number($provenance['iterations'] ?? null, 'The result iteration count', 1.0, 50000.0),
        'planningHorizonYears' => (int) qk_decision_number($provenance['planningHorizonYears'] ?? null, 'The result planning horizon', 1.0, 50.0),
        'sameGroupIndependentCoverage' => qk_decision_number($provenance['sameGroupIndependentCoverage'] ?? null, 'The result same-group coverage', 0.0, 1.0),
    ];
}


/**
 * @param mixed $value
 * @return array<string,mixed>
 */
function qk_decision_saved_cost($value, string $label): array
{
    $cost = qk_decision_saved_map($value, $label);
    $initial = qk_decision_number($cost['initialInvestment'] ?? null, $label . ' initial investment', 0.0, 1.0e12);
    $annual = qk_decision_number($cost['annualOperatingCost'] ?? null, $label . ' annual operating cost', 0.0, 1.0e12);
    $horizon = (int) qk_decision_number($cost['horizonYears'] ?? null, $label . ' horizon', 1.0, 50.0);
    $annualised = qk_decision_number($cost['annualisedTreatmentCost'] ?? null, $label . ' annualised cost', 0.0, 1.0e12);
    $delay = (int) qk_decision_number($cost['implementationDelayDays'] ?? null, $label . ' implementation delay', 0.0, 3650.0);

    qk_decision_assert_close(
        $annualised,
        $annual + ($initial / $horizon),
        $label . ' annualised cost does not equal the annual cost plus the spread implementation cost.'
    );

    return [
        'initialInvestment' => $initial,
        'annualOperatingCost' => $annual,
        'horizonYears' => $horizon,
        'annualisedTreatmentCost' => $annualised,
        'implementationDelayDays' => $delay,
    ];
}

/**
 * @param mixed $value
 * @return array<string,mixed>
 */
function qk_decision_saved_portfolio($value, string $label): array
{
    $row = qk_decision_saved_map($value, $label);
    qk_live_text($row['id'] ?? null, $label . ' id', 64, false);

    $treatmentIds = qk_decision_saved_list($row['treatmentIds'] ?? null, $label . ' treatment ids');
    $seen = [];
    foreach ($treatmentIds as $treatmentId) {
        $id = qk_live_text($treatmentId, $label . ' treatment id', 64, false);
        if (isset($seen[$id])) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' repeats a treatment.');
        }
        $seen[$id] = true;
    }

    qk_decision_saved_cost($row['cost'] ?? null, $label . ' cost');
    qk_decision_saved_summary($row['treated'] ?? null, $label . ' treated');

    qk_decision_number($row['deltaEal'] ?? null, $label . ' delta EAL', -1.0e15, 1.0e15);
    qk_decision_number($row['reductionShare'] ?? null, $label . ' reduction share', -1.0, 1.0);

    $appetite = qk_decision_saved_map($row['appetite'] ?? null, $label . ' appetite');
    if (!in_array((string) ($appetite['status'] ?? ''), ['within', 'above', 'undefined'], true)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' has an unrecognised appetite status.');
    }
    if (!is_bool($row['withinAppetite'] ?? null)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' within-appetite flag must be true or false.');
    }

    $violations = qk_decision_saved_list($row['constraintViolations'] ?? null, $label . ' constraint violations');
    foreach ($violations as $violation) {
        qk_live_text($violation, $label . ' constraint violation', 240, false);
    }

    $portfolioLabel = (string) ($row['label'] ?? '');
    if (!array_key_exists($portfolioLabel, QK_DECISION_LABELS)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $label . ' has an unrecognised label.');
    }
    qk_live_text($row['labelText'] ?? null, $label . ' label text', 80, false);
    qk_live_text($row['labelReason'] ?? null, $label . ' label reason', 400, false);

    return $row;
}

/**
 * @param mixed $value
 * @return array{search:array<string,mixed>,byId:array<string,array<string,mixed>>}
 */
function qk_decision_saved_portfolio_search($value): array
{
    $search = qk_decision_saved_map($value, 'The portfolio search');
    qk_decision_saved_summary($search['baseline'] ?? null, 'The portfolio baseline');

    $rows = qk_decision_saved_list($search['portfolios'] ?? null, 'The portfolio search rows');
    $byId = [];
    foreach ($rows as $row) {
        $portfolio = qk_decision_saved_portfolio($row, 'A portfolio');
        $id = (string) $portfolio['id'];
        if (isset($byId[$id])) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The portfolio search repeats a portfolio id.');
        }
        $byId[$id] = $portfolio;
    }

    $recommendedId = $search['recommendedId'] ?? null;
    if ($recommendedId !== null) {
        if (!is_string($recommendedId) || !isset($byId[$recommendedId])) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The portfolio search recommends a portfolio it does not contain.');
        }
    }
    if (!is_bool($search['noneSatisfies'] ?? null)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The portfolio search none-satisfies flag must be true or false.');
    }
    if ($search['noneSatisfies'] === true && $recommendedId !== null) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The portfolio search cannot both recommend a portfolio and report that none satisfies.');
    }

    $paretoIds = qk_decision_saved_list($search['paretoIds'] ?? null, 'The Pareto ids');
    foreach ($paretoIds as $paretoId) {
        if (!is_string($paretoId) || !isset($byId[$paretoId])) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The Pareto frontier references an unknown portfolio.');
        }
    }

    $notes = qk_decision_saved_list($search['notes'] ?? null, 'The portfolio notes');
    foreach ($notes as $note) {
        qk_live_text($note, 'A portfolio note', 400);
    }
    qk_decision_number($search['evaluated'] ?? null, 'The evaluated portfolio count', 0.0, 256.0);
    qk_decision_number($search['candidatesConsidered'] ?? null, 'The candidate count', 0.0, 30.0);
    if (
        !is_bool($search['truncated'] ?? null)
        || !is_bool($search['appetiteDefined'] ?? null)
        || !is_bool($search['portfolioAppetiteDefined'] ?? null)
    ) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The portfolio search flags must be true or false.');
    }
    if ((string) ($search['appetiteBasis'] ?? '') !== 'expected-annual-loss-only'
        || ($search['portfolioAppetiteDefined'] ?? null) !== true) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The portfolio appetite basis is not recognised.');
    }
    $portfolioCriteria = qk_decision_saved_list($search['portfolioCriteria'] ?? null, 'The portfolio criteria');
    if ($portfolioCriteria !== ['annualLoss']) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'Portfolio selection must use expected annual loss only.');
    }
    $excludedCriteria = qk_decision_saved_list($search['excludedCriteria'] ?? null, 'The excluded appetite criteria');
    foreach ($excludedCriteria as $criterionId) {
        if (!in_array($criterionId, ['highEndLoss', 'exceedanceProbability'], true)) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'An excluded portfolio criterion is not recognised.');
        }
    }
    qk_decision_saved_provenance($search['provenance'] ?? null);

    return ['search' => $search, 'byId' => $byId];
}


/**
 * Compares the identity fields of two provenances.
 *
 * @param array<string,mixed> $left
 * @param array<string,mixed> $right
 */
function qk_decision_assert_same_provenance(array $left, array $right, string $message): void
{
    $fields = [
        'quickriskModelId',
        'quickriskModelVersion',
        'decisionMethodologyVersion',
        'boardPackVersion',
        'simulationSeed',
        'iterations',
        'planningHorizonYears',
        'sameGroupIndependentCoverage',
    ];
    foreach ($fields as $field) {
        if ($left[$field] !== $right[$field]) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', $message);
        }
    }
}

/**
 * Validates a saved Decision Lab result against its own arithmetic, the server-resolved
 * treatments, the active model and the configured appetite. Nothing is trusted because it
 * arrived from the browser.
 *
 * @param array<string,mixed> $payload
 * @param array<string,mixed> $appConfig
 * @return array<string,mixed>
 */
function qk_decision_validate_saved_result(array $payload, array $appConfig): array
{
    $selection = qk_decision_saved_map($payload['selection'] ?? null, 'The saved selection');
    $result = qk_decision_saved_map($payload['result'] ?? null, 'The decision result');
    $comparison = qk_decision_saved_map($selection['comparison'] ?? null, 'The saved comparison');

    if (qk_decision_canonical_json($result) !== qk_decision_canonical_json($comparison)) {
        throw new QkLiveHttpError(
            422,
            'VALIDATION_ERROR',
            'The saved result and the saved comparison do not describe the same analysis.'
        );
    }

    $baseline = qk_decision_saved_summary($result['baseline'] ?? null, 'The baseline');
    $treated = qk_decision_saved_summary($result['treated'] ?? null, 'The residual position');
    $delta = qk_decision_saved_map($result['delta'] ?? null, 'The modeled reduction');
    $deltaEal = qk_decision_number($delta['expectedAnnualLoss'] ?? null, 'The modeled EAL reduction', -1.0e15, 1.0e15);
    $deltaP90 = qk_decision_number($delta['p90'] ?? null, 'The modeled P90 reduction', -1.0e15, 1.0e15);
    $reductionShare = qk_decision_number($delta['reductionShare'] ?? null, 'The modeled reduction share', -1.0, 1.0);
    $baselineEal = (float) $baseline['expectedAnnualLoss'];
    $treatedEal = (float) $treated['expectedAnnualLoss'];

    qk_decision_assert_close(
        $deltaEal,
        $baselineEal - $treatedEal,
        'The modeled EAL reduction does not equal the difference between the baseline and residual EAL.'
    );
    qk_decision_assert_close(
        $deltaP90,
        (float) $baseline['p90'] - (float) $treated['p90'],
        'The modeled P90 reduction does not equal the difference between the baseline and residual P90.'
    );
    qk_decision_assert_close(
        $reductionShare,
        $baselineEal > 0.0 ? ($baselineEal - $treatedEal) / $baselineEal : 0.0,
        'The modeled reduction share is not consistent with the EAL figures.'
    );

    $cost = qk_decision_saved_cost($result['cost'] ?? null, 'The treatment cost');
    $rre = $result['riskReductionEfficiency'] ?? null;
    if ((float) $cost['annualisedTreatmentCost'] > 0.0) {
        $rreValue = qk_decision_number($rre, 'The risk reduction efficiency', -1.0e12, 1.0e12);
        qk_decision_assert_close(
            $rreValue,
            $deltaEal / (float) $cost['annualisedTreatmentCost'],
            'The risk reduction efficiency is not the modeled reduction per unit of annualised cost.'
        );
    } elseif ($rre !== null) {
        throw new QkLiveHttpError(
            422,
            'VALIDATION_ERROR',
            'Risk reduction efficiency must be null when no annualised cost was configured.'
        );
    }

    $provenance = qk_decision_saved_provenance($result['provenance'] ?? null);
    if ($provenance['effectModel'] !== QK_DECISION_EFFECT_MODEL) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The result names an unknown treatment-effect model.');
    }
    $manifest = qk_load_model($appConfig)->versionMeta();
    if ($provenance['quickriskModelId'] !== (string) $manifest['modelId']
        || $provenance['quickriskModelVersion'] !== (string) $manifest['modelVersion']) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The result was produced by a different QuickRisk model.');
    }
    if ($provenance['boardPackVersion'] !== QK_BOARD_PACK_VERSION) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The result names an unsupported Board Pack version.');
    }
    if ((int) $cost['horizonYears'] !== (int) $provenance['planningHorizonYears']) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The cost horizon does not match the result provenance.');
    }

    $seed = (int) qk_decision_number($payload['simulationSeed'] ?? null, 'The simulation seed', 1.0, 2147483646.0);
    $iterations = (int) qk_decision_number($payload['iterations'] ?? null, 'The iteration count', 1.0, 50000.0);
    $budget = qk_decision_compute_budget(qk_decision_config($appConfig));
    if ($iterations < $budget['minIterations'] || $iterations > $budget['maxIterations']) {
        throw new QkLiveHttpError(
            422,
            'VALIDATION_ERROR',
            'The iteration count is outside the anonymous compute budget.'
        );
    }
    if ($seed !== (int) $provenance['simulationSeed'] || $iterations !== (int) $provenance['iterations']) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The saved seed or iteration count does not match the result provenance.');
    }

    $modelId = qk_live_text($payload['quickriskModelId'] ?? null, 'The model id', 32, false);
    $modelVersion = qk_live_text($payload['quickriskModelVersion'] ?? null, 'The model version', 32, false);
    $decisionVersion = qk_live_text(
        $payload['decisionMethodologyVersion'] ?? null,
        'The Decision Lab methodology version',
        32,
        false
    );
    $boardVersion = qk_live_text($payload['boardPackVersion'] ?? null, 'The Board Pack version', 32, false);
    if ($modelId !== $provenance['quickriskModelId']
        || $modelVersion !== $provenance['quickriskModelVersion']
        || $decisionVersion !== $provenance['decisionMethodologyVersion']
        || $boardVersion !== $provenance['boardPackVersion']) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The saved provenance does not match the result provenance.');
    }

    $storedTreatments = qk_decision_saved_list($selection['treatments'] ?? null, 'The saved treatments');
    if (count($storedTreatments) > $budget['maxCandidates']) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The saved analysis contains too many treatments.');
    }
    $resolvedById = [];
    foreach ($storedTreatments as $stored) {
        $resolved = qk_decision_saved_treatment_resolved($stored, $appConfig);
        $id = (string) $resolved['id'];
        if (isset($resolvedById[$id])) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'Two saved treatments resolve to the same identity.');
        }
        $resolvedById[$id] = $resolved;
    }

    $resultTreatments = qk_decision_saved_list($result['treatments'] ?? null, 'The result treatments');
    if (count($resultTreatments) !== count($resolvedById)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The result treatment list does not match the saved treatments.');
    }
    $seen = [];
    foreach ($resultTreatments as $entry) {
        $entry = qk_decision_saved_map($entry, 'A result treatment');
        $id = qk_live_text($entry['id'] ?? null, 'A result treatment id', 64, false);
        if (!isset($resolvedById[$id]) || isset($seen[$id])) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The result treatment list does not match the saved treatments.');
        }
        if (qk_decision_canonical_json($entry) !== qk_decision_canonical_json($resolvedById[$id])) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A result treatment does not match its resolved definition.');
        }
        $seen[$id] = true;
    }
    if (qk_decision_canonical_json($storedTreatments) !== qk_decision_canonical_json($resultTreatments)) {
        throw new QkLiveHttpError(
            422,
            'VALIDATION_ERROR',
            'The saved treatment definitions do not match the result treatment definitions.'
        );
    }

    $expectedInitial = 0.0;
    $expectedAnnual = 0.0;
    $expectedDelay = 0;
    foreach ($resolvedById as $resolved) {
        $expectedInitial += (float) $resolved['initialCost']['amount'];
        $expectedAnnual += (float) $resolved['annualOperatingCost']['amount'];
        $expectedDelay = max($expectedDelay, (int) $resolved['implementationDelayDays']);
    }
    qk_decision_assert_close(
        (float) $cost['initialInvestment'],
        $expectedInitial,
        'The saved implementation cost does not equal the sum of the resolved treatment costs.'
    );
    qk_decision_assert_close(
        (float) $cost['annualOperatingCost'],
        $expectedAnnual,
        'The saved annual operating cost does not equal the sum of the resolved treatment costs.'
    );
    if ((int) $cost['implementationDelayDays'] !== $expectedDelay) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The saved implementation delay does not equal the longest treatment delay.');
    }

    $portfolios = $selection['portfolios'] ?? null;
    $search = null;
    $portfolioById = [];
    if ($portfolios !== null) {
        $portfolioData = qk_decision_saved_portfolio_search($portfolios);
        $search = $portfolioData['search'];
        $portfolioById = $portfolioData['byId'];
        qk_decision_assert_close(
            (float) $search['baseline']['expectedAnnualLoss'],
            $baselineEal,
            'The portfolio search baseline does not match the result baseline.'
        );
        qk_decision_assert_close(
            (float) $search['baseline']['p90'],
            (float) $baseline['p90'],
            'The portfolio search high-end baseline does not match the result baseline.'
        );
        qk_decision_assert_same_provenance(
            $provenance,
            qk_decision_saved_provenance($search['provenance'] ?? null),
            'The portfolio search provenance does not match the result provenance.'
        );
    }

    $recommended = $payload['recommended'] ?? null;
    if ($recommended !== null) {
        $recommended = qk_decision_saved_portfolio($recommended, 'The recommended portfolio');
        if ($search === null) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A recommended portfolio requires a saved portfolio search.');
        }
        $recommendedId = $search['recommendedId'] ?? null;
        if ($recommendedId === null || $recommendedId !== $recommended['id']) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The recommended portfolio is not the search recommendation.');
        }
        $row = $portfolioById[$recommended['id']] ?? null;
        if ($row === null || qk_decision_canonical_json($row) !== qk_decision_canonical_json($recommended)) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The recommended portfolio does not match its row in the search.');
        }

        $recommendedIds = array_map(static fn ($id): string => (string) $id, $recommended['treatmentIds']);
        sort($recommendedIds);
        $resultIds = array_keys($resolvedById);
        sort($resultIds);
        if ($recommendedIds !== $resultIds) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The recommended portfolio treatment set does not match the result.');
        }

        qk_decision_assert_close(
            (float) $recommended['treated']['expectedAnnualLoss'],
            $treatedEal,
            'The recommended portfolio residual EAL does not match the result.'
        );
        qk_decision_assert_close(
            (float) $recommended['treated']['p90'],
            (float) $treated['p90'],
            'The recommended portfolio high-end loss does not match the result.'
        );
        qk_decision_assert_close(
            (float) $recommended['cost']['initialInvestment'],
            (float) $cost['initialInvestment'],
            'The recommended portfolio investment does not match the result cost.'
        );
        qk_decision_assert_close(
            (float) $recommended['cost']['annualOperatingCost'],
            (float) $cost['annualOperatingCost'],
            'The recommended portfolio operating cost does not match the result cost.'
        );
        qk_decision_assert_close(
            (float) $recommended['cost']['annualisedTreatmentCost'],
            (float) $cost['annualisedTreatmentCost'],
            'The recommended portfolio annualised cost does not match the result cost.'
        );
        if ((int) $recommended['cost']['implementationDelayDays'] !== (int) $cost['implementationDelayDays']) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The recommended portfolio delay does not match the result cost.');
        }
        qk_decision_assert_close(
            (float) $recommended['reductionShare'],
            $reductionShare,
            'The recommended portfolio reduction share does not match the result.'
        );

        // Portfolio rows use the expected-annual-loss criterion only. The full comparison may
        // still be above appetite on high-end or exceedance criteria; those criteria are not
        // permitted to drive portfolio selection.
        $savedAppetite = qk_decision_appetite($payload['appetite'] ?? null);
        $portfolioCriteria = qk_decision_portfolio_appetite_criteria($savedAppetite);
        if ($portfolioCriteria === []) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A recommended portfolio requires an annual loss limit.');
        }
        qk_decision_validate_appetite_evaluation(
            $recommended['appetite'] ?? null,
            'The recommended portfolio appetite',
            $recommended['treated'],
            $portfolioCriteria
        );
        $recommendedPortfolioStatus = (string) ($recommended['appetite']['status'] ?? '');
        if (($recommended['withinAppetite'] ?? null) !== ($recommendedPortfolioStatus === 'within')) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The recommended portfolio within-appetite flag is inconsistent.');
        }
    }

    $appetite = qk_decision_appetite($payload['appetite'] ?? null);
    $criteria = qk_decision_appetite_criteria($appetite);
    $appetiteResult = qk_decision_saved_map($result['appetite'] ?? null, 'The appetite result');
    qk_decision_validate_appetite_evaluation(
        $appetiteResult['baseline'] ?? null,
        'The baseline appetite',
        $baseline,
        $criteria
    );
    qk_decision_validate_appetite_evaluation(
        $appetiteResult['treated'] ?? null,
        'The residual appetite',
        $treated,
        $criteria
    );
    $baselineStatus = (string) ($appetiteResult['baseline']['status'] ?? '');
    $treatedStatus = (string) ($appetiteResult['treated']['status'] ?? '');
    $improved = $appetiteResult['improved'] ?? null;
    if (!is_bool($improved)
        || $improved !== ($baselineStatus === 'above' && $treatedStatus === 'within')) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The appetite improvement flag does not match the criteria.');
    }

    $basis = qk_decision_saved_map($selection['reportBasis'] ?? null, 'The report basis');
    $kind = (string) ($basis['kind'] ?? '');
    if (!in_array($kind, ['comparison', 'recommended-portfolio'], true)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The report basis kind is not recognised.');
    }
    $state = (string) ($basis['recommendationState'] ?? '');
    if (!in_array($state, ['recommended', 'none-satisfies', 'evaluated-other', 'not-evaluated'], true)) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The report recommendation state is not recognised.');
    }
    qk_live_text($basis['inputKey'] ?? null, 'The analysis input key', 100000, false);

    $basisIds = qk_decision_saved_list($basis['treatmentIds'] ?? null, 'The report-basis treatment ids');
    $normalisedBasisIds = [];
    foreach ($basisIds as $basisId) {
        $normalisedBasisIds[] = qk_live_text($basisId, 'A report-basis treatment id', 64, false);
    }
    sort($normalisedBasisIds);
    $resultIdsForBasis = array_keys($resolvedById);
    sort($resultIdsForBasis);
    if ($normalisedBasisIds !== $resultIdsForBasis) {
        throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The report-basis treatment ids do not match the result treatment set.');
    }

    if ($kind === 'recommended-portfolio') {
        if ($state !== 'recommended' || $recommended === null) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A recommended-portfolio report must carry the recommended analysis.');
        }
    } else {
        if ($recommended !== null) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'A comparison report must not carry a portfolio recommendation.');
        }
        $expectedState = $search === null
            ? 'not-evaluated'
            : ($search['noneSatisfies'] === true ? 'none-satisfies' : 'evaluated-other');
        if ($state !== $expectedState) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The report recommendation state does not match the saved portfolio search.');
        }
    }

    $sensitivity = $selection['sensitivity'] ?? null;
    if ($sensitivity !== null) {
        $sensitivity = qk_decision_saved_map($sensitivity, 'The saved sensitivity');
        if (!is_bool($sensitivity['available'] ?? null)) {
            throw new QkLiveHttpError(422, 'VALIDATION_ERROR', 'The saved sensitivity availability flag must be true or false.');
        }
        $curve = qk_decision_saved_list($sensitivity['curve'] ?? null, 'The saved sensitivity curve');
        foreach ($curve as $point) {
            $point = qk_decision_saved_map($point, 'A sensitivity point');
            qk_decision_number($point['effectiveness'] ?? null, 'A sensitivity effectiveness', 0.0, 1.0);
            qk_decision_number($point['expectedAnnualLoss'] ?? null, 'A sensitivity expected annual loss', 0.0, 1.0e15);
        }
    }

    return [
        'result' => $result,
        'selection' => $selection,
        'recommended' => $recommended,
        'appetite' => $appetite,
        'baselineEal' => $baselineEal,
        'treatedEal' => $treatedEal,
        'initialInvestment' => (float) $cost['initialInvestment'],
        'annualOperatingCost' => (float) $cost['annualOperatingCost'],
        'status' => $treatedStatus,
        'simulationSeed' => $seed,
        'iterations' => $iterations,
        'decisionVersion' => $decisionVersion,
        'boardPackVersion' => $boardVersion,
        'quickriskModelId' => $modelId,
        'quickriskModelVersion' => $modelVersion,
    ];
}

