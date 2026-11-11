<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — decision engine.
 *
 * Deterministic decision rules over the paired loss vectors produced by the QuickRisk engine.
 * Nothing here simulates: every figure is a statistic of already-simulated years, so a
 * comparison is reproducible for a given seed, iteration count and set of treatments.
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/treatment_adapter.php';
require_once dirname(__DIR__) . '/percentile.php';

/**
 * The loss thresholds a Decision Lab summary must carry.
 *
 * The model's own thresholds are always included. The appetite annual loss limit is added as
 * well, so the probability criterion is evaluated at the threshold the user actually set
 * instead of at the nearest model threshold.
 *
 * @param array<string,mixed> $vectors
 * @param array<string,mixed>|null $appetite
 * @return array<int,float>
 */
function qk_decision_thresholds(array $vectors, ?array $appetite): array
{
    $thresholds = array_map(static fn ($value): float => (float) $value, (array) $vectors['meta']['thresholds']);

    if ($appetite !== null && is_numeric($appetite['annualLossLimit'] ?? null)) {
        $limit = (float) $appetite['annualLossLimit'];
        if ($limit > 0) {
            $thresholds[] = $limit;
        }
    }
    if ($appetite !== null && is_numeric($appetite['exceedanceThreshold'] ?? null)) {
        $candidate = (float) $appetite['exceedanceThreshold'];
        if ($candidate > 0) {
            $thresholds[] = $candidate;
        }
    }

    $thresholds = array_values(array_unique($thresholds));
    sort($thresholds);

    return $thresholds;
}

/**
 * Summarises a loss sample.
 *
 * @param array<int,float> $losses
 * @param array<int,float> $thresholds
 * @return array<string,mixed>
 */
function qk_decision_summary(array $losses, array $thresholds): array
{
    $sorted = QkPercentile::sorted($losses);
    $iterations = count($losses);

    $exceedance = [];
    $counts = [];
    foreach ($thresholds as $threshold) {
        $probability = QkPercentile::probabilityGreaterThan($sorted, (float) $threshold);
        $key = (string) (int) $threshold;
        $exceedance[$key] = $probability;
        $counts[$key] = (int) round($probability * $iterations);
    }

    return [
        'expectedAnnualLoss' => QkPercentile::mean($losses),
        'p10' => QkPercentile::percentile($sorted, 0.10),
        'p25' => QkPercentile::percentile($sorted, 0.25),
        'p50' => QkPercentile::percentile($sorted, 0.50),
        'p75' => QkPercentile::percentile($sorted, 0.75),
        'p90' => QkPercentile::percentile($sorted, 0.90),
        'minimum' => $sorted === [] ? 0.0 : (float) $sorted[0],
        'maximum' => $sorted === [] ? 0.0 : (float) $sorted[$iterations - 1],
        'iterations' => $iterations,
        'thresholdProbabilities' => $exceedance,
        'thresholdExceedanceCounts' => $counts,
    ];
}

/**
 * Builds the portfolio loss sample from the paired scenario vectors.
 *
 * @param array<string,mixed> $vectors
 * @param array<string,float> $kappa factor per scenario code
 * @param array<int,float> $thresholds
 * @return array<string,mixed>
 */
function qk_decision_portfolio_metrics(array $vectors, array $kappa, array $thresholds): array
{
    $iterations = (int) $vectors['meta']['iterations'];
    $totals = array_fill(0, $iterations, 0.0);
    $contributions = [];

    foreach ($vectors['scenarios'] as $scenario) {
        $code = (string) $scenario['code'];
        $factor = (float) ($kappa[$code] ?? 1.0);
        $losses = $scenario['losses'];
        $sum = 0.0;
        for ($index = 0; $index < $iterations; $index++) {
            $value = $factor * (float) $losses[$index];
            $totals[$index] += $value;
            $sum += $value;
        }
        $contributions[] = [
            'code' => $code,
            'name' => (string) $scenario['name'],
            'shortLabel' => (string) $scenario['shortLabel'],
            'expectedAnnualLoss' => $iterations > 0 ? $sum / $iterations : 0.0,
            'factor' => $factor,
        ];
    }

    $summary = qk_decision_summary($totals, $thresholds);
    $summary['scenarioContributions'] = $contributions;

    return $summary;
}

