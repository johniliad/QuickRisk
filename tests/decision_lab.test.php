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
require_once dirname(__DIR__) . '/server/includes/decision/handlers.php';
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

    $inference = QkInferenceRepository::load(qk_config(), $model);
    $vectors = QkRiskEngine::lossVectors($model, $inference, $validated, $seed, $iterations);
    $realised = qk_decision_realise_effects($treatments, $seed, $iterations, $inference);

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
                (bool) ($entry['pairedLossSeriesAvailable'] ?? false),
                'The public factor must disclose that a paired loss series was applied'
            );
            assertFalse(isset($entry['lossSeries']), 'Server-only loss vectors must not be published');
            assertTrue(
                (float) $entry['kappa'] >= 0.0 && (float) $entry['kappa'] <= 1.0,
                'Event-count treatment transformation must be a bounded reduction'
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
        $independent = (1.0 - $first) * (1.0 - $second);
        $firstOnly = 1.0 - $first;

        assertTrue(
            (float) $factors['frequencyFactor'] < $firstOnly,
            'The second treatment in a mechanism group must add some independent coverage'
        );
        assertTrue(
            (float) $factors['frequencyFactor'] > $independent,
            'Overlapping treatments must never combine as if they were independent'
        );
    },

    'decision lab: a probability appetite requires a loss threshold' => function (): void {
        try {
            qk_decision_appetite(['maxExceedanceProbability' => 0.25]);
            qk_fail('A probability appetite without a loss threshold must be rejected');
        } catch (QkLiveHttpError $error) {
            assertSame(422, $error->status, 'The incomplete appetite must return 422');
            assertTrue(
                str_contains($error->getMessage(), 'loss threshold'),
                'The error must explain that a loss threshold is required'
            );
        }

        $annual = qk_decision_appetite([
            'annualLossLimit' => 250000.0,
            'maxExceedanceProbability' => 0.25,
        ]);
        assertSame(250000.0, (float) $annual['annualLossLimit'], 'The annual threshold must be retained');
        assertSame(0.25, (float) $annual['maxExceedanceProbability'], 'The probability must be retained');

        $explicit = qk_decision_appetite([
            'exceedanceThreshold' => 600000.0,
            'maxExceedanceProbability' => 0.25,
        ]);
        assertSame(600000.0, (float) $explicit['exceedanceThreshold'], 'An explicit threshold must be accepted');
        assertSame(0.25, (float) $explicit['maxExceedanceProbability'], 'The probability must be retained');
    },

    'decision lab: appetite evaluates only the configured criteria' => function (): void {
        $three = qk_decision_test_compare([], qk_decision_test_appetite(1.0, 1.0))['result'];
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
            'annualLossLimit' => 100.0,
            'maxExceedanceProbability' => 0.01,
        ])['result'];
        $criterion = null;
        foreach ($probability['appetite']['baseline']['criteria'] as $entry) {
            if ($entry['id'] === 'exceedanceProbability') {
                $criterion = $entry;
            }
        }
        assertTrue($criterion !== null, 'The probability criterion must be evaluated');
        assertTrue(
            abs((float) $criterion['threshold'] - 100.0) < 1.0e-6,
            'The probability must be measured against the configured annual loss limit'
        );
        assertSame(
            false,
            (bool) $criterion['passes'],
            'A positive annual-loss distribution exceeds a €100 limit more than 25% of the time'
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
            ['annualLossLimit' => 1.0],
            [],
            $run['config']
        );

        assertSame(true, $search['noneSatisfies'], 'An impossible appetite must not produce a recommendation');
        assertSame(null, $search['recommendedId'], 'No portfolio may be recommended');
        assertContains(
            'No evaluated portfolio meets the expected annual-loss criterion',
            (string) $search['noneSatisfiesMessage'],
            'The message must state that no portfolio meets the portfolio-level criterion'
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

        $search = qk_decision_portfolio_search(
            $run['vectors'],
            $candidates,
            $realised,
            ['annualLossLimit' => 1000000.0],
            [],
            $run['config']
        );

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
        $appetite = ['annualLossLimit' => 600.0];

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
            $package = $run['realised'];
            $package['effects'] = $scaled;
            $package['series'] = [];
            foreach ($run['realised']['series'] ?? [] as $id => $series) {
                $package['series'][$id] = [
                    'frequency' => $series['frequency'] === null
                        ? null
                        : array_map(static fn ($value): float => (float) $value * $factor, $series['frequency']),
                    'magnitude' => $series['magnitude'] === null
                        ? null
                        : array_map(static fn ($value): float => (float) $value * $factor, $series['magnitude']),
                ];
            }
            $factors = qk_decision_scenario_factors($run['vectors'], $treatments, $package, $run['config']);
            $kappa = [];
            foreach ($factors['byScenario'] as $code => $entry) {
                $kappa[(string) $code] = $entry;
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

    'decision lab: the anonymous compute budget is the documented one' => function (): void {
        $budget = qk_decision_compute_budget(qk_decision_config(qk_config()));

        assertSame(10000, $budget['maxIterations'], 'The compute budget must cap iterations at 10,000');
        assertSame(30, $budget['maxCandidates'], 'The compute budget must allow at most 30 candidate treatments');
        assertSame(256, $budget['maxPortfolios'], 'The compute budget must allow at most 256 portfolios');
        assertSame(1000, $budget['minIterations'], 'The documented iteration floor must be unchanged');
    },

    'decision lab: a compute request above the iteration budget is rejected' => function (): void {
        $server = [
            'REQUEST_METHOD' => 'POST',
            'HTTP_HOST' => 'test.local',
            'HTTP_ORIGIN' => 'https://test.local',
            'HTTP_X_QUICKRISK_LIVE' => '1',
            'CONTENT_TYPE' => 'application/json',
            'REMOTE_ADDR' => '192.0.2.10',
            'SCRIPT_NAME' => '/live/api/decision-compute.php',
            'REQUEST_SCHEME' => 'https',
            'SERVER_PORT' => '443',
        ];
        $payload = array_merge(qk_test_payload(qk_test_profile()), [
            'action' => 'baseline',
            'seed' => 20261107,
            'iterations' => 10001,
        ]);

        try {
            qk_decision_compute($server, qk_config(), (string) json_encode($payload));
            qk_fail('A request above the iteration budget must be rejected');
        } catch (QkLiveHttpError $error) {
            assertSame(422, $error->status, 'An iteration count above the budget must be a validation error');
            assertContains('10000', $error->getMessage(), 'The rejection must state the iteration budget');
        }
    },

    'decision lab: a compute request above the candidate budget is rejected' => function (): void {
        $server = [
            'REQUEST_METHOD' => 'POST',
            'HTTP_HOST' => 'test.local',
            'HTTP_ORIGIN' => 'https://test.local',
            'HTTP_X_QUICKRISK_LIVE' => '1',
            'CONTENT_TYPE' => 'application/json',
            'REMOTE_ADDR' => '192.0.2.10',
            'SCRIPT_NAME' => '/live/api/decision-compute.php',
            'REQUEST_SCHEME' => 'https',
            'SERVER_PORT' => '443',
        ];
        $payload = array_merge(qk_test_payload(qk_test_profile()), [
            'action' => 'baseline',
            'seed' => 20261107,
            'iterations' => 1000,
            'treatments' => array_fill(0, 31, ['source' => 'curated', 'id' => 'edr']),
        ]);

        try {
            qk_decision_compute($server, qk_config(), (string) json_encode($payload));
            qk_fail('A request above the candidate budget must be rejected');
        } catch (QkLiveHttpError $error) {
            assertSame(422, $error->status, 'Too many candidate treatments must be a validation error');
            assertContains('30', $error->getMessage(), 'The rejection must state the candidate budget');
        }
    },

    'decision lab: portfolio enumeration stops at the budget without skipping a candidate' => function (): void {
        $masks = qk_decision_portfolio_masks(30, 256);
        assertSame(256, count($masks), 'The portfolio budget must bound the enumeration');
        assertSame($masks, array_values(array_unique($masks)), 'Every enumerated portfolio must be distinct');
        assertSame(0, $masks[0], 'The empty portfolio must be evaluated first');

        $template = qk_decision_curated_treatment('edr');
        assertTrue($template !== null, 'The fixture treatment must exist');
        $candidates = [];
        for ($index = 0; $index < 30; $index++) {
            $candidate = (array) $template;
            $candidate['id'] = 'budget-candidate-' . $index;
            $candidates[] = $candidate;
        }
        $realised = qk_decision_realise_effects($candidates, 20261107);
        $run = qk_decision_test_compare([], null, 20261107, 1000);

        $search = qk_decision_portfolio_search(
            $run['vectors'],
            $candidates,
            $realised,
            ['annualLossLimit' => 1000000.0],
            [],
            $run['config']
        );

        assertSame(256, $search['evaluated'], 'The search must evaluate exactly the portfolio budget');
        assertSame(30, $search['candidatesConsidered'], 'All thirty candidates must be inside the budget');
        assertSame(true, $search['truncated'], 'The search must report that the enumeration was bounded');

        $ids = array_column($search['portfolios'], 'id');
        foreach (range(0, 29) as $index) {
            assertTrue(
                in_array('p' . (1 << $index), $ids, true),
                'Every single-treatment portfolio must be evaluated, including candidate ' . $index
            );
        }

        $considered = [];
        foreach ($search['portfolios'] as $portfolio) {
            foreach ($portfolio['treatmentIds'] as $treatmentId) {
                $considered[$treatmentId] = true;
            }
        }
        assertSame(30, count($considered), 'No candidate may be silently ignored by the budget');

        $notes = implode(' ', array_map('strval', $search['notes']));
        assertContains('anonymous compute budget', $notes, 'A bounded enumeration must be explained');
    },

    'decision lab: portfolio selection uses expected annual loss only' => function (): void {
        $appetite = [
            'annualLossLimit' => 1000000.0,
            'highEndLimit' => 1.0,
            'maxExceedanceProbability' => 0.0001,
        ];
        $criteria = qk_decision_portfolio_appetite_criteria($appetite);
        assertSame(['annualLoss'], array_column($criteria, 'id'), 'Only EAL may select a portfolio');

        $run = qk_decision_test_compare([]);
        $candidates = qk_decision_test_candidates(['edr', 'immutable-backup']);
        $realised = qk_decision_realise_effects($candidates, 20261107);
        $search = qk_decision_portfolio_search(
            $run['vectors'],
            $candidates,
            $realised,
            $appetite,
            [],
            $run['config']
        );

        assertSame(true, $search['portfolioAppetiteDefined'], 'The EAL criterion must be available');
        assertSame('expected-annual-loss-only', $search['appetiteBasis'], 'The portfolio basis must be explicit');
        assertSame(['annualLoss'], $search['portfolioCriteria'], 'Only EAL must be used');
        assertSame(
            ['highEndLoss', 'exceedanceProbability'],
            $search['excludedCriteria'],
            'The joint-distribution criteria must be recorded as excluded'
        );
        assertTrue($search['recommendedId'] !== null, 'An impossible P90 criterion must not block an EAL recommendation');
    },

    'decision lab: portfolio ranking does not use joint P90' => function (): void {
        $base = [
            'id' => 'p1',
            'cost' => ['initialInvestment' => 100.0, 'annualOperatingCost' => 10.0, 'implementationDelayDays' => 30],
            'treated' => ['expectedAnnualLoss' => 500.0, 'p90' => 1.0],
        ];
        $higherP90 = $base;
        $higherP90['id'] = 'p2';
        $higherP90['treated']['p90'] = 999999.0;

        assertTrue(
            qk_decision_rank_compare($base, $higherP90) < 0,
            'Equal cost, EAL and delay must be ordered deterministically without P90'
        );
    },

    'decision lab: portfolios require an annual-loss limit' => function (): void {
        $server = [
            'REQUEST_METHOD' => 'POST',
            'HTTP_HOST' => 'test.local',
            'HTTP_ORIGIN' => 'https://test.local',
            'HTTP_X_QUICKRISK_LIVE' => '1',
            'CONTENT_TYPE' => 'application/json',
            'REMOTE_ADDR' => '192.0.2.10',
            'SCRIPT_NAME' => '/live/api/decision-compute.php',
            'REQUEST_SCHEME' => 'https',
            'SERVER_PORT' => '443',
        ];
        $payload = array_merge(qk_test_payload(qk_test_profile()), [
            'action' => 'portfolios',
            'seed' => 20261107,
            'iterations' => 1000,
            'appetite' => ['highEndLimit' => 900000.0],
            'treatments' => [],
            'candidateTreatments' => [['source' => 'curated', 'id' => 'edr']],
        ]);

        try {
            qk_decision_compute($server, qk_config(), (string) json_encode($payload));
            qk_fail('Portfolio evaluation without an annual-loss limit must be rejected');
        } catch (QkLiveHttpError $error) {
            assertSame(422, $error->status, 'The missing portfolio criterion must be a validation error');
            assertContains('annual loss limit', $error->getMessage(), 'The error must name the required criterion');
        }
    },

    'decision lab: a reachable loss cap is disclosed as a treatment approximation' => function (): void {
        $model = qk_test_model();
        $config = qk_decision_config(qk_config());
        $profile = qk_test_profile([
            'QP2' => 'EXTREME',
            'QP6' => 'VERY_LOW',
            'QP8' => 'GT10M',
        ]);
        $validated = QkValidation::validatePayload(
            $model,
            qk_test_payload($profile, qk_test_scenario_answers('VERY_LIKELY', 'CRITICAL'))
        );
        $vectors = FairEngine::lossVectors($model, $validated, 20261107, 2000);
        $treatments = [qk_decision_curated_treatment('immutable-backup')];
        $realised = qk_decision_realise_effects($treatments, 20261107);
        $result = qk_decision_compare($vectors, $treatments, $realised, null, $config);

        assertSame(true, $result['factors']['clampWarning'], 'The reachable component cap must be disclosed');
        $notes = implode(' ', $result['factors']['notes']);
        assertContains('paired yearly losses is an approximation', $notes, 'The approximation must be explained');
    },

    'decision lab: fractional exceedance thresholds keep distinct keys' => function (): void {
        $summary = qk_decision_summary(
            [499999.0, 500000.5, 500001.0],
            [500000.4, 500000.6]
        );

        assertRelativeClose(
            2.0 / 3.0,
            (float) $summary['thresholdProbabilities'][qk_decision_threshold_key(500000.4)],
            1.0e-12,
            'The lower fractional threshold must retain its own probability'
        );
        assertRelativeClose(
            1.0 / 3.0,
            (float) $summary['thresholdProbabilities'][qk_decision_threshold_key(500000.6)],
            1.0e-12,
            'The upper fractional threshold must retain its own probability'
        );
    },

];
