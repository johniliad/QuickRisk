<?php

declare(strict_types=1);

/**
 * Monte Carlo engine tests (development plan phases 11, 23, 24, 28).
 */

return [
    'engine: response carries the required version and simulation metadata' => function (): void {
        $model = qk_test_model();
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));

        assertSame('ok', $response['status'], 'The response should report success');
        assertSame('FAIR-QK-1.3', $response['meta']['modelId'], 'The model identifier must be reported');
        assertSame('1.3.0', $response['meta']['modelVersion'], 'The model version must be reported');
        assertSame('CAL-1.3', $response['meta']['calibrationVersion'], 'The calibration version must be reported');
        assertSame(5000, $response['meta']['iterations'], 'The simulation count must be reported');
        assertSame('EUR', $response['meta']['currency'], 'The currency must be reported');
        assertSame('zero-retention', $response['meta']['retentionMode'], 'The retention mode must be reported');
        assertFalse($response['meta']['seedPersisted'], 'The seed must never be persisted');
        assertFalse($response['meta']['seedDisclosed'], 'The seed must never be disclosed to the browser');
        assertFalse($response['meta']['jointPercentilesAvailable'], 'No joint percentile may be claimed');
        assertSame(5, $response['meta']['scenarioCount'], 'Exactly five scenarios must be assessed');
        assertTrue(
            strtotime((string) $response['meta']['calculatedAt']) !== false,
            'The calculation timestamp must be a valid timestamp'
        );
        assertSame(count($model->scenarioOrder()), count($response['scenarios']), 'Every model scenario must be present');
    },

    'engine: portfolio total equals the sum of scenario expected annual losses' => function (): void {
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));

        assertRelativeClose(
            qk_test_sum_expected($response),
            (float) $response['portfolio']['expectedAnnualLoss'],
            1e-9,
            'The portfolio figure must be exactly the sum of scenario expected values'
        );

        $top = $response['portfolio']['topScenarios'];
        assertCount(3, $top, 'Three top scenarios should be ranked');
        assertTrue(
            (float) $top[0]['expectedAnnualLoss'] >= (float) $top[1]['expectedAnnualLoss'],
            'Top scenarios must be ranked in descending order'
        );
        assertContains(
            'Sum of scenario expected annual loss',
            (string) $response['portfolio']['label'],
            'The total must be labelled as a sum of scenario expected values'
        );
        assertTrue(
            (string) $response['portfolio']['annualisationNote'] !== '',
            'The annualisation limitation must accompany the portfolio total'
        );
        assertTrue(
            (string) $response['portfolio']['jointPercentilesNote'] !== '',
            'The joint-percentile limitation must be stated'
        );
    },

    'engine: percentile statistics are ordered, non-negative and finite' => function (): void {
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));

        foreach ($response['scenarios'] as $scenario) {
            $statistics = $scenario['statistics'];
            $previous = -INF;
            foreach (['minimum', 'p10', 'p25', 'p50', 'p75', 'p90', 'maximum'] as $key) {
                $value = (float) $statistics[$key];
                if (!is_finite($value)) {
                    qk_fail('Statistic ' . $key . ' was not finite for ' . $scenario['code']);
                }
                assertBetween($value, 0.0, 1.0e12, 'Statistic ' . $key . ' must be a plausible loss value');
                assertTrue($value >= $previous - 1e-6, 'Statistics must be ordered: ' . $key . ' in ' . $scenario['code']);
                $previous = $value;
            }
            assertGreaterThan(0.0, (float) $statistics['expectedAnnualLoss'], 'Expected annual loss must be positive');
            assertGreaterThan(0.0, (float) $statistics['standardDeviation'], 'A dispersion metric must be reported');
            assertBetween((float) $statistics['coefficientOfVariation'], 0.0, 100.0, 'The coefficient of variation must be plausible');
        }
    },

    'engine: loss event frequency is consistent with TEF multiplied by susceptibility' => function (): void {
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()), 4242, 20000);

        foreach ($response['scenarios'] as $scenario) {
            $statistics = $scenario['statistics'];
            $expected = (float) $statistics['expectedThreatEventFrequency'] * (float) $statistics['meanSusceptibility'];

            assertRelativeClose(
                $expected,
                (float) $statistics['expectedLossEventFrequency'],
                0.08,
                'LEF should equal TEF x susceptibility in ' . $scenario['code']
            );
        }
    },

    'engine: loss magnitude equals primary plus secondary and the share is bounded' => function (): void {
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));

        foreach ($response['scenarios'] as $scenario) {
            $statistics = $scenario['statistics'];
            assertRelativeClose(
                (float) $statistics['expectedPrimaryLossMagnitude'] + (float) $statistics['expectedSecondaryLossMagnitude'],
                (float) $statistics['expectedLossMagnitude'],
                1e-6,
                'Loss magnitude should be primary plus secondary in ' . $scenario['code']
            );
            assertBetween((float) $statistics['secondaryLossShare'], 0.0, 1.0, 'The secondary-loss share must be a proportion');
            assertBetween((float) $statistics['secondaryLossOccurrenceRate'], 0.0, 1.0, 'The occurrence rate must be a proportion');
        }
    },

    'engine: threshold exceedance probabilities are monotone and bounded' => function (): void {
        $model = qk_test_model();
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));

        foreach ($response['scenarios'] as $scenario) {
            $previous = 1.1;
            foreach ($model->lossThresholds() as $threshold) {
                $probability = (float) $scenario['statistics']['thresholdProbabilities'][(string) (int) $threshold];
                assertBetween($probability, 0.0, 1.0, 'A threshold probability must be a proportion');
                assertTrue(
                    $probability <= $previous + 1e-9,
                    'Threshold probabilities must not increase with the threshold in ' . $scenario['code']
                );
                $previous = $probability;
            }
        }
    },

    'engine: the loss histogram accounts for every simulated observation' => function (): void {
        $response = qk_test_calculate(qk_test_payload(qk_test_profile()));
        $bins = (int) qk_test_model()->parameters()['engineLimits']['histogramBins'];

        foreach ($response['scenarios'] as $scenario) {
            $distribution = $scenario['distribution'];
            assertCount($bins, $distribution['counts'], 'The histogram should have the configured number of bins');
            assertCount($bins + 1, $distribution['binEdges'], 'Bin edges should bound every bin');
            assertSame(
                5000,
                array_sum($distribution['counts']) + (int) $distribution['overflowCount'],
                'Histogram counts must sum to the iteration count in ' . $scenario['code']
            );
            assertGreaterThan(0.0, (float) $distribution['overflowFrom'], 'The overflow boundary must be positive');

            $previousEdge = -1.0;
            foreach ($distribution['binEdges'] as $edge) {
                assertTrue((float) $edge > $previousEdge, 'Bin edges must increase monotonically');
                $previousEdge = (float) $edge;
            }
        }
    },

    'engine: a fixed seed reproduces identical results across repeated runs' => function (): void {
        $payload = qk_test_payload(qk_test_profile());
        $first = qk_test_calculate($payload, 987654);

        for ($run = 0; $run < 4; $run++) {
            $repeat = qk_test_calculate($payload, 987654);
            assertSame(
                $first['scenarios'][0]['statistics']['expectedAnnualLoss'],
                $repeat['scenarios'][0]['statistics']['expectedAnnualLoss'],
                'A fixed seed must reproduce the same expected annual loss'
            );
            assertSame(
                $first['scenarios'][2]['statistics']['p90'],
                $repeat['scenarios'][2]['statistics']['p90'],
                'A fixed seed must reproduce the same P90'
            );
        }

        $different = qk_test_calculate($payload, 987655);
        assertTrue(
            $first['scenarios'][0]['statistics']['expectedAnnualLoss'] !== $different['scenarios'][0]['statistics']['expectedAnnualLoss'],
            'A different seed must produce a different sample'
        );
    },

    'engine: summary statistics stabilise as the iteration count increases' => function (): void {
        $payload = qk_test_payload(qk_test_profile());
        $reference = qk_test_calculate($payload, 20261029, 50000);
        $referenceMean = (float) $reference['scenarios'][0]['statistics']['expectedAnnualLoss'];
        $referenceP50 = (float) $reference['scenarios'][0]['statistics']['p50'];

        foreach ([1000, 5000, 10000] as $iterations) {
            $response = qk_test_calculate($payload, 20261029, $iterations);
            $mean = (float) $response['scenarios'][0]['statistics']['expectedAnnualLoss'];
            $p50 = (float) $response['scenarios'][0]['statistics']['p50'];

            assertRelativeClose($referenceMean, $mean, 0.20, 'The mean should stabilise at ' . $iterations . ' iterations');
            assertRelativeClose($referenceP50, $p50, 0.25, 'The median should stabilise at ' . $iterations . ' iterations');
        }
    },

    'engine: iterations are clamped to the model limits' => function (): void {
        $payload = qk_test_payload(qk_test_profile());

        $low = qk_test_calculate($payload, 1, 10);
        assertSame(1000, $low['meta']['iterations'], 'The minimum iteration count must be enforced');

        $high = qk_test_calculate($payload, 1, 5000000);
        assertSame(50000, $high['meta']['iterations'], 'The maximum iteration count must be enforced');
    },
];