/**
 * The criteria the user actually configured, in evaluation order.
 *
 * @param array<string,mixed>|null $appetite
 * @return array<int,array<string,mixed>>
 */
function qk_decision_appetite_criteria(?array $appetite): array
{
    if ($appetite === null) {
        return [];
    }

    $criteria = [];
    $annualLimit = $appetite['annualLossLimit'] ?? null;
    $highEndLimit = $appetite['highEndLimit'] ?? null;
    $maxProbability = $appetite['maxExceedanceProbability'] ?? null;

    if (is_numeric($annualLimit) && (float) $annualLimit > 0) {
        $criteria[] = [
            'id' => 'annualLoss',
            'label' => 'Expected annual loss',
            'limit' => (float) $annualLimit,
            'unit' => 'currency',
        ];
    }
    if (is_numeric($highEndLimit) && (float) $highEndLimit > 0) {
        $criteria[] = [
            'id' => 'highEndLoss',
            'label' => 'High-end modeled loss',
            'limit' => (float) $highEndLimit,
            'unit' => 'currency',
        ];
    }
    if (is_numeric($maxProbability) && (float) $maxProbability > 0 && (float) $maxProbability <= 1) {
        // The threshold for the probability criterion is the annual loss limit when one is
        // configured; otherwise an explicit threshold must be supplied. It is never invented.
        $threshold = null;
        if (is_numeric($annualLimit) && (float) $annualLimit > 0) {
            $threshold = (float) $annualLimit;
        } elseif (is_numeric($appetite['exceedanceThreshold'] ?? null)) {
            $threshold = (float) $appetite['exceedanceThreshold'];
        }
        if ($threshold !== null) {
            $criteria[] = [
                'id' => 'exceedanceProbability',
                'label' => 'Probability of exceeding the annual loss limit',
                'limit' => (float) $maxProbability,
                'unit' => 'probability',
                'threshold' => $threshold,
            ];
        }
    }

    return $criteria;
}

/**
 * Evaluates configured appetite criteria against a summary.
 *
 * @param array<string,mixed> $summary
 * @param array<int,array<string,mixed>> $criteria
 * @return array<string,mixed>
 */
function qk_decision_evaluate_appetite_criteria(array $summary, array $criteria): array
{
    if ($criteria === []) {
        return [
            'status' => 'undefined',
            'label' => 'Risk appetite has not been defined',
            'message' => 'Risk appetite has not been defined.',
            'criteria' => [],
        ];
    }

    $evaluated = [];
    $allPass = true;

    foreach ($criteria as $criterion) {
        $id = (string) $criterion['id'];
        if ($id === 'annualLoss') {
            $actual = (float) $summary['expectedAnnualLoss'];
        } elseif ($id === 'highEndLoss') {
            $actual = (float) $summary['p90'];
        } else {
            $threshold = (float) $criterion['threshold'];
            $actual = (float) ($summary['thresholdProbabilities'][(string) (int) $threshold] ?? 0.0);
        }

        $passes = $actual <= (float) $criterion['limit'] + 1.0e-9;
        $allPass = $allPass && $passes;

        $evaluated[] = [
            'id' => $id,
            'label' => (string) $criterion['label'],
            'limit' => (float) $criterion['limit'],
            'actual' => $actual,
            'unit' => (string) $criterion['unit'],
            'passes' => $passes,
            'threshold' => isset($criterion['threshold']) ? (float) $criterion['threshold'] : null,
        ];
    }

    return [
        'status' => $allPass ? 'within' : 'above',
        'label' => $allPass ? 'Within appetite' : 'Above appetite',
        'message' => '',
        'criteria' => $evaluated,
    ];
}

