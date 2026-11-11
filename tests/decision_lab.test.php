<?php

declare(strict_types=1);

/**
 * QuickRisk Decision Lab — methodology and decision-rule tests.
 *
 * These tests exercise the real engine and the real model. They pin the properties the
 * requirements make mandatory: determinism, paired comparison, "no treatment = baseline",
 * driver-level treatment mapping, appetite evaluation, the deterministic portfolio rules, the
 * Pareto frontier and break-even sensitivity.
 */

require_once dirname(__DIR__) . '/server/includes/decision/decision_engine.php';
require_once dirname(__DIR__) . '/server/includes/decision/treatment_library.php';
require_once dirname(__DIR__) . '/server/includes/decision/treatment_adapter.php';
require_once dirname(__DIR__) . '/server/includes/fair_engine.php';

/** A representative appetite that the modeled baseline exceeds. */
function qk_decision_test_appetite(float $annualLimit = 250000.0, float $highEndLimit = 900000.0): array
{
    return [
        'annualLossLimit' => $annualLimit,
        'highEndLimit' => $highEndLimit,
        'maxExceedanceProbability' => 0.25,
    ];
}

/**
 * Runs one Decision Lab comparison for the standard test profile.
 *
 * @param array<int,string> $treatmentIds
 * @return array<string,mixed>
 */
function qk_decision_test_compare(
    array $treatmentIds,
    ?array $appetite = null,
    int $seed = 20261107,
    int $iterations = 5000
): array {
    $model = qk_test_model();
    $config = qk_decision_config(qk_config());
    $validated = QkValidation::validatePayload($model, qk_test_payload(qk_test_profile()));

    $treatments = [];
    foreach ($treatmentIds as $id) {
        $treatment = qk_decision_curated_treatment($id);
        assertTrue($treatment !== null, 'The curated treatment must exist: ' . $id);
        $treatments[] = $treatment;
    }

    $vectors = FairEngine::lossVectors($model, $validated, $seed, $iterations);
    $realised = qk_decision_realise_effects($treatments, $seed);

    return [
        'vectors' => $vectors,
        'realised' => $realised,
        'result' => qk_decision_compare($vectors, $treatments, $realised, $appetite, $config),
        'config' => $config,
        'validated' => $validated,
    ];
}

/**
 * Five curated treatments used by the portfolio tests.
 *
 * @return array<int,array<string,mixed>>
 */
function qk_decision_test_candidates(array $ids = ['edr', 'immutable-backup', 'privileged-mfa', 'incident-response', 'network-segmentation']): array
{
    $candidates = [];
    foreach ($ids as $id) {
        $candidates[] = qk_decision_curated_treatment($id);
    }

    return $candidates;
}

return [
    'decision lab: no treatment reproduces the baseline exactly' => function (): void {
        $result = qk_decision_test_compare([])['result'];

        assertSame(
            $result['baseline']['expectedAnnualLoss'],
            $result['treated']['expectedAnnualLoss'],
            'An empty portfolio must leave the expected annual loss unchanged'
        );
        assertSame($result['baseline']['p90'], $result['treated']['p90'], 'The high-end modeled loss must be unchanged');
        assertSame(0.0, (float) $result['delta']['expectedAnnualLoss'], 'The modeled reduction must be exactly zero');
        assertSame(0.0, (float) $result['delta']['reductionShare'], 'The reduction share must be exactly zero');
    },

    'decision lab: the paired vectors match the published assessment figures' => function (): void {
        $model = qk_test_model();
        $validated = QkValidation::validatePayload($model, qk_test_payload(qk_test_profile()));
        $vectors = FairEngine::lossVectors($model, $validated, 20261029, 5000);
        $assessment = FairEngine::calculateAssessment($model, $validated, 20261029, 5000);

        $summary = qk_decision_portfolio_metrics(
            $vectors,
            array_fill_keys((array) $vectors['meta']['scenarioOrder'], 1.0),
            (array) $vectors['meta']['thresholds']
        );

        $expected = 0.0;
        foreach ($assessment['scenarios'] as $scenario) {
            $expected += (float) $scenario['statistics']['expectedAnnualLoss'];
        }
        assertTrue(
            abs((float) $summary['expectedAnnualLoss'] - $expected) < 1.0e-6,
            'The Decision Lab baseline must equal the sum of the assessment scenario expectations'
        );

        foreach ($assessment['scenarios'] as $scenario) {
            foreach ($vectors['scenarios'] as $vectorScenario) {
                if ($vectorScenario['code'] !== $scenario['code']) {
                    continue;
                }
                $mean = array_sum($vectorScenario['losses']) / count($vectorScenario['losses']);
                assertTrue(
                    abs($mean - (float) $scenario['statistics']['expectedAnnualLoss']) < 1.0e-6,
                    'The paired loss vector must reproduce the assessment for ' . $scenario['code']
                );
            }
        }
    },

    'decision lab: the same seed produces identical results' => function (): void {
        $first = qk_decision_test_compare(['edr', 'immutable-backup'], qk_decision_test_appetite(), 424242);
        $second = qk_decision_test_compare(['edr', 'immutable-backup'], qk_decision_test_appetite(), 424242);

        assertSame(
            $first['result']['treated']['expectedAnnualLoss'],
            $second['result']['treated']['expectedAnnualLoss'],
            'The same seed must produce the same treated expected annual loss'
        );
        assertSame(
            $first['result']['delta']['expectedAnnualLoss'],
            $second['result']['delta']['expectedAnnualLoss'],
            'The same seed must produce the same modeled reduction'
        );
        assertSame($first['result']['effects'], $second['result']['effects'], 'The same seed must realise the same effects');

        $other = qk_decision_test_compare(['edr', 'immutable-backup'], qk_decision_test_appetite(), 999);
        assertTrue(
            $other['result']['effects'] !== $first['result']['effects'],
            'A different seed must produce a different treatment realisation'
        );
    },

    'decision lab: a treatment acts on the drivers of the scenarios it applies to' => function (): void {
        $result = qk_decision_test_compare(['immutable-backup'])['result'];
        $factors = $result['factors']['byScenario'];

        assertTrue((float) $result['delta']['expectedAnnualLoss'] > 0.0, 'The treatment must reduce the modeled loss');
        assertTrue(
            (float) $factors['S1']['magnitudeFactor'] < 1.0,
            'A loss-magnitude treatment must scale the magnitude driver of an applicable scenario'
        );
        assertSame(
            1.0,
            (float) $factors['S5']['magnitudeFactor'],
            'A treatment must not affect a scenario it does not apply to'
        );
        assertSame(
            1.0,
            (float) $factors['S1']['frequencyFactor'],
            'A magnitude-only treatment must leave the frequency driver unchanged'
        );

        foreach ($factors as $entry) {
            assertTrue(
                abs((float) $entry['kappa'] - ((float) $entry['frequencyFactor'] * (float) $entry['magnitudeFactor'])) < 1.0e-12,
                'The loss scaling must be the product of the two driver factors'
            );
        }
    },

    'decision lab: overlapping treatments deliver less than independent ones' => function (): void {
        $overlapping = qk_decision_test_compare(['privileged-mfa', 'identity-monitoring']);
        $factors = $overlapping['result']['factors']['byScenario']['S2'];
        $effects = $overlapping['result']['effects']['effects'];

        // Treatments are combined in id order, so identity-monitoring keeps full coverage and
        // privileged-mfa delivers only its independent share of the same mechanism group.
        $first = (float) $effects['identity-monitoring']['frequency'];
        $second = (float) $effects['privileged-mfa']['frequency'];
        $expected = (1.0 - $first) * (1.0 - 0.65 * $second);

        assertTrue(
            abs((float) $factors['frequencyFactor'] - $expected) < 1.0e-9,
            'The second treatment in a mechanism group must deliver only its independent coverage'
        );
        assertTrue(
            (float) $factors['frequencyFactor'] > (1.0 - $first) * (1.0 - $second),
            'Overlapping treatments must never combine as if they were independent'
        );
    },

    'decision lab: appetite evaluates only the configured criteria' => function (): void {
        $three = qk_decision_test_compare([], qk_decision_test_appetite(250000.0, 900000.0))['result'];
        assertSame('above', $three['appetite']['baseline']['status'], 'The fixture must start above appetite');
        assertSame(3, count($three['appetite']['baseline']['criteria']), 'All three criteria must be evaluated');
        foreach ($three['appetite']['baseline']['criteria'] as $criterion) {
            assertTrue(isset($criterion['passes']), 'Every criterion must report a pass or fail');
        }

        $single = qk_decision_test_compare([], ['annualLossLimit' => 1.0])['result'];
        assertSame(1, count($single['appetite']['baseline']['criteria']), 'Only configured criteria are evaluated');
        assertSame('above', $single['appetite']['baseline']['status'], 'The tightened appetite must fail');

        $undefined = qk_decision_test_compare([], null)['result'];
        assertSame('undefined', $undefined['appetite']['baseline']['status'], 'No appetite must be undefined');
        assertContains(
            'not been defined',
            (string) $undefined['appetite']['baseline']['message'],
            'The message must state that no appetite is defined'
        );

        // The probability criterion is evaluated at the appetite threshold, not a model default.
        $probability = qk_decision_test_compare([], [
            'annualLossLimit' => 500000.0,
            'maxExceedanceProbability' => 0.25,
        ])['result'];
        $criterion = null;
        foreach ($probability['appetite']['baseline']['criteria'] as $entry) {
            if ($entry['id'] === 'exceedanceProbability') {
                $criterion = $entry;
            }
        }
        assertTrue($criterion !== null, 'The probability criterion must be evaluated');
        assertTrue(
            abs((float) $criterion['threshold'] - 500000.0) < 1.0e-6,
            'The probability must be measured against the configured annual loss limit'
        );
        assertSame(
            false,
            (bool) $criterion['passes'],
            'A modeled exposure near 760K exceeds a 500K limit far more than 25% of the time'
        );
    },

    'decision lab: cost, risk reduction efficiency and implementation delay are separate' => function (): void {
        $result = qk_decision_test_compare(['immutable-backup'], qk_decision_test_appetite())['result'];

        assertSame(90000.0, (float) $result['cost']['initialInvestment'], 'The implementation cost must be separate');
        assertSame(45000.0, (float) $result['cost']['annualOperatingCost'], 'The operating cost must be separate');
        assertSame(90, (int) $result['cost']['implementationDelayDays'], 'The implementation delay must be reported');

        $annualised = (float) $result['cost']['annualisedTreatmentCost'];
        assertTrue($annualised > 0.0, 'The annualised cost must be positive');
        assertTrue(
            abs((float) $result['riskReductionEfficiency'] - ((float) $result['delta']['expectedAnnualLoss'] / $annualised)) < 1.0e-9,
            'Risk reduction efficiency must be the modeled reduction per unit of annualised cost'
        );

        $phases = $result['delayPhases'];
        assertTrue(
            (float) $phases['transitionYearEal'] > (float) $phases['steadyStateEal'],
            'The transition year must retain part of the pre-treatment exposure'
        );
        assertTrue(
            (float) $phases['transitionYearEal'] < (float) $phases['currentEal'],
            'The transition year must be better than the current position'
        );
    },

    'decision lab: the portfolio rule is deterministic and explainable' => function (): void {
        $run = qk_decision_test_compare([]);
        $candidates = qk_decision_test_candidates();
        $realised = qk_decision_realise_effects($candidates, 20261107);
        $appetite = ['annualLossLimit' => 250000.0, 'highEndLimit' => 900000.0];

        $first = qk_decision_portfolio_search($run['vectors'], $candidates, $realised, $appetite, [], $run['config']);
        $second = qk_decision_portfolio_search($run['vectors'], $candidates, $realised, $appetite, [], $run['config']);

        assertSame(32, $first['evaluated'], 'Five candidates must produce 32 enumerated portfolios');
        assertSame($first['recommendedId'], $second['recommendedId'], 'The optimizer must be deterministic');
        assertSame(
            array_column($first['portfolios'], 'id'),
            array_column($second['portfolios'], 'id'),
            'The ordering must be deterministic'
        );
        assertSame(false, $first['noneSatisfies'], 'The fixture must have a feasible recommendation');

        $recommended = null;
        foreach ($first['portfolios'] as $portfolio) {
            if ($portfolio['id'] === $first['recommendedId']) {
                $recommended = $portfolio;
            }
        }
        assertTrue($recommended !== null, 'The recommended portfolio must be present');
        assertSame(true, $recommended['withinAppetite'], 'The recommendation must be within appetite');
        assertSame([], $recommended['constraintViolations'], 'The recommendation must satisfy every constraint');

        foreach ($first['portfolios'] as $portfolio) {
            if ($portfolio['withinAppetite'] === true && $portfolio['constraintViolations'] === []) {
                assertTrue(
                    qk_decision_total_cost($portfolio['cost']) >= qk_decision_total_cost($recommended['cost']) - 1.0e-9,
                    'No cheaper portfolio may satisfy appetite while this one is recommended'
                );
            }
            assertTrue(
                in_array($portfolio['label'], array_keys(QK_DECISION_LABELS), true),
                'Every portfolio must carry a documented label'
            );
            assertTrue($portfolio['labelReason'] !== '', 'Every label must be explained');
        }
    },

    'decision lab: no portfolio satisfies an impossible appetite' => function (): void {
        $run = qk_decision_test_compare([]);
        $candidates = qk_decision_test_candidates(['edr', 'immutable-backup']);
        $realised = qk_decision_realise_effects($candidates, 20261107);

        $search = qk_decision_portfolio_search(
            $run['vectors'],
            $candidates,
            $realised,
            ['annualLossLimit' => 1000.0],
            [],
            $run['config']
        );

        assertSame(true, $search['noneSatisfies'], 'An impossible appetite must not produce a recommendation');
        assertSame(null, $search['recommendedId'], 'No portfolio may be recommended');
        assertContains(
            'No evaluated portfolio satisfies',
            (string) $search['noneSatisfiesMessage'],
            'The message must state that no portfolio satisfies the appetite'
        );
        foreach ($search['portfolios'] as $portfolio) {
            assertTrue($portfolio['label'] !== 'recommended', 'No portfolio may be labelled recommended');
        }
    },

    'decision lab: a budget constraint makes portfolios infeasible' => function (): void {
        $run = qk_decision_test_compare([]);
        $candidates = qk_decision_test_candidates(['edr', 'immutable-backup']);
        $realised = qk_decision_realise_effects($candidates, 20261107);

        $search = qk_decision_portfolio_search(
            $run['vectors'],
            $candidates,
            $realised,
            ['annualLossLimit' => 700000.0],
            ['maxInitialInvestment' => 50000.0],
            $run['config']
        );

        foreach ($search['portfolios'] as $portfolio) {
            if ((float) $portfolio['cost']['initialInvestment'] > 50000.0) {
                assertSame('infeasible', $portfolio['label'], 'A portfolio over budget must be infeasible');
                assertTrue($portfolio['constraintViolations'] !== [], 'An infeasible portfolio must state why');
            }
        }
    },


    'decision lab: the Pareto frontier excludes dominated portfolios' => function (): void {
        $run = qk_decision_test_compare([]);
        $candidates = qk_decision_test_candidates(['edr', 'immutable-backup', 'privileged-mfa']);
        $realised = qk_decision_realise_effects($candidates, 20261107);

        $search = qk_decision_portfolio_search($run['vectors'], $candidates, $realised, null, [], $run['config']);

        assertTrue(count($search['paretoIds']) > 1, 'The frontier must contain more than one point');
        $byId = [];
        foreach ($search['portfolios'] as $portfolio) {
            $byId[$portfolio['id']] = $portfolio;
        }
        foreach ($search['paretoIds'] as $id) {
            assertTrue(isset($byId[$id]), 'Every frontier id must reference an evaluated portfolio');
            $candidate = $byId[$id];
            foreach ($search['portfolios'] as $other) {
                if ($other['constraintViolations'] !== []) {
                    continue;
                }
                $cheaper = qk_decision_total_cost($other['cost']) < qk_decision_total_cost($candidate['cost']) - 1.0e-9;
                $noRiskier = (float) $other['treated']['expectedAnnualLoss']
                    <= (float) $candidate['treated']['expectedAnnualLoss'] + 1.0e-9;
                assertTrue(!($cheaper && $noRiskier), 'A frontier portfolio must not be dominated');
            }
        }
    },

    'decision lab: break-even effectiveness is found by evaluating the model' => function (): void {
        $run = qk_decision_test_compare(['edr']);
        $treatments = [qk_decision_curated_treatment('edr')];
        $appetite = ['annualLossLimit' => 600000.0];

        $sensitivity = qk_decision_sensitivity(
            $run['vectors'],
            $treatments,
            $run['realised'],
            $appetite,
            $run['config']
        );

        assertSame(true, $sensitivity['available'], 'The sensitivity must be available when appetite is defined');
        assertTrue(is_float($sensitivity['breakEvenEffectiveness']), 'A break-even value must be found');
        $breakEven = (float) $sensitivity['breakEvenEffectiveness'];
        assertTrue($breakEven > 0.0 && $breakEven < 1.0, 'The break-even must be inside the modelled range');
        assertTrue(count($sensitivity['curve']) >= 5, 'The curve must contain the evaluated points');

        // Re-evaluate the model at the reported value: it must satisfy appetite, and slightly
        // below it, must not. No interpolation is used anywhere in this path.
        $statusAt = static function (float $factor) use ($run, $treatments, $appetite): string {
            $scaled = [];
            foreach ($run['realised']['effects'] as $id => $effect) {
                $scaled[$id] = [
                    'frequency' => $effect['frequency'] === null ? null : $effect['frequency'] * $factor,
                    'magnitude' => $effect['magnitude'] === null ? null : $effect['magnitude'] * $factor,
                ];
            }
            $factors = qk_decision_scenario_factors($run['vectors'], $treatments, $scaled, $run['config']);
            $kappa = [];
            foreach ($factors['byScenario'] as $code => $entry) {
                $kappa[(string) $code] = (float) $entry['kappa'];
            }
            $metrics = qk_decision_portfolio_metrics(
                $run['vectors'],
                $kappa,
                qk_decision_thresholds($run['vectors'], $appetite)
            );

            return qk_decision_evaluate_appetite_criteria(
                $metrics,
                qk_decision_appetite_criteria($appetite)
            )['status'];
        };

        assertSame('within', $statusAt($breakEven), 'The reported break-even must satisfy the appetite');
        assertSame('above', $statusAt(max(0.0, $breakEven - 0.03)), 'Slightly less effectiveness must not satisfy it');
    },

];