/**
 * Cost model: implementation cost and annual operating cost stay separate.
 *
 * @param array<int,array<string,mixed>> $treatments
 * @param array<string,mixed> $config
 * @return array<string,mixed>
 */
function qk_decision_cost(array $treatments, array $config): array
{
    $initial = 0.0;
    $annual = 0.0;
    $delayDays = 0;

    foreach ($treatments as $treatment) {
        $initial += (float) ($treatment['initialCost']['amount'] ?? 0.0);
        $annual += (float) ($treatment['annualOperatingCost']['amount'] ?? 0.0);
        $delayDays = max($delayDays, (int) ($treatment['implementationDelayDays'] ?? 0));
    }

    $horizon = max(1, (int) ($config['planningHorizonYears'] ?? 3));
    $annualised = $annual + $initial / $horizon;

    return [
        'initialInvestment' => $initial,
        'annualOperatingCost' => $annual,
        'horizonYears' => $horizon,
        'annualisedTreatmentCost' => $annualised,
        'implementationDelayDays' => $delayDays,
    ];
}

/**
 * Risk Reduction Efficiency: modeled annual loss reduction per unit of annualised cost.
 *
 * Deliberately not called ROI: it is not a financial return.
 *
 * @param array<string,mixed> $cost
 */
function qk_decision_risk_reduction_efficiency(float $deltaEal, array $cost): ?float
{
    $annualised = (float) $cost['annualisedTreatmentCost'];
    if ($annualised <= 0.0) {
        return null;
    }

    return $deltaEal / $annualised;
}

/**
 * Splits the modelled exposure into the current, transition and steady-state periods.
 *
 * A treatment that takes 180 days to become effective cannot reduce the exposure of the days
 * before it is in place.
 *
 * @param array<string,mixed> $cost
 * @return array<string,mixed>
 */
function qk_decision_delay_phases(float $baselineEal, float $treatedEal, array $cost): array
{
    $delayDays = (int) $cost['implementationDelayDays'];
    $fractionOfYearAtRisk = min(1.0, max(0.0, $delayDays / 365.0));
    $transitionEal = $baselineEal * $fractionOfYearAtRisk + $treatedEal * (1.0 - $fractionOfYearAtRisk);

    return [
        'implementationDelayDays' => $delayDays,
        'currentEal' => $baselineEal,
        'transitionYearEal' => $transitionEal,
        'steadyStateEal' => $treatedEal,
        'effectiveWithinOneYear' => $delayDays <= 365,
    ];
}


/**
 * Compares the baseline against a selected set of treatments.
 *
 * @param array<string,mixed> $vectors
 * @param array<int,array<string,mixed>> $treatments resolved treatment definitions
 * @param array<string,mixed> $realised output of qk_decision_realise_effects()
 * @param array<string,mixed>|null $appetite
 * @param array<string,mixed> $config
 * @return array<string,mixed>
 */
function qk_decision_compare(
    array $vectors,
    array $treatments,
    array $realised,
    ?array $appetite,
    array $config
): array {
    $thresholds = qk_decision_thresholds($vectors, $appetite);
    $baselineFactors = [];
    foreach ($vectors['scenarios'] as $scenario) {
        $baselineFactors[(string) $scenario['code']] = 1.0;
    }

    $baseline = qk_decision_portfolio_metrics($vectors, $baselineFactors, $thresholds);
    $factors = qk_decision_scenario_factors($vectors, $treatments, $realised['effects'], $config);

    $kappa = [];
    foreach ($factors['byScenario'] as $code => $entry) {
        $kappa[(string) $code] = (float) $entry['kappa'];
    }
    $treated = qk_decision_portfolio_metrics($vectors, $kappa, $thresholds);

    $criteria = qk_decision_appetite_criteria($appetite);
    $baselineAppetite = qk_decision_evaluate_appetite_criteria($baseline, $criteria);
    $treatedAppetite = qk_decision_evaluate_appetite_criteria($treated, $criteria);

    $cost = qk_decision_cost($treatments, $config);
    $deltaEal = (float) $baseline['expectedAnnualLoss'] - (float) $treated['expectedAnnualLoss'];
    $deltaP90 = (float) $baseline['p90'] - (float) $treated['p90'];
    $reductionShare = (float) $baseline['expectedAnnualLoss'] > 0.0
        ? $deltaEal / (float) $baseline['expectedAnnualLoss']
        : 0.0;

    return [
        'baseline' => $baseline,
        'treated' => $treated,
        'delta' => [
            'expectedAnnualLoss' => $deltaEal,
            'p90' => $deltaP90,
            'reductionShare' => $reductionShare,
        ],
        'appetite' => [
            'baseline' => $baselineAppetite,
            'treated' => $treatedAppetite,
            'improved' => $baselineAppetite['status'] === 'above' && $treatedAppetite['status'] === 'within',
        ],
        'cost' => $cost,
        'delayPhases' => qk_decision_delay_phases(
            (float) $baseline['expectedAnnualLoss'],
            (float) $treated['expectedAnnualLoss'],
            $cost
        ),
        'riskReductionEfficiency' => qk_decision_risk_reduction_efficiency($deltaEal, $cost),
        'factors' => $factors,
        'effects' => $realised,
        'treatmentIds' => array_values(array_map(static fn (array $t): string => (string) $t['id'], $treatments)),
    ];
}

/**
 * Total first-year cost used for ranking: implementation plus one year of operation.
 *
 * @param array<string,mixed> $cost
 */
function qk_decision_total_cost(array $cost): float
{
    return (float) $cost['initialInvestment'] + (float) $cost['annualOperatingCost'];
}

/**
 * Deterministic comparison of two evaluated portfolios; lower is better.
 *
 * @param array<string,mixed> $left
 * @param array<string,mixed> $right
 */
function qk_decision_rank_compare(array $left, array $right): int
{
    $byCost = qk_decision_total_cost($left['cost']) <=> qk_decision_total_cost($right['cost']);
    if ($byCost !== 0) {
        return $byCost;
    }
    $byEal = (float) $left['treated']['expectedAnnualLoss'] <=> (float) $right['treated']['expectedAnnualLoss'];
    if ($byEal !== 0) {
        return $byEal;
    }
    $byP90 = (float) $left['treated']['p90'] <=> (float) $right['treated']['p90'];
    if ($byP90 !== 0) {
        return $byP90;
    }

    return (int) $left['cost']['implementationDelayDays'] <=> (int) $right['cost']['implementationDelayDays'];
}


/**
 * Exhaustive enumeration of treatment portfolios.
 *
 * Deterministic: candidates are used in the supplied order, masks are evaluated in ascending
 * order, and ranking uses the documented tie-breakers (cost, EAL, P90, implementation delay).
 *
 * @param array<string,mixed> $vectors
 * @param array<int,array<string,mixed>> $candidates
 * @param array<string,mixed> $realised
 * @param array<string,mixed>|null $appetite
 * @param array<string,mixed> $constraints
 * @param array<string,mixed> $config
 * @return array<string,mixed>
 */
function qk_decision_portfolio_search(
    array $vectors,
    array $candidates,
    array $realised,
    ?array $appetite,
    array $constraints,
    array $config
): array {
    $maxCandidates = (int) ($config['maxCandidates'] ?? 10);
    $candidates = array_slice($candidates, 0, $maxCandidates);
    $maxPortfolios = (int) ($config['maxPortfolios'] ?? 4096);
    $count = count($candidates);
    $total = 1 << $count;
    $truncated = $total > $maxPortfolios;

    $thresholds = qk_decision_thresholds($vectors, $appetite);
    $baselineFactors = [];
    foreach ($vectors['scenarios'] as $scenario) {
        $baselineFactors[(string) $scenario['code']] = 1.0;
    }
    $baseline = qk_decision_portfolio_metrics($vectors, $baselineFactors, $thresholds);
    $criteria = qk_decision_appetite_criteria($appetite);

    $budget = is_numeric($constraints['maxInitialInvestment'] ?? null)
        ? (float) $constraints['maxInitialInvestment']
        : null;
    $deadlineDays = is_numeric($constraints['implementationDeadlineDays'] ?? null)
        ? (int) $constraints['implementationDeadlineDays']
        : null;

    $portfolios = [];
    for ($mask = 0; $mask < $total && $mask < $maxPortfolios; $mask++) {
        $subset = [];
        for ($index = 0; $index < $count; $index++) {
            if (($mask & (1 << $index)) !== 0) {
                $subset[] = $candidates[$index];
            }
        }

        $factors = qk_decision_scenario_factors($vectors, $subset, $realised['effects'], $config);
        $kappa = [];
        foreach ($factors['byScenario'] as $code => $entry) {
            $kappa[(string) $code] = (float) $entry['kappa'];
        }
        $metrics = qk_decision_portfolio_metrics($vectors, $kappa, $thresholds);
        $cost = qk_decision_cost($subset, $config);
        $appetiteResult = qk_decision_evaluate_appetite_criteria($metrics, $criteria);

        $violations = [];
        if ($budget !== null && (float) $cost['initialInvestment'] > $budget + 1.0e-9) {
            $violations[] = 'Initial investment exceeds the budget.';
        }
        if ($deadlineDays !== null && (int) $cost['implementationDelayDays'] > $deadlineDays) {
            $violations[] = 'Implementation delay exceeds the deadline.';
        }

        $deltaEal = (float) $baseline['expectedAnnualLoss'] - (float) $metrics['expectedAnnualLoss'];
        $portfolios[] = [
            'id' => 'p' . $mask,
            'treatmentIds' => array_values(array_map(static fn (array $t): string => (string) $t['id'], $subset)),
            'cost' => $cost,
            'treated' => $metrics,
            'deltaEal' => $deltaEal,
            'reductionShare' => (float) $baseline['expectedAnnualLoss'] > 0.0
                ? $deltaEal / (float) $baseline['expectedAnnualLoss']
                : 0.0,
            'appetite' => $appetiteResult,
            'withinAppetite' => $appetiteResult['status'] === 'within',
            'constraintViolations' => $violations,
            'clampWarning' => $factors['clampWarning'],
        ];
    }

    $labelled = qk_decision_label_portfolios($portfolios, $config);

    return [
        'baseline' => $baseline,
        'portfolios' => $labelled['portfolios'],
        'recommendedId' => $labelled['recommendedId'],
        'paretoIds' => $labelled['paretoIds'],
        'noneSatisfies' => $labelled['noneSatisfies'],
        'noneSatisfiesMessage' => $labelled['noneSatisfiesMessage'],
        'evaluated' => count($portfolios),
        'truncated' => $truncated,
        'candidatesConsidered' => $count,
        'appetiteDefined' => $criteria !== [],
        'notes' => $truncated
            ? ['The candidate set was truncated to the configured maximum of ' . $maxCandidates . ' treatments.']
            : [],
    ];
}

/**
 * Applies the deterministic recommendation labels.
 *
 * Labels (documented in docs/QUICKRISK_DECISION_LAB.md):
 *   Recommended               lowest-cost feasible portfolio meeting every configured criterion
 *   Viable alternative        another feasible portfolio that also meets appetite
 *   High value / above appetite  on the Pareto frontier but still above appetite
 *   Dominated                 a cheaper portfolio is no riskier
 *   Infeasible                violates a stated constraint (budget or implementation deadline)
 *
 * @param array<int,array<string,mixed>> $portfolios
 * @param array<string,mixed> $config
 * @return array<string,mixed>
 */
function qk_decision_label_portfolios(array $portfolios, array $config): array
{
    $feasible = [];
    foreach ($portfolios as $portfolio) {
        if ($portfolio['constraintViolations'] === []) {
            $feasible[] = $portfolio;
        }
    }

    $within = array_values(array_filter(
        $feasible,
        static fn (array $portfolio): bool => $portfolio['withinAppetite'] === true
    ));
    usort($within, 'qk_decision_rank_compare');
    $recommendedId = $within[0]['id'] ?? null;

    $paretoIds = qk_decision_pareto($feasible);

    $labelled = [];
    foreach ($portfolios as $portfolio) {
        if ($portfolio['constraintViolations'] !== []) {
            $label = 'infeasible';
            $reason = implode(' ', $portfolio['constraintViolations']);
        } elseif ($portfolio['id'] === $recommendedId) {
            $label = 'recommended';
            $reason = 'Lowest-cost evaluated portfolio that satisfies the stated risk appetite and constraints.';
        } elseif ($portfolio['withinAppetite'] === true) {
            $label = 'viable';
            $reason = 'Also satisfies the stated risk appetite, at a different cost or trade-off.';
        } elseif (in_array($portfolio['id'], $paretoIds, true)) {
            $label = 'high_value';
            $reason = 'Best available trade-off among the evaluated options, but still above the stated risk appetite.';
        } else {
            $label = 'dominated';
            $reason = 'Another evaluated portfolio is no more expensive and no riskier.';
        }

        $portfolio['label'] = $label;
        $portfolio['labelText'] = QK_DECISION_LABELS[$label] ?? $label;
        $portfolio['labelReason'] = $reason;
        $labelled[] = $portfolio;
    }

    $order = ['recommended' => 0, 'viable' => 1, 'high_value' => 2, 'dominated' => 3, 'infeasible' => 4];
    usort($labelled, static function (array $left, array $right) use ($order): int {
        $byLabel = ($order[$left['label']] ?? 9) <=> ($order[$right['label']] ?? 9);

        return $byLabel !== 0 ? $byLabel : qk_decision_rank_compare($left, $right);
    });

    return [
        'portfolios' => $labelled,
        'recommendedId' => $recommendedId,
        'paretoIds' => $paretoIds,
        'noneSatisfies' => $recommendedId === null,
        'noneSatisfiesMessage' => $recommendedId === null
            ? 'No evaluated portfolio satisfies the selected risk appetite within the stated constraints.'
            : '',
    ];
}

/**
 * Pareto-efficient portfolios over (total first-year cost, residual expected annual loss).
 *
 * @param array<int,array<string,mixed>> $portfolios
 * @return array<int,string>
 */
function qk_decision_pareto(array $portfolios): array
{
    $ids = [];
    foreach ($portfolios as $candidate) {
        $candidateCost = qk_decision_total_cost($candidate['cost']);
        $candidateEal = (float) $candidate['treated']['expectedAnnualLoss'];
        $dominated = false;

        foreach ($portfolios as $other) {
            if ($other['id'] === $candidate['id']) {
                continue;
            }
            $otherCost = qk_decision_total_cost($other['cost']);
            $otherEal = (float) $other['treated']['expectedAnnualLoss'];
            $noWorse = $otherCost <= $candidateCost + 1.0e-9 && $otherEal <= $candidateEal + 1.0e-9;
            $strictlyBetter = $otherCost < $candidateCost - 1.0e-9 || $otherEal < $candidateEal - 1.0e-9;
            if ($noWorse && $strictlyBetter) {
                $dominated = true;
                break;
            }
        }

        if (!$dominated) {
            $ids[] = (string) $candidate['id'];
        }
    }

    return $ids;
}


/**
 * Break-even effectiveness: the smallest modelled effectiveness that reaches appetite.
 *
 * Every point on the curve is a model evaluation on the same paired sample; the break-even
 * value comes from bisection over those evaluations, never from interpolating two numbers.
 *
 * @param array<string,mixed> $vectors
 * @param array<int,array<string,mixed>> $treatments
 * @param array<string,mixed> $realised
 * @param array<string,mixed>|null $appetite
 * @param array<string,mixed> $config
 * @return array<string,mixed>
 */
function qk_decision_sensitivity(
    array $vectors,
    array $treatments,
    array $realised,
    ?array $appetite,
    array $config
): array {
    $criteria = qk_decision_appetite_criteria($appetite);
    if ($criteria === []) {
        return [
            'available' => false,
            'reason' => 'Risk appetite has not been defined, so a break-even effectiveness cannot be calculated.',
            'curve' => [],
            'breakEvenEffectiveness' => null,
        ];
    }

    $thresholds = qk_decision_thresholds($vectors, $appetite);
    $evaluate = static function (float $scale) use ($vectors, $treatments, $realised, $criteria, $config, $thresholds): array {
        $scaled = [];
        foreach ($realised['effects'] as $id => $effect) {
            $scaled[$id] = [
                'frequency' => $effect['frequency'] === null ? null : min(0.99, (float) $effect['frequency'] * $scale),
                'magnitude' => $effect['magnitude'] === null ? null : min(0.99, (float) $effect['magnitude'] * $scale),
            ];
        }
        $factors = qk_decision_scenario_factors($vectors, $treatments, $scaled, $config);
        $kappa = [];
        foreach ($factors['byScenario'] as $code => $entry) {
            $kappa[(string) $code] = (float) $entry['kappa'];
        }
        $metrics = qk_decision_portfolio_metrics($vectors, $kappa, $thresholds);

        return [
            'effectiveness' => $scale,
            'expectedAnnualLoss' => (float) $metrics['expectedAnnualLoss'],
            'p90' => (float) $metrics['p90'],
            'appetite' => qk_decision_evaluate_appetite_criteria($metrics, $criteria),
        ];
    };

    $baselineFactors = [];
    foreach ($vectors['scenarios'] as $scenario) {
        $baselineFactors[(string) $scenario['code']] = 1.0;
    }
    $baseline = qk_decision_portfolio_metrics($vectors, $baselineFactors, $thresholds);
    $baselineAppetite = qk_decision_evaluate_appetite_criteria($baseline, $criteria);

    $curve = [];
    foreach ([0.0, 0.2, 0.4, 0.6, 0.8, 1.0] as $point) {
        $curve[] = $evaluate($point);
    }

    if ($baselineAppetite['status'] === 'within') {
        return [
            'available' => true,
            'alreadyWithinAppetite' => true,
            'breakEvenEffectiveness' => 0.0,
            'message' => 'Current exposure is already within the stated risk appetite.',
            'curve' => $curve,
        ];
    }

    $atFull = $evaluate(1.0);
    if ($atFull['appetite']['status'] !== 'within') {
        return [
            'available' => true,
            'alreadyWithinAppetite' => false,
            'breakEvenEffectiveness' => null,
            'message' => 'Even at full modelled effectiveness, this option does not reach the stated risk appetite.',
            'curve' => $curve,
        ];
    }

    $tolerance = (float) ($config['breakEvenTolerance'] ?? 0.005);
    $maxIterations = (int) ($config['breakEvenIterations'] ?? 14);
    $low = 0.0;
    $high = 1.0;
    for ($iteration = 0; $iteration < $maxIterations && ($high - $low) > $tolerance; $iteration++) {
        $mid = ($low + $high) / 2.0;
        if ($evaluate($mid)['appetite']['status'] === 'within') {
            $high = $mid;
        } else {
            $low = $mid;
        }
    }

    // Reported to one hundredth and rounded up, so the published break-even value is itself a
    // value that satisfies the appetite (rounding down would report a failing effectiveness).
    $breakEven = min(1.0, ceil($high * 100.0) / 100.0);

    return [
        'available' => true,
        'alreadyWithinAppetite' => false,
        'breakEvenEffectiveness' => $breakEven,
        'message' => 'Break-even modeled effectiveness: approximately '
            . number_format($breakEven * 100.0, 0) . '%.',
        'curve' => $curve,
    ];
}

